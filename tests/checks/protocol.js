/*
 * The panel and the plugin talk over postMessage, and nothing type-checks that
 * conversation. This walks both sides and fails when one of them says something
 * the other never listens for — the failure mode that otherwise shows up as a
 * control that silently does nothing.
 *
 * Three directions are checked:
 *   1. every upd("key") the panel sends has a case in applyUpdate;
 *   2. every send({type}) has a case in the message router;
 *   3. every postMessage({type}) the plugin sends has a case in onmessage.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..", "src");
const code = fs.readFileSync(path.join(ROOT, "code.js"), "utf8");
const html = fs.readFileSync(path.join(ROOT, "ui.html"), "utf8");
const ui = html.match(/<script>([\s\S]*)<\/script>/)[1];

const cases = new Set([...code.matchAll(/case "([^"]+)":/g)].map((m) => m[1]));

/* Keys handled before the per-node loop in the update case, so they never reach
   applyUpdate's switch. Keep in sync with code.js. */
const SELECTION_LEVEL = new Set(["align", "distribute", "tidy", "replaceColor", "__none__"]);

let failed = 0;
function report(label, missing) {
  if (missing.length) {
    console.log("  FAIL  " + label + ": " + missing.join(", "));
    failed++;
  } else {
    console.log("  ok    " + label);
  }
}

/* ---- 1. property keys ---- */
const updKeys = new Set([...ui.matchAll(/\bupd\(\s*"([^"]+)"/g)].map((m) => m[1]));
// upd(kind + ".x") and upd(ctx.prefix + ".x") are written once for fill and stroke
[...ui.matchAll(/upd\(\s*(?:kind|ctx\.prefix)\s*\+\s*"([^"]+)"/g)].forEach((m) => {
  ["fill", "stroke"].forEach((k) => updKeys.add(k + m[1]));
});
report("every upd() key is handled",
  [...updKeys].filter((k) => !cases.has(k) && !SELECTION_LEVEL.has(k) && k !== "style.").sort());

/* ---- 2. panel -> plugin ---- */
const sent = new Set([...ui.matchAll(/send\(\{\s*type:\s*"([^"]+)"/g)].map((m) => m[1]));
report("every send() type is routed", [...sent].filter((t) => !cases.has(t)).sort());

/* ---- 3. plugin -> panel ---- */
const posted = new Set([...code.matchAll(/postMessage\(\{\s*\n?\s*type:\s*"([^"]+)"/g)].map((m) => m[1]));
[...code.matchAll(/postMessage\(\{ type: "([^"]+)"/g)].forEach((m) => posted.add(m[1]));
const handled = new Set([...ui.matchAll(/^\s*case "([^"]+)":$/gm)].map((m) => m[1]));
report("every plugin message is received", [...posted].filter((t) => !handled.has(t)).sort());

/* ---- 4. no absolute paths leaked into the shipped files ---- */
const leaked = [];
[["code.js", code], ["ui.html", html]].forEach(([name, text]) => {
  if (/\/Users\/|\/tmp\//.test(text)) leaked.push(name);
});
report("no machine-specific paths in shipped files", leaked);

console.log("\n  " + cases.size + " cases in code.js · " + updKeys.size +
  " property keys · " + sent.size + " outbound types · " + posted.size + " inbound types");

process.exit(failed ? 1 : 0);
