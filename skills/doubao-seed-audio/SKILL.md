---
name: doubao-seed-audio
description: 'Generate film-grade audio from a single prompt with Volcengine Doubao Seed-Audio 1.0 (seed-audio-1.0): multi-role dialogue, background music, sound effects and ambience in one mix, optionally guided by up to 3 reference audios / voice IDs or one character image. Use for 豆包音频生成, Seed Audio, 音频创作, 有声剧, 广播剧, 有声书, 播客, 游戏配音, 音效, 环境音, 影视配音, 多角色对话. Not for plain text reading with one voice (use doubao-tts). 使用豆包音频生成模型 1.0 通过提示词一次生成人声、配乐与音效。'
argument-hint: 'Describe the scene, roles, lines, music and sound effects, plus output path'
user-invocable: true
disable-model-invocation: false
license: MIT
compatibility: 'Node.js 18+. Keychain credential storage requires macOS; elsewhere set ARK_API_KEY.'
---

# Doubao Seed-Audio 1.0 Audio Generation

Generate complete audio scenes — voices, music, sound effects — from one natural-language prompt through the Volcengine Doubao Speech audio-generation HTTP API using the bundled script.

This skill is for **prompt-driven audio creation**. To simply read text aloud with one voice, use the separate `doubao-tts` skill.

`$SKILL_DIR` below means the directory that contains this `SKILL.md` (where the skill was installed, e.g. `.agents/skills/doubao-seed-audio`). Always call the scripts through that absolute path.

## Security

- Read credentials through `scripts/credentials.mjs`: prefer `ARK_API_KEY`; on macOS, fall back to the generic-password Keychain item with service `dino-skills` and account `ARK_API_KEY`. One Doubao (Volcengine) key and entry are shared by `doubao-seedream`, `doubao-tts` and this skill.
- Never ask the user to paste an API key into chat.
- Never print, log, commit, or save the API key in plaintext, command arguments, shell history, prompts, or tool responses. Keychain is the only permitted persistent credential store for the bundled scripts.
- Never run `security find-generic-password -w` directly in a visible terminal tool call. The credential helper captures its output privately in the Node process and emits only sanitized errors.
- Save or rotate the key by having the user run `security add-generic-password -U -s dino-skills -a ARK_API_KEY -w` in their own terminal. With `-w` last, macOS prompts for the key with hidden input, so it never appears in command arguments or shell history; never append the key after `-w`. Stop the agent turn at the prompt. Do not collect the key with chat or question tools.
- If macOS asks for Keychain authorization or a password, the user handles that locally. Do not bypass access controls.
- Missing credentials or denied access are blockers. Do not search project `.env` files for substitute keys.
- Reference audio: only use voices the user owns or is authorized to use. Decline imitating real people without consent.

## Workflow

1. Check credentials without printing the key or calling the API:
   ```bash
   node "$SKILL_DIR"/scripts/generate-audio.mjs --check-credentials
   ```
2. Choose the mode: text only, text + reference audio / voice IDs, or text + one image.
3. Write the prompt to a UTF-8 file (see [Writing prompts](#writing-prompts)) and pass `--prompt-file`.
4. Run [generate-audio.mjs](./scripts/generate-audio.mjs). Generation is non-streaming and may take a few minutes (timeout 330 s). Save each attempt to a new path.
5. Verify the output exists and is non-empty, and report the returned duration. On macOS, the user can listen with `afplay <file>`.

## Usage

Text only (dialogue + music + effects):

```bash
node "$SKILL_DIR"/scripts/generate-audio.mjs \
  --prompt-file "$SKILL_DIR"/examples/thriller-phone-call.txt \
  --output ./audio/thriller.mp3
```

With reference voices — the order of `--audio` / `--speaker` flags defines `@音频1`, `@音频2`, `@音频3`:

```bash
node "$SKILL_DIR"/scripts/generate-audio.mjs \
  --prompt '爷爷（70岁以上，沙哑沧桑，温和慈祥，饰演者为@音频1）节奏缓慢，带着笑意说道："好嘞，那爷爷就来偏爱小丸子吧！"' \
  --audio ./refs/grandpa.wav \
  --output ./audio/grandpa.wav
```

Mix a sample file and an existing voice ID:

```bash
node "$SKILL_DIR"/scripts/generate-audio.mjs \
  --prompt-file ./scenes/dialogue.txt \
  --audio ./refs/host.mp3 \
  --speaker zh_female_vv_uranus_bigtts \
  --output ./audio/dialogue.mp3
```

From a character image (the model infers a fitting voice; the prompt can be just the lines):

```bash
node "$SKILL_DIR"/scripts/generate-audio.mjs \
  --image ./refs/captain.png \
  --prompt '“加入舰队，一起上天吧！为了全人类的福祉，勇往直前！”' \
  --output ./audio/captain.mp3
```

## Options

- `--prompt <text>` / `--prompt-file <path>`: Required, ≤ 3000 characters.
- `--audio <path-or-url>`: Reference audio, repeatable. wav/mp3/pcm/ogg_opus, ≤ 30 s and ≤ 10 MB each. Local files are sent as base64.
- `--speaker <id>`: A Doubao TTS 2.0 or cloned voice ID used as a reference, repeatable.
- At most 3 `--audio` + `--speaker` in total; every `@音频N` in the prompt must have a matching reference.
- `--image <path-or-url>`: One jpeg/png/webp ≤ 10 MB. Cannot be combined with audio or speaker references.
- `--format <wav|mp3|pcm|ogg_opus>`: From the output extension (`.ogg`/`.opus` → `ogg_opus`), else `wav`.
- `--sample-rate <hz>`: wav/pcm 8000–48000 incl. 40000 (server default 40000); mp3 8000–48000 excl. 40000 (default 44100); ogg_opus 48000 only.
- `--speech-rate <n>` / `--loudness-rate <n>`: -50 (0.5×) to 100 (2×). `--pitch-rate <n>`: -12 to 12.

## Writing prompts

Structure the prompt in two parts, like a radio-drama script:

1. **Cast list first**: one line per role — `<角色名>是<性别年龄>，<口音/语言>，<音色>，<气质>。` e.g. `男子1是中青年男性，台湾口音，嗓音低沉，浑厚，富有磁性，气泡音，成熟。` Use a fixed name per role (男子1 / 旁白 / 主播2) and refer to it by exactly that name afterwards. For a reference voice, add `饰演者为@音频N` to the role line.
2. **Script in time order**, one beat per line, mixing:
   - **Music**: lead instrument, bed, accompaniment, mood, and when it changes or stops: `音乐以马林巴为主奏乐器，加入pad铺底、弦乐组、合成器lead、电贝斯、打击乐，整体情绪紧张悬疑。` … `伴随着一阵警报声，音乐停止。`
   - **Sound effects and ambience**, in sequence: `先是一声手机震动的声音，环境中伴随着持续的鸟鸣声。`
   - **Lines**: role name + delivery (tone, emotion, pace, emphasis) + the line in quotes: `男子1用严肃且带有质问的语气说道：“钟sir，你是什么时候被收买的？”`
   - **Spatial / device effects**: `声音经过处理，显得有些遥远和失真`（电话）, `声音像从电视机传来，带有轻微回响`, `声音像从对讲机传来`, `带有混响感`.
   - **Paralinguistics and interaction**: `先吸一口气`, `稍微停顿了一下`, `略微吞口水的声音`, `主播2笑了一声`, `“特地”两个字被加重说了出来`, short back-channel replies like `主播2简短地附和道：“是。”`
   - **Other languages** inline: set the role's language in the cast list and quote the line in that language.

Bundled examples (use as templates or run directly with `--prompt-file "$SKILL_DIR"/examples/<file>`):

| File | Genre | Shows |
|---|---|---|
| [thriller-phone-call.txt](./examples/thriller-phone-call.txt) | 悬疑刑侦片 · 港片黑帮：钟 sir 的深夜来电 | Two roles, phone-filtered voice, marimba suspense score, closing foley |
| [scifi-new-eden.txt](./examples/scifi-new-eden.txt) | 未来科幻片 · 科幻末世：寻找新家园 | Four roles incl. an English line, TV/intercom/PA effects, dense UI sound effects, music stop |
| [podcast-disney.txt](./examples/podcast-disney.txt) | 双人播客对谈 · 播客闲谈：最冷天里的迪士尼 | Natural conversation, hesitation, stress, laughter, back-channel replies, no music |

Image mode: the prompt can contain only the lines; add a short profile if the inferred voice should be steered.

Limits and tips:

- Output is at most 2 minutes. Keep the spoken text for voices within about 400 characters per request; longer text makes the model speak faster to fit.
- Voices support Chinese and English best (also ja, ko, es, de, fr, pt-BR, th, vi, ms, fil, it, ru, nl, pl, tr per the API docs). Dialect accents can be performed, but not pure dialect output.
- You can describe the total duration and when each line starts in natural language (timeline control).
- If a generated voice is good, register it with the Doubao voice-clone service and reuse its speaker ID via `--speaker` instead of re-uploading the sample.

## API Reference

- Endpoint: `POST https://openspeech.bytedance.com/api/v3/tts/create` (non-streaming)
- Headers: `X-Api-Key`, `Content-Type: application/json`
- Body: `{ model: "seed-audio-1.0", text_prompt, references: [{ speaker | audio_data | audio_url } ... ] or [{ image_data | image_url }], audio_config: { format, sample_rate, speech_rate, loudness_rate, pitch_rate } }`
- Response: `{ audio: <base64>, duration, original_duration, url }`; the script writes `audio` (or downloads `url`) and prints `X-Tt-Logid` on failure.
- Docs: https://docs.volcengine.com/docs/DoubaoVoice/audio-generation-http?lang=zh
