import { pathToFileURL } from 'node:url';
import { rollbackRelease } from './install.mjs';

/** Select a verified compatible inactive release without touching runtime state. */
export async function rollbackInstallation(options) {
  return rollbackRelease(options);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [root, release, confirmation, ...extra] = process.argv.slice(2);
    if (!root || !release || confirmation !== 'confirm-inactive' || extra.length) {
      throw new Error('USAGE_ROOT_RELEASE_CONFIRM_INACTIVE');
    }
    console.log(JSON.stringify(await rollbackInstallation({ root, release })));
  } catch (error) {
    const message = error instanceof Error && /^[A-Z_]+$/.test(error.message)
      ? error.message
      : 'VALIDATION_FAILED';
    console.error(`grok-photon rollback failed: ${message}`);
    process.exitCode = 1;
  }
}
