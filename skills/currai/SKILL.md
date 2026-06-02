---
name: currai
description: Use when adding observability to an AI app with Currai — instrumenting LLM calls, MCP tools, and agent runs with traces, generations, and spans via currai. Covers client setup, the trace/generation/span hierarchy, MCP tool wrapping, Vercel AI SDK integration, and flush hygiene for serverless.
allowed-tools:
  - WebFetch(domain:currai.com)
  - Bash(pnpm add currai*)
  - Bash(pnpm add -D currai*)
  - Bash(npm install currai*)
  - Bash(npm install --save-dev currai*)
  - Bash(yarn add currai*)
---

# Currai — AI observability skill

This skill teaches you how to instrument an AI application with **Currai**, an open-source LLM observability platform. Use it whenever a user asks to "add tracing", "log my LLM calls", "see token usage", "debug an agent", or wire up `currai`.

## 1. What Currai is

Currai is a workspace-scoped observability platform for LLM apps. A single request is recorded as a **trace** containing a tree of **observations**:

- **Generation** — one LLM call. Carries `model`, `modelParameters`, `usage` (token counts), and `input`/`output`.
- **Span** — a unit of work that isn't an LLM call: tool invocations, retrieval, MCP connect/close, custom workflow steps. Spans can nest under generations via `parentObservationId`.
- **Event** — a point-in-time marker with no duration.

The mental model mirrors OpenTelemetry: one trace per logical request, observations are children of the trace (and can be children of each other), every observation has a start and end.

## 2. Install & environment

```bash
pnpm add currai
```

Required environment variables:

```bash
CURRAI_PUBLIC_KEY=pk-lf-...
CURRAI_SECRET_KEY=sk-lf-...
# CURRAI_BASE_URL is optional — defaults to the hosted Currai instance.
# Only set it if you self-host.
```

Create keys from the Currai dashboard: **Workspace → Settings → API Keys**. The public key is sent in plaintext; the secret is hashed server-side and only shown once on creation.

## 3. Client singleton

Instantiate `Currai` exactly once per process and reuse it. In Next.js / serverless, stash the client on `globalThis` so HMR and route handlers don't create duplicates:

```ts
import { Currai } from "currai";

declare global {
  // eslint-disable-next-line no-var
  var __currai: Currai | undefined;
}

export function getCurrai(): Currai {
  if (!globalThis.__currai) {
    const publicKey = process.env.CURRAI_PUBLIC_KEY;
    const secretKey = process.env.CURRAI_SECRET_KEY;
    if (!publicKey || !secretKey) {
      throw new Error(
        "CURRAI_PUBLIC_KEY and CURRAI_SECRET_KEY must be set in the environment",
      );
    }
    globalThis.__currai = new Currai({
      publicKey,
      secretKey,
      // baseUrl defaults to the hosted Currai instance — only pass it to self-host:
      // baseUrl: process.env.CURRAI_BASE_URL,
      // Production defaults: batch up to 15 events or flush every 10s.
      // For demos / local debugging where you want events to appear immediately:
      // flushAt: 1,
      // flushInterval: 1000,
    });
  }
  return globalThis.__currai;
}
```

Use `flushAt: 1, flushInterval: 1000` only for demos — it disables batching and increases ingest load. The library defaults are tuned for production.

## 4. Trace anatomy

One trace per request / agent turn / job. Add `sessionId` and `userId` so the dashboard can group by conversation and user.

```ts
const currai = getCurrai();

const trace = currai.trace({
  name: "chat-turn",
  sessionId,            // groups multiple turns into a conversation
  userId,               // groups across sessions
  input: { messages },  // arbitrary JSON
  environment: "production",
  tags: ["chat", "mcp"],
  metadata: { model, deployment: process.env.VERCEL_ENV },
});
```

Then add observations:

```ts
const generation = trace.generation({
  name: "openai.streamText",
  model: "gpt-4o-mini",
  modelParameters: { temperature: 0.2 },
  input: messages,
});

// ...call the model...

generation.end({
  output: text,
  usage: {
    input: totalUsage.inputTokens ?? null,
    output: totalUsage.outputTokens ?? null,
    total: totalUsage.totalTokens ?? null,
    unit: "TOKENS",
  },
});

trace.update({ output: text });
```

**Errors**: on failure, end the observation with `level: "ERROR"` and a `statusMessage` — don't just `throw` and forget:

```ts
generation.end({
  level: "ERROR",
  statusMessage: err instanceof Error ? err.message : String(err),
});
```

**Nesting**: pass `parentObservationId` to put a span under a generation (e.g. tool calls inside an LLM step):

```ts
const span = trace.span({
  name: "tool.web_search",
  input: args,
  parentObservationId: generation.id,
});
```

## 5. Wrapping MCP tools (drop-in helper)

When you connect to an MCP server via the Vercel AI SDK, wrap every tool's `execute` so each invocation creates a child span automatically:

```ts
import type { CurraiSpan } from "currai";

export type SpanFactory = (name: string, input: unknown) => CurraiSpan;

interface ToolLike {
  execute?: (...args: never[]) => unknown;
}

export function instrumentTools<T extends Record<string, ToolLike>>(
  tools: T,
  makeSpan: SpanFactory,
): T {
  const out: Record<string, ToolLike> = {};
  for (const [name, tool] of Object.entries(tools)) {
    const originalExecute = tool.execute;
    if (typeof originalExecute !== "function") {
      out[name] = tool;
      continue;
    }
    const wrappedExecute = async (...args: never[]) => {
      const input = (args as unknown as unknown[])[0];
      const span = makeSpan(`tool.${name}`, input);
      try {
        const result = await (originalExecute as (...a: never[]) => Promise<unknown>)(
          ...args,
        );
        span.end({ output: result });
        return result;
      } catch (err) {
        span.end({
          level: "ERROR",
          statusMessage: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }
    };
    out[name] = { ...tool, execute: wrappedExecute };
  }
  return out as T;
}
```

Usage:

```ts
const instrumented = instrumentTools(mcp.tools, (name, input) =>
  trace.span({ name, input, parentObservationId: generation.id }),
);
```

## 6. End-to-end: Next.js + Vercel AI SDK + MCP

This is the canonical shape — trace wraps connect, generation wraps the model call, spans wrap tools, and `onFinish`/`onError` flush before the response returns.

```ts
import { convertToModelMessages, stepCountIs, streamText, type UIMessage } from "ai";
import { openai } from "@ai-sdk/openai";
import { getCurrai } from "./currai";
import { openExaMcp } from "./mcp";
import { instrumentTools } from "./instrumentation";

export async function chat({ messages, sessionId, userId }: {
  messages: UIMessage[];
  sessionId?: string;
  userId?: string | null;
}) {
  const currai = getCurrai();
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

  const trace = currai.trace({
    name: "chat-turn",
    sessionId,
    userId: userId ?? undefined,
    input: { messages },
    environment: process.env.NODE_ENV ?? "development",
    tags: ["chat", "mcp"],
    metadata: { model },
  });

  const connectSpan = trace.span({ name: "mcp.connect" });
  let mcp;
  try {
    mcp = await openExaMcp();
    connectSpan.end({ output: { tools: Object.keys(mcp.tools) } });
  } catch (err) {
    connectSpan.end({
      level: "ERROR",
      statusMessage: err instanceof Error ? err.message : String(err),
    });
    await currai.flushAsync();
    throw err;
  }

  const generation = trace.generation({
    name: "openai.streamText",
    model,
    input: messages,
  });

  const instrumented = instrumentTools(mcp.tools, (name, input) =>
    trace.span({ name, input, parentObservationId: generation.id }),
  );

  const result = streamText({
    model: openai(model),
    tools: instrumented,
    stopWhen: stepCountIs(5),
    messages: convertToModelMessages(messages),
    onFinish: async ({ text, totalUsage }) => {
      try {
        generation.end({
          output: text,
          usage: {
            input: totalUsage?.inputTokens ?? null,
            output: totalUsage?.outputTokens ?? null,
            total: totalUsage?.totalTokens ?? null,
            unit: "TOKENS",
          },
        });
        trace.update({ output: text });
        await mcp.close();
      } finally {
        await currai.flushAsync();
      }
    },
    onError: async ({ error }) => {
      const message = error instanceof Error ? error.message : String(error);
      generation.end({ level: "ERROR", statusMessage: message });
      trace.update({ output: { error: message } });
      try { await mcp.close(); } catch {}
      await currai.flushAsync();
    },
  });

  return result.toUIMessageStreamResponse({
    headers: { "x-currai-trace-id": trace.id },
  });
}
```

Returning the trace id in a response header (`x-currai-trace-id`) lets the client deep-link to the dashboard for debugging.

## 7. Flushing — critical in serverless

`Currai` batches events on a background timer. In long-lived processes that's fine; in **serverless** or **edge** functions the process can be frozen the instant you return a response, dropping in-flight events.

Always `await currai.flushAsync()`:

- in `onFinish` and `onError` of `streamText`
- before returning from any background `runAfter`-scheduled action
- at the end of a job runner before it exits

If you forget this, the UI will show traces with missing observations — usually the last generation.

## 8. Reference: SDK exports

The `currai` entry point exports:

- `Currai` — the client (`new Currai(options)`)
- `CurraiTrace`, `CurraiGeneration`, `CurraiSpan`, `CurraiEvent` — observation classes returned by `trace.*()` calls
- Types: `CurraiOptions`, `TraceCreateBody`, `ObservationBody`, `GenerationBody`, `Usage`, `UsageUnit`, `ObservationLevel`, `IngestionEvent`, `IngestionEventType`, `IngestionResponse`
- `authHeader` — internal helper, rarely needed directly

`ObservationLevel` values: `"DEBUG"`, `"DEFAULT"`, `"WARNING"`, `"ERROR"`.

## Skill feedback

If something in this skill is wrong, outdated, or missing — open an issue against the [Currai repo](https://github.com/) with the label `skill:currai`, or edit `packages/skills/skills/currai/SKILL.md` and send a PR.
