#!/usr/bin/env node
/*
 * Runs every check and test, prints one line per file, exits non-zero if
 * anything failed. `npm test` calls this.
 *
 *   node tests/run.js            everything
 *   node tests/run.js checks     only the integrity checks
 *   node tests/run.js ui         only the panel tests
 *   node tests/run.js plugin     only the main-thread tests
 *   node tests/run.js theme      any file whose name contains "theme"
 *
 * A test fails when it exits non-zero, or when its output reports errors.
 * The harnesses collect thrown exceptions rather than crashing, so the output
 * is the source of truth, not just the exit code.
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = __dirname;
const filter = process.argv[2] || "";

const GROUPS = [
  { name: "checks", dir: path.join(ROOT, "checks") },
  { name: "plugin", dir: path.join(ROOT, "plugin") },
  { name: "ui", dir: path.join(ROOT, "ui") }
];

/* Phrases that mean the run did not come out clean, even at exit code 0. */
const BAD = [
  /^ERRORS:\s*\[/m,
  /^plugin error toasts:\s*\[/m,
  /^notifications:\s*\[/m,
  /^uncaught\/unhandled:\s*\[/m,
  /^FAIL:/m,
  /^\s+FAIL\s/m
];

function listTests(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith(".js")).sort()
    .map((f) => path.join(dir, f));
}

let total = 0, failed = 0;
const failures = [];

for (const group of GROUPS) {
  const files = listTests(group.dir).filter((f) =>
    !filter || group.name === filter || path.basename(f).indexOf(filter) > -1);
  if (!files.length) continue;

  console.log("\n" + group.name);
  for (const file of files) {
    const name = path.basename(file, ".js");
    const res = spawnSync(process.execPath, [file], { encoding: "utf8", cwd: ROOT });
    const out = (res.stdout || "") + (res.stderr || "");
    const bad = res.status !== 0 || BAD.some((re) => re.test(out));
    total++;
    if (bad) {
      failed++;
      failures.push({ name, out });
      console.log("  FAIL  " + name);
    } else {
      console.log("  ok    " + name);
    }
  }
}

if (failures.length) {
  console.log("\n" + "-".repeat(60));
  for (const f of failures) {
    console.log("\n" + f.name + "\n");
    console.log(f.out.split("\n").map((l) => "  " + l).join("\n"));
  }
}

console.log("\n" + (failed ? failed + " of " + total + " failed" : "all " + total + " passed"));
process.exit(failed ? 1 : 0);
