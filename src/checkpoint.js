import { readFile, writeFile, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';

const CHECKPOINT_FILE = '.checkpoint.json';

function checkpointPath(outputDir) {
  return join(outputDir, CHECKPOINT_FILE);
}

/**
 * Load checkpoint if it exists. Returns a Set of already-processed URLs.
 */
export async function loadCheckpoint(outputDir) {
  const path = checkpointPath(outputDir);
  if (!existsSync(path)) {
    return new Set();
  }
  try {
    const data = JSON.parse(await readFile(path, 'utf-8'));
    console.log(`Resuming from checkpoint (${data.processedUrls.length} URLs already processed, saved at ${data.timestamp})`);
    return new Set(data.processedUrls);
  } catch {
    return new Set();
  }
}

/**
 * Save current progress to checkpoint file.
 */
export async function saveCheckpoint(outputDir, processedUrls) {
  const path = checkpointPath(outputDir);
  await writeFile(
    path,
    JSON.stringify(
      {
        processedUrls: [...processedUrls],
        timestamp: new Date().toISOString(),
      },
      null,
      2
    )
  );
}

/**
 * Remove checkpoint file on successful completion.
 */
export async function clearCheckpoint(outputDir) {
  const path = checkpointPath(outputDir);
  if (existsSync(path)) {
    await unlink(path);
  }
}
