import { fileURLToPath } from 'node:url';
import path from 'node:path';

export function checkNodeVersion(version = process.versions.node) {
  const majorVersion = Number.parseInt(String(version).split('.')[0], 10);

  if (!Number.isInteger(majorVersion) || majorVersion < 20) {
    throw new Error(`Node.js 20+ is required. Current version: ${version}`);
  }
}

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  try {
    checkNodeVersion();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
