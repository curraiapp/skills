# Currai Skill

The Currai agent skill connects TypeScript, JavaScript, and Python AI applications to Currai's user intelligence and agent quality platform through native HTTP. It does not install or require a Currai SDK.

## Install

```bash
npx skills add https://github.com/curraiapp/skills --skill currai
```

Then ask the coding agent:

> Connect this AI application to Currai user intelligence. Instrument the real chat or agent path with native HTTP capture, then verify one real interaction.

That is the complete customer setup. The installed skill handles framework detection, dependency-free native HTTP instrumentation, environment configuration, and real-interaction verification internally.

## Repository development

The package-local installer remains available for repository development:

```bash
node bin/install.mjs install currai --to ./.claude/skills
node --test test/*.test.mjs
```
