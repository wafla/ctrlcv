import { promises as fs } from "fs";
import path from "path";

const UPLOAD_DIR = path.join(process.cwd(), "ctrlcv_private", "uploads");
const ORPHAN_FILE_MAX_AGE_MS = 3 * 60 * 60 * 1000;

export async function ensureUploadDir() {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
}

export function getUploadPath(fileName: string) {
  return path.join(UPLOAD_DIR, fileName);
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
    if (!file.isFile() || !file.name.endsWith(".bin")) continue;

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
