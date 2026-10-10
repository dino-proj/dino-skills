#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveApiKey } from './credentials.mjs';

const API_URL = 'https://ark.cn-beijing.volces.com/api/v3/images/generations';
const DEFAULT_MODEL = 'doubao-seedream-5-0-pro-260628';

function usage() {
  console.log(`Usage:
  node generate-image.mjs --prompt <text> --output <path> [options]
  node generate-image.mjs --layer-decomposition --image <path> --output <new-directory> [options]

Options:
  --image <path-or-url>          Reference image; repeatable
  --layer-decomposition         Split one PNG/JPEG into a base and PNG layers
  --size <value>                Default: 2K for generation; auto for layers
  --format <jpeg|png>           Output format
  --background <value>          opaque or transparent
  --model <id>                  Ark model ID
  --watermark                   Enable watermark
  --no-watermark                Disable watermark (default)
  --check-credentials           Check credential access without an API call
  --help                        Show this help`);
}

export function parseArgs(argv) {
  const options = { images: [], model: DEFAULT_MODEL, watermark: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${argument}`);
      index += 1;
      return value;
    };

    switch (argument) {
      case '--prompt': options.prompt = next(); break;
      case '--output': options.output = next(); break;
      case '--image': options.images.push(next()); break;
      case '--layer-decomposition': options.layerDecomposition = true; break;
      case '--size': options.size = next(); break;
      case '--format': options.format = next().toLowerCase(); break;
      case '--background': options.background = next(); break;
      case '--model': options.model = next(); break;
      case '--watermark': options.watermark = true; break;
      case '--no-watermark': options.watermark = false; break;
      case '--check-credentials': options.checkCredentials = true; break;
      case '--help': options.help = true; break;
      default: throw new Error(`Unknown option: ${argument}`);
    }
  }
  return options;
}

function mimeType(filePath) {
  const extension = extname(filePath).toLowerCase();
  const types = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
  };
  if (!types[extension]) throw new Error(`Unsupported reference image type: ${extension}`);
  return types[extension];
}

async function normalizeImage(input) {
  if (/^https?:\/\//i.test(input) || /^data:image\//i.test(input)) return input;
  const absolutePath = resolve(input);
  const buffer = await readFile(absolutePath);
  return `data:${mimeType(absolutePath)};base64,${buffer.toString('base64')}`;
}

async function download(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Image download failed (${response.status})`);
  return Buffer.from(await response.arrayBuffer());
}

export async function buildRequest(options) {
  if (!options.layerDecomposition && !options.prompt) throw new Error('--prompt is required');
  if (!options.output) throw new Error('--output is required');
  const inferredFormat = options.layerDecomposition ? 'png' : extname(resolve(options.output)).slice(1).toLowerCase();
  const outputFormat = options.format || (inferredFormat === 'jpg' ? 'jpeg' : inferredFormat) || 'png';
  if (!['jpeg', 'png'].includes(outputFormat)) throw new Error('--format must be jpeg or png');
  const size = options.size || (options.layerDecomposition ? 'auto' : '2K');
  if (options.layerDecomposition) {
    if (options.images.length !== 1) throw new Error('Layer decomposition requires exactly one PNG/JPEG reference.');
    if (!['auto', '1K', '1.5K', '2K'].includes(size)) throw new Error('Layer size must be auto, 1K, 1.5K or 2K.');
    if (options.background) throw new Error('Do not set --background for layer decomposition; layers already have alpha.');
    const image = options.images[0];
    const format = image.startsWith('data:') ? image.split(';', 1)[0].slice(5) : /^https?:\/\//i.test(image) ? null : mimeType(image);
    if (format && !['image/png', 'image/jpeg'].includes(format)) throw new Error('Layer decomposition accepts PNG/JPEG only.');
  }
  const body = {
    model: options.model,
    size,
    output_format: outputFormat,
    response_format: 'url',
    watermark: options.watermark,
  };
  if (options.prompt) body.prompt = options.prompt;
  if (options.layerDecomposition) body.layer_decomposition = true;
  if (options.background) body.background = options.background;
  if (options.images.length) {
    const images = await Promise.all(options.images.map(normalizeImage));
    body.image = images.length === 1 ? images[0] : images;
  }
  return body;
}

export function planLayerOutputs(payload, baseFormat = 'png') {
  const results = payload?.data;
  if (payload?.error || !Array.isArray(results) || results.length < 2 || results.length > 17 || results.some(result => result.error)) {
    throw new Error('Layer decomposition failed: expected one base and 1-16 successful layers.');
  }
  const indexes = new Set();
  const layers = results.map(result => {
    const index = result.z_index;
    if (!Number.isInteger(index) || index < 0 || index > 16 || indexes.has(index)) throw new Error('Invalid or duplicate layer z_index.');
    indexes.add(index);
    if (!result.url && !result.b64_json) throw new Error('Layer response is missing image data.');
    const format = result.output_format || (index === 0 ? baseFormat : 'png');
    if (!['png', 'jpeg'].includes(format) || (index > 0 && format !== 'png')) throw new Error('Unexpected layer image format.');
    if (index > 0) {
      const box = result.bounding_box?.absolute;
      if (!Array.isArray(box) || box.length !== 4 || !box.every(value => Number.isInteger(value) && value >= 0) || box[2] <= box[0] || box[3] <= box[1]) {
        throw new Error('Layer response is missing a valid absolute bounding box.');
      }
    }
    return {
      result,
      metadata: {
        file: `${index === 0 ? 'base' : `layer-${String(index).padStart(2, '0')}`}.${format}`,
        z_index: index,
        name: result.name,
        description: result.description,
        bounding_box: result.bounding_box,
        size: result.size,
        output_format: format,
      },
    };
  });
  if (!indexes.has(0)) throw new Error('Layer response is missing its base (z_index 0).');
  return layers.sort((first, second) => first.metadata.z_index - second.metadata.z_index);
}

async function imageBuffer(result) {
  if (result.url) return download(result.url);
  if (result.b64_json) return Buffer.from(result.b64_json, 'base64');
  throw new Error('Ark API response has neither url nor b64_json');
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
  const body = await buildRequest(options);
  const { apiKey } = await resolveApiKey('ARK_API_KEY');
  const outputPath = resolve(options.output);
  if (options.layerDecomposition) {
    await mkdir(resolve(outputPath, '..'), { recursive: true });
    await mkdir(outputPath);
  }

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.error) {
    const message = payload?.error?.message || payload?.message || JSON.stringify(payload);
    throw new Error(`Ark API request failed (${response.status}): ${String(message).replaceAll(apiKey, '[REDACTED]')}`);
  }

  if (options.layerDecomposition) {
    const layers = planLayerOutputs(payload, body.output_format);
    const buffers = await Promise.all(layers.map(layer => imageBuffer(layer.result)));
    for (const [index, layer] of layers.entries()) {
      await writeFile(resolve(outputPath, layer.metadata.file), buffers[index]);
    }
    await writeFile(resolve(outputPath, 'manifest.json'), JSON.stringify({
      model: payload.model, created: payload.created, usage: payload.usage,
      layers: layers.map(layer => layer.metadata),
    }, null, 2) + '\n');
    console.log(`Saved base and ${layers.length - 1} layers: ${outputPath}`);
    return;
  }

  const result = payload?.data?.[0];
  if (!result) throw new Error('Ark API returned no image data');

  const buffer = await imageBuffer(result);

  await mkdir(resolve(outputPath, '..'), { recursive: true });
  await writeFile(outputPath, buffer);
  console.log(`Generated image: ${outputPath}`);
  if (result.size) console.log(`Size: ${result.size}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  });
}
