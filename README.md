# dino-skills

Open-source [Agent Skills](https://agentskills.io/) for coding agents (GitHub Copilot, Claude Code, Codex, Cursor, …), installable with [`npx skills`](https://github.com/vercel-labs/skills).

面向编程智能体的开源技能集合，可用 `npx skills` 一键安装。

## Skills

| Skill | Description |
|---|---|
| [doubao-seedream](skills/doubao-seedream/SKILL.md) | Generate, edit, or decompose images into layers with Volcengine Ark Doubao Seedream 5.0 Pro. |

## Install

```bash
# List skills in this repo
npx skills add <owner>/dino-skills --list

# Install one skill into the current project
npx skills add <owner>/dino-skills --skill doubao-seedream

# Install globally for a specific agent
npx skills add <owner>/dino-skills --skill doubao-seedream -g -a github-copilot
```

## doubao-seedream setup

The skill needs a Volcengine Ark API key. It never asks for the key in chat.

- **macOS**: store it in the login Keychain with hidden terminal input (run from the installed skill directory):
  ```bash
  swift scripts/store-api-key.swift
  ```
- **Any OS**: export `ARK_API_KEY` in your shell. An environment variable takes precedence over the Keychain.

Requires Node.js 18+.

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
