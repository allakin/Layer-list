/*
 * The grip in the corner has to be findable. It used to be a hairline at 36%
 * opacity, invisible on a dark panel, and small enough to miss.
 */
const { w, errors, sent, check, expect } = require("../harness/ui.js");
const D = w.document;
const rz = D.getElementById("resizer");
const css = (el) => w.getComputedStyle(el);
// jsdom resolves neither custom properties nor pseudo-elements, so the parts of
// the grip that live in ::after are asserted against the stylesheet itself.
const SOURCE = require("fs").readFileSync(
  require("path").join(__dirname, "..", "..", "plugin", "ui.html"), "utf8");

console.log("size:      ", css(rz).width + " × " + css(rz).height);
console.log("cursor:    ", css(rz).cursor);
console.log("colour:    ", css(rz).color);
console.log("tooltip:   ", JSON.stringify(rz.title));

expect("the hit area is at least 20px square", parseInt(css(rz).width, 10) >= 20);
expect("it shows a resize cursor", css(rz).cursor === "nwse-resize");
expect("it says what it does", /resize/i.test(rz.title));
// Pull a CSS rule out by its selector and work on the text — simpler to keep
// correct than escaping braces and parens into a regexp.
function rule(selector) {
  const at = SOURCE.indexOf(selector + " {");
  if (at === -1) return "";
  return SOURCE.slice(at, SOURCE.indexOf("}", at) + 1);
}

const base = rule("#resizer");
const grip = rule("#resizer::after");

expect("it rests at a readable weight, not the faintest token",
  base.indexOf("color: var(--text-2)") > -1);
expect("it brightens on hover",
  rule("#resizer:hover").indexOf("color: var(--text)") > -1);
expect("dragging tints it with the accent",
  rule("#resizer.dragging").indexOf("color: var(--brand)") > -1);

console.log("grip rule: ", grip.replace(/\s+/g, " ").slice(0, 64) + "…");
expect("the grip is drawn as diagonal stripes",
  grip.indexOf("repeating-linear-gradient") > -1);
expect("it is clipped to the corner", grip.indexOf("mask-image") > -1);

/* dragging is signposted, and still resizes */
["setPointerCapture", "releasePointerCapture"].forEach((m) => { rz[m] = function () {}; });
const down = new w.MouseEvent("pointerdown", { bubbles: true, cancelable: true, clientX: 600, clientY: 700 });
down.pointerId = 1;
rz.dispatchEvent(down);
console.log("\nwhile dragging class:", JSON.stringify(rz.className));
expect("dragging is signposted", rz.classList.contains("dragging"));

sent.length = 0;
const move = new w.MouseEvent("pointermove", { bubbles: true, clientX: 660, clientY: 760 });
move.pointerId = 1;
rz.dispatchEvent(move);
const resize = sent.find((m) => m.type === "resize");
console.log("resize sent:         ", JSON.stringify(resize));
expect("dragging resizes the window", !!resize && resize.w > 0 && resize.h > 0);

const up = new w.MouseEvent("pointerup", { bubbles: true, clientX: 660, clientY: 760 });
up.pointerId = 1;
rz.dispatchEvent(up);
console.log("after release:       ", JSON.stringify(rz.className));
expect("the signpost clears on release", !rz.classList.contains("dragging"));

check("resize grip");
console.log("\nERRORS:", errors.length ? errors : "(none)");
