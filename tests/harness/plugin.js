/* Minimal Figma API stub, enough to load code.js and drive it. */
const posted = [];
const clientStore = {};
const events = {};      // figma.on handlers
const pageEvents = {};  // page.on handlers
let uiHandler = null;
const nodesById = new Map();

function mkNode(o) {
  const n = o;                                  // register the real object, not a copy
  if (n.visible === undefined) n.visible = true;
  if (n.locked === undefined) n.locked = false;
  n.removed = false;
  if (n.type === "TEXT" && n.characters === undefined) n.characters = "text";
  if (n.children) {
    n.children.forEach(c => { c.parent = n; });
    n.insertChild = (i, child) => {
      if (child.parent && child.parent.children) {
        const arr = child.parent.children;
        const at = arr.indexOf(child);
        if (at > -1) arr.splice(at, 1);
      }
      n.children.splice(i, 0, child);
      child.parent = n;
    };
    n.appendChild = (child) => n.insertChild(n.children.length, child);
  }
  nodesById.set(n.id, n);
  (n.children || []).forEach(mkNode);
  return n;
}

/*
 * The plugin window. Everything the plugin does to it is recorded in order,
 * because the order is the point: the size and the position have to be applied
 * before it is shown, or the user watches it jump.
 *
 * getPosition() throws until a test says where the window is, the way it does
 * when there is no UI — which is also what stops the position poll, so a test
 * that never places a window still exits.
 */
const uiLog = [];
let uiPos = null;
function setUiPosition(windowSpace, canvasSpace) {
  uiPos = { windowSpace: windowSpace, canvasSpace: canvasSpace || { x: 0, y: 0 } };
}

global.figma = {
  mixed: Symbol("mixed"),
  skipInvisibleInstanceChildren: false,
  showUI(html, opts) { uiLog.push({ call: "showUI", opts: opts || {} }); },
  notify(m) { console.log("NOTIFY:", m); posted.push({ notify: m }); },
  commitUndo() {},
  clientStorage: { getAsync: async (k) => clientStore[k] === undefined ? null : clientStore[k], setAsync: async (k,v) => { clientStore[k] = JSON.parse(JSON.stringify(v)); } },
  ui: {
    postMessage: (m) => posted.push(m),
    resize(w, h) { uiLog.push({ call: "resize", w: w, h: h }); },
    reposition(x, y) { uiLog.push({ call: "reposition", x: x, y: y }); },
    show() { uiLog.push({ call: "show" }); },
    hide() { uiLog.push({ call: "hide" }); },
    getPosition() {
      if (!uiPos) throw new Error("no UI available");
      return uiPos;
    },
    set onmessage(fn) { uiHandler = fn; }
  },
  on(t, fn) { events[t] = fn; }, off() {},
  root: { children: [] },
  currentPage: null,
  viewport: { zoom: 1, scrollAndZoomIntoView() {} },
  getNodeByIdAsync: async (id) => nodesById.get(id) || null,
  getStyleByIdAsync: async () => null,
  // Overridden by the tests that care; by default a key resolves to nothing, the
  // way an unpublished or renamed one does.
  importStyleByKeyAsync: async () => { throw new Error("Unable to create style"); },
  variables: {
    getLocalVariableCollectionsAsync: async () => [],
    getVariableByIdAsync: async () => null,
    getVariableCollectionByIdAsync: async () => null
  },
  teamLibrary: { getAvailableLibraryVariableCollectionsAsync: async () => [] },
  getLocalPaintStylesAsync: async () => [], getLocalTextStylesAsync: async () => [],
  getLocalEffectStylesAsync: async () => [], getLocalGridStylesAsync: async () => [],
  listAvailableFontsAsync: async () => [],
  setCurrentPageAsync: async () => {},
  loadFontAsync: async () => {}
};

const failures = [];

/*
 * Same idea on this side: an assertion that does not hold is recorded and the
 * process exits non-zero, so a test cannot pass by reporting nothing.
 */
function expect(label, condition) {
  if (condition) {
    console.log("  ok    " + label);
  } else {
    console.log("  FAIL  " + label);
    failures.push(label);
  }
  return !!condition;
}

function finish() {
  const notes = posted.filter((m) => m.notify);
  console.log("\nplugin error toasts: " + (notes.length ? JSON.stringify(notes.map((x) => x.notify)) : "(none)"));
  if (failures.length) {
    console.log("FAIL: " + failures.length + " assertion(s) did not hold");
    process.exit(1);
  }
  process.exit(notes.length ? 1 : 0);
}

global.__html__ = "<html></html>";
module.exports = { events, pageEvents, clientStore, posted, mkNode, nodesById, expect, finish, uiLog, setUiPosition, send: (m) => uiHandler(m), get ui() { return uiHandler; } };
