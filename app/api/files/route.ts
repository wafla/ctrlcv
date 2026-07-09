import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import { NextResponse } from "next/server";
import { getConnection } from "@/lib/oracle";
import {
  cleanupExpiredFiles,
  ensureUploadDir,
  getUploadPath,
} from "@/lib/server-files";
import { recordUsageEvent } from "@/lib/usage";

const oracledb = require("oracledb");

const MAX_ENCRYPTED_FILE_SIZE = 10 * 1024 * 1024 + 1024;
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/json",
  "application/zip",
  "application/x-zip-compressed",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/x-hwp",
  "application/haansofthwp",
  "application/vnd.hancom.hwp",
  "application/vnd.hancom.hwpx",
]);
const ALLOWED_EXTENSIONS = new Set(["hwp", "hwpx"]);

function getExtension(fileName: string) {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

export async function POST(request: Request) {
  let conn;
  let storagePath: string | null = null;

  try {
    const formData = await request.formData();
    const sessionId = formData.get("sessionId");
    const file = formData.get("file");
    const mimeType = formData.get("mimeType");
    const fileName = formData.get("fileName");

    if (
      typeof sessionId !== "string" ||
      typeof mimeType !== "string" ||
      typeof fileName !== "string" ||
      !(file instanceof File)
    ) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const extension = getExtension(fileName);
    const isAllowedExtension = ALLOWED_EXTENSIONS.has(extension);
    const storedMimeType = mimeType || "application/octet-stream";

    if (!ALLOWED_MIME_TYPES.has(mimeType) && !isAllowedExtension) {
      return NextResponse.json(
        { error: "Unsupported file type" },
        { status: 400 }
      );
    }

    if (file.size <= 12 || file.size > MAX_ENCRYPTED_FILE_SIZE) {
      return NextResponse.json(
        { error: "Invalid file size" },
        { status: 400 }
      );
    }

    conn = await getConnection();
    await cleanupExpiredFiles(conn);

    const sessionCheck = await conn.execute(
      `
      SELECT expires_at
      FROM sessions
      WHERE id = :sessionId
        AND is_active = 1
        AND expires_at > SYS_EXTRACT_UTC(SYSTIMESTAMP)
      `,
      { sessionId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if ((sessionCheck.rows?.length ?? 0) === 0) {
      return NextResponse.json(
        { error: "Session not found or expired" },
        { status: 404 }
      );
    }

    await ensureUploadDir();

    const fileId = randomUUID().replace(/-/g, "").toUpperCase();
    storagePath = `${fileId}.bin`;
    await fs.writeFile(getUploadPath(storagePath), Buffer.from(await file.arrayBuffer()));

    await conn.execute(
      `
      INSERT INTO image_attachments (
        id,
        session_id,
        storage_path,
        encrypted_size,
        mime_type,
        expires_at
      )
      VALUES (
        :id,
        :sessionId,
        :storagePath,
        :encryptedSize,
        :mimeType,
        :expiresAt
      )
      `,
      {
        id: fileId,
        sessionId,
        storagePath,
        encryptedSize: file.size,
        mimeType: storedMimeType,
        expiresAt: sessionCheck.rows[0].EXPIRES_AT,
      }
    );

    const isImage = storedMimeType.startsWith("image/");
    await recordUsageEvent(conn, isImage ? "image_uploaded" : "file_uploaded", {
      sessionId,
    });
    await recordUsageEvent(conn, isImage ? "image_bytes_uploaded" : "file_bytes_uploaded", {
      sessionId,
      value: file.size,
    });

    await conn.commit();

    return NextResponse.json({ fileId });
  } catch (err) {
    if (conn) await conn.rollback();
    if (conn) {
      await recordUsageEvent(conn, "api_error");
      await conn.commit();
    }
    if (storagePath) {
      await fs.unlink(getUploadPath(storagePath)).catch(() => {});
    }
    console.error("POST /api/files error:", err);

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  } finally {
    if (conn) await conn.close();
  }
}
