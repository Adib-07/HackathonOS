import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..", "..");

function readRepoFile(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

/**
 * Strip comments so prose that *mentions* a command is not mistaken for a
 * command that *runs* one. This is what makes the check about behaviour
 * rather than about wording.
 */
function stripComments(contents) {
  return contents
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("#")) return "";
      // A shebang is not a comment.
      if (trimmed.startsWith("#!")) return line;
      // Block comments.
      return line.replace(/\/\*.*?\*\//g, "").replace(/\/\/.*$/, "");
    })
    .join("\n");
}

/** Every file in the repository that could run a command at deploy time. */
function collectScriptFiles(dir, found = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".git" || entry === "dist") {
      continue;
    }
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectScriptFiles(full, found);
    } else if (/\.(sh|mjs|cjs|js|ts|json|ya?ml|toml)$/.test(entry)) {
      found.push(full);
    }
  }
  return found;
}

test("the post-merge hook does not run drizzle-kit push", () => {
  const script = stripComments(readRepoFile("scripts/post-merge.sh"));
  assert.ok(
    !/drizzle-kit\s+push/.test(script),
    "post-merge.sh must not run drizzle-kit push",
  );
  assert.ok(
    !/--filter\s+db\s+push\b/.test(script),
    "post-merge.sh must not run the db push script",
  );
  assert.ok(
    !/push-force/.test(script),
    "post-merge.sh must not run push-force",
  );
});

test("the post-merge hook applies the reviewed migrations instead", () => {
  const script = readRepoFile("scripts/post-merge.sh");
  assert.match(
    script,
    /pnpm --filter @workspace\/db run migrate\b/,
    "post-merge.sh must apply the migrations",
  );
  assert.match(
    script,
    /pnpm --filter @workspace\/db run migrate:baseline/,
    "post-merge.sh must record the baseline first",
  );
});

test("the post-merge hook keeps its other necessary behaviour", () => {
  const script = readRepoFile("scripts/post-merge.sh");
  assert.match(
    script,
    /pnpm install --frozen-lockfile/,
    "post-merge.sh must still install dependencies",
  );
  // It must fail loudly rather than continue after an error.
  assert.match(script, /set -euo pipefail/);
  // It must run from a known directory.
  assert.match(script, /cd "\$\(dirname "\$0"\)\/\.\."/);
});

test("the post-merge hook is executable", () => {
  const stat = statSync(path.join(repoRoot, "scripts/post-merge.sh"));
  // Owner execute bit.
  assert.ok(stat.mode & 0o100, "post-merge.sh must be executable");
});

test("no deployment path anywhere runs drizzle-kit push", () => {
  const offenders = [];
  for (const file of collectScriptFiles(repoRoot)) {
    const relative = path.relative(repoRoot, file);
    // The developer-facing db package scripts are allowed to expose `push`;
    // what matters is that nothing *runs* it as part of a release.
    if (relative.startsWith("lib/db/package.json")) continue;
    if (relative.startsWith("lib/db/scripts/")) continue;
    if (relative.startsWith("lib/db/test/")) continue;
    const contents = stripComments(readFileSync(file, "utf8"));
    if (/drizzle-kit\s+push\b/.test(contents) || /--filter\s+db\s+push\b/.test(contents)) {
      offenders.push(relative);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `these files still run drizzle-kit push: ${offenders.join(", ")}`,
  );
});

test("the db package still exposes push for local development only", () => {
  const pkg = JSON.parse(readRepoFile("lib/db/package.json"));
  assert.ok(pkg.scripts.push, "the local push script should remain available");
  assert.ok(pkg.scripts.migrate, "the migrate script must exist");
  assert.ok(pkg.scripts["migrate:baseline"], "the baseline script must exist");
  assert.ok(pkg.scripts.generate, "the generate script must exist");
  // The production-safe path must never be the push script.
  assert.ok(!/push/.test(pkg.scripts.migrate));
  assert.ok(!/push/.test(pkg.scripts["migrate:baseline"]));
});

test("the documented deployment commands use migrate, not push", () => {
  // An invocation of push: as a package script, as a pnpm filter target, or
  // as the drizzle-kit command itself.
  const invocation =
    /(?:pnpm[^\n]*\srun\s+push\b)|(?:pnpm[^\n]*--filter\s+\S+\s+push\b)|(?:drizzle-kit\s+push\b)/;

  // Words that make a mention a warning rather than an instruction.
  const warning =
    /must not|not be used|not run|never|change|replaced|no longer|remove|do not|created with|was previously|remains available|destructive|authoritative|instead of|rather than|only|can drop|differs|diff\b|previously|regress/i;

  for (const doc of ["replit.md", "PROJECT_STATUS.md"]) {
    const contents = readRepoFile(doc);
    // Prose is wrapped across lines, so a mention is judged by the paragraph
    // it belongs to, not by the single line it happens to land on.
    const paragraphs = contents.split(/\n\s*\n/);
    for (const paragraph of paragraphs) {
      if (!invocation.test(paragraph)) continue;
      assert.ok(
        warning.test(paragraph),
        `${doc} appears to instruct a push: ${paragraph.trim().slice(0, 160)}`,
      );
    }
  }
});

test("the deployment documentation names the migration commands", () => {
  const replit = readRepoFile("replit.md");
  assert.match(replit, /pnpm --filter @workspace\/db run migrate\b/);
  assert.match(replit, /pnpm --filter @workspace\/db run migrate:baseline/);
  // The difference between a local schema sync and a production migration
  // must be explained, not just implied.
  assert.match(replit, /drop/i);
});
