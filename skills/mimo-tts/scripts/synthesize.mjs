#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveApiKey } from './credentials.mjs';

const API_URL = 'https://api.xiaomimimo.com/v1/chat/completions';
export const MODEL = 'mimo-v2.5-tts';
export const PRESET_VOICES = ['mimo_default', '冰糖', '茉莉', '苏打', '白桦', 'Mia', 'Chloe', 'Milo', 'Dean'];

function usage() {
  console.log(`Usage:
  node synthesize.mjs --text <text> --output <file.wav|mp3|pcm> [options]

Options:
  --text <text>                 Text to speak (assistant message); may include (style) and [tag] markup
  --text-file <path>            Read the text to speak from a UTF-8 file
  --instruction <text>          Style instruction (user message)
  --instruction-file <path>     Read the instruction from a UTF-8 file
  --voice <id>                  Preset voice (default mimo_default): ${PRESET_VOICES.join(', ')}
  --format <wav|mp3|pcm16>      Output format; default from the output extension, then wav
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

    switch (argument) {
      case '--text': options.text = next(); break;
      case '--text-file': options.textFile = next(); break;
      case '--instruction': options.instruction = next(); break;
      case '--instruction-file': options.instructionFile = next(); break;
      case '--voice': options.voice = next(); break;
      case '--format': options.format = next().toLowerCase(); break;
      case '--output': options.output = next(); break;
      case '--check-credentials': options.checkCredentials = true; break;
      case '--help': options.help = true; break;
      default: throw new Error(`Unknown option: ${argument}`);
    }
  }
  return options;
}

async function readOptionalText(value, file, name) {
  if (value !== undefined && file) throw new Error(`Use either --${name} or --${name}-file, not both.`);
  const text = file ? await readFile(resolve(file), 'utf8') : value;
  return text?.trim() || undefined;
}

export function outputFormat(options) {
  const extension = extname(options.output).slice(1).toLowerCase();
  const format = options.format || { pcm: 'pcm16', pcm16: 'pcm16', mp3: 'mp3', wav: 'wav' }[extension] || 'wav';
  if (format === 'pcm') return 'pcm16';
  if (!['wav', 'mp3', 'pcm16'].includes(format)) throw new Error('--format must be wav, mp3 or pcm16.');
  return format;
}

export async function buildRequest(options) {
  if (!options.output) throw new Error('--output is required');
  const text = await readOptionalText(options.text, options.textFile, 'text');
  const instruction = await readOptionalText(options.instruction, options.instructionFile, 'instruction');
  if (options.voice && !PRESET_VOICES.includes(options.voice)) throw new Error(`Unknown preset voice. Use one of: ${PRESET_VOICES.join(', ')}`);
  if (!text) throw new Error('--text or --text-file is required.');

  const messages = [];
  if (instruction) messages.push({ role: 'user', content: instruction });
  messages.push({ role: 'assistant', content: text });
  return { model: MODEL, messages, audio: { format: outputFormat(options), voice: options.voice || 'mimo_default' } };
}

export function extractAudio(payload) {
  const data = payload?.choices?.[0]?.message?.audio?.data;
  if (!data) throw new Error(`MiMo API returned no audio (finish_reason: ${payload?.choices?.[0]?.finish_reason ?? 'unknown'}).`);
  return Buffer.from(data, 'base64');
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

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.error) {
    const message = payload?.error?.message || payload?.message || JSON.stringify(payload);
    throw new Error(`MiMo API request failed (${response.status}): ${String(message).replaceAll(apiKey, '[REDACTED]')}`);
  }

  const buffer = extractAudio(payload);
  const outputPath = resolve(options.output);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, buffer);
  console.log(`Saved ${body.audio.format} audio (${buffer.length} bytes, model ${body.model}): ${outputPath}`);
  if (body.audio.format === 'pcm16') console.log('PCM16 is raw 24 kHz, 16-bit little-endian, mono.');
  if (payload.usage) console.log(`Tokens: prompt ${payload.usage.prompt_tokens}, completion ${payload.usage.completion_tokens}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  });
}
