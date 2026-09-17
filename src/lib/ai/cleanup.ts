import { readdir, stat, unlink } from 'node:fs/promises';
import path from 'node:path';

const TEMP_DIR = path.join(process.cwd(), 'public', 'uploads', 'temp');
const MAX_AGE_MS = 60 * 60 * 1000; // 1 hour max lifecycle for temporary upload scans

/**
 * Sweeps the public/uploads/temp directory and removes files older than MAX_AGE_MS.
 */
export async function cleanTempUploads(): Promise<{ deleted: number; errors: number }> {
  let deleted = 0;
  let errors = 0;
  try {
    const files = await readdir(TEMP_DIR);
    const now = Date.now();

    for (const file of files) {
      if (file === '.gitkeep') continue;
      const filePath = path.join(TEMP_DIR, file);
      try {
        const fileStat = await stat(filePath);
        if (now - fileStat.mtimeMs > MAX_AGE_MS) {
          await unlink(filePath);
          deleted++;
        }
      } catch {
        errors++;
      }
    }
  } catch {
    // Directory might not exist or be empty
  }
  return { deleted, errors };
}

// Auto-run cleanup every 30 minutes in background
setInterval(() => {
  cleanTempUploads().catch(() => {});
}, 30 * 60 * 1000).unref?.();
