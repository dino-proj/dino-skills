#!/usr/bin/env node

import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveApiKey } from './credentials.mjs';

const API_BASE = 'https://api.minimax.cn/v1';
export const DEFAULT_MODEL = 'music-3.0';
export const MUSIC_MODELS = ['music-3.0', 'music-2.6'];
const COVER_MODEL = 'music-cover';
const ENDPOINTS = {
  generate: 'music_generation',
  cover: 'music_generation',
  'cover-preprocess': 'music_cover_preprocess',
  lyrics: 'lyrics_generation',
};
const SAMPLE_RATES = [16000, 24000, 32000, 44100];
const BITRATES = [32000, 64000, 128000, 256000];
const MAX_REFERENCE_BYTES = 50 * 1024 * 1024;

function usage() {
  console.log(`Usage:
  node music.mjs lyrics --prompt <text> --output <lyrics.txt> [--title <t>]
  node music.mjs lyrics --mode edit --lyrics-file <in.txt> --prompt <instruction> --output <out.txt>
  node music.mjs generate --prompt <style> --lyrics-file <lyrics.txt> --output <song.mp3>
  node music.mjs generate --instrumental --prompt <style> --output <track.mp3>
  node music.mjs generate --auto-lyrics --prompt <theme and style> --output <song.mp3>
  node music.mjs cover-preprocess --audio <file-or-url> --output <cover.json>
  node music.mjs cover --prompt <target style> (--audio <file-or-url> | --feature-id <id> --lyrics-file <f>) --output <cover.mp3>
  node music.mjs --check-credentials

Options:
  --prompt <text> / --prompt-file <path>    Style, mood and scene; or the lyrics brief
  --lyrics <text> / --lyrics-file <path>    Lyrics with [Verse]/[Chorus]... tags, lines separated by newlines
  --instrumental                            No vocals (generate)
  --auto-lyrics                             Write lyrics from --prompt (generate)
  --model <id>                              ${MUSIC_MODELS.join(' or ')} (default ${DEFAULT_MODEL})
  --audio <path-or-url>                     Reference song for cover (6 s - 6 min, <= 50 MB)
  --feature-id <id>                         cover_feature_id from cover-preprocess (valid 24 h)
  --mode <write|edit>                       Lyrics mode (default write)
  --title <text>                            Keep this song title (lyrics)
  --format <mp3|wav|pcm>                    Audio format; default from the output extension, then mp3
  --sample-rate <hz>                        ${SAMPLE_RATES.join(', ')} (default 44100)
  --bitrate <bps>                           ${BITRATES.join(', ')} (default 256000)
  --watermark                               Append an AIGC audio watermark
  --output <path>                           Output file
  --help                                    Show this help`);
}

export function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (command === undefined || command === '--help') return { help: true };
  if (command === '--check-credentials') return { checkCredentials: true };
  if (!ENDPOINTS[command]) throw new Error(`Unknown command: ${command}. Use ${Object.keys(ENDPOINTS).join(', ')}.`);
  const options = { command };
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index];
    const next = () => {
      const value = rest[index + 1];
      if (value === undefined || value.startsWith('--')) throw new Error(`Missing value for ${argument}`);
      index += 1;
      return value;
    };

    switch (argument) {
      case '--prompt': options.prompt = next(); break;
      case '--prompt-file': options.promptFile = next(); break;
      case '--lyrics': options.lyrics = next(); break;
      case '--lyrics-file': options.lyricsFile = next(); break;
      case '--instrumental': options.instrumental = true; break;
      case '--auto-lyrics': options.autoLyrics = true; break;
      case '--model': options.model = next(); break;
      case '--audio': options.audio = next(); break;
      case '--feature-id': options.featureId = next(); break;
      case '--mode': options.mode = next(); break;
      case '--title': options.title = next(); break;
      case '--format': options.format = next().toLowerCase(); break;
      case '--sample-rate': options.sampleRate = Number(next()); break;
      case '--bitrate': options.bitrate = Number(next()); break;
      case '--watermark': options.watermark = true; break;
      case '--output': options.output = next(); break;
      case '--help': options.help = true; break;
      default: throw new Error(`Unknown option: ${argument}`);
    }
  }
  return options;
}

async function readText(value, file, name) {
  if (value !== undefined && file) throw new Error(`Use either --${name} or --${name}-file, not both.`);
  const text = file ? await readFile(resolve(file), 'utf8') : value;
  return text?.replace(/\r\n?/g, '\n').trim() || undefined;
}

function checkLength(text, name, min, max) {
  const length = [...text].length;
  if (length < min || length > max) throw new Error(`${name} must be ${min}-${max} characters (got ${length}).`);
}

export function audioSetting(options) {
  const extension = extname(options.output).slice(1).toLowerCase();
  const format = options.format || (['mp3', 'wav', 'pcm'].includes(extension) ? extension : 'mp3');
  if (!['mp3', 'wav', 'pcm'].includes(format)) throw new Error('--format must be mp3, wav or pcm.');
  const sampleRate = options.sampleRate ?? 44100;
  const bitrate = options.bitrate ?? 256000;
  if (!SAMPLE_RATES.includes(sampleRate)) throw new Error(`--sample-rate must be one of ${SAMPLE_RATES.join(', ')}.`);
  if (!BITRATES.includes(bitrate)) throw new Error(`--bitrate must be one of ${BITRATES.join(', ')}.`);
  return { sample_rate: sampleRate, bitrate, format };
}

async function referenceAudio(input) {
  if (/^https?:\/\//i.test(input)) return { audio_url: input };
  const path = resolve(input);
  if ((await stat(path)).size > MAX_REFERENCE_BYTES) throw new Error('Reference audio must not exceed 50 MB.');
  return { audio_base64: (await readFile(path)).toString('base64') };
}

async function buildGenerate(options) {
  const prompt = await readText(options.prompt, options.promptFile, 'prompt');
  const lyrics = await readText(options.lyrics, options.lyricsFile, 'lyrics');
  const model = options.model || DEFAULT_MODEL;
  if (!MUSIC_MODELS.includes(model)) throw new Error(`--model must be ${MUSIC_MODELS.join(' or ')}.`);
  if (prompt) checkLength(prompt, 'Prompt', 1, 2000);
  if (lyrics) checkLength(lyrics, 'Lyrics', 1, 3500);
  if (options.instrumental) {
    if (!prompt) throw new Error('--instrumental requires --prompt describing the music.');
    if (lyrics || options.autoLyrics) throw new Error('--instrumental cannot be combined with lyrics or --auto-lyrics.');
  } else if (options.autoLyrics) {
    if (!prompt) throw new Error('--auto-lyrics requires --prompt describing the song.');
    if (lyrics) throw new Error('Use either --auto-lyrics or explicit lyrics, not both.');
  } else if (!lyrics) {
    throw new Error('Provide --lyrics/--lyrics-file, or use --auto-lyrics or --instrumental.');
  }

  const body = { model, output_format: 'hex', audio_setting: audioSetting(options), aigc_watermark: Boolean(options.watermark) };
  if (prompt) body.prompt = prompt;
  if (lyrics) body.lyrics = lyrics;
  if (options.instrumental) body.is_instrumental = true;
  if (options.autoLyrics) body.lyrics_optimizer = true;
  return body;
}

async function buildCover(options) {
  const prompt = await readText(options.prompt, options.promptFile, 'prompt');
  const lyrics = await readText(options.lyrics, options.lyricsFile, 'lyrics');
  if (!prompt) throw new Error('cover requires --prompt describing the target style.');
  checkLength(prompt, 'Cover prompt', 10, 300);
  if (lyrics) checkLength(lyrics, 'Cover lyrics', 10, 1000);
  if (Boolean(options.audio) === Boolean(options.featureId)) throw new Error('cover requires exactly one of --audio or --feature-id.');
  if (options.featureId && !lyrics) throw new Error('--feature-id requires lyrics (edit the formatted_lyrics from cover-preprocess).');

  const body = { model: COVER_MODEL, prompt, output_format: 'hex', audio_setting: audioSetting(options), aigc_watermark: Boolean(options.watermark) };
  if (lyrics) body.lyrics = lyrics;
  if (options.featureId) body.cover_feature_id = options.featureId;
  else Object.assign(body, await referenceAudio(options.audio));
  return body;
}

async function buildPreprocess(options) {
  if (!options.audio) throw new Error('cover-preprocess requires --audio.');
  return { model: COVER_MODEL, ...await referenceAudio(options.audio) };
}

async function buildLyrics(options) {
  const prompt = await readText(options.prompt, options.promptFile, 'prompt');
  const lyrics = await readText(options.lyrics, options.lyricsFile, 'lyrics');
  const mode = { write: 'write_full_song', edit: 'edit' }[options.mode || 'write'];
  if (!mode) throw new Error('--mode must be write or edit.');
  if (mode === 'edit' && !lyrics) throw new Error('--mode edit requires --lyrics or --lyrics-file.');
  if (mode !== 'edit' && lyrics) throw new Error('Existing lyrics are only used with --mode edit.');
  if (prompt) checkLength(prompt, 'Prompt', 1, 2000);
  if (lyrics) checkLength(lyrics, 'Lyrics', 1, 3500);

  const body = { mode };
  if (prompt) body.prompt = prompt;
  if (lyrics) body.lyrics = lyrics;
  if (options.title) body.title = options.title;
  return body;
}

export async function buildRequest(options) {
  if (!options.output) throw new Error('--output is required');
  const builders = { generate: buildGenerate, cover: buildCover, 'cover-preprocess': buildPreprocess, lyrics: buildLyrics };
  return builders[options.command](options);
}

export function checkResponse(status, payload) {
  const code = payload?.base_resp?.status_code;
  if (status < 200 || status >= 300 || code === undefined || code !== 0) {
    const message = payload?.base_resp?.status_msg || payload?.message || `HTTP ${status}`;
    throw new Error(`MiniMax API request failed (${code ?? status}): ${message}`);
  }
}

export function decodeAudio(payload) {
  const hex = payload?.data?.audio;
  if (!hex) throw new Error(`MiniMax returned no audio (status ${payload?.data?.status ?? 'unknown'}).`);
  if (!/^(?:[0-9a-f]{2})+$/i.test(hex)) throw new Error('MiniMax returned malformed hex audio.');
  return Buffer.from(hex, 'hex');
}

export function preprocessResult(payload) {
  if (!payload.cover_feature_id) throw new Error('MiniMax returned no cover_feature_id.');
  let structure = payload.structure_result;
  try { structure = JSON.parse(structure); } catch { /* keep raw string */ }
  return {
    cover_feature_id: payload.cover_feature_id,
    audio_duration: payload.audio_duration,
    formatted_lyrics: payload.formatted_lyrics,
    structure,
  };
}

async function save(path, content) {
  const outputPath = resolve(path);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, content);
  return outputPath;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    return;
  }
  if (options.checkCredentials) {
    const { source } = await resolveApiKey('MINIMAX_API_KEY');
    console.log(`Credentials available (${source}). No API request was made.`);
    return;
  }
  const body = await buildRequest(options);
  const { apiKey } = await resolveApiKey('MINIMAX_API_KEY');

  const response = await fetch(`${API_BASE}/${ENDPOINTS[options.command]}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  try {
    checkResponse(response.status, payload);
  } catch (error) {
    throw new Error(error.message.replaceAll(apiKey, '[REDACTED]'));
  }

  if (options.command === 'lyrics') {
    if (!payload.lyrics) throw new Error('MiniMax returned no lyrics.');
    const path = await save(options.output, payload.lyrics + '\n');
    console.log(`Saved lyrics: ${path}`);
    console.log(`Title: ${payload.song_title ?? ''}`);
    console.log(`Style tags: ${payload.style_tags ?? ''}`);
    return;
  }
  if (options.command === 'cover-preprocess') {
    const path = await save(options.output, JSON.stringify(preprocessResult(payload), null, 2) + '\n');
    console.log(`Saved preprocess result: ${path}`);
    console.log(`cover_feature_id: ${payload.cover_feature_id} (valid 24 h)`);
    return;
  }

  const path = await save(options.output, decodeAudio(payload));
  const info = payload.extra_info || {};
  console.log(`Saved ${body.audio_setting.format} (${body.model}): ${path}`);
  if (info.music_duration) console.log(`Duration: ${(info.music_duration / 1000).toFixed(1)} s, ${info.music_sample_rate} Hz, ${info.music_channel} ch`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  });
}
