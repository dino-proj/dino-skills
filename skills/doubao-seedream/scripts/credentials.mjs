import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

export const KEYCHAIN_SERVICE = 'com.github.copilot.doubao-seedream';
export const KEYCHAIN_ACCOUNT = 'ARK_API_KEY';
const execute = promisify(execFile);
const STORE_KEY_SCRIPT = fileURLToPath(new URL('./store-api-key.swift', import.meta.url));

export async function resolveApiKey({ env = process.env, platform = process.platform, run = execute } = {}) {
  const environmentKey = env.ARK_API_KEY?.trim();
  if (environmentKey) return { apiKey: environmentKey, source: 'environment' };
  if (platform !== 'darwin') {
    throw new Error('ARK_API_KEY is not set. Keychain fallback is available only on macOS.');
  }

  let result;
  try {
    result = await run('/usr/bin/security', [
      'find-generic-password', '-s', KEYCHAIN_SERVICE, '-a', KEYCHAIN_ACCOUNT, '-w',
    ], { encoding: 'utf8', timeout: 120_000, maxBuffer: 64 * 1024 });
  } catch (error) {
    if (error.code === 44) {
      throw new Error(`No Ark key in Keychain. Run: swift "${STORE_KEY_SCRIPT}"`);
    }
    throw new Error('Keychain access failed or was cancelled. Unlock your login keychain and approve access locally, then retry.');
  }

  const apiKey = result.stdout.trim();
  if (!apiKey) throw new Error('The Ark Keychain entry is empty. Run store-api-key.swift to replace it.');
  return { apiKey, source: 'macOS Keychain' };
}