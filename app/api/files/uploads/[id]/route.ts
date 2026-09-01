import { promises as fs } from "fs";
import { NextResponse } from "next/server";
import {
  FILE_CHUNK_ENCRYPTION_OVERHEAD,
  FILE_CHUNK_SIZE,
  getUploadPath,
  hasUploadCapacity,
} from "@/lib/server-files";
import { getBearerToken, verifyUploadToken } from "@/lib/upload-token";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const upload = verifyUploadToken(getBearerToken(request));
    const offset = Number(request.headers.get("x-upload-offset"));
    const contentLengthHeader = request.headers.get("content-length");
    const contentLength = contentLengthHeader ? Number(contentLengthHeader) : null;

    if (
      !id ||
      !upload ||
      upload.fileId !== id.toUpperCase() ||
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      (contentLength !== null &&
        (!Number.isSafeInteger(contentLength) ||
          contentLength <= FILE_CHUNK_ENCRYPTION_OVERHEAD ||
          contentLength > FILE_CHUNK_SIZE + FILE_CHUNK_ENCRYPTION_OVERHEAD))
    ) {
      return NextResponse.json({ error: "Invalid upload chunk" }, { status: 400 });
    }

    if (!(await hasUploadCapacity(contentLength ?? FILE_CHUNK_SIZE))) {
      return NextResponse.json(
        { error: "Server storage is too low to continue this upload" },
        { status: 507 }
      );
    }

    const uploadPath = getUploadPath(`${upload.fileId}.part`);
    const stat = await fs.stat(uploadPath);
    if (stat.size !== offset) {
      return NextResponse.json(
        { error: "Upload offset mismatch", expectedOffset: stat.size },
        { status: 409 }
      );
    }
    const chunk = Buffer.from(await request.arrayBuffer());
    if (
      chunk.byteLength <= FILE_CHUNK_ENCRYPTION_OVERHEAD ||
      chunk.byteLength > FILE_CHUNK_SIZE + FILE_CHUNK_ENCRYPTION_OVERHEAD ||
      (contentLength !== null && chunk.byteLength !== contentLength)
    ) {
      return NextResponse.json({ error: "Incomplete upload chunk" }, { status: 400 });
    }
    if (offset + chunk.byteLength > upload.expectedEncryptedSize) {
      return NextResponse.json({ error: "Upload exceeds expected size" }, { status: 413 });
    }

    await fs.appendFile(uploadPath, chunk);
    return NextResponse.json({ offset: offset + chunk.byteLength });
  } catch (error: any) {
    if (error?.code === "ENOENT") {
      return NextResponse.json({ error: "Upload not found or expired" }, { status: 404 });
    }
    console.error("PUT /api/files/uploads/[id] error:", error);
    return NextResponse.json({ error: "Failed to store upload chunk" }, { status: 500 });
  }
}
