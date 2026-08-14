/* Dark by default, distinct from Figma, switchable and persisted. */
const { w, errors, sent, post, check } = require("../harness/ui.js");
const D = w.document;
const root = D.documentElement;
const tok = name => w.getComputedStyle(root).getPropertyValue(name).trim();

console.log("theme at first paint:", root.getAttribute("data-theme"), "(set in the HTML, so no light flash)");
console.log("toggle button:       ", !!D.getElementById("btn-theme"), "| title:", D.getElementById("btn-theme").title);

post({ type:"pages", pages:[{id:"0:1",name:"P"}], currentPageId:"0:1" });
post({ type:"layers", pageName:"P", truncated:false, searching:false, selection:[], zoom:1, rows:[] });
check("boot");

console.log("\nDARK PALETTE");
[["--bg","#17181c"],["--bg-2","#21232a"],["--text","#e6e7ea"],["--brand","#4a8cff"],
 ["--text-comp","#b98cff"],["--text-slot","#ff9351"],["--border","rgba(255,255,255,.09)"]]
 .forEach(([k, want]) => {
   const got = tok(k);
   console.log("  " + k.padEnd(13), got.padEnd(24), got === want ? "ok" : "expected " + want);
 });
console.log("  derives from Figma vars:", /figma-color/.test(tok("--bg")) ? "yes (wrong)" : "no");
console.log("  differs from Figma dark (#2c2c2c):", tok("--bg") !== "#2c2c2c");

/* switching to auto hands control back to Figma */
sent.length = 0;
D.getElementById("btn-theme").dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
console.log("\nafter toggle: data-theme:", root.getAttribute("data-theme"),
  "| --bg:", tok("--bg").slice(0, 34));
console.log("  follows Figma again:", /figma-color/.test(tok("--bg")));
console.log("  saved:", JSON.stringify(sent.find(m => m.type === "setPref")));
console.log("  title now:", D.getElementById("btn-theme").title);

/* and back */
D.getElementById("btn-theme").dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
console.log("\nback to dark:", root.getAttribute("data-theme"), "| --bg:", tok("--bg"));

/* a stored preference is honoured on open */
post({ type:"prefs", theme:"auto" });
console.log("stored pref applied on open:", root.getAttribute("data-theme"));
post({ type:"prefs", theme:"dark" });
check("theme");

/* the Gravity icons came through */
const eye = D.getElementById("btn-collapse").querySelector("svg");
console.log("\nGravity icon (collapse): fill", eye.getAttribute("fill"), "| fill-rule",
  (eye.querySelector("path")||{getAttribute:()=>null}).getAttribute("fill-rule"));
console.log("theme icon is moon:", /1\.5|moon/.test(D.getElementById("btn-theme").innerHTML.slice(0,40)) ? "yes" : "check");

console.log("\nERRORS:", errors.length ? errors : "(none)");
