import { NextResponse } from "next/server";
import { getConnection } from "@/lib/oracle";
import { createFileAccessToken } from "@/lib/upload-token";

const oracledb = require("oracledb");

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let conn;

  try {
    const { id } = await params;
    const sessionId = new URL(request.url).searchParams.get("sessionId");
    if (!id || !sessionId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    conn = await getConnection();
    const result = await conn.execute(
      `
      SELECT a.storage_path, a.mime_type, a.expires_at
      FROM image_attachments a
      JOIN sessions s ON s.id = a.session_id
      WHERE a.id = :id
        AND a.session_id = :sessionId
        AND a.storage_path LIKE '%.bin'
        AND a.expires_at > SYS_EXTRACT_UTC(SYSTIMESTAMP)
        AND s.is_active = 1
        AND s.expires_at > SYS_EXTRACT_UTC(SYSTIMESTAMP)
      `,
      { id: id.toUpperCase(), sessionId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if ((result.rows?.length ?? 0) === 0) {
      return NextResponse.json({ error: "File not found or expired" }, { status: 404 });
    }

    const row = result.rows[0];
    const token = createFileAccessToken({
      kind: "download",
      fileId: id.toUpperCase(),
      storagePath: row.STORAGE_PATH,
      mimeType: row.MIME_TYPE,
      expiresAt: new Date(row.EXPIRES_AT).getTime(),
    });
    return NextResponse.json({ token });
  } catch (error) {
    console.error("GET /api/files/[id]/access error:", error);
    return NextResponse.json({ error: "Failed to authorize download" }, { status: 500 });
  } finally {
    if (conn) await conn.close();
  }
}
