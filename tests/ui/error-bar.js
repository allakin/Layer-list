/* The error bar must collect UI errors, promise rejections and plugin-side
   failures, and hand the lot over as copyable text. */
const { w, errors, post, check } = require("../harness/ui.js");
const D = w.document;
const bar = () => D.getElementById("errbar");

let copied = null;
w.navigator.clipboard = { writeText: t => { copied = t; return Promise.resolve(); } };

console.log("hidden at rest:", w.getComputedStyle(bar()).display);

/* 1. a UI error */
w.eval('reportError("UI error: Cannot read properties of null (reading \'closest\')  (line 2161:14)")');
console.log("\nafter 1 error:  visible:", bar().style.display,
  "| text:", bar().querySelector(".eb-msg").textContent.slice(0, 46) + "…");
console.log("  buttons:", [...bar().querySelectorAll(".eb-btn")].map(b=>b.textContent).join(", "));

/* 2. a plugin-side failure arriving over the bridge */
post({ type:"error", message:'[update] in get_children: The node (instance sublayer) with id "I4002:62425" does not exist',
       stack:"at collectRows (code.js:210)" });
const msgEl = bar().querySelector(".eb-msg").textContent;
console.log("\nafter 2 errors: shows newest + count:", /\(\+1 earlier\)/.test(msgEl));
console.log("  newest is the plugin one:", /get_children/.test(msgEl));

/* 3. copy hands over everything */
bar().querySelector(".eb-btn").dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
console.log("\ncopied lines:", copied.split("\n").filter(Boolean).length);
console.log("  contains UI error:     ", /closest/.test(copied));
console.log("  contains plugin error: ", /get_children/.test(copied));
console.log("  contains the stack:    ", /collectRows/.test(copied));
console.log("  button feedback:       ", bar().querySelector(".eb-btn").textContent);

/* 4. dismiss clears it */
[...bar().querySelectorAll(".eb-btn")].find(b=>b.textContent === "✕")
  .dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
console.log("\nafter dismiss:  display:", bar().style.display, "| buffer empty:", w.eval("ERRORS.length") === 0);

console.log("\nERRORS:", errors.length ? errors : "(none)");
