import { promises as fs } from "fs";
import path from "path";

const UPLOAD_DIR = path.join(process.cwd(), "ctrlcv_private", "uploads");
const ORPHAN_FILE_MAX_AGE_MS = 3 * 60 * 60 * 1000;
export const MIB = 1024 * 1024;
const GIB = 1024 * MIB;
const RESERVED_FREE_SPACE = 5 * GIB;

export const DEFAULT_UPLOAD_LIMIT = 10 * MIB;
export const ABSOLUTE_UPLOAD_LIMIT = 10 * GIB;
export const FILE_CHUNK_SIZE = 8 * MIB;
export const FILE_CHUNK_ENCRYPTION_OVERHEAD = 28;

export async function ensureUploadDir() {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
}

export function getUploadPath(fileName: string) {
  return path.join(UPLOAD_DIR, fileName);
}

export async function getUploadLimitBytes() {
  await ensureUploadDir();

  try {
    const stats = await fs.statfs(UPLOAD_DIR);
    const freeBytes = stats.bavail * stats.bsize;
    const usableBytes = Math.max(0, freeBytes - RESERVED_FREE_SPACE);

    if (freeBytes <= RESERVED_FREE_SPACE) return DEFAULT_UPLOAD_LIMIT;
    const fairShare = Math.floor(usableBytes / 3 / MIB) * MIB;
    return Math.min(ABSOLUTE_UPLOAD_LIMIT, Math.max(DEFAULT_UPLOAD_LIMIT, fairShare));
  } catch (error) {
    console.error("Failed to read upload disk capacity:", error);
    return DEFAULT_UPLOAD_LIMIT;
  }
}

export async function hasUploadCapacity(requiredBytes: number) {
  await ensureUploadDir();

  try {
    const stats = await fs.statfs(UPLOAD_DIR);
    const freeBytes = stats.bavail * stats.bsize;
    const usableBytes = Math.max(0, freeBytes - RESERVED_FREE_SPACE);
    const fairShare = Math.floor(usableBytes / 3 / MIB) * MIB;
    const requiredReserve =
      fairShare <= DEFAULT_UPLOAD_LIMIT
        ? DEFAULT_UPLOAD_LIMIT
        : RESERVED_FREE_SPACE;
    return freeBytes - requiredBytes >= requiredReserve;
  } catch (error) {
    console.error("Failed to verify upload disk capacity:", error);
    return false;
  }
}

export async function deleteStoredFile(fileName: string) {
  try {
    await fs.unlink(getUploadPath(fileName));
  } catch (error: any) {
    if (error?.code !== "ENOENT") {
      console.error("Failed to delete uploaded file:", error);
    }
  }
}

async function cleanupOrphanedFiles(conn: any) {
  await ensureUploadDir();

  const files = await fs.readdir(UPLOAD_DIR, { withFileTypes: true });
  const now = Date.now();

  for (const file of files) {
    if (
      !file.isFile() ||
      (!file.name.endsWith(".bin") && !file.name.endsWith(".part"))
    ) continue;

    const filePath = getUploadPath(file.name);
    const stat = await fs.stat(filePath);
    const isOldEnough = now - stat.mtimeMs > ORPHAN_FILE_MAX_AGE_MS;
    if (!isOldEnough) continue;

    const result = await conn.execute(
      `
      SELECT 1
      FROM image_attachments
      WHERE storage_path = :storagePath
      FETCH FIRST 1 ROWS ONLY
      `,
      { storagePath: file.name }
    );

    if ((result.rows?.length ?? 0) === 0) {
      await deleteStoredFile(file.name);
    }
  }
}

export async function cleanupExpiredFiles(conn: any) {
  const result = await conn.execute(`
    SELECT id, storage_path
    FROM image_attachments
    WHERE expires_at <= SYS_EXTRACT_UTC(SYSTIMESTAMP)
  `);

  const rows = result.rows ?? [];
  if (rows.length > 0) {
    for (const row of rows) {
      await deleteStoredFile(row.STORAGE_PATH);
    }

    await conn.execute(`
      DELETE FROM image_attachments
      WHERE expires_at <= SYS_EXTRACT_UTC(SYSTIMESTAMP)
    `);
    await conn.commit();
  }

  await cleanupOrphanedFiles(conn);
}
