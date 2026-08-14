/*
 * Both files must parse. ui.html carries its script inline, so the script is
 * extracted and checked the same way code.js is — a syntax error there is
 * otherwise invisible until the plugin is opened in Figma.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..", "..");
let failed = 0;

function check(label, source, filename) {
  try {
    new vm.Script(source, { filename });
    console.log("  ok    " + label);
  } catch (e) {
    console.log("  FAIL  " + label + " — " + e.message);
    failed++;
  }
}

const code = fs.readFileSync(path.join(ROOT, "code.js"), "utf8");
check("code.js parses", code, "code.js");

const html = fs.readFileSync(path.join(ROOT, "ui.html"), "utf8");
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
if (!scripts.length) {
  console.log("  FAIL  ui.html has no <script> block");
  failed++;
} else {
  scripts.forEach((m, i) => check("ui.html script #" + (i + 1) + " parses", m[1], "ui.html"));
}

/* manifest must stay valid JSON and point at files that exist */
try {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));
  console.log("  ok    manifest.json parses");
  ["main", "ui"].forEach((key) => {
    const target = manifest[key];
    if (target && fs.existsSync(path.join(ROOT, target))) {
      console.log('  ok    manifest.' + key + ' -> ' + target + " exists");
    } else {
      console.log('  FAIL  manifest.' + key + ' -> ' + target + " is missing");
      failed++;
    }
  });
} catch (e) {
  console.log("  FAIL  manifest.json — " + e.message);
  failed++;
}

process.exit(failed ? 1 : 0);
