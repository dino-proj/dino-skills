import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs, buildRequest, checkResponse, decodeAudio, preprocessResult, DEFAULT_MODEL } from './music.mjs';

const request = (...argv) => buildRequest(parseArgs(argv));
const LYRICS = '[Verse]\n街灯微亮晚风轻抚\n[Chorus]\n推开木门香气弥漫';

test('generate defaults to music-3.0, hex output and 44.1 kHz mp3', async () => {
  const body = await request('generate', '--prompt', '独立民谣,忧郁', '--lyrics', LYRICS, '--output', '/tmp/song.mp3');
  assert.deepEqual(body, {
    model: DEFAULT_MODEL,
    output_format: 'hex',
    audio_setting: { sample_rate: 44100, bitrate: 256000, format: 'mp3' },
    aigc_watermark: false,
    prompt: '独立民谣,忧郁',
    lyrics: LYRICS,
  });
  assert.equal(DEFAULT_MODEL, 'music-3.0');
});

test('generate supports instrumental and auto lyrics', async () => {
  const instrumental = await request('generate', '--instrumental', '--prompt', 'lofi piano', '--output', '/tmp/a.wav');
  assert.equal(instrumental.is_instrumental, true);
  assert.equal(instrumental.audio_setting.format, 'wav');
  assert.equal(instrumental.lyrics, undefined);
  const auto = await request('generate', '--auto-lyrics', '--prompt', '夏日海边情歌', '--output', '/tmp/a.mp3');
  assert.equal(auto.lyrics_optimizer, true);
});

test('generate rejects invalid input before any API request', async () => {
  await assert.rejects(request('generate', '--prompt', 'pop', '--output', '/tmp/a.mp3'), /Provide --lyrics/);
  await assert.rejects(request('generate', '--instrumental', '--output', '/tmp/a.mp3'), /requires --prompt/);
  await assert.rejects(request('generate', '--instrumental', '--prompt', 'x', '--lyrics', LYRICS, '--output', '/tmp/a.mp3'), /cannot be combined/);
  await assert.rejects(request('generate', '--auto-lyrics', '--output', '/tmp/a.mp3'), /requires --prompt/);
  await assert.rejects(request('generate', '--lyrics', LYRICS, '--model', 'music-1.0', '--output', '/tmp/a.mp3'), /--model/);
  await assert.rejects(request('generate', '--lyrics', LYRICS, '--sample-rate', '48000', '--output', '/tmp/a.mp3'), /sample-rate/);
  await assert.rejects(request('generate', '--lyrics', 'x'.repeat(3501), '--output', '/tmp/a.mp3'), /1-3500/);
  await assert.rejects(request('generate', '--lyrics', LYRICS), /--output/);
});

test('cover reads a local reference as base64, or uses a feature id with lyrics', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'minimax-music-'));
  const song = join(dir, 'song.mp3');
  await writeFile(song, 'test');
  const direct = await request('cover', '--audio', song, '--prompt', '爵士风格翻唱，慵懒女声', '--output', join(dir, 'c.mp3'));
  assert.equal(direct.model, 'music-cover');
  assert.equal(direct.audio_base64, 'dGVzdA==');
  const url = await request('cover', '--audio', 'https://example.com/a.mp3', '--prompt', '爵士风格翻唱，慵懒女声', '--output', '/tmp/c.mp3');
  assert.equal(url.audio_url, 'https://example.com/a.mp3');
  const twoStep = await request('cover', '--feature-id', 'abc', '--lyrics', LYRICS, '--prompt', '爵士风格翻唱，慵懒女声', '--output', '/tmp/c.mp3');
  assert.equal(twoStep.cover_feature_id, 'abc');
  assert.equal(twoStep.audio_base64, undefined);
});

test('cover rejects invalid combinations', async () => {
  const prompt = ['--prompt', '爵士风格翻唱，慵懒女声'];
  await assert.rejects(request('cover', ...prompt, '--output', '/tmp/c.mp3'), /exactly one/);
  await assert.rejects(request('cover', ...prompt, '--audio', 'https://e.com/a', '--feature-id', 'x', '--output', '/tmp/c.mp3'), /exactly one/);
  await assert.rejects(request('cover', ...prompt, '--feature-id', 'x', '--output', '/tmp/c.mp3'), /requires lyrics/);
  await assert.rejects(request('cover', '--prompt', '短', '--audio', 'https://e.com/a', '--output', '/tmp/c.mp3'), /10-300/);
});

test('cover-preprocess and lyrics requests', async () => {
  assert.deepEqual(await request('cover-preprocess', '--audio', 'https://e.com/a.mp3', '--output', '/tmp/c.json'), { model: 'music-cover', audio_url: 'https://e.com/a.mp3' });
  assert.deepEqual(await request('lyrics', '--prompt', '夏日海边', '--title', '海风', '--output', '/tmp/l.txt'), { mode: 'write_full_song', prompt: '夏日海边', title: '海风' });
  assert.deepEqual(await request('lyrics', '--mode', 'edit', '--lyrics', LYRICS, '--prompt', '续写第二段', '--output', '/tmp/l.txt'), { mode: 'edit', prompt: '续写第二段', lyrics: LYRICS });
  await assert.rejects(request('lyrics', '--mode', 'edit', '--output', '/tmp/l.txt'), /requires --lyrics/);
  await assert.rejects(request('lyrics', '--mode', 'rewrite', '--output', '/tmp/l.txt'), /--mode/);
  assert.throws(() => parseArgs(['compose']), /Unknown command/);
});

test('responses: base_resp errors, hex audio and preprocess result', () => {
  assert.doesNotThrow(() => checkResponse(200, { base_resp: { status_code: 0 } }));
  assert.throws(() => checkResponse(200, { base_resp: { status_code: 1008, status_msg: 'insufficient balance' } }), /1008.*insufficient/);
  assert.throws(() => checkResponse(500, {}), /HTTP 500/);
  assert.equal(decodeAudio({ data: { audio: '74657374', status: 2 } }).toString(), 'test');
  assert.throws(() => decodeAudio({ data: { status: 1 } }), /no audio/);
  assert.throws(() => decodeAudio({ data: { audio: 'zz' } }), /malformed/);
  const result = preprocessResult({ cover_feature_id: 'id', audio_duration: 90, formatted_lyrics: LYRICS, structure_result: '{"num_segments":1}' });
  assert.deepEqual(result.structure, { num_segments: 1 });
});
