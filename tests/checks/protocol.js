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
 *
 * Then two things about the files themselves: that no machine-specific path
 * leaked into them, and that neither of them reaches for the network.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..", "plugin");
const code = fs.readFileSync(path.join(ROOT, "code.js"), "utf8");
const html = fs.readFileSync(path.join(ROOT, "ui.html"), "utf8");
const ui = html.match(/<script>([\s\S]*)<\/script>/)[1];

const cases = new Set([...code.matchAll(/case "([^"]+)":/g)].map((m) => m[1]));

/* Keys handled before the per-node loop in the update case, so they never reach
   applyUpdate's switch. Keep in sync with code.js. */
const SELECTION_LEVEL = new Set(["align", "distribute", "tidy", "replaceColor", "scale", "__none__"]);

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

/* ---- 5. nothing here waits on the network ----
 * The manifest says `allowedDomains: ["none"]`, and the panel has to open with no
 * round trip at all: the saved index covers the first paint and the team-library
 * catalogue is asked for only when a picker needs it (through the plugin API, not
 * a URL). The one request that ever failed was Figma's own plugin VM timing out
 * on its CDN — an error whose stack sits entirely in figma_app-*.min.js and which
 * no plugin can prevent. What a plugin *can* do is never add a request of its own
 * to the path between opening it and seeing it, and that is what this pins.
 */
const NETWORK = /\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|importScripts|\bimport\s*\(/;
const reaches = [];
[["code.js", code], ["ui.html", ui]].forEach(([name, text]) => {
  if (NETWORK.test(text)) reaches.push(name);
});
report("neither side reaches for the network", reaches);

console.log("\n  " + cases.size + " cases in code.js · " + updKeys.size +
  " property keys · " + sent.size + " outbound types · " + posted.size + " inbound types");

process.exit(failed ? 1 : 0);
