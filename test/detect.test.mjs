import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const detectScript = join(
  packageRoot,
  "skills/currai/scripts/detect.mjs",
);

test("detects supported TypeScript and JavaScript AI frameworks", () => {
  const cases = [
    {
      dependencies: { next: "15", ai: "5" },
      source: "export async function POST() { return streamText({ model }); }",
      framework: "vercel-ai",
      runtime: "nextjs",
    },
    {
      dependencies: { openai: "6" },
      source: "await client.responses.create({ model: 'gpt-5' });",
      framework: "openai-ts",
    },
    {
      dependencies: { "@anthropic-ai/sdk": "1" },
      source: "await anthropic.messages.create({ model: 'claude' });",
      framework: "anthropic-ts",
    },
    {
      dependencies: { "@langchain/core": "1" },
      source: "await agent.invoke(input);",
      framework: "langchain-ts",
    },
    {
      dependencies: { "@mastra/core": "1" },
      source: "await agent.run(input);",
      framework: "mastra-ts",
    },
    {
      dependencies: { "@modelcontextprotocol/sdk": "1" },
      source: "server.tool('lookup', async () => ({}));",
      framework: "mcp-ts",
    },
  ];

  for (const fixture of cases) {
    const dir = project({ dependencies: fixture.dependencies, source: fixture.source });
    const result = detect(dir);
    assert.equal(result.ok, true);
    assert.equal(result.framework, fixture.framework);
    if (fixture.runtime) assert.equal(result.runtime, fixture.runtime);
    assert.deepEqual(result.env, ["CURRAI_WORKSPACE_ID", "CURRAI_BASE_URL"]);
    assert.ok(result.entrypoints.includes("src/chat.ts"));
  }
});

test("detects supported Python AI frameworks", () => {
  const cases = [
    ["openai\nfastapi", "openai-py"],
    ["anthropic", "anthropic-py"],
    ["langchain\nlanggraph", "langchain-py"],
    ["fastmcp", "mcp-py"],
  ];
  for (const [requirements, framework] of cases) {
    const dir = mkdtempSync(join(tmpdir(), "currai-skill-py-"));
    writeFileSync(join(dir, "requirements.txt"), `${requirements}\n`);
    writeFileSync(join(dir, "main.py"), "@app.post('/chat')\nasync def chat(): pass\n");
    const result = detect(dir);
    assert.equal(result.framework, framework);
    assert.equal(result.language, "python");
    assert.ok(result.entrypoints.includes("main.py"));
  }
});

test("rejects a monorepo root and reports target candidates", () => {
  const dir = mkdtempSync(join(tmpdir(), "currai-skill-monorepo-"));
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({ private: true, workspaces: ["apps/*"] }),
  );
  const app = join(dir, "apps/chat");
  mkdirSync(app, { recursive: true });
  writeFileSync(join(app, "package.json"), JSON.stringify({ dependencies: { ai: "5" } }));
  const result = spawnSync(
    process.execPath,
    [detectScript, "--dir", dir, "--json"],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  const body = JSON.parse(result.stdout);
  assert.equal(body.ok, false);
  assert.match(body.error, /apps\/chat/);
});

function project({ dependencies, source }) {
  const dir = mkdtempSync(join(tmpdir(), "currai-skill-node-"));
  mkdirSync(join(dir, "src"));
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({ dependencies, devDependencies: { typescript: "5" } }),
  );
  writeFileSync(join(dir, "tsconfig.json"), "{}");
  writeFileSync(join(dir, "src/chat.ts"), source);
  return dir;
}

function detect(dir) {
  return JSON.parse(
    execFileSync(process.execPath, [detectScript, "--dir", dir, "--json"], {
      encoding: "utf8",
    }),
  );
}
