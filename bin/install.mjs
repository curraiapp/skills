#!/usr/bin/env node
import { readdir, stat, cp, mkdir, access } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { argv, cwd, exit, stderr, stdout } from "node:process";

const SKILLS_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "skills");

function printHelp() {
  stdout.write(
    `currai-skills — install Currai agent skills into your project.

Usage:
  currai-skills install [skill] [--to <dir>] [--force]
  currai-skills list

Examples:
  currai-skills install               # installs the only bundled skill into ./.claude/skills
  currai-skills install currai        # installs the "currai" skill
  currai-skills install currai --to ~/.claude/skills --force

Options:
  --to <dir>   Target directory (default: ./.claude/skills)
  --force      Overwrite if the destination skill folder already exists
  -h, --help   Show this help
`,
  );
}

async function listSkills() {
  const entries = await readdir(SKILLS_ROOT, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function parseArgs(args) {
  const opts = { command: undefined, skill: undefined, to: undefined, force: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "-h" || a === "--help") {
      printHelp();
      exit(0);
    } else if (a === "--force") {
      opts.force = true;
    } else if (a === "--to") {
      opts.to = args[++i];
    } else if (!opts.command) {
      opts.command = a;
    } else if (!opts.skill) {
      opts.skill = a;
    }
  }
  return opts;
}

async function main() {
  const opts = parseArgs(argv.slice(2));

  if (!opts.command || opts.command === "list") {
    const skills = await listSkills();
    stdout.write(`Available skills:\n${skills.map((s) => `  - ${s}`).join("\n")}\n`);
    return;
  }

  if (opts.command !== "install") {
    stderr.write(`Unknown command: ${opts.command}\n`);
    printHelp();
    exit(1);
  }

  const skills = await listSkills();
  let skill = opts.skill;
  if (!skill) {
    if (skills.length === 1) {
      skill = skills[0];
    } else {
      stderr.write(
        `Multiple skills available — pick one:\n${skills.map((s) => `  - ${s}`).join("\n")}\n`,
      );
      exit(1);
    }
  }

  if (!skills.includes(skill)) {
    stderr.write(`Unknown skill "${skill}". Available: ${skills.join(", ")}\n`);
    exit(1);
  }

  const source = join(SKILLS_ROOT, skill);
  const targetRoot = resolve(cwd(), opts.to ?? ".claude/skills");
  const destination = join(targetRoot, skill);

  if ((await exists(destination)) && !opts.force) {
    stderr.write(
      `Refusing to overwrite ${destination} — pass --force to replace.\n`,
    );
    exit(1);
  }

  await mkdir(targetRoot, { recursive: true });
  await cp(source, destination, { recursive: true, force: true });

  stdout.write(`Installed "${skill}" skill at ${destination}\n`);
}

main().catch((err) => {
  stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  exit(1);
});
