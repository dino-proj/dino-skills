import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveApiKey, KEYCHAIN_ACCOUNT, KEYCHAIN_SERVICE } from './credentials.mjs';

test('environment takes precedence without reading Keychain', async () => {
  const result = await resolveApiKey({ env: { ARK_API_KEY: ' test-key ' }, platform: 'darwin', run: () => assert.fail('Keychain must not run') });
  assert.deepEqual(result, { apiKey: 'test-key', source: 'environment' });
});

test('macOS reads only the skill-specific entry without a shell', async () => {
  const result = await resolveApiKey({ env: {}, platform: 'darwin', run: async (command, args, options) => {
    assert.equal(command, '/usr/bin/security');
    assert.deepEqual(args, ['find-generic-password', '-s', KEYCHAIN_SERVICE, '-a', KEYCHAIN_ACCOUNT, '-w']);
    assert.equal(options.shell, undefined);
    return { stdout: 'test-key\n' };
  } });
  assert.deepEqual(result, { apiKey: 'test-key', source: 'macOS Keychain' });
});

test('missing Keychain entry gives setup instructions', async () => {
  await assert.rejects(resolveApiKey({ env: {}, platform: 'darwin', run: async () => { throw Object.assign(new Error('private-output'), { code: 44 }); } }), /Run: swift/);
});

test('denied, timed out and cancelled reads never expose subprocess output', async () => {
  for (const code of [36, 128, 'ETIMEDOUT']) {
    await assert.rejects(resolveApiKey({ env: {}, platform: 'darwin', run: async () => { throw Object.assign(new Error('private-output'), { code, stdout: 'test-key', stderr: 'private-output' }); } }), error => {
      assert.match(error.message, /Keychain access failed/);
      assert.doesNotMatch(error.message, /test-key|private-output/);
      return true;
    });
  }
});

test('empty entries fail closed', async () => {
  await assert.rejects(resolveApiKey({ env: {}, platform: 'darwin', run: async () => ({ stdout: '\n' }) }), /entry is empty/);
});

test('non-macOS requires an environment variable', async () => {
  await assert.rejects(resolveApiKey({ env: {}, platform: 'linux', run: () => assert.fail('Must not run') }), /only on macOS/);
});