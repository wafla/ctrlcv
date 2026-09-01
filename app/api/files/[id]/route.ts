import { promises as fs } from "fs";
import { NextResponse } from "next/server";
import { getConnection } from "@/lib/oracle";
import {
  cleanupExpiredFiles,
  FILE_CHUNK_ENCRYPTION_OVERHEAD,
  FILE_CHUNK_SIZE,
  getUploadPath,
  MIB,
} from "@/lib/server-files";
import { recordUsageEvent } from "@/lib/usage";
import { getBearerToken, verifyFileAccessToken } from "@/lib/upload-token";

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
    const access = verifyFileAccessToken(getBearerToken(request));
    const hasRange = searchParams.has("offset") || searchParams.has("length");
    const offset = Number(searchParams.get("offset"));
    const length = Number(searchParams.get("length"));

    if (
      !id ||
      (!sessionId && !access) ||
      (access && access.fileId !== id.toUpperCase()) ||
      (hasRange &&
        (!Number.isSafeInteger(offset) ||
          offset < 0 ||
          !Number.isSafeInteger(length) ||
          length <= 0 ||
          length > FILE_CHUNK_SIZE + FILE_CHUNK_ENCRYPTION_OVERHEAD))
    ) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    let row: { STORAGE_PATH: string; MIME_TYPE: string };
    if (access) {
      row = {
        STORAGE_PATH: access.storagePath,
        MIME_TYPE: access.mimeType,
      };
    } else {
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
      row = result.rows[0];
    }
    if (!String(row.STORAGE_PATH).endsWith(".bin")) {
      return NextResponse.json({ error: "File upload is incomplete" }, { status: 409 });
    }

    const filePath = getUploadPath(row.STORAGE_PATH);
    const stat = await fs.stat(filePath);

    if (hasRange) {
      if (offset + length > stat.size) {
        return NextResponse.json({ error: "Invalid file range" }, { status: 416 });
      }

      const handle = await fs.open(filePath, "r");
      try {
        const chunk = Buffer.allocUnsafe(length);
        const { bytesRead } = await handle.read(chunk, 0, length, offset);
        if (bytesRead !== length) {
          return NextResponse.json({ error: "Incomplete file range" }, { status: 500 });
        }
        return new Response(chunk, {
          headers: {
            "Content-Type": "application/octet-stream",
            "Cache-Control": "no-store",
            "X-Original-Content-Type": row.MIME_TYPE,
          },
        });
      } finally {
        await handle.close();
      }
    }

    if (stat.size > 100 * MIB) {
      return NextResponse.json(
        { error: "Large files must be downloaded in chunks" },
        { status: 400 }
      );
    }

    const file = await fs.readFile(filePath);
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
