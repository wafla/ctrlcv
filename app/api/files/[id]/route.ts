import { promises as fs } from "fs";
import { NextResponse } from "next/server";
import { getConnection } from "@/lib/oracle";
import { cleanupExpiredFiles, getUploadPath } from "@/lib/server-files";
import { recordUsageEvent } from "@/lib/usage";

const oracledb = require("oracledb");

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let conn;

  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("sessionId");

    if (!id || !sessionId) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    conn = await getConnection();
    await cleanupExpiredFiles(conn);

    const result = await conn.execute(
      `
      SELECT a.storage_path, a.mime_type
      FROM image_attachments a
      JOIN sessions s ON s.id = a.session_id
      WHERE a.id = :id
        AND a.session_id = :sessionId
        AND a.expires_at > SYS_EXTRACT_UTC(SYSTIMESTAMP)
        AND s.is_active = 1
        AND s.expires_at > SYS_EXTRACT_UTC(SYSTIMESTAMP)
      `,
      { id: id.toUpperCase(), sessionId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if ((result.rows?.length ?? 0) === 0) {
      return NextResponse.json(
        { error: "File not found or expired" },
        { status: 404 }
      );
    }

    const row = result.rows[0];
    const file = await fs.readFile(getUploadPath(row.STORAGE_PATH));
    const body = file.buffer.slice(
      file.byteOffset,
      file.byteOffset + file.byteLength
    ) as ArrayBuffer;

    return new Response(body, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Cache-Control": "no-store",
        "X-Original-Content-Type": row.MIME_TYPE,
      },
    });
  } catch (err: any) {
    if (err?.code === "ENOENT") {
      return NextResponse.json(
        { error: "File not found or expired" },
        { status: 404 }
      );
    }

    console.error("GET /api/files/[id] error:", err);
    if (conn) {
      await recordUsageEvent(conn, "api_error");
      await conn.commit();
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  } finally {
    if (conn) await conn.close();
  }
}
