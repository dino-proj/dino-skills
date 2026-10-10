import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';

// One store for every dino-skills key; the macOS account / Windows file name is the environment variable name.
export const KEYCHAIN_SERVICE = 'dino-skills';
const execute = promisify(execFile);
const MISSING = 44;

// Decrypts a DPAPI SecureString file (current Windows user only); the path comes from an env var, never interpolated.
const WINDOWS_READ_SCRIPT = [
  "$ErrorActionPreference = 'Stop'",
  '$path = $env:DINO_SKILLS_KEY_FILE',
  `if (-not (Test-Path -LiteralPath $path)) { exit ${MISSING} }`,
  '$secure = (Get-Content -LiteralPath $path -Raw).Trim() | ConvertTo-SecureString',
  "[Console]::Out.Write([System.Net.NetworkCredential]::new('', $secure).Password)",
].join('; ');

export function windowsKeyFile(account, env = process.env) {
  if (!env.APPDATA) throw new Error(`${account} is not set and %APPDATA% is unavailable for the Windows key store.`);
  return join(env.APPDATA, KEYCHAIN_SERVICE, `${account}.secure`);
}

export function storeCommand(account, platform = process.platform) {
  if (platform === 'win32') {
    return `$d = "$env:APPDATA\\${KEYCHAIN_SERVICE}"; New-Item -Force -ItemType Directory $d | Out-Null; Read-Host -AsSecureString ${account} | ConvertFrom-SecureString | Set-Content "$d\\${account}.secure"`;
  }
  return `security add-generic-password -U -s ${KEYCHAIN_SERVICE} -a ${account} -w`;
}

function readStore(account, keyFile, { env, platform, run }) {
  if (platform === 'darwin') {
    return run('/usr/bin/security', ['find-generic-password', '-s', KEYCHAIN_SERVICE, '-a', account, '-w'],
      { encoding: 'utf8', timeout: 120_000, maxBuffer: 64 * 1024 });
  }
  return run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', WINDOWS_READ_SCRIPT],
    { encoding: 'utf8', timeout: 120_000, maxBuffer: 64 * 1024, windowsHide: true, env: { ...env, DINO_SKILLS_KEY_FILE: keyFile } });
}

export async function resolveApiKey(account, { env = process.env, platform = process.platform, run = execute } = {}) {
  const environmentKey = env[account]?.trim();
  if (environmentKey) return { apiKey: environmentKey, source: 'environment' };
  if (platform !== 'darwin' && platform !== 'win32') {
    throw new Error(`${account} is not set. The key store fallback is available only on macOS and Windows.`);
  }
  const storeName = platform === 'darwin' ? 'macOS Keychain' : 'Windows DPAPI key store';
  const shell = platform === 'darwin' ? 'a terminal' : 'PowerShell';
  const keyFile = platform === 'win32' ? windowsKeyFile(account, env) : undefined;

  let result;
  try {
    result = await readStore(account, keyFile, { env, platform, run });
  } catch (error) {
    if (error.code === MISSING) {
      throw new Error(`No ${account} in the ${storeName}. Run this in ${shell} and type the key at the hidden prompt: ${storeCommand(account, platform)}`);
    }
    throw new Error(`${storeName} access failed or was cancelled. Approve access locally (and unlock the keychain on macOS), then retry.`);
  }

  const apiKey = result.stdout.trim();
  if (!apiKey) throw new Error(`The ${account} entry in the ${storeName} is empty. Replace it with: ${storeCommand(account, platform)}`);
  return { apiKey, source: storeName };
}
