import { promises as fs } from "fs";
import { NextResponse } from "next/server";
import { getConnection } from "@/lib/oracle";
import { getUploadPath } from "@/lib/server-files";
import { recordUsageEvent } from "@/lib/usage";
import { getBearerToken, verifyUploadToken } from "@/lib/upload-token";

const oracledb = require("oracledb");

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let conn;
  let oldPath: string | null = null;
  let newPath: string | null = null;

  try {
    const { id } = await params;
    const upload = verifyUploadToken(getBearerToken(request));
    if (!id || !upload || upload.fileId !== id.toUpperCase()) {
      return NextResponse.json({ error: "Invalid completion request" }, { status: 400 });
    }

    conn = await getConnection();
    const result = await conn.execute(
      `
      SELECT a.storage_path, a.encrypted_size
      FROM image_attachments a
      JOIN sessions s ON s.id = a.session_id
      WHERE a.id = :id
        AND a.session_id = :sessionId
        AND a.expires_at > SYS_EXTRACT_UTC(SYSTIMESTAMP)
        AND s.is_active = 1
        AND s.expires_at > SYS_EXTRACT_UTC(SYSTIMESTAMP)
      `,
      { id: id.toUpperCase(), sessionId: upload.sessionId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if ((result.rows?.length ?? 0) === 0) {
      return NextResponse.json({ error: "Upload not found or expired" }, { status: 404 });
    }

    const row = result.rows[0];
    if (Number(row.ENCRYPTED_SIZE) !== upload.expectedEncryptedSize) {
      return NextResponse.json({ error: "Upload metadata mismatch" }, { status: 409 });
    }
    if (!String(row.STORAGE_PATH).endsWith(".part")) {
      return NextResponse.json({ fileId: id.toUpperCase() });
    }

    oldPath = getUploadPath(row.STORAGE_PATH);
    const stat = await fs.stat(oldPath);
    if (stat.size !== Number(row.ENCRYPTED_SIZE)) {
      return NextResponse.json(
        { error: "Upload is incomplete", receivedSize: stat.size },
        { status: 409 }
      );
    }

    const completedStoragePath = `${id.toUpperCase()}.bin`;
    newPath = getUploadPath(completedStoragePath);
    await fs.rename(oldPath, newPath);

    await conn.execute(
      `UPDATE image_attachments SET storage_path = :storagePath WHERE id = :id`,
      { storagePath: completedStoragePath, id: id.toUpperCase() }
    );
    await recordUsageEvent(conn, upload.isImage ? "image_uploaded" : "file_uploaded", {
      sessionId: upload.sessionId,
    });
    await recordUsageEvent(conn, upload.isImage ? "image_bytes_uploaded" : "file_bytes_uploaded", {
      sessionId: upload.sessionId,
      value: upload.originalSize,
    });
    await conn.commit();

    return NextResponse.json({ fileId: id.toUpperCase() });
  } catch (error: any) {
    if (conn) await conn.rollback();
    if (oldPath && newPath) await fs.rename(newPath, oldPath).catch(() => {});
    if (error?.code === "ENOENT") {
      return NextResponse.json({ error: "Upload not found or expired" }, { status: 404 });
    }
    console.error("POST /api/files/uploads/[id]/complete error:", error);
    if (conn) {
      await recordUsageEvent(conn, "api_error");
      await conn.commit();
    }
    return NextResponse.json({ error: "Failed to complete upload" }, { status: 500 });
  } finally {
    if (conn) await conn.close();
  }
}
