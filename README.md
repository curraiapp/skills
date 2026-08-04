# Currai Skill

The Currai agent skill connects TypeScript, JavaScript, and Python AI applications to Currai's user intelligence and agent quality platform through native HTTP. It does not install or require a Currai SDK.

## Install

```bash
npx skills add https://github.com/curraiapp/skills --skill currai
```

Then ask the coding agent:

> Connect this AI application to Currai user intelligence. Instrument the real chat or agent path with native HTTP capture, then verify one real interaction.

## Workflow

The installed skill guides the agent through five steps:

1. Detect the framework, target package, and real AI entrypoint.
2. Create a dependency-free native HTTP helper and server environment.
3. Capture sessions plus nested agent, model, tool, retrieval, guardrail, and evaluator evidence.
4. Restart or deploy the application and trigger a real interaction.
5. Verify the interaction in Events, User Stories, Intents, Violations, Errors, and traces.

A bundled demo checks endpoint connectivity but never counts as completed application integration.

## Repository development

The package-local installer remains available for repository development:

```bash
node bin/install.mjs install currai --to ./.claude/skills
node --test test/*.test.mjs
```
