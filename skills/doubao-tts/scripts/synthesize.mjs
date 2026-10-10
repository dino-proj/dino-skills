#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveApiKey } from './credentials.mjs';

const API_URL = 'https://openspeech.bytedance.com/api/v3/tts/unidirectional';
export const RESOURCES = ['seed-tts-2.0', 'seed-icl-2.0'];
export const DEFAULT_SPEAKER = 'zh_female_vv_uranus_bigtts';
const FORMATS = ['mp3', 'wav', 'pcm', 'ogg_opus'];
const EXTENSION_FORMATS = { mp3: 'mp3', wav: 'wav', pcm: 'pcm', ogg: 'ogg_opus', opus: 'ogg_opus' };
const SAMPLE_RATES = [8000, 16000, 22050, 24000, 32000, 44100, 48000];
const END_CODE = 20000000;

function usage() {
  console.log(`Usage:
  node synthesize.mjs --text <text> --output <file.mp3|wav|pcm|ogg> [options]

Options:
  --text <text> / --text-file <path>   Text to read aloud
  --speaker <id>                Voice ID (default ${DEFAULT_SPEAKER})
  --resource <id>               ${RESOURCES.join(' or ')} (default seed-tts-2.0; use seed-icl-2.0 for cloned voices)
  --instruction <text>          Voice instruction (context_texts), e.g. tone or emotion; seed-tts-2.0 only
  --format <mp3|wav|pcm|ogg_opus>  Default from the output extension, then mp3
  --sample-rate <hz>            ${SAMPLE_RATES.join(', ')} (default 24000; ogg_opus 48000 only)
  --speech-rate <n>             -50 (0.5x) to 100 (2x), default 0
  --loudness-rate <n>           -50 (0.5x) to 100 (2x), default 0
  --language <code>             explicit_language, e.g. zh-cn, en, ja, es-mx
  --silence <ms>                Trailing silence, 0-30000
  --latex                       Read LaTeX formulas (education)
  --subtitles <file.json>       Save word-level timestamps (Chinese and English only)
  --check-credentials           Check credential access without an API call
  --help                        Show this help`);
}

export function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = () => {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith('--')) throw new Error(`Missing value for ${argument}`);
      index += 1;
      return value;
    };
    const integer = () => {
      const value = next();
      if (!/^-?\d+$/.test(value)) throw new Error(`${argument} must be an integer.`);
      return Number(value);
    };

    switch (argument) {
      case '--text': options.text = next(); break;
      case '--text-file': options.textFile = next(); break;
      case '--speaker': options.speaker = next(); break;
      case '--resource': options.resource = next(); break;
      case '--instruction': options.instruction = next(); break;
      case '--format': options.format = next().toLowerCase(); break;
      case '--sample-rate': options.sampleRate = integer(); break;
      case '--speech-rate': options.speechRate = integer(); break;
      case '--loudness-rate': options.loudnessRate = integer(); break;
      case '--language': options.language = next(); break;
      case '--silence': options.silence = integer(); break;
      case '--latex': options.latex = true; break;
      case '--subtitles': options.subtitles = next(); break;
      case '--output': options.output = next(); break;
      case '--check-credentials': options.checkCredentials = true; break;
      case '--help': options.help = true; break;
      default: throw new Error(`Unknown option: ${argument}`);
    }
  }
  return options;
}

function inRange(value, name, min, max) {
  if (value !== undefined && (value < min || value > max)) throw new Error(`${name} must be between ${min} and ${max}.`);
}

export async function buildRequest(options) {
  if (!options.output) throw new Error('--output is required');
  if (options.text !== undefined && options.textFile) throw new Error('Use either --text or --text-file, not both.');
  const text = (options.textFile ? await readFile(resolve(options.textFile), 'utf8') : options.text)?.trim();
  if (!text) throw new Error('--text or --text-file is required.');

  const resource = options.resource || 'seed-tts-2.0';
  if (!RESOURCES.includes(resource)) throw new Error(`--resource must be ${RESOURCES.join(' or ')}.`);
  if (resource === 'seed-icl-2.0' && !options.speaker) throw new Error('seed-icl-2.0 requires --speaker with a cloned voice ID.');
  if (resource === 'seed-icl-2.0' && options.instruction) throw new Error('--instruction is not supported by seed-icl-2.0.');

  const format = options.format || EXTENSION_FORMATS[extname(options.output).slice(1).toLowerCase()] || 'mp3';
  if (!FORMATS.includes(format)) throw new Error(`--format must be one of ${FORMATS.join(', ')}.`);
  const sampleRate = options.sampleRate ?? (format === 'ogg_opus' ? 48000 : 24000);
  if (format === 'ogg_opus' ? sampleRate !== 48000 : !SAMPLE_RATES.includes(sampleRate)) {
    throw new Error(format === 'ogg_opus' ? 'ogg_opus supports only 48000 Hz.' : `--sample-rate must be one of ${SAMPLE_RATES.join(', ')}.`);
  }
  inRange(options.speechRate, '--speech-rate', -50, 100);
  inRange(options.loudnessRate, '--loudness-rate', -50, 100);
  inRange(options.silence, '--silence', 0, 30000);

  // Chunked WAV output is not recommended upstream, so request PCM and add the header locally.
  const audioParams = { format: format === 'wav' ? 'pcm' : format, sample_rate: sampleRate };
  if (options.speechRate) audioParams.speech_rate = options.speechRate;
  if (options.loudnessRate) audioParams.loudness_rate = options.loudnessRate;
  if (options.subtitles) audioParams.enable_subtitle = true;

  const additions = {};
  if (options.instruction) additions.context_texts = [options.instruction];
  if (options.language) additions.explicit_language = options.language;
  if (options.silence) additions.silence_duration = options.silence;
  if (options.latex) Object.assign(additions, { latex_parser: 'v2', disable_markdown_filter: true });

  const reqParams = { text, speaker: options.speaker || DEFAULT_SPEAKER, audio_params: audioParams };
  if (Object.keys(additions).length) reqParams.additions = JSON.stringify(additions);
  return { resource, format, sampleRate, body: { req_params: reqParams } };
}

// Splits a chunked stream of concatenated JSON objects, whether or not they are newline-delimited.
export function createFrameParser() {
  let buffer = '';
  return (chunk) => {
    buffer += chunk;
    const frames = [];
    let depth = 0;
    let inString = false;
    let escaped = false;
    let start = -1;
    let consumed = 0;
    for (let index = 0; index < buffer.length; index += 1) {
      const character = buffer[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (character === '\\') escaped = true;
        else if (character === '"') inString = false;
      } else if (character === '"') {
        inString = true;
      } else if (character === '{') {
        if (depth === 0) start = index;
        depth += 1;
      } else if (character === '}') {
        depth -= 1;
        if (depth === 0) {
          frames.push(JSON.parse(buffer.slice(start, index + 1)));
          consumed = index + 1;
        }
      }
    }
    buffer = buffer.slice(consumed);
    return frames;
  };
}

export function collectFrame(frame, state) {
  if (frame.code === END_CODE) {
    state.done = true;
    if (frame.usage) state.usage = frame.usage;
    return;
  }
  if (frame.code !== 0) throw new Error(`Doubao TTS failed (${frame.code}): ${frame.message ?? 'unknown error'}`);
  if (frame.data) state.audio.push(Buffer.from(frame.data, 'base64'));
  if (frame.sentence) state.sentences.push(frame.sentence);
  if (frame.usage) state.usage = frame.usage;
}

export function pcmToWav(pcm, sampleRate, channels = 1, bitsPerSample = 16) {
  const header = Buffer.alloc(44);
  const byteRate = sampleRate * channels * bitsPerSample / 8;
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(channels * bitsPerSample / 8, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
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
    const { source } = await resolveApiKey('ARK_API_KEY');
    console.log(`Credentials available (${source}). No API request was made.`);
    return;
  }
  const request = await buildRequest(options);
  const { apiKey } = await resolveApiKey('ARK_API_KEY');
  const redact = text => String(text).replaceAll(apiKey, '[REDACTED]');

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': apiKey,
      'X-Api-Resource-Id': request.resource,
      'X-Api-Request-Id': randomUUID(),
      'X-Control-Require-Usage-Tokens-Return': '*',
    },
    body: JSON.stringify(request.body),
  });
  const logId = response.headers.get('x-tt-logid');
  if (!response.ok) {
    throw new Error(`Doubao TTS request failed (HTTP ${response.status}, logid ${logId}): ${redact(await response.text())}`);
  }

  const state = { audio: [], sentences: [], done: false };
  const parse = createFrameParser();
  const decoder = new TextDecoder();
  try {
    for await (const chunk of response.body) {
      for (const frame of parse(decoder.decode(chunk, { stream: true }))) collectFrame(frame, state);
    }
  } catch (error) {
    throw new Error(`${redact(error.message)} (logid ${logId})`);
  }
  if (!state.audio.length) throw new Error(`Doubao TTS returned no audio (logid ${logId}).`);

  const pcmOrAudio = Buffer.concat(state.audio);
  const audio = request.format === 'wav' ? pcmToWav(pcmOrAudio, request.sampleRate) : pcmOrAudio;
  const path = await save(options.output, audio);
  console.log(`Saved ${request.format} audio (${audio.length} bytes, ${request.resource}): ${path}`);
  if (request.format === 'pcm') console.log(`PCM is raw ${request.sampleRate} Hz, 16-bit little-endian, mono.`);
  if (options.subtitles) console.log(`Saved subtitles: ${await save(options.subtitles, JSON.stringify(state.sentences, null, 2) + '\n')}`);
  if (state.usage?.text_words !== undefined) console.log(`Billed characters: ${state.usage.text_words}`);
  if (!state.done) console.log('Warning: the stream ended without a completion frame; check the audio is complete.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  });
}
