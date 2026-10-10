import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs, buildRequest, extractAudio, MODEL, STYLES } from './synthesize.mjs';

const request = (...argv) => buildRequest(parseArgs(argv));

test('preset voice puts text in assistant and instruction in user', async () => {
  const body = await request('--text', '(开心)你好', '--instruction', '语速稍快', '--voice', '冰糖', '--output', '/tmp/a.mp3');
  assert.equal(body.model, MODEL);
  assert.deepEqual(body.messages, [
    { role: 'user', content: '语速稍快' },
    { role: 'assistant', content: '(开心)你好' },
  ]);
  assert.deepEqual(body.audio, { format: 'mp3', voice: '冰糖' });
});

test('defaults to mimo_default voice and wav; .pcm maps to pcm16', async () => {
  const body = await request('--text', 'hi', '--output', '/tmp/a.out');
  assert.deepEqual(body.audio, { format: 'wav', voice: 'mimo_default' });
  assert.deepEqual(body.messages, [{ role: 'assistant', content: 'hi' }]);
  assert.equal((await request('--text', 'hi', '--output', '/tmp/a.pcm')).audio.format, 'pcm16');
  assert.equal((await request('--text', 'hi', '--format', 'pcm', '--output', '/tmp/a.wav')).audio.format, 'pcm16');
});

test('reads text from a file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mimo-tts-'));
  const file = join(dir, 'text.txt');
  await writeFile(file, '  长文本\n');
  const body = await request('--text-file', file, '--output', join(dir, 'out.wav'));
  assert.equal(body.messages.at(-1).content, '长文本');
});

test('rejects invalid combinations before any API request', async () => {
  await assert.rejects(request('--output', '/tmp/a.wav'), /--text/);
  await assert.rejects(request('--text', 'hi'), /--output/);
  await assert.rejects(request('--text', 'hi', '--voice', 'Nobody', '--output', '/tmp/a.wav'), /Unknown preset/);
  await assert.rejects(request('--text', 'hi', '--format', 'flac', '--output', '/tmp/a.wav'), /--format/);
  assert.throws(() => parseArgs(['--voice-design']), /Unknown option/);
  assert.throws(() => parseArgs(['--text']), /Missing value/);
});

test('teaching styles send the built-in instruction and default to Mia', async () => {
  const body = await request('--style', 'teacher-slow', '--text', 'The cat sat.', '--output', '/tmp/a.mp3');
  assert.deepEqual(body.messages[0], { role: 'user', content: STYLES['teacher-slow'] });
  assert.equal(body.audio.voice, 'Mia');
  assert.equal((await request('--style', 'teacher', '--voice', 'Dean', '--text', 'Hi.', '--output', '/tmp/a.mp3')).audio.voice, 'Dean');
  await assert.rejects(request('--style', 'fast', '--text', 'Hi.', '--output', '/tmp/a.mp3'), /Unknown style/);
  await assert.rejects(request('--style', 'teacher', '--instruction', 'x', '--text', 'Hi.', '--output', '/tmp/a.mp3'), /either --style/);
  await assert.rejects(request('--style', 'teacher', '--voice', '冰糖', '--text', 'Hi.', '--output', '/tmp/a.mp3'), /English voice/);
});

test('extracts base64 audio and fails without it', () => {
  assert.equal(extractAudio({ choices: [{ message: { audio: { data: 'dGVzdA==' } } }] }).toString(), 'test');
  assert.throws(() => extractAudio({ choices: [{ finish_reason: 'content_filter', message: {} }] }), /content_filter/);
});
