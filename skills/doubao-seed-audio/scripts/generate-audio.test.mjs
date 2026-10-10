import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs, buildRequest, parseResult, MODEL } from './generate-audio.mjs';

const request = (...argv) => buildRequest(parseArgs(argv));

test('text-only generation defaults to seed-audio-1.0 and wav', async () => {
  const body = await request('--prompt', '雨夜，远处雷声，钢琴独奏', '--output', '/tmp/a.out');
  assert.deepEqual(body, { model: MODEL, text_prompt: '雨夜，远处雷声，钢琴独奏', audio_config: { format: 'wav' } });
  assert.equal(MODEL, 'seed-audio-1.0');
});

test('audio and speaker references keep command-line order for @音频N', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'seed-audio-'));
  const sample = join(dir, 'voice.wav');
  await writeFile(sample, 'test');
  const body = await request('--prompt', '男子（饰演者为@音频1）与女子（饰演者为@音频2）对话', '--audio', sample, '--speaker', 'zh_female_vv_uranus_bigtts',
    '--format', 'mp3', '--sample-rate', '48000', '--speech-rate', '-10', '--pitch-rate', '2', '--output', join(dir, 'o.mp3'));
  assert.deepEqual(body.references, [{ audio_data: 'dGVzdA==' }, { speaker: 'zh_female_vv_uranus_bigtts' }]);
  assert.deepEqual(body.audio_config, { format: 'mp3', sample_rate: 48000, speech_rate: -10, pitch_rate: 2 });
});

test('image and URL references', async () => {
  const image = await request('--prompt', '“加入舰队，一起上天吧！”', '--image', 'https://example.com/a.png', '--output', '/tmp/a.mp3');
  assert.deepEqual(image.references, [{ image_url: 'https://example.com/a.png' }]);
  const url = await request('--prompt', '@音频1 说：“你好”', '--audio', 'https://example.com/a.wav', '--output', '/tmp/a.wav');
  assert.deepEqual(url.references, [{ audio_url: 'https://example.com/a.wav' }]);
});

test('rejects invalid input before any API request', async () => {
  const url = 'https://example.com/a.wav';
  await assert.rejects(request('--output', '/tmp/a.wav'), /--prompt/);
  await assert.rejects(request('--prompt', 'x'), /--output/);
  await assert.rejects(request('--prompt', 'x'.repeat(3001), '--output', '/tmp/a.wav'), /3000/);
  await assert.rejects(request('--prompt', 'x', '--audio', url, '--audio', url, '--speaker', 's', '--speaker', 's', '--output', '/tmp/a.wav'), /At most 3/);
  await assert.rejects(request('--prompt', 'x', '--audio', url, '--image', 'https://e.com/a.png', '--output', '/tmp/a.wav'), /cannot be combined/);
  await assert.rejects(request('--prompt', '饰演者为@音频2', '--audio', url, '--output', '/tmp/a.wav'), /@音频2/);
  await assert.rejects(request('--prompt', 'x', '--audio', 'a.flac', '--output', '/tmp/a.wav'), /Reference audio must be/);
  await assert.rejects(request('--prompt', 'x', '--sample-rate', '40000', '--output', '/tmp/a.mp3'), /sample-rate for mp3/);
  await assert.rejects(request('--prompt', 'x', '--sample-rate', '44100', '--output', '/tmp/a.ogg'), /ogg_opus/);
  await assert.rejects(request('--prompt', 'x', '--pitch-rate', '20', '--output', '/tmp/a.wav'), /pitch-rate/);
  assert.throws(() => parseArgs(['--image', 'a.png', '--image', 'b.png']), /Only one --image/);
});

test('parseResult accepts audio or url and reports errors', () => {
  assert.equal(parseResult(200, '{"audio":"YQ==","duration":1.5}').duration, 1.5);
  assert.equal(parseResult(200, '{"url":"https://e.com/a.wav"}').url, 'https://e.com/a.wav');
  assert.throws(() => parseResult(400, '{"code":45000001,"message":"invalid param"}'), /45000001.*invalid param/);
  assert.throws(() => parseResult(200, '{}'), /failed/);
  assert.throws(() => parseResult(502, 'Bad Gateway'), /502.*Bad Gateway/);
});
