import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

// One Keychain service for every dino-skills key; the account is the environment variable name.
export const KEYCHAIN_SERVICE = 'dino-skills';
const execute = promisify(execFile);

export function storeCommand(account) {
  return `security add-generic-password -U -s ${KEYCHAIN_SERVICE} -a ${account} -w`;
}

export async function resolveApiKey(account, { env = process.env, platform = process.platform, run = execute } = {}) {
  const environmentKey = env[account]?.trim();
  if (environmentKey) return { apiKey: environmentKey, source: 'environment' };
  if (platform !== 'darwin') {
    throw new Error(`${account} is not set. Keychain fallback is available only on macOS.`);
  }

  let result;
  try {
    result = await run('/usr/bin/security', [
      'find-generic-password', '-s', KEYCHAIN_SERVICE, '-a', account, '-w',
    ], { encoding: 'utf8', timeout: 120_000, maxBuffer: 64 * 1024 });
  } catch (error) {
    if (error.code === 44) {
      throw new Error(`No ${account} in Keychain. Run this in a terminal and type the key at the hidden prompt: ${storeCommand(account)}`);
    }
    throw new Error('Keychain access failed or was cancelled. Unlock your login keychain and approve access locally, then retry.');
  }

  const apiKey = result.stdout.trim();
  if (!apiKey) throw new Error(`The ${account} Keychain entry is empty. Replace it with: ${storeCommand(account)}`);
  return { apiKey, source: 'macOS Keychain' };
}
