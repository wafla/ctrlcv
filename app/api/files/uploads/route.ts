import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import { NextResponse } from "next/server";
import { getConnection } from "@/lib/oracle";
import {
  cleanupExpiredFiles,
  FILE_CHUNK_ENCRYPTION_OVERHEAD,
  FILE_CHUNK_SIZE,
  getUploadLimitBytes,
  getUploadPath,
} from "@/lib/server-files";
import { createUploadToken } from "@/lib/upload-token";
import { recordUsageEvent } from "@/lib/usage";

const oracledb = require("oracledb");

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
    const body = await request.json();
    const { sessionId, fileName, mimeType, size, chunkSize, chunkCount } = body;

    if (
      typeof sessionId !== "string" ||
      typeof fileName !== "string" ||
      typeof mimeType !== "string" ||
      !Number.isSafeInteger(size) ||
      !Number.isSafeInteger(chunkSize) ||
      !Number.isSafeInteger(chunkCount) ||
      size <= 0 ||
      chunkSize !== FILE_CHUNK_SIZE ||
      chunkCount !== Math.ceil(size / FILE_CHUNK_SIZE)
    ) {
      return NextResponse.json({ error: "Invalid upload metadata" }, { status: 400 });
    }

    const extension = getExtension(fileName);
    if (!ALLOWED_MIME_TYPES.has(mimeType) && !ALLOWED_EXTENSIONS.has(extension)) {
      return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });
    }

    const maxFileSize = await getUploadLimitBytes();
    if (maxFileSize === 0) {
      return NextResponse.json(
        { error: "Uploads are temporarily unavailable due to low server storage" },
        { status: 507 }
      );
    }
    if (size > maxFileSize) {
      return NextResponse.json(
        { error: "File exceeds the current server upload limit", maxFileSize },
        { status: 413 }
      );
    }

    conn = await getConnection();
    await cleanupExpiredFiles(conn);
    const sessionResult = await conn.execute(
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

    if ((sessionResult.rows?.length ?? 0) === 0) {
      return NextResponse.json({ error: "Session not found or expired" }, { status: 404 });
    }

    const fileId = randomUUID().replace(/-/g, "").toUpperCase();
    storagePath = `${fileId}.part`;
    const expectedEncryptedSize = size + chunkCount * FILE_CHUNK_ENCRYPTION_OVERHEAD;
    const expiresAt = new Date(sessionResult.rows[0].EXPIRES_AT).getTime();
    const uploadToken = createUploadToken({
      kind: "upload",
      fileId,
      sessionId,
      originalSize: size,
      expectedEncryptedSize,
      expiresAt,
      isImage: mimeType.startsWith("image/"),
    });

    await fs.writeFile(getUploadPath(storagePath), Buffer.alloc(0), { flag: "wx" });
    await conn.execute(
      `
      INSERT INTO image_attachments (
        id, session_id, storage_path, encrypted_size, mime_type, expires_at
      ) VALUES (
        :id, :sessionId, :storagePath, :encryptedSize, :mimeType, :expiresAt
      )
      `,
      {
        id: fileId,
        sessionId,
        storagePath,
        encryptedSize: expectedEncryptedSize,
        mimeType: mimeType || "application/octet-stream",
        expiresAt: sessionResult.rows[0].EXPIRES_AT,
      }
    );
    await conn.commit();

    return NextResponse.json({
      fileId,
      uploadToken,
      chunkSize: FILE_CHUNK_SIZE,
      chunkCount,
    });
  } catch (error) {
    if (conn) await conn.rollback();
    if (storagePath) await fs.unlink(getUploadPath(storagePath)).catch(() => {});
    console.error("POST /api/files/uploads error:", error);
    if (conn) {
      await recordUsageEvent(conn, "api_error");
      await conn.commit();
    }
    return NextResponse.json({ error: "Failed to initialize upload" }, { status: 500 });
  } finally {
    if (conn) await conn.close();
  }
}
