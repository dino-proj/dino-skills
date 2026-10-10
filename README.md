# dino-skills

Open-source [Agent Skills](https://agentskills.io/) for coding agents (GitHub Copilot, Claude Code, Codex, Cursor, …), installable with [`npx skills`](https://github.com/vercel-labs/skills).

面向编程智能体的开源技能集合，可用 `npx skills` 一键安装。

## Skills

| Skill | Description |
|---|---|
| [doubao-seedream](skills/doubao-seedream/SKILL.md) | Generate, edit, or decompose images into layers with Volcengine Ark Doubao Seedream 5.0 Pro.<br>使用火山方舟 Doubao Seedream 5.0 Pro 生成、编辑图片，或将图片拆分为图层。 |
| [mimo-tts](skills/mimo-tts/SKILL.md) | Text to speech with Xiaomi MiMo-V2.5-TTS preset voices, style control, and English teaching read-aloud styles (standard / slow).<br>使用小米 MiMo-V2.5-TTS 预置音色进行语音合成，含英语教学标准/慢速朗读。 |
| [minimax-music](skills/minimax-music/SKILL.md) | Generate songs and instrumental music with MiniMax music-3.0, write lyrics, and create covers.<br>使用 MiniMax music-3.0 生成歌曲与纯音乐、生成歌词以及翻唱。 |
| [doubao-tts](skills/doubao-tts/SKILL.md) | Text to speech with Volcengine Doubao Speech Synthesis 2.0 (seed-tts-2.0) or cloned voices.<br>使用豆包语音合成大模型 2.0 将文本转为语音。 |
| [doubao-seed-audio](skills/doubao-seed-audio/SKILL.md) | Generate multi-role dialogue, music and sound effects from one prompt with Doubao Seed-Audio 1.0.<br>使用豆包音频生成模型 1.0 通过提示词一次生成人声、配乐与音效。 |

## Install

```bash
# List skills in this repo
npx skills add dino-proj/dino-skills --list
```

<details open>
<summary><b>doubao-seedream</b></summary>

```bash
# Install into the current project
npx skills add dino-proj/dino-skills --skill doubao-seedream

# Install globally
npx skills add dino-proj/dino-skills --skill doubao-seedream -g

# Install globally for a specific agent
npx skills add dino-proj/dino-skills --skill doubao-seedream -g -a github-copilot
```

</details>

<details>
<summary><b>mimo-tts</b></summary>

```bash
# Install into the current project
npx skills add dino-proj/dino-skills --skill mimo-tts

# Install globally
npx skills add dino-proj/dino-skills --skill mimo-tts -g

# Install globally for a specific agent
npx skills add dino-proj/dino-skills --skill mimo-tts -g -a github-copilot
```

</details>

<details>
<summary><b>minimax-music</b></summary>

```bash
# Install into the current project
npx skills add dino-proj/dino-skills --skill minimax-music

# Install globally
npx skills add dino-proj/dino-skills --skill minimax-music -g

# Install globally for a specific agent
npx skills add dino-proj/dino-skills --skill minimax-music -g -a github-copilot
```

</details>

<details>
<summary><b>doubao-tts</b></summary>

```bash
# Install into the current project
npx skills add dino-proj/dino-skills --skill doubao-tts

# Install globally
npx skills add dino-proj/dino-skills --skill doubao-tts -g

# Install globally for a specific agent
npx skills add dino-proj/dino-skills --skill doubao-tts -g -a github-copilot
```

</details>

<details>
<summary><b>doubao-seed-audio</b></summary>

```bash
# Install into the current project
npx skills add dino-proj/dino-skills --skill doubao-seed-audio

# Install globally
npx skills add dino-proj/dino-skills --skill doubao-seed-audio -g

# Install globally for a specific agent
npx skills add dino-proj/dino-skills --skill doubao-seed-audio -g -a github-copilot
```

</details>

## API keys

Skills never ask for keys in chat. Each key is read from an environment variable first, then (on macOS) from the login Keychain under the shared service `dino-skills`, with the variable name as the account.

| Key | Used by | Where to get it |
|---|---|---|
| `ARK_API_KEY` | doubao-seedream, doubao-tts, doubao-seed-audio | Volcengine console (one key for all Doubao skills) |
| `MIMO_API_KEY` | mimo-tts | Xiaomi MiMo open platform |
| `MINIMAX_API_KEY` | minimax-music | MiniMax China platform, account with music API access |

**macOS Keychain** (no extra tools needed). Run in your terminal and type the key at the hidden prompt; `-U` replaces an existing entry:

```bash
security add-generic-password -U -s dino-skills -a ARK_API_KEY -w
security add-generic-password -U -s dino-skills -a MIMO_API_KEY -w
security add-generic-password -U -s dino-skills -a MINIMAX_API_KEY -w
```

Keep `-w` as the last option so the key is prompted for instead of appearing in shell history. To remove a key: `security delete-generic-password -s dino-skills -a <KEY_NAME>`.

**Any OS**: export the variable in your shell, e.g. `export ARK_API_KEY=...`. An environment variable takes precedence over the Keychain.

All skills require Node.js 18+.

## Repository layout

```
skills/
  <skill-name>/
    SKILL.md        # frontmatter: name, description
    scripts/        # helper scripts the skill calls
```

Add a skill by creating `skills/<skill-name>/SKILL.md` with `name` and `description` in its YAML frontmatter, then verify with `npx skills add . --list`.

## License

[MIT](LICENSE)
