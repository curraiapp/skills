# @currai/skills

Agent Skills for **Currai** — markdown skill packs that teach AI coding agents (Claude Code, Cursor, Windsurf, …) how to use Currai effectively.

A skill is a folder with a `SKILL.md` (YAML frontmatter + body) following the [Claude Code Agent Skills](https://docs.claude.com/) convention. The agent loads the frontmatter into its context and reads the body on demand when the user asks something the skill's `description` matches. Inspired by [`langfuse/skills`](https://github.com/langfuse/skills).

## Install

```bash
npx @currai/skills install
```

That copies the bundled skill(s) into `./.claude/skills/<name>/`. If you have more than one skill bundled, pass the name:

```bash
npx @currai/skills install currai
```

### Flags

| Flag      | Default              | Description                                       |
| --------- | -------------------- | ------------------------------------------------- |
| `--to`    | `./.claude/skills`   | Target directory                                  |
| `--force` | off                  | Overwrite the destination skill folder if present |

### Examples

```bash
# Install into a user-wide Claude Code skills directory
npx @currai/skills install currai --to ~/.claude/skills

# Refresh an existing install
npx @currai/skills install currai --force

# List available skills
npx @currai/skills list
```

## Bundled skills

| Skill    | Description                                                                         |
| -------- | ----------------------------------------------------------------------------------- |
| `currai` | Adding observability to an AI app with `@currai/sdk` — traces, generations, spans, MCP tool wrapping, AI SDK integration, flush hygiene. |

## How is this different from docs?

Documentation explains things to humans. A skill is a compact, machine-targeted brief: a few hundred lines an LLM can hold in context that tells it *which APIs to call, in what shape, in your project*. Same content can fuel both — but the skill is the one that ships into the agent.
