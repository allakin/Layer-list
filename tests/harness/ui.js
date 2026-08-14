const fs = require("fs");
const { JSDOM } = require("jsdom");

const html = fs.readFileSync(require("path").join(__dirname, "..", "..", "ui.html"), "utf8");
const errors = [];
const sent = [];

const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true });
const w = dom.window;
w.Element.prototype.scrollIntoView = function(){};
w.Element.prototype.setPointerCapture = function(){};
w.Element.prototype.releasePointerCapture = function(){};
w.Element.prototype.hasPointerCapture = function(){return false;};
w.addEventListener("error", e => errors.push("window error: " + e.message));
// capture postMessage to the "plugin"
w.parent = { postMessage: (m) => sent.push(m.pluginMessage) };

function post(msg) {
  const ev = new w.MessageEvent("message", { data: { pluginMessage: msg } });
  try { w.onmessage(ev); } catch (e) { errors.push("onmessage(" + msg.type + "): " + e.stack.split("\n").slice(0,3).join(" | ")); }
}
function check(label) {
  const bar = w.document.getElementById("errbar");
  if (bar && bar.style.display === "block") errors.push(label + " -> " + bar.textContent);
}

module.exports = { w, dom, errors, sent, post, check };
