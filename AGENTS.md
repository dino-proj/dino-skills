# AGENTS.md

Guide for coding agents working in **dino-skills** — an open-source collection of [Agent Skills](https://agentskills.io/) installed with [`npx skills`](https://github.com/vercel-labs/skills). Published at `https://github.com/dino-proj/dino-skills`.

## Layout

```
skills/
  <skill-name>/
    SKILL.md        # required; YAML frontmatter + agent instructions
    scripts/        # optional helpers the skill calls (Node .mjs preferred)
README.md           # human-facing index; keep the skills table in sync
LICENSE             # MIT
```

Only `skills/<skill-name>/SKILL.md` is discovered. Don't nest skills deeper, and don't put `SKILL.md` anywhere else.

## Adding or changing a skill

1. Folder name = `name` in frontmatter: lowercase, hyphens only.
2. Frontmatter must have `name` and `description`. The description says **what it does and when to use it**, including trigger keywords (Chinese and English if users use both). Optional: `license: MIT`, `compatibility` (runtime / OS requirements). Agent-specific keys (`argument-hint`, `user-invocable`, `disable-model-invocation`) are allowed; other agents ignore them.
3. **Never hard-code an install location** (`~/.copilot/skills/...`, `.claude/skills/...`). In `SKILL.md` refer to scripts as `"$SKILL_DIR"/scripts/<file>` and define `$SKILL_DIR` once as "the directory that contains this SKILL.md". In scripts, resolve sibling files with `new URL('./file', import.meta.url)`.
4. Scripts: Node.js 18+, ES modules, no npm dependencies unless unavoidable (installs copy files only — there is no `npm install` step).
5. Add the skill to the table in `README.md`.

## Security (hard rules)

- No API keys, tokens, cookies, internal URLs or personal paths in any file. Read credentials from environment variables or the OS keychain at runtime.
- Skills must instruct agents never to ask for secrets in chat and never to echo them into terminals, logs or command arguments.
- Before committing, scan: `grep -rnE "sk-[A-Za-z0-9]|[A-Za-z0-9_-]{36,}|/Users/" skills/` must return nothing unexpected.

## Verify before committing

```bash
node --test skills/*/scripts/          # skill unit tests (Node built-in runner)
npx -y skills add . --list             # every skill must be listed with its description
```

Fix failures instead of skipping tests. Keep tests offline: inject fakes for network and keychain calls.

## Commits and publishing

- Small, focused commits; message in the imperative (`Add <skill>`, `<skill>: fix ...`).
- Pushing to `origin/main` publishes immediately to everyone running `npx skills add dino-proj/dino-skills` — ask the maintainer before pushing, force-pushing, or rewriting history.
