---
name: minimax-music
description: 'Generate songs and instrumental music with MiniMax Music 3.0 (music-3.0), write or edit lyrics, and create covers from a reference song. Use for music generation, song, BGM, background music, instrumental, lyrics, cover, 音乐生成, 歌曲, 作曲, 配乐, 纯音乐, 歌词生成, 写歌词, 翻唱, MiniMax, 海螺. 使用 MiniMax music-3.0 生成歌曲与纯音乐、生成歌词以及翻唱。'
argument-hint: 'Describe the song style/mood, lyrics or theme, and output path'
user-invocable: true
disable-model-invocation: false
license: MIT
compatibility: 'Node.js 18+. Keychain credential storage requires macOS; elsewhere set MINIMAX_API_KEY.'
---

# MiniMax Music Generation

Generate music, lyrics and covers through the MiniMax Music API (China endpoint) using the bundled script.

`$SKILL_DIR` below means the directory that contains this `SKILL.md` (where the skill was installed, e.g. `.agents/skills/minimax-music`). Always call the scripts through that absolute path.

## Security

- Read credentials through `scripts/credentials.mjs`: prefer `MINIMAX_API_KEY`; on macOS, fall back to the generic-password Keychain item with service `com.github.copilot.minimax-music` and account `MINIMAX_API_KEY`.
- Never ask the user to paste an API key into chat.
- Never print, log, commit, or save the API key in plaintext, command arguments, shell history, prompts, or tool responses. Keychain is the only permitted persistent credential store for the bundled scripts.
- Never run `security find-generic-password -w` directly in a visible terminal tool call. The credential helper captures its output privately in the Node process and emits only sanitized errors.
- Save or rotate the key with `swift "$SKILL_DIR"/scripts/store-api-key.swift`. It accepts hidden terminal input. The user must type the key directly into the terminal; stop the agent turn at the secret prompt. Do not collect it with chat or question tools.
- If macOS asks for Keychain authorization or a password, the user handles that locally. Do not bypass access controls.
- Missing credentials or denied access are blockers. Do not search project `.env` files for substitute keys.
- Covers: only use reference songs the user owns or is licensed to adapt.

## Availability

Per MiniMax's notice, from 2026-08-20 the paid music and lyrics APIs are no longer offered to new users (existing paid users keep access), and the `-free` models are discontinued. `music-3.0` requires an M Plan or paid account (120 RPM). An authentication or balance error (`1004`, `1008`, `2049`) usually means the account lacks access; report it rather than retrying.

## Workflow

1. Check credentials without printing the key or calling the API:
   ```bash
   node "$SKILL_DIR"/scripts/music.mjs --check-credentials
   ```
2. Choose the task:
   - **Song with your lyrics**: write lyrics (or generate them with `lyrics`), then `generate`.
   - **Song from a theme only**: `generate --auto-lyrics`.
   - **Instrumental / BGM**: `generate --instrumental`.
   - **Cover**: `cover --audio`, or the two-step flow `cover-preprocess` → edit lyrics → `cover --feature-id`.
3. Write lyrics and prompts to UTF-8 files and pass `--lyrics-file` / `--prompt-file` for anything multi-line.
4. Run [music.mjs](./scripts/music.mjs). Generation can take a minute or more. Save each attempt to a new path.
5. Verify the output exists and is non-empty. On macOS, the user can listen with `afplay <file>`.

## Usage

Generate lyrics (prints the title and style tags; reuse the style tags in the music prompt):

```bash
node "$SKILL_DIR"/scripts/music.mjs lyrics \
  --prompt "一首关于夏日海边的轻快情歌" \
  --output ./music/summer-lyrics.txt
```

Edit or continue existing lyrics:

```bash
node "$SKILL_DIR"/scripts/music.mjs lyrics --mode edit \
  --lyrics-file ./music/summer-lyrics.txt \
  --prompt "把第二段主歌改得更伤感" \
  --output ./music/summer-lyrics-v2.txt
```

Song from lyrics:

```bash
node "$SKILL_DIR"/scripts/music.mjs generate \
  --prompt "Mandopop, Summer Vibe, Romance, 轻快, 女声" \
  --lyrics-file ./music/summer-lyrics.txt \
  --output ./music/summer.mp3
```

Song with automatic lyrics, and instrumental music:

```bash
node "$SKILL_DIR"/scripts/music.mjs generate --auto-lyrics \
  --prompt "独立民谣, 忧郁, 内省, 雨夜独自漫步, 写一首关于咖啡馆的歌" \
  --output ./music/folk.mp3

node "$SKILL_DIR"/scripts/music.mjs generate --instrumental \
  --prompt "Lo-fi hip hop, 温暖钢琴, 慢节奏, 适合学习的背景音乐" \
  --output ./music/study-bgm.mp3
```

Cover in one step, or two steps when the lyrics should change:

```bash
node "$SKILL_DIR"/scripts/music.mjs cover \
  --audio ./reference.mp3 \
  --prompt "爵士风格翻唱, 慵懒女声, 钢琴与低音提琴伴奏" \
  --output ./music/cover.mp3

node "$SKILL_DIR"/scripts/music.mjs cover-preprocess --audio ./reference.mp3 --output ./music/cover.json
# Copy formatted_lyrics from cover.json into cover-lyrics.txt and edit it (10-1000 characters)
node "$SKILL_DIR"/scripts/music.mjs cover \
  --feature-id <cover_feature_id from cover.json> \
  --lyrics-file ./music/cover-lyrics.txt \
  --prompt "爵士风格翻唱, 慵懒女声, 钢琴与低音提琴伴奏" \
  --output ./music/cover-v2.mp3
```

## Commands and options

| Command | Endpoint | Model | Output |
|---|---|---|---|
| `lyrics` | `/v1/lyrics_generation` | — | Lyrics text file |
| `generate` | `/v1/music_generation` | `music-3.0` (default) or `music-2.6` | Audio file |
| `cover-preprocess` | `/v1/music_cover_preprocess` | `music-cover` | JSON: `cover_feature_id` (24 h), `formatted_lyrics`, structure, duration |
| `cover` | `/v1/music_generation` | `music-cover` | Audio file |

- `--prompt` / `--prompt-file`: `generate` style, mood and scene, 0–2000 characters, required with `--instrumental` or `--auto-lyrics`; `cover` target style, 10–300 characters, required; `lyrics` theme or edit instruction (random if omitted).
- `--lyrics` / `--lyrics-file`: `generate` 1–3500 characters, required unless `--instrumental` or `--auto-lyrics`; `cover` 10–1000 characters, optional (extracted by ASR) but required with `--feature-id`; `lyrics --mode edit` input.
- `--instrumental`: No vocals. `--auto-lyrics`: Model writes lyrics from the prompt. These cannot be combined with each other or with explicit lyrics.
- `--audio <path-or-url>`: Cover reference, 6 s–6 min, ≤ 50 MB, mp3/wav/flac etc. Local files are sent as base64.
- `--feature-id <id>`: Two-step cover; mutually exclusive with `--audio`.
- `--mode <write|edit>`, `--title <text>`: Lyrics options; a given title is kept unchanged.
- `--format <mp3|wav|pcm>`: From the output extension, else `mp3`. `--sample-rate` 16000/24000/32000/44100 (default 44100). `--bitrate` 32000/64000/128000/256000 (default 256000).
- `--watermark`: Append an AIGC watermark at the end (off by default).
- `--model <music-3.0|music-2.6>`: `generate` only.

## Writing prompts and lyrics

- Prompt: comma-separated genre, mood, scene, instruments, vocal gender/timbre and tempo, e.g. `流行音乐, 难过, 适合在下雨的晚上, 钢琴, 男声`. English tags such as `Pop, Upbeat, Female Vocals` work too.
- Lyrics: one line per sung line, separated by newlines, with section tags on their own lines: `[Intro]`, `[Verse]`, `[Pre Chorus]`, `[Chorus]`, `[Post Chorus]`, `[Hook]`, `[Bridge]`, `[Interlude]`, `[Transition]`, `[Break]`, `[Build Up]`, `[Inst]`, `[Solo]`, `[Outro]`. Output of the `lyrics` command can be passed directly.
- Keep songs reasonably short (two verses and choruses) for faster generation and fewer artifacts.
