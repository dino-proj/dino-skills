---
name: doubao-seedream
description: 'Generate, edit, or decompose images into layers with Volcengine Ark Doubao Seedream 5.0 Pro. Use for Doubao, Seedream, 火山方舟, 图层拆分, layer_decomposition, or doubao-seedream-5-0-pro-260628 image tasks. 使用火山方舟 Doubao Seedream 5.0 Pro 生成、编辑图片或进行图层拆分。'
argument-hint: 'Describe the image, output path, size, and optional reference images'
user-invocable: true
disable-model-invocation: false
license: MIT
compatibility: 'Node.js 18+. Keychain credential storage requires macOS; elsewhere set ARK_API_KEY.'
---

# Doubao Seedream Image Generation

Generate or edit bitmap images through the Volcengine Ark Images API using the bundled script.

`$SKILL_DIR` below means the directory that contains this `SKILL.md` (where the skill was installed, e.g. `.agents/skills/doubao-seedream`). Always call the scripts through that absolute path.

## Security

- Read credentials through `scripts/credentials.mjs`: prefer `ARK_API_KEY`; on macOS, fall back to the generic-password Keychain item with service `com.github.copilot.doubao-seedream` and account `ARK_API_KEY`. The same key and entry are shared with `doubao-tts` and `doubao-seed-audio`.
- Never ask the user to paste an API key into chat.
- Never print, log, commit, or save the API key in plaintext, command arguments, shell history, prompts, or tool responses. Keychain is the only permitted persistent credential store for the bundled scripts.
- Never run `security find-generic-password -w` directly in a visible terminal tool call. The credential helper captures its output privately in the Node process and emits only sanitized errors.
- Save or rotate the key with `swift "$SKILL_DIR"/scripts/store-api-key.swift`. It accepts hidden terminal input and uses Security APIs directly, never secret-bearing subprocess arguments. The user must type the key directly into the terminal; stop the agent turn at the secret prompt. Do not collect it with chat or question tools.
- If macOS asks for Keychain authorization or a password, the user handles that locally. Do not bypass access controls, unlock the keychain programmatically, or grant all applications access.
- Missing credentials or denied access are blockers. Do not search project `.env` files for substitute keys. On non-macOS systems, use `ARK_API_KEY` supplied by the user outside chat.

## Workflow

1. Determine the task: generation/editing or layer decomposition. For extracting existing elements into layers, use `--layer-decomposition`, not generative redrawing described as extraction. Confirm the reference, intended layers, and output path.
2. Check credential availability without printing the key or calling the image API:
   ```bash
  node "$SKILL_DIR"/scripts/generate-image.mjs --check-credentials
   ```
  This checks local access, not whether the key is accepted by Ark. If missing on macOS, run the hidden-input setup command above and let the user enter the key directly in their terminal. The entry is user-level and shared across projects; existing environment variables take precedence.
3. Write a concrete prompt. Include composition, subject, style, palette, lighting, camera/view, aspect ratio, and exclusions. For presentation images, request no embedded text unless the user explicitly needs it.
4. Run [generate-image.mjs](./scripts/generate-image.mjs) with Node.js.
5. Inspect the generated image with the image viewing tool. If it misses the brief, refine the prompt and regenerate to a new path so the prior result is preserved.
6. When integrating into a project, use a relative asset path and verify the file exists and is non-empty.

## Usage

Text to image:

```bash
node "$SKILL_DIR"/scripts/generate-image.mjs \
  --prompt "A concise but detailed image prompt" \
  --output ./assets/generated-image.png \
  --size 2K \
  --format png \
  --no-watermark
```

Image-guided generation or editing:

```bash
node "$SKILL_DIR"/scripts/generate-image.mjs \
  --prompt "Keep the subject identity and change the scene..." \
  --image ./reference.png \
  --output ./assets/edited-image.png \
  --size 2K \
  --format png \
  --no-watermark
```

Multiple references may be supplied by repeating `--image` up to the model limit.

Layer decomposition (Seedream 5.0 pro / flash):

```bash
node "$SKILL_DIR"/scripts/generate-image.mjs \
  --layer-decomposition \
  --image ./reference.png \
  --prompt "Separate the character and its platform into two foreground layers; keep other elements in the base." \
  --output ./output/layers-v1 \
  --size auto \
  --format png \
  --no-watermark
```

- Exactly one PNG/JPEG input, at most 30 MB, aspect ratio 1:16 through 16:1, total pixels 262144 through 36000000. Check dimensions before calling; retain aspect ratio if resizing a small crop. Prefer a subject crop over sending unrelated private UI information.
- `--prompt` is optional in decomposition mode; specify desired elements to avoid splitting every UI component. Keep Chinese prompts within roughly 300 characters.
- Do not pass `--background` in decomposition mode. This sends `layer_decomposition: true`; output consists of one base (`z_index: 0`) plus up to 16 transparent PNG layers, not a group-image generation request.
- `--size` accepts only `auto` (default), `1K`, `1.5K`, `2K`. Output format controls the base; foreground layers remain PNG.
- `--output` must be a new directory. Existing directories are rejected before API submission. Failed requests may leave an empty directory; use a new attempt path rather than overwriting results.
- All response images are downloaded. `manifest.json` retains model, usage, dimensions, layer names, descriptions, `z_index`, and `bounding_box`; it does not persist signed URLs or input base64. A manifest is written only after all image downloads/writes succeed.
- Inspect each requested foreground and its alpha channel. A model-produced decomposition still needs visual comparison; do not claim pixel-perfect extraction automatically.
- To reassemble, use the base dimensions and `bounding_box.absolute: [left, top, right, bottom]`. Resize each layer to `(right-left, bottom-top)`, place at `(left, top)`, and composite in increasing `z_index`. Do not assume returned layer pixel dimensions already equal their compositing dimensions. For custom canvases, `normalized` bounds use 0-1000 coordinates.

Transparent generative editing is a different mode: `--background transparent` requires exactly one PNG with actual transparent pixels and PNG output. It does not enable decomposition. Do not use it as a substitute for requested layer separation.

## Options

- `--prompt <text>`: Required for generation/editing; optional intent for decomposition.
- `--output <path>`: Required output file for generation, new directory for decomposition.
- `--layer-decomposition`: Decompose one PNG/JPEG and save the base, all layers, and manifest.
- `--image <path-or-url>`: Optional reference image; repeat for multiple references.
- `--size <value>`: Defaults to `2K` for generation or `auto` for decomposition.
- `--format <jpeg|png>`: Defaults from the output extension, then `png`.
- `--background <opaque|transparent>`: Optional background mode.
- `--model <id>`: Defaults to `doubao-seedream-5-0-pro-260628`.
- `--watermark` / `--no-watermark`: Defaults to no watermark.
- `--check-credentials`: Report only credential source and availability; no image/API request.

## API Reference

The script calls:

- Endpoint: `POST https://ark.cn-beijing.volces.com/api/v3/images/generations`
- Authentication: `Authorization: Bearer $ARK_API_KEY`
- Default model: `doubao-seedream-5-0-pro-260628`
- Response mode: URL, downloaded to the requested output path

Seedream 5.0 Pro generates one image per generation request and supports text-to-image, single-reference, multi-reference generation, and a separate layer-decomposition mode producing a base plus foreground layers.