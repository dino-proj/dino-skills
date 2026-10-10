import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { resolveApiKey, storeCommand, windowsKeyFile, KEYCHAIN_SERVICE } from './credentials.mjs';

const ACCOUNT = 'TEST_API_KEY';

test('environment takes precedence without reading Keychain', async () => {
  const result = await resolveApiKey(ACCOUNT, { env: { [ACCOUNT]: ' test-key ' }, platform: 'darwin', run: () => assert.fail('Keychain must not run') });
  assert.deepEqual(result, { apiKey: 'test-key', source: 'environment' });
});

test('macOS reads the shared service with the key name as account, without a shell', async () => {
  const result = await resolveApiKey(ACCOUNT, { env: {}, platform: 'darwin', run: async (command, args, options) => {
    assert.equal(command, '/usr/bin/security');
    assert.deepEqual(args, ['find-generic-password', '-s', KEYCHAIN_SERVICE, '-a', ACCOUNT, '-w']);
    assert.equal(options.shell, undefined);
    return { stdout: 'test-key\n' };
  } });
  assert.deepEqual(result, { apiKey: 'test-key', source: 'macOS Keychain' });
});

test('missing Keychain entry gives a prompt-based store command without a key value', async () => {
  assert.equal(storeCommand(ACCOUNT, 'darwin'), `security add-generic-password -U -s dino-skills -a ${ACCOUNT} -w`);
  await assert.rejects(resolveApiKey(ACCOUNT, { env: {}, platform: 'darwin', run: async () => { throw Object.assign(new Error('private-output'), { code: 44 }); } }),
    error => error.message.includes(storeCommand(ACCOUNT, 'darwin')));
});

test('denied, timed out and cancelled reads never expose subprocess output', async () => {
  for (const code of [36, 128, 'ETIMEDOUT']) {
    await assert.rejects(resolveApiKey(ACCOUNT, { env: {}, platform: 'darwin', run: async () => { throw Object.assign(new Error('private-output'), { code, stdout: 'test-key', stderr: 'private-output' }); } }), error => {
      assert.match(error.message, /Keychain access failed/);
      assert.doesNotMatch(error.message, /test-key|private-output/);
      return true;
    });
  }
});

test('empty entries fail closed', async () => {
  await assert.rejects(resolveApiKey(ACCOUNT, { env: {}, platform: 'darwin', run: async () => ({ stdout: '\n' }) }), /is empty/);
});

test('Windows decrypts the per-user DPAPI file via PowerShell, passing the path only through env', async () => {
  const env = { APPDATA: 'C:\\Users\\me\\AppData\\Roaming' };
  const result = await resolveApiKey(ACCOUNT, { env, platform: 'win32', run: async (command, args, options) => {
    assert.equal(command, 'powershell.exe');
    assert.equal(args.at(-2), '-Command');
    assert.doesNotMatch(args.at(-1), /TEST_API_KEY|AppData/);
    assert.equal(options.env.DINO_SKILLS_KEY_FILE, join(env.APPDATA, KEYCHAIN_SERVICE, `${ACCOUNT}.secure`));
    assert.equal(options.shell, undefined);
    return { stdout: 'test-key' };
  } });
  assert.deepEqual(result, { apiKey: 'test-key', source: 'Windows DPAPI key store' });
});

test('Windows missing key gives a hidden-input PowerShell store command', async () => {
  const command = storeCommand(ACCOUNT, 'win32');
  assert.match(command, /Read-Host -AsSecureString TEST_API_KEY \| ConvertFrom-SecureString \| Set-Content/);
  assert.match(command, /APPDATA\\dino-skills".*\\TEST_API_KEY\.secure"$/);
  await assert.rejects(resolveApiKey(ACCOUNT, { env: { APPDATA: 'C:\\x' }, platform: 'win32', run: async () => { throw Object.assign(new Error('private-output'), { code: 44 }); } }),
    error => error.message.includes(command) && error.message.includes('PowerShell'));
  await assert.rejects(resolveApiKey(ACCOUNT, { env: { APPDATA: 'C:\\x' }, platform: 'win32', run: async () => { throw Object.assign(new Error('private-output'), { code: 1, stdout: 'test-key' }); } }), error => {
    assert.match(error.message, /Windows DPAPI key store access failed/);
    assert.doesNotMatch(error.message, /test-key|private-output/);
    return true;
  });
  assert.throws(() => windowsKeyFile(ACCOUNT, {}), /APPDATA/);
  await assert.rejects(resolveApiKey(ACCOUNT, { env: {}, platform: 'win32', run: () => assert.fail('Must not run') }), /APPDATA/);
});

test('other platforms require an environment variable', async () => {
  await assert.rejects(resolveApiKey(ACCOUNT, { env: {}, platform: 'linux', run: () => assert.fail('Must not run') }), /only on macOS and Windows/);
});
