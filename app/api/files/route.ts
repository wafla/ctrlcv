import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import { NextResponse } from "next/server";
import { getConnection } from "@/lib/oracle";
import {
  cleanupExpiredFiles,
  ensureUploadDir,
  getUploadLimitBytes,
  getUploadPath,
  MIB,
} from "@/lib/server-files";
import { recordUsageEvent } from "@/lib/usage";

const oracledb = require("oracledb");

const ENCRYPTION_OVERHEAD_ALLOWANCE = 1024;
const LEGACY_WHOLE_FILE_LIMIT = 100 * MIB;

export const dynamic = "force-dynamic";

export async function GET() {
  const maxFileSize = await getUploadLimitBytes();

  return NextResponse.json(
    { maxFileSize, uploadsAvailable: maxFileSize > 0 },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(request: Request) {
  let conn;
  let storagePath: string | null = null;

  try {
    const maxFileSize = Math.min(
      await getUploadLimitBytes(),
      LEGACY_WHOLE_FILE_LIMIT
    );
    if (maxFileSize === 0) {
      return NextResponse.json(
        { error: "Uploads are temporarily unavailable due to low server storage" },
        { status: 507 }
      );
    }

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

    const storedMimeType = mimeType || "application/octet-stream";

    if (
      file.size <= 12 ||
      file.size > maxFileSize + ENCRYPTION_OVERHEAD_ALLOWANCE
    ) {
      return NextResponse.json(
        { error: "File exceeds the current server upload limit", maxFileSize },
        { status: 413 }
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
