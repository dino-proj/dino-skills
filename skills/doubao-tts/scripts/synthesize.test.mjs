import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs, buildRequest, createFrameParser, collectFrame, pcmToWav, DEFAULT_SPEAKER } from './synthesize.mjs';

const request = (...argv) => buildRequest(parseArgs(argv));

test('defaults to seed-tts-2.0, default speaker and 24 kHz mp3', async () => {
  const result = await request('--text', '你好', '--output', '/tmp/a.mp3');
  assert.equal(result.resource, 'seed-tts-2.0');
  assert.deepEqual(result.body, { req_params: { text: '你好', speaker: DEFAULT_SPEAKER, audio_params: { format: 'mp3', sample_rate: 24000 } } });
});

test('maps options to audio_params and serialized additions', async () => {
  const result = await request('--text', 'Hello.', '--speaker', 'zh_male_wennuanahu_uranus_bigtts', '--instruction', '用开心的语气说',
    '--speech-rate', '-20', '--loudness-rate', '10', '--language', 'en', '--silence', '500', '--latex', '--subtitles', '/tmp/s.json', '--output', '/tmp/a.mp3');
  const params = result.body.req_params;
  assert.deepEqual(params.audio_params, { format: 'mp3', sample_rate: 24000, speech_rate: -20, loudness_rate: 10, enable_subtitle: true });
  assert.deepEqual(JSON.parse(params.additions), {
    context_texts: ['用开心的语气说'], explicit_language: 'en', silence_duration: 500, latex_parser: 'v2', disable_markdown_filter: true,
  });
});

test('wav is requested as pcm; ogg defaults to 48 kHz; text can come from a file', async () => {
  const wav = await request('--text', 'hi', '--output', '/tmp/a.wav');
  assert.equal(wav.format, 'wav');
  assert.equal(wav.body.req_params.audio_params.format, 'pcm');
  const ogg = await request('--text', 'hi', '--output', '/tmp/a.ogg');
  assert.deepEqual(ogg.body.req_params.audio_params, { format: 'ogg_opus', sample_rate: 48000 });
  const dir = await mkdtemp(join(tmpdir(), 'doubao-tts-'));
  await writeFile(join(dir, 't.txt'), '  长文本\n');
  assert.equal((await request('--text-file', join(dir, 't.txt'), '--output', join(dir, 'o.mp3'))).body.req_params.text, '长文本');
});

test('rejects invalid input before any API request', async () => {
  await assert.rejects(request('--output', '/tmp/a.mp3'), /--text/);
  await assert.rejects(request('--text', 'hi'), /--output/);
  await assert.rejects(request('--text', 'hi', '--resource', 'seed-tts-1.0', '--output', '/tmp/a.mp3'), /--resource/);
  await assert.rejects(request('--text', 'hi', '--resource', 'seed-icl-2.0', '--output', '/tmp/a.mp3'), /cloned voice/);
  await assert.rejects(request('--text', 'hi', '--resource', 'seed-icl-2.0', '--speaker', 'S_x', '--instruction', 'x', '--output', '/tmp/a.mp3'), /not supported/);
  await assert.rejects(request('--text', 'hi', '--speech-rate', '200', '--output', '/tmp/a.mp3'), /speech-rate/);
  await assert.rejects(request('--text', 'hi', '--sample-rate', '44000', '--output', '/tmp/a.mp3'), /sample-rate/);
  await assert.rejects(request('--text', 'hi', '--sample-rate', '24000', '--output', '/tmp/a.ogg'), /48000/);
  await assert.rejects(request('--text', 'hi', '--format', 'flac', '--output', '/tmp/a.mp3'), /--format/);
  assert.throws(() => parseArgs(['--speech-rate', 'fast']), /integer/);
});

test('frame parser handles split, concatenated and newline-delimited JSON', () => {
  const parse = createFrameParser();
  assert.deepEqual(parse('{"code":0,"data":"YQ=="}{"code":0,"me'), [{ code: 0, data: 'YQ==' }]);
  assert.deepEqual(parse('ssage":"a}b{"}\n{"code":20000000}'), [{ code: 0, message: 'a}b{' }, { code: 20000000 }]);
});

test('collects audio, sentences and usage; fails on error codes', () => {
  const state = { audio: [], sentences: [], done: false };
  collectFrame({ code: 0, data: 'YQ==' }, state);
  collectFrame({ code: 0, data: 'Yg==', sentence: { text: 'ab', words: [] } }, state);
  collectFrame({ code: 20000000, usage: { text_words: 2 } }, state);
  assert.equal(Buffer.concat(state.audio).toString(), 'ab');
  assert.equal(state.sentences.length, 1);
  assert.deepEqual(state.usage, { text_words: 2 });
  assert.equal(state.done, true);
  assert.throws(() => collectFrame({ code: 45000000, message: 'quota exceeded' }, state), /45000000.*quota/);
});

test('pcmToWav writes a valid 16-bit mono header', () => {
  const wav = pcmToWav(Buffer.alloc(100), 24000);
  assert.equal(wav.length, 144);
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wav.readUInt32LE(24), 24000);
  assert.equal(wav.readUInt32LE(40), 100);
});
