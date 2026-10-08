import test from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs, buildRequest, planLayerOutputs } from './generate-image.mjs';

const image = 'data:image/png;base64,dGVzdA==';
const options = (...extra) => parseArgs(['--layer-decomposition', '--image', image, '--output', '/tmp/test-layers', ...extra]);
const base = { z_index: 0, b64_json: 'dGVzdA==', size: '1024x1024' };
const layer = { z_index: 1, b64_json: 'dGVzdA==', name: '../cat', description: 'Cat', output_format: 'png', bounding_box: { absolute: [10, 20, 100, 200], normalized: [10, 20, 98, 195] } };

test('decomposition uses one image and auto size, with optional prompt', async () => {
  const body = await buildRequest(options());
  assert.equal(body.layer_decomposition, true);
  assert.equal(body.size, 'auto');
  assert.equal(body.image, image);
  assert.equal(body.output_format, 'png');
  assert.equal(body.prompt, undefined);
  assert.equal(body.background, undefined);
});

test('ordinary generation keeps its single-image defaults', async () => {
  const body = await buildRequest(parseArgs(['--prompt', 'test', '--output', '/tmp/test.jpg']));
  assert.equal(body.size, '2K');
  assert.equal(body.output_format, 'jpeg');
  assert.equal(body.layer_decomposition, undefined);
});

test('reject invalid decomposition arguments before any API request', async () => {
  await assert.rejects(buildRequest(options('--image', image)), /exactly one/);
  await assert.rejects(buildRequest({ ...options(), images: [] }), /exactly one/);
  await assert.rejects(buildRequest(options('--size', '2048x2048')), /Layer size/);
  await assert.rejects(buildRequest(options('--background', 'transparent')), /Do not set/);
  await assert.rejects(buildRequest({ ...options(), images: ['data:image/webp;base64,dGVzdA=='] }), /PNG\/JPEG only/);
  await assert.rejects(buildRequest(parseArgs(['--output', '/tmp/test.png'])), /prompt is required/);
});

test('preserves every layer and bounds, sorts by z_index, uses safe filenames', () => {
  const result = planLayerOutputs({ data: [{ ...layer, z_index: 2 }, base, layer] });
  assert.deepEqual(result.map(item => item.metadata.file), ['base.png', 'layer-01.png', 'layer-02.png']);
  assert.deepEqual(result[1].metadata.bounding_box, layer.bounding_box);
  assert.equal(result[1].metadata.name, '../cat');
});

test('JPEG base still produces PNG layers', () => {
  const result = planLayerOutputs({ data: [base, layer] }, 'jpeg');
  assert.deepEqual(result.map(item => item.metadata.file), ['base.jpeg', 'layer-01.png']);
});

test('reject partial errors, missing base, duplicates and malformed bounds', () => {
  for (const payload of [
    { error: { message: 'failed' }, data: [base, layer] },
    { data: [base] },
    { data: [base, { ...layer, error: { message: 'failed' } }] },
    { data: [layer, { ...layer, z_index: 2 }] },
    { data: [base, layer, layer] },
    { data: [base, { ...layer, bounding_box: undefined }] },
    { data: [base, { ...layer, output_format: 'jpeg' }] },
  ]) assert.throws(() => planLayerOutputs(payload));
});