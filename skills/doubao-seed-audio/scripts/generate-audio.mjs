#!/usr/bin/env node

import { request as httpsRequest } from 'node:https';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveApiKey } from './credentials.mjs';

const API_URL = 'https://openspeech.bytedance.com/api/v3/tts/create';
export const MODEL = 'seed-audio-1.0';
const REQUEST_TIMEOUT_MS = 330_000;
const MAX_PROMPT = 3000;
const MAX_AUDIO_REFERENCES = 3;
const MAX_REFERENCE_BYTES = 10 * 1024 * 1024;
const AUDIO_EXTENSIONS = ['.wav', '.mp3', '.pcm', '.ogg', '.opus'];
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];
const EXTENSION_FORMATS = { wav: 'wav', mp3: 'mp3', pcm: 'pcm', ogg: 'ogg_opus', opus: 'ogg_opus' };
export const SAMPLE_RATES = {
  wav: [8000, 16000, 24000, 32000, 40000, 44100, 48000],
  pcm: [8000, 16000, 24000, 32000, 40000, 44100, 48000],
  mp3: [8000, 16000, 24000, 32000, 44100, 48000],
  ogg_opus: [48000],
};

function usage() {
  console.log(`Usage:
  node generate-audio.mjs --prompt <text> --output <file.wav|mp3|pcm|ogg> [options]

Options:
  --prompt <text> / --prompt-file <path>   Scene, sound effects, music, roles and lines (<= ${MAX_PROMPT} chars)
  --audio <path-or-url>         Reference audio, referenced as @音频1, @音频2... in order; repeatable
  --speaker <id>                Voice ID used as a reference in the same @音频N order; repeatable
  --image <path-or-url>         One reference image (cannot be combined with audio or speaker references)
  --format <wav|mp3|pcm|ogg_opus>  Default from the output extension, then wav
  --sample-rate <hz>            wav/pcm: ${SAMPLE_RATES.wav.join(', ')}; mp3: ${SAMPLE_RATES.mp3.join(', ')}; ogg_opus: 48000
  --speech-rate <n>             -50 (0.5x) to 100 (2x), default 0
  --loudness-rate <n>           -50 (0.5x) to 100 (2x), default 0
  --pitch-rate <n>              -12 to 12, default 0
  --check-credentials           Check credential access without an API call
  --help                        Show this help`);
}

export function parseArgs(argv) {
  const options = { references: [] };
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
      case '--prompt': options.prompt = next(); break;
      case '--prompt-file': options.promptFile = next(); break;
      case '--audio': options.references.push({ kind: 'audio', value: next() }); break;
      case '--speaker': options.references.push({ kind: 'speaker', value: next() }); break;
      case '--image':
        if (options.image) throw new Error('Only one --image is supported.');
        options.image = next();
        break;
      case '--format': options.format = next().toLowerCase(); break;
      case '--sample-rate': options.sampleRate = integer(); break;
      case '--speech-rate': options.speechRate = integer(); break;
      case '--loudness-rate': options.loudnessRate = integer(); break;
      case '--pitch-rate': options.pitchRate = integer(); break;
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

async function encodeFile(input, extensions, label) {
  const path = resolve(input);
  if (!extensions.includes(extname(path).toLowerCase())) throw new Error(`${label} must be one of ${extensions.join(', ')}: ${input}`);
  if ((await stat(path)).size > MAX_REFERENCE_BYTES) throw new Error(`${label} must not exceed 10 MB: ${input}`);
  return (await readFile(path)).toString('base64');
}

async function toReference({ kind, value }) {
  if (kind === 'speaker') return { speaker: value };
  if (/^https?:\/\//i.test(value)) return { audio_url: value };
  return { audio_data: await encodeFile(value, AUDIO_EXTENSIONS, 'Reference audio') };
}

export async function buildRequest(options) {
  if (!options.output) throw new Error('--output is required');
  if (options.prompt !== undefined && options.promptFile) throw new Error('Use either --prompt or --prompt-file, not both.');
  const prompt = (options.promptFile ? await readFile(resolve(options.promptFile), 'utf8') : options.prompt)?.trim();
  if (!prompt) throw new Error('--prompt or --prompt-file is required.');
  if ([...prompt].length > MAX_PROMPT) throw new Error(`Prompt must not exceed ${MAX_PROMPT} characters.`);

  const references = options.references || [];
  if (references.length > MAX_AUDIO_REFERENCES) throw new Error(`At most ${MAX_AUDIO_REFERENCES} audio/speaker references are supported.`);
  if (options.image && references.length) throw new Error('--image cannot be combined with --audio or --speaker.');
  const cited = [...prompt.matchAll(/@音频(\d+)/g)].map(match => Number(match[1]));
  const missing = cited.filter(number => number < 1 || number > references.length);
  if (missing.length) throw new Error(`Prompt cites @音频${missing[0]} but only ${references.length} audio/speaker reference(s) were given.`);

  const format = options.format || EXTENSION_FORMATS[extname(options.output).slice(1).toLowerCase()] || 'wav';
  if (!SAMPLE_RATES[format]) throw new Error(`--format must be one of ${Object.keys(SAMPLE_RATES).join(', ')}.`);
  if (options.sampleRate !== undefined && !SAMPLE_RATES[format].includes(options.sampleRate)) {
    throw new Error(`--sample-rate for ${format} must be one of ${SAMPLE_RATES[format].join(', ')}.`);
  }
  inRange(options.speechRate, '--speech-rate', -50, 100);
  inRange(options.loudnessRate, '--loudness-rate', -50, 100);
  inRange(options.pitchRate, '--pitch-rate', -12, 12);

  const audioConfig = { format };
  if (options.sampleRate !== undefined) audioConfig.sample_rate = options.sampleRate;
  if (options.speechRate) audioConfig.speech_rate = options.speechRate;
  if (options.loudnessRate) audioConfig.loudness_rate = options.loudnessRate;
  if (options.pitchRate) audioConfig.pitch_rate = options.pitchRate;

  const body = { model: MODEL, text_prompt: prompt, audio_config: audioConfig };
  if (references.length) body.references = await Promise.all(references.map(toReference));
  if (options.image) {
    body.references = [/^https?:\/\//i.test(options.image)
      ? { image_url: options.image }
      : { image_data: await encodeFile(options.image, IMAGE_EXTENSIONS, 'Reference image') }];
  }
  return body;
}

export function parseResult(status, text) {
  let payload;
  try { payload = JSON.parse(text); } catch { payload = undefined; }
  if (status < 200 || status >= 300 || !payload || (!payload.audio && !payload.url)) {
    const detail = payload?.message || payload?.error?.message || payload?.header?.message || text.slice(0, 500) || 'empty response';
    const code = payload?.code ?? payload?.header?.code ?? status;
    throw new Error(`Seed Audio request failed (${code}): ${detail}`);
  }
  return payload;
}

function postJson(url, headers, body) {
  return new Promise((resolvePromise, reject) => {
    const request = httpsRequest(url, {
      method: 'POST',
      headers: { ...headers, 'Content-Length': Buffer.byteLength(body) },
      timeout: REQUEST_TIMEOUT_MS,
    }, (response) => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolvePromise({
        status: response.statusCode,
        text: Buffer.concat(chunks).toString('utf8'),
        logId: response.headers['x-tt-logid'],
      }));
      response.on('error', reject);
    });
    request.on('timeout', () => request.destroy(new Error(`Request timed out after ${REQUEST_TIMEOUT_MS / 1000} s.`)));
    request.on('error', reject);
    request.end(body);
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    return;
  }
  if (options.checkCredentials) {
    const { source } = await resolveApiKey();
    console.log(`Credentials available (${source}). No API request was made.`);
    return;
  }
  const body = await buildRequest(options);
  const { apiKey } = await resolveApiKey();

  const { status, text, logId } = await postJson(API_URL, { 'Content-Type': 'application/json', 'X-Api-Key': apiKey }, JSON.stringify(body));
  let payload;
  try {
    payload = parseResult(status, text);
  } catch (error) {
    throw new Error(`${error.message.replaceAll(apiKey, '[REDACTED]')} (logid ${logId})`);
  }

  let audio;
  if (payload.audio) {
    audio = Buffer.from(payload.audio, 'base64');
  } else {
    const download = await fetch(payload.url);
    if (!download.ok) throw new Error(`Audio download failed (${download.status}).`);
    audio = Buffer.from(await download.arrayBuffer());
  }
  const outputPath = resolve(options.output);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, audio);
  console.log(`Saved ${body.audio_config.format} audio (${audio.length} bytes): ${outputPath}`);
  if (payload.duration !== undefined) console.log(`Duration: ${payload.duration} s`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  });
}
