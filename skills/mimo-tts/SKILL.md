---
name: mimo-tts
description: 'Synthesize speech (text to speech) with Xiaomi MiMo-V2.5-TTS preset voices, with natural-language style control, audio tags, dialects, singing, and built-in English teaching read-aloud styles (standard and slow). Use for TTS, 语音合成, 文本转语音, 配音, 朗读, 英语朗读, 英语教学, 慢速, MiMo, 小米, mimo-v2.5-tts. 使用小米 MiMo-V2.5-TTS 预置音色进行语音合成，含英语教学标准/慢速朗读。'
argument-hint: 'Text to speak, output path, and optional voice / style'
user-invocable: true
disable-model-invocation: false
license: MIT
compatibility: 'Node.js 18+. Keychain credential storage requires macOS; elsewhere set MIMO_API_KEY.'
---

# MiMo TTS Speech Synthesis

Convert text to speech through the Xiaomi MiMo OpenAI-compatible Chat Completions API using the bundled script.

`$SKILL_DIR` below means the directory that contains this `SKILL.md` (where the skill was installed, e.g. `.agents/skills/mimo-tts`). Always call the scripts through that absolute path.

## Security

- Read credentials through `scripts/credentials.mjs`: prefer `MIMO_API_KEY`; on macOS, fall back to the generic-password Keychain item with service `com.github.copilot.mimo-tts` and account `MIMO_API_KEY`.
- Never ask the user to paste an API key into chat.
- Never print, log, commit, or save the API key in plaintext, command arguments, shell history, prompts, or tool responses. Keychain is the only permitted persistent credential store for the bundled scripts.
- Never run `security find-generic-password -w` directly in a visible terminal tool call. The credential helper captures its output privately in the Node process and emits only sanitized errors.
- Save or rotate the key with `swift "$SKILL_DIR"/scripts/store-api-key.swift`. It accepts hidden terminal input. The user must type the key directly into the terminal; stop the agent turn at the secret prompt. Do not collect it with chat or question tools.
- If macOS asks for Keychain authorization or a password, the user handles that locally. Do not bypass access controls.
- Missing credentials or denied access are blockers. Do not search project `.env` files for substitute keys.

## Workflow

1. Check credentials without printing the key or calling the API:
   ```bash
   node "$SKILL_DIR"/scripts/synthesize.mjs --check-credentials
   ```
   If missing on macOS, run the hidden-input setup command above and let the user enter the key in their terminal.
2. Pick a preset voice and write the text and optional style (see [Style control](#style-control)). For long or multi-line text, write it to a UTF-8 file and use `--text-file` to avoid shell quoting problems.
3. Run [synthesize.mjs](./scripts/synthesize.mjs). Save each attempt to a new path so earlier results are preserved.
4. Verify the output file exists and is non-empty. On macOS, the user can listen with `afplay <file>`.

## Usage

```bash
node "$SKILL_DIR"/scripts/synthesize.mjs \
  --text "(开心)我查到成绩了，居然考过了！" \
  --instruction "用轻快上扬的语调报喜，语速稍快，声音明亮有活力。" \
  --voice 冰糖 \
  --output ./audio/news.wav
```

## English teaching voices

For English learning material read aloud to young learners, use `--style` with one of the four English voices. `--style` sends a tuned instruction as the user message and defaults the voice to `Mia`.

| Voice | Gender | Notes |
|---|---|---|
| `Mia` | Female | Default; US accent |
| `Milo` | Male | US accent |
| `Chloe` | Female | Alternative, US accent |
| `Dean` | Male | Alternative, US accent |

| Style | Pace | Use for |
|---|---|---|
| `teacher` | Natural, about 110–120 wpm | Standard read-aloud, stories, dialogues |
| `teacher-slow` | Clearly slower, about 85 wpm, long phrase pauses | Beginners, shadowing, follow-along reading |

The wpm values are targets; MiMo has no numeric speed parameter, so pace comes only from the instruction. The exact instructions sent:

- `teacher`:
  > A warm, encouraging English teacher reading a story aloud to young beginners. Clear, natural American English at a natural, moderately lively pace — not slow, not rushed. Keep an even, steady tempo the whole way through; do NOT speed up toward the end — the last sentence should be as unhurried as the first. Pause at each sentence end, but keep the words within a sentence connected. Friendly and clear, never flat or robotic.
- `teacher-slow`:
  > A warm, patient English teacher reading a story aloud to one young child at a calm, gentle storytelling pace, clearly slower than normal speech, so the child can follow along. Clear, natural American English. Leave a long, clear pause between phrases and a full pause after every sentence. Keep a calm, unhurried pace; do NOT speed up. Gentle and warm.

Prepare the text before synthesis; pauses follow punctuation and line breaks:
- End every line with punctuation; add a period where it is missing.
- Put a title in sentence case ending with a period, then a blank line before the body.
- Spell out letter-by-letter abbreviations as they should sound, e.g. `ID` → `I-D`.
- Do not add `(style)` tags to the text; the `--style` instruction already sets the delivery.

```bash
node "$SKILL_DIR"/scripts/synthesize.mjs \
  --style teacher-slow \
  --voice Milo \
  --text-file ./lesson-01.txt \
  --output ./audio/lesson-01-slow.mp3
```

For custom variants (e.g. word-by-word dictation), use `--instruction` instead and keep the same structure: who is speaking, to whom, pace, pauses, and "do NOT speed up".

## Options

- `--text <text>` / `--text-file <path>`: Required text to speak (sent as the `assistant` message).
- `--instruction <text>` / `--instruction-file <path>`: Optional style direction or dialogue context (sent as the `user` message; never spoken).
- `--style <teacher|teacher-slow>`: Built-in English teaching instruction; cannot be combined with `--instruction`; requires an English voice.
- `--voice <id>`: Preset voice. Default `mimo_default` (冰糖 on the China cluster, Mia elsewhere), or `Mia` with `--style`.
- `--format <wav|mp3|pcm16>`: Defaults from the output extension (`.wav`, `.mp3`, `.pcm`), then `wav`. `pcm16` is raw 24 kHz 16-bit little-endian mono without a header.
- `--output <path>`: Required output file; parent directories are created.
- `--check-credentials`: Report credential source only; no API request.

Preset voices:

| Voice ID | Language | Gender |
|---|---|---|
| `冰糖` | Chinese | Female |
| `茉莉` | Chinese | Female |
| `苏打` | Chinese | Male |
| `白桦` | Chinese | Male |
| `Mia` | English | Female |
| `Chloe` | English | Female |
| `Milo` | English | Male |
| `Dean` | English | Male |

## Style control

Two complementary methods; they go in different messages:

**Natural-language instruction → `--instruction` (user message).** One sentence describing tone, pace and emotion, e.g. `用慵懒沙哑的低音，语速极慢，句间停顿较长。` For demanding performances use a "director" format with three parts:
- `角色：` identity, personality, speaking habits.
- `场景：` what is happening, who is addressed, current emotion.
- `指导：` pace, breath, pauses, stress, resonance, timbre, emotional arc.

**Tags in the text → `--text` (assistant message).**
- Leading style tag in `()`, `（）` or `[]`; several styles may share one pair: `(温柔 慵懒)再让我睡五分钟……`
  - Emotions: 开心/悲伤/愤怒/恐惧/惊讶/兴奋/委屈/平静/冷漠; 怅然/欣慰/无奈/愧疚/释然/嫉妒/厌倦/忐忑/动情
  - Tone: 温柔/高冷/活泼/严肃/慵懒/俏皮/深沉/干练/凌厉
  - Timbre: 磁性/醇厚/清亮/空灵/稚嫩/苍老/甜美/沙哑/醇雅; 夹子音/御姐音/正太音/大叔音/台湾腔
  - Dialects: 东北话/四川话/河南话/粤语; role-play: 孙悟空/林黛玉. Custom styles are also accepted.
- Singing: the text must start with `(唱歌)` (or `sing` / `singing`), followed by lyrics; Chinese lyrics work best.
- Inline audio tags anywhere in the text for fine control: `（紧张，深呼吸）呼……冷静。（语速加快）自我介绍背了五十遍了……（小声）领带歪没歪？` Useful tags: 吸气/深呼吸/叹气/喘息/屏息, 紧张/害怕/激动/疲惫/撒娇/震惊, 颤抖/气声/沙哑/鼻音, 笑/轻笑/大笑/冷笑/抽泣/哽咽, 小声/提高音量/语速加快/沉默片刻, 咳嗽.

## API Reference

- Endpoint: `POST https://api.xiaomimimo.com/v1/chat/completions` (OpenAI-compatible)
- Authentication: `api-key: $MIMO_API_KEY`
- Model: `mimo-v2.5-tts`
- Request: `messages` (optional `user` instruction, required `assistant` text), `audio: { format, voice }`
- Response: `choices[0].message.audio.data` is base64 audio, decoded to `--output`.
- Docs: https://mimo.mi.com/docs/zh-CN/quick-start/usage-guide/audio/speech-synthesis-v2.5 and https://mimo.mi.com/docs/zh-CN/api/audio/tts
