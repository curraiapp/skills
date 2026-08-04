import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const instrumentScript = join(
  packageRoot,
  "skills/currai/scripts/instrument.mjs",
);

test("creates an idempotent dependency-free Next.js integration scaffold", () => {
  const dir = mkdtempSync(join(tmpdir(), "currai-instrument-next-"));
  mkdirSync(join(dir, "app/api/chat"), { recursive: true });
  const packageJson = JSON.stringify({ dependencies: { next: "15", ai: "5" } }, null, 2);
  writeFileSync(join(dir, "package.json"), packageJson);
  writeFileSync(join(dir, "tsconfig.json"), "{}");
  writeFileSync(
    join(dir, "app/api/chat/route.ts"),
    "export async function POST() { return streamText({ model }); }\n",
  );

  const first = instrument(dir);
  assert.equal(first.ok, true);
  assert.equal(first.framework, "vercel-ai");
  assert.equal(first.helper, "lib/currai.ts");
  assert.match(readFileSync(join(dir, "lib/currai.ts"), "utf8"), /captureCurraiSession/);
  assert.equal(
    readFileSync(join(dir, ".env.local"), "utf8"),
    "CURRAI_WORKSPACE_ID=workspace-123\nCURRAI_BASE_URL=https://www.currai.app\n",
  );
  assert.equal(readFileSync(join(dir, "package.json"), "utf8"), packageJson);

  const second = instrument(dir);
  assert.deepEqual(second.filesChanged, []);
});

test("preserves existing environment values", () => {
  const dir = mkdtempSync(join(tmpdir(), "currai-instrument-env-"));
  mkdirSync(join(dir, "src"));
  writeFileSync(join(dir, "package.json"), JSON.stringify({ dependencies: { openai: "6" } }));
  writeFileSync(join(dir, "tsconfig.json"), "{}");
  writeFileSync(join(dir, "src/chat.ts"), "await client.responses.create({});\n");
  writeFileSync(
    join(dir, ".env"),
    "CURRAI_WORKSPACE_ID=existing-workspace\nCURRAI_BASE_URL=https://example.test\n",
  );

  const result = instrument(dir);
  assert.match(result.warnings.join("\n"), /preserved/);
  assert.equal(
    readFileSync(join(dir, ".env"), "utf8"),
    "CURRAI_WORKSPACE_ID=existing-workspace\nCURRAI_BASE_URL=https://example.test\n",
  );
});

test("creates a dependency-free Python helper", () => {
  const dir = mkdtempSync(join(tmpdir(), "currai-instrument-py-"));
  writeFileSync(join(dir, "requirements.txt"), "openai\n");
  writeFileSync(join(dir, "main.py"), "client.responses.create()\n");
  const before = readFileSync(join(dir, "requirements.txt"), "utf8");

  const result = instrument(dir);
  assert.equal(result.language, "python");
  assert.match(readFileSync(join(dir, "currai.py"), "utf8"), /capture_currai_event/);
  assert.equal(readFileSync(join(dir, "requirements.txt"), "utf8"), before);
});

function instrument(dir) {
  return JSON.parse(
    execFileSync(
      process.execPath,
      [
        instrumentScript,
        "--dir",
        dir,
        "--workspace-id",
        "workspace-123",
        "--mode",
        "local",
        "--env-mode",
        "file",
        "--json",
      ],
      { encoding: "utf8" },
    ),
  );
}
