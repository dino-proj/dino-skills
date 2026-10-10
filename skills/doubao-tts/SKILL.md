---
name: doubao-tts
description: 'Text to speech with Volcengine Doubao Speech Synthesis 2.0 (seed-tts-2.0, 130+ voices, 中/英/日/韩/西/葡/东南亚等多语种) or cloned voices (seed-icl-2.0), with voice instructions, speed/volume, LaTeX reading and word timestamps. Use for 豆包语音合成, 火山引擎 TTS, 文本转语音, 朗读, 配音, 播报, seed-tts-2.0, speaker ID like zh_female_vv_uranus_bigtts. Not for multi-role scenes with music and sound effects (use doubao-seed-audio). 使用豆包语音合成大模型 2.0 将文本转为语音。'
argument-hint: 'Text to read, speaker ID, output path, and optional instruction / speed'
user-invocable: true
disable-model-invocation: false
license: MIT
compatibility: 'Node.js 18+ on macOS, Windows or Linux. Key storage uses the macOS Keychain or a Windows DPAPI file; elsewhere set ARK_API_KEY.'
---

# Doubao TTS (Speech Synthesis 2.0)

Read text aloud with a fixed voice through the Volcengine Doubao Speech unidirectional streaming HTTP API using the bundled script. The script collects the streamed chunks into one file.

This skill is for **reading given text with one voice**. For prompt-driven audio with multiple roles, background music and sound effects, use the separate `doubao-seed-audio` skill.

`$SKILL_DIR` below means the directory that contains this `SKILL.md` (where the skill was installed, e.g. `.agents/skills/doubao-tts`). Always call the scripts through that absolute path. On Windows, run the commands in PowerShell and replace trailing `\` line continuations with a backtick (`` ` ``), or put each command on one line.

## Security

- Read credentials through `scripts/credentials.mjs`: prefer `ARK_API_KEY`; on macOS, fall back to the generic-password Keychain item with service `dino-skills` and account `ARK_API_KEY`; on Windows, to the DPAPI-encrypted file `%APPDATA%\dino-skills\ARK_API_KEY.secure`, which only the current Windows user can decrypt. One Doubao (Volcengine) key and entry are shared by `doubao-seedream`, `doubao-seed-audio` and this skill.
- Never ask the user to paste an API key into chat.
- Never print, log, commit, or save the API key in plaintext, command arguments, shell history, prompts, or tool responses. Keychain is the only permitted persistent credential store for the bundled scripts.
- Never run `security find-generic-password -w` or decrypt the Windows key file directly in a visible terminal tool call. The credential helper captures its output privately in the Node process and emits only sanitized errors.
- Save or rotate the key by having the user run `security add-generic-password -U -s dino-skills -a ARK_API_KEY -w` in their own terminal. With `-w` last, macOS prompts for the key with hidden input, so it never appears in command arguments or shell history; never append the key after `-w`. Stop the agent turn at the prompt. Do not collect the key with chat or question tools. On Windows, have the user run this in their own PowerShell instead (hidden prompt, encrypted for the current user): `$d = "$env:APPDATA\dino-skills"; New-Item -Force -ItemType Directory $d | Out-Null; Read-Host -AsSecureString ARK_API_KEY | ConvertFrom-SecureString | Set-Content "$d\ARK_API_KEY.secure"`.
- If macOS asks for Keychain authorization or a password, the user handles that locally. Do not bypass access controls.
- Missing credentials or denied access are blockers. Do not search project `.env` files for substitute keys.

## Workflow

1. Check credentials without printing the key or calling the API:
   ```bash
   node "$SKILL_DIR"/scripts/synthesize.mjs --check-credentials
   ```
2. Pick a speaker ID (see [Voices](#voices)) and, optionally, an instruction for tone or emotion.
3. For long or multi-line text, write it to a UTF-8 file and use `--text-file`.
4. Run [synthesize.mjs](./scripts/synthesize.mjs). Save each attempt to a new path.
5. Verify the output exists and is non-empty. The user can listen with `afplay <file>` on macOS or `start <file>` on Windows.

## Usage

```bash
node "$SKILL_DIR"/scripts/synthesize.mjs \
  --text "今天也辛苦啦，先放下手里的事，泡一杯热茶，坐下来歇一会儿。" \
  --speaker zh_female_vv_uranus_bigtts \
  --instruction "用温柔、放松的语气，语速稍慢" \
  --output ./audio/relax.mp3
```

English with slower speed and word timestamps:

```bash
node "$SKILL_DIR"/scripts/synthesize.mjs \
  --text-file ./lesson.txt \
  --speaker zh_male_wennuanahu_uranus_bigtts \
  --language en \
  --speech-rate -20 \
  --subtitles ./audio/lesson.words.json \
  --output ./audio/lesson.wav
```

Cloned voice (registered through the Doubao voice-clone service):

```bash
node "$SKILL_DIR"/scripts/synthesize.mjs --resource seed-icl-2.0 --speaker <cloned speaker ID> \
  --text "这是用复刻音色合成的一句话。" --output ./audio/clone.mp3
```

## Options

- `--text <text>` / `--text-file <path>`: Required text.
- `--speaker <id>`: Voice ID. Default `zh_female_vv_uranus_bigtts`. Required with `seed-icl-2.0`.
- `--resource <seed-tts-2.0|seed-icl-2.0>`: Sent as `X-Api-Resource-Id`. Default `seed-tts-2.0`.
- `--instruction <text>`: Voice instruction (`context_texts`) for emotion, tone or pace, e.g. `你可以用特别痛心的语气说吗`. Not supported by `seed-icl-2.0`.
- `--format <mp3|wav|pcm|ogg_opus>`: From the output extension (`.mp3`, `.wav`, `.pcm`, `.ogg`/`.opus`), else `mp3`. WAV is requested as PCM and wrapped locally.
- `--sample-rate <hz>`: 8000, 16000, 22050, 24000 (default), 32000, 44100, 48000; `ogg_opus` only 48000.
- `--speech-rate <n>` / `--loudness-rate <n>`: -50 (0.5×) to 100 (2×), default 0.
- `--language <code>`: `explicit_language`, e.g. `zh-cn` (Chinese with mixed English), `en`, `ja`, `ko`, `es-mx`, `pt-br`, `id`, `de`, `fr`, `th`, `vi`, `ru`. Text must match the language.
- `--silence <ms>`: Trailing silence, 0–30000.
- `--latex`: Read LaTeX formulas (education); adds some latency.
- `--subtitles <file.json>`: Save word-level timestamps (Chinese and English only).

## Voices

Full list: [Doubao TTS 2.0 voice list](https://docs.volcengine.com/docs/6561/1257544?lang=zh) or the console voice library. Examples:

| Scene | Voice | Speaker ID |
|---|---|---|
| General / default | vv | `zh_female_vv_uranus_bigtts` |
| AI assistant | 少年梓辛 2.0 | `zh_male_shaonianzixin_uranus_bigtts` |
| Customer service | 温婉珊珊 2.0 | `saturn_zh_female_wenwanshanshan_cs_tob` |
| Casual chat | 爽快思思 2.0 | `zh_female_shuangkuaisisi_uranus_bigtts` |
| Chat, Chinese/English | 温暖阿虎 / Alvin 2.0 | `zh_male_wennuanahu_uranus_bigtts` |
| Role play | 调皮公主 | `saturn_zh_female_tiaopigongzhu_tob` |
| Role play / narration | 悠悠君子 2.0 | `zh_male_youyoujunzi_uranus_bigtts` |

Supported languages for TTS 2.0: Chinese, English, Japanese, Korean, Mexican Spanish, Brazilian Portuguese, Indonesian, Malay, Thai, Vietnamese, Filipino, German, French, Spanish, Russian, Arabic. Only `*_uranus_bigtts` voices support some extra European languages.

## API Reference

- Endpoint: `POST https://openspeech.bytedance.com/api/v3/tts/unidirectional` (HTTP chunked stream of JSON frames)
- Headers: `X-Api-Key`, `X-Api-Resource-Id` (`seed-tts-2.0` / `seed-icl-2.0`), `X-Api-Request-Id` (random UUID)
- Body: `{ req_params: { text, speaker, audio_params: { format, sample_rate, speech_rate, loudness_rate, enable_subtitle }, additions: "<JSON string>" } }`
- Frames: `code: 0` carries base64 `data` and optional `sentence` timestamps; `code: 20000000` ends the stream; any other code is an error. The script prints `X-Tt-Logid` on failure for support requests.
- Docs: https://docs.volcengine.com/docs/DoubaoVoice/unidirectional-streaming-text-to-speech-http?lang=zh
