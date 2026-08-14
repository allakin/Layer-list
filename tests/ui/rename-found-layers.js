/*
 * The search field's rename button: find layers by name, then rewrite all of the
 * matches at once — either their layer names or, for text layers, the text
 * inside them. Figma keeps the two in step only until you rename one, so which
 * of them is being written has to be a visible choice.
 *
 * The new strings are computed in the panel so the preview and the message that
 * goes out cannot disagree — that is the property worth pinning down here, along
 * with the two things the control must not do: reserve width while the search box
 * is empty (rule 4), and offer to rename a layer to what it is already called.
 */
const { w, errors, sent, post, check, expect } = require("../harness/ui.js");
const D = w.document;
function ev(el, type, init) { el.dispatchEvent(new w.MouseEvent(type, Object.assign({ bubbles: true, cancelable: true }, init))); }
function type(el, v) { el.value = v; el.dispatchEvent(new w.Event("input", { bubbles: true })); }
const row = (id, name) => ({ id, name, type: "RECTANGLE", depth: 0, parentId: "a",
  visible: true, locked: false, hasChildren: false, expanded: false, path: "Frame A" });
/* only the search rows carry .text, and only for text layers */
const trow = (id, name, text) => Object.assign(row(id, name), { type: "TEXT", text });

post({ type: "pages", pages: [{ id: "0:1", name: "Page 1" }], currentPageId: "0:1" });
post({ type: "layers", pageName: "P", truncated: false, searching: false, selection: [], rows: [row("a", "Frame A")] });

/* ---- at rest the button takes no width ---- */
const btn = D.getElementById("search-rename");
expect("the rename button exists", !!btn);
expect("it is display:none while the search is empty", btn.style.display === "none");
expect("it never uses opacity to hide", btn.style.opacity === "");

/* ---- it appears with the search term ---- */
const s = D.getElementById("search");
type(s, "btn");
expect("typing a term reveals it", btn.style.display === "");

/* ---- no matches: it says so instead of doing nothing ---- */
post({ type: "layers", pageName: "P", truncated: false, searching: true, selection: [], rows: [] });
ev(btn, "click");
expect("with no matches the popover explains itself",
  /nothing to rename/i.test(D.querySelector("#pop-layer .rnp").textContent));
expect("and offers no action", !D.querySelector("#pop-layer .foot"));
ev(D.getElementById("pop-layer"), "mousedown");

/* ---- the matches ---- */
post({ type: "layers", pageName: "P", truncated: false, searching: true, selection: [], rows: [
  row("b1", "btn primary"), row("b2", "Btn secondary"), row("b3", "icon-btn"), row("b4", "BTN")
] });
console.log("matches:", D.querySelectorAll(".lrow").length);

ev(btn, "click");
const pop = D.querySelector("#pop-layer .rnp");
expect("the popover opened", !!pop);
console.log("head:", pop.querySelector(".pop-hd .t").textContent);
expect("the head counts the matches", /4 layers found/.test(pop.querySelector(".pop-hd .t").textContent));

const inputs = pop.querySelectorAll(".r input");
expect("two fields: find and replacement", inputs.length === 2);
console.log("target:", [...pop.querySelectorAll(".seg-b")].map(b =>
  b.textContent + (b.classList.contains("on") ? "*" : "") + (b.hasAttribute("disabled") ? " (off)" : "")).join(" | "));
expect("the target is a visible choice", pop.querySelectorAll(".seg-b").length === 2);
expect("it defaults to the layer name", pop.querySelector(".seg-b.on").textContent === "Layer name");
expect("with no text layers among the matches, Text is unavailable",
  pop.querySelectorAll(".seg-b")[1].hasAttribute("disabled"));
console.log("find prefilled with:", JSON.stringify(inputs[0].value));
expect("Find is seeded with the search term", inputs[0].value === "btn");
expect("the replacement starts as the $& no-op", inputs[1].value === "$&");
expect("so nothing is queued up on open",
  /Nothing changes yet/.test(pop.querySelector(".prev").textContent));
expect("and the action is disabled", pop.querySelector(".foot .sel").hasAttribute("disabled"));

/* ---- a plain substring replacement, matched case-insensitively ---- */
type(inputs[1], "Button");
let lines = [...pop.querySelectorAll(".prev .pl")].map(l =>
  [l.querySelector(".a").textContent, l.querySelector(".b").textContent]);
console.log("preview:", JSON.stringify(lines));
expect("every case of the term is replaced", lines.length === 4);
expect("lower case matched", lines[0][1] === "Button primary");
expect("capitalised matched", lines[1][1] === "Button secondary");
expect("mid-name matched", lines[2][1] === "icon-Button");
expect("upper case matched", lines[3][1] === "Button");
console.log("action:", pop.querySelector(".foot .sel").textContent);
expect("the action counts what it will do", /Rename 4 layers/.test(pop.querySelector(".foot .sel").textContent));

/* ---- $& and $n ---- */
type(inputs[0], "");
type(inputs[1], "$& $n");
lines = [...pop.querySelectorAll(".prev .pl")].map(l => l.querySelector(".b").textContent);
console.log("numbered:", JSON.stringify(lines));
expect("$& stands for the whole name when Find is empty", lines[0] === "btn primary 1");
expect("$n numbers the matches in list order", lines[3] === "BTN 4");

/* ---- renaming a layer to its own name is not a rename ---- */
type(inputs[0], "btn");
type(inputs[1], "$&");
console.log("identity:", pop.querySelector(".prev").textContent.trim());
expect("an identity replacement changes nothing", !pop.querySelector(".prev .pl"));
expect("so the action stays disabled", pop.querySelector(".foot .sel").hasAttribute("disabled"));

/* ---- what actually goes out matches the preview ---- */
type(inputs[1], "Button");
const shown = [...pop.querySelectorAll(".prev .pl")].map(l => l.querySelector(".b").textContent);
sent.length = 0;
ev(pop.querySelector(".foot .sel"), "click");
const msg = sent.find(m => m.type === "renameMatches");
console.log("sent ->", JSON.stringify(msg));
expect("a renameMatches message is sent", !!msg);
expect("it carries every match", msg && msg.renames.length === 4);
expect("with the ids from the tree", msg && msg.renames.map(r => r.id).join() === "b1,b2,b3,b4");
expect("and exactly the names the preview showed",
  msg && msg.renames.map(r => r.name).join("|") === shown.join("|"));
expect("it writes the layer name", msg && msg.target === "name");
expect("the popover closed", !D.querySelector("#pop-layer .rnp"));

/* ---- the text inside a text layer, which is a different string ---- */
type(s, "Monium");
post({ type: "layers", pageName: "P", truncated: false, searching: true, selection: [], rows: [
  trow("t1", "Monium", "Monium"),
  trow("t2", "Heading", "Monium is here"),
  row("i1", "Monium")                       // an instance: no text of its own
] });
/* the search matches text content too, so a row whose name does not contain the
   term has to say what it does contain */
const snips = [...D.querySelectorAll(".lrow")].map(l => {
  const sn = l.querySelector(".snip");
  return l.querySelector(".nm").textContent + (sn ? " " + sn.textContent : "");
});
console.log("rows:", JSON.stringify(snips));
expect("a row matched by its text shows that text", snips.some(t => t === "Heading “Monium is here”"));
expect("a row matched by its name does not repeat itself", snips.includes("Monium"));

ev(btn, "click");
let p2 = D.querySelector("#pop-layer .rnp");
const seg = p2.querySelectorAll(".seg-b");
expect("Text becomes available once a text layer matched", !seg[1].hasAttribute("disabled"));
ev(seg[1], "click");
p2 = D.querySelector("#pop-layer .rnp");
expect("the popover stays open on the Text target", !!p2);
expect("Text is now the active target", p2.querySelector(".seg-b.on").textContent === "Text");
console.log("labels:", [...p2.querySelectorAll(".r .lb")].map(l => l.textContent).join(" | "));
expect("the second field is now a replacement, not a rename",
  [...p2.querySelectorAll(".r .lb")].some(l => l.textContent === "Replace with"));
const skipped = [...p2.querySelectorAll(".note")].map(n => n.textContent).join(" ");
console.log("skipped note:", skipped.trim());
expect("the layers with no text of their own are accounted for", /2 of the 3 matches are text layers/.test(skipped));

const ti = p2.querySelectorAll(".r input");
type(ti[1], "Monium1");
lines = [...p2.querySelectorAll(".prev .pl")].map(l =>
  [l.querySelector(".a").textContent, l.querySelector(".b").textContent]);
console.log("text preview:", JSON.stringify(lines));
expect("the preview shows the text, not the layer name", lines[1][0] === "Monium is here");
expect("only the text layers are listed", lines.length === 2);
expect("the text is what gets rewritten", lines[1][1] === "Monium1 is here");
console.log("action:", p2.querySelector(".foot .sel").textContent);
expect("the action says it replaces", /Replace in 2 layers/.test(p2.querySelector(".foot .sel").textContent));

sent.length = 0;
ev(p2.querySelector(".foot .sel"), "click");
const tmsg = sent.find(m => m.type === "renameMatches");
console.log("sent ->", JSON.stringify(tmsg));
expect("the message names the text target", tmsg && tmsg.target === "text");
expect("and carries only the text layers",
  tmsg && tmsg.renames.map(r => r.id).join() === "t1,t2");
expect("with the new text", tmsg && tmsg.renames[0].name === "Monium1");

/* the choice persists for the next search, but falls back when it cannot apply */
type(s, "Frame");
post({ type: "layers", pageName: "P", truncated: false, searching: true, selection: [], rows: [row("f1", "Frame 8")] });
ev(btn, "click");
expect("with no text layers the target falls back to the layer name",
  D.querySelector("#pop-layer .seg-b.on").textContent === "Layer name");
ev(D.getElementById("pop-layer"), "mousedown");

/* ---- a capped result set says so ---- */
post({ type: "layers", pageName: "P", truncated: true, searching: true, selection: [], rows: [row("b1", "btn")] });
ev(btn, "click");
const note = [...D.querySelectorAll("#pop-layer .rnp .note")]
  .map(n => n.textContent).find(t => /narrow the search/.test(t));
console.log("truncation note:", note);
expect("truncation is not silent", !!note);
ev(D.getElementById("pop-layer"), "mousedown");

/* ---- clearing the search puts the button away again ---- */
ev(D.getElementById("search-clear"), "click");
expect("clearing hides it", btn.style.display === "none");

check("rename found layers");
console.log("\nERRORS:", errors.length ? errors : "(none)");
