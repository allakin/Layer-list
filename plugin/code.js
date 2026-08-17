/* =============================================================================
   Layers & Design — main thread.

   Mirrors Figma's two native side panels: the layer tree (left) and the
   properties inspector (right). The document is the single source of truth —
   the UI never holds state that isn't re-derived from a node on every push.
   ========================================================================== */

const MIXED = "__MIXED__";
const MAX_ROWS = 4000;        // flat rows sent to the UI in one push
const MAX_INSPECT = 400;      // nodes merged into one property payload
const MAX_SEARCH = 500;

// Two walks run on the editor's thread every time the selection changes, so both
// are capped. Neither has to be exhaustive: the colour strip is a summary, and
// the background scan is what indexes the document properly.
const COLOR_SAMPLE_NODES = 2000;
const INDEX_SAMPLE_NODES = 500;

// Types whose children Figma shows in the layer list.
const HAS_LAYER_CHILDREN = new Set([
  "FRAME", "GROUP", "COMPONENT", "COMPONENT_SET", "INSTANCE",
  "SECTION", "BOOLEAN_OPERATION", "SLOT"
]);

// Containers you may drop layers into.
const DROP_TARGETS = new Set([
  "FRAME", "GROUP", "COMPONENT", "COMPONENT_SET", "SECTION", "SLOT"
]);

/* ---- boot ---------------------------------------------------------------- */

/*
  Where the panel sits and how big it is belongs to the person using it, not to
  the document, so it lives in clientStorage: on this machine, for this user,
  outside the .fig file and outside the repository. A plugin cannot write to disk
  at all — there is no file to gitignore, and nothing here appears in the project
  folder.

  The window starts hidden because reading that back is asynchronous: shown
  first, it would paint one frame at the default size and place and then jump.
  show() is unconditional, so storage that refuses to answer costs the saved
  placement and never the panel itself.
*/
const UI_DEFAULT = { w: 660, h: 760 };
const UI_MIN = { w: 260, h: 320 };

figma.showUI(__html__, {
  visible: false,
  width: UI_DEFAULT.w,
  height: UI_DEFAULT.h,
  themeColors: true,
  title: "Layers & Design"
});

(async () => {
  let pos = null;
  try {
    const size = await figma.clientStorage.getAsync("ui-size");
    if (size && size.w && size.h) {
      figma.ui.resize(Math.max(UI_MIN.w, size.w), Math.max(UI_MIN.h, size.h));
    }
    pos = await figma.clientStorage.getAsync("ui-pos");
  } catch (e) {
    /* nothing saved yet, or storage is unavailable: the defaults stand */
  }
  // Placing it while it is still hidden is the whole point of starting hidden.
  // Should the position not be readable until the window is up, placing it after
  // still beats leaving it wherever Figma decided to put it.
  const placed = placeWindow(pos);
  try { figma.ui.show(); } catch (e) { return; }   // closed while we were reading
  if (!placed) placeWindow(pos);
  watchWindowPosition();
})();

/*
  reposition() speaks canvas coordinates, but what the user arranged is a place
  on screen, and the canvas coordinates of that place depend on the current
  scroll and zoom — saved as canvas coordinates it would land somewhere else
  entirely in the next file. So window space is what gets saved, and
  getPosition() answers in both spaces at once for the same point, which is all
  it takes to convert: a distance in window space is that distance over the zoom
  in canvas space.

  Returns false only when there was a position to restore and it could not be
  measured, so the caller knows to try again.
*/
function placeWindow(pos) {
  if (!pos || !isFinite(pos.x) || !isFinite(pos.y)) return true;
  let now;
  try { now = figma.ui.getPosition(); } catch (e) { return false; }
  const zoom = figma.viewport.zoom || 1;
  figma.ui.reposition(
    now.canvasSpace.x + (pos.x - now.windowSpace.x) / zoom,
    now.canvasSpace.y + (pos.y - now.windowSpace.y) / zoom
  );
  return true;
}

/*
  Nothing fires when the user drags the plugin window, so the position has to be
  looked at. getPosition() reads no node and walks nothing — that is what makes
  polling it affordable where polling the document would not be — and the write
  it leads to is debounced and only happens when the window has actually moved.

  The first reading is the one we just restored, so it seeds and saves nothing.
  A reading that throws means there is no window any more: stop, rather than
  wake up once a second for a plugin that has closed.
*/
const POS_POLL_MS = 1000;
let lastPos = null;

function watchWindowPosition() {
  const tick = () => {
    let win;
    try { win = figma.ui.getPosition().windowSpace; } catch (e) { return; }
    const at = { x: Math.round(win.x), y: Math.round(win.y) };
    // Figma keeps the window inside the viewport, so what it ends up at can
    // differ from what was asked for. What the user can see is what gets saved.
    if (!lastPos) lastPos = at;
    else if (lastPos.x !== at.x || lastPos.y !== at.y) {
      lastPos = at;
      saveLater("ui-pos", at);
    }
    setTimeout(tick, POS_POLL_MS);
  };
  setTimeout(tick, POS_POLL_MS);
}

/*
  One write per key, once things have stopped moving. The resize grip sends a
  message on every pointer move and a window drag reports a new position every
  second; each of those used to be a clientStorage write of its own.
*/
const SAVE_DEBOUNCE_MS = 400;
const pendingSaves = new Map();

function saveLater(key, value) {
  const prev = pendingSaves.get(key);
  if (prev) clearTimeout(prev.timer);
  pendingSaves.set(key, {
    value: value,
    timer: setTimeout(() => {
      const entry = pendingSaves.get(key);
      pendingSaves.delete(key);
      figma.clientStorage.setAsync(key, entry.value).catch(() => { /* over quota */ });
    }, SAVE_DEBOUNCE_MS)
  });
}

/* ---- panel preferences (theme) ------------------------------------------- */

let prefs = { theme: "dark" };

async function loadPrefs() {
  try {
    const saved = await figma.clientStorage.getAsync("ui-prefs");
    if (saved && saved.theme) prefs = saved;
  } catch (e) { /* storage unavailable; defaults stand */ }
  figma.ui.postMessage({ type: "prefs", theme: prefs.theme });
}

/* ---- panel state --------------------------------------------------------- */

const expanded = new Set();   // node ids whose children are rendered
let searchTerm = "";
let refreshTimer = null;
let selectionDirty = false; // a coalesced refresh has to reveal before it lists
let inspectDirty = true;

/* ---- colour helpers ------------------------------------------------------ */

function rgbToHex(c) {
  const to = (v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, "0");
  return "#" + to(c.r) + to(c.g) + to(c.b);
}

function hexToRgb(hex) {
  const h = String(hex).replace("#", "").trim();
  const full = h.length === 3 ? h[0] + h[0] + h[1] + h[1] + h[2] + h[2] : h;
  return {
    r: parseInt(full.slice(0, 2), 16) / 255,
    g: parseInt(full.slice(2, 4), 16) / 255,
    b: parseInt(full.slice(4, 6), 16) / 255
  };
}

function clone(v) { return JSON.parse(JSON.stringify(v)); }
function m(v) { return v === figma.mixed ? MIXED : v; }

// Read a property that throws when the node isn't in the right context
// (layoutSizing* outside auto layout, strokeWeight on mixed strokes, …).
function safe(fn, fallback) {
  try {
    const v = fn();
    return v === undefined ? fallback : m(v);
  } catch (e) {
    return fallback;
  }
}

/* =============================================================================
   Layer tree
   ========================================================================== */

const COMPONENT_TYPES = new Set(["COMPONENT", "COMPONENT_SET", "INSTANCE"]);

function typeMeta(node) {
  const meta = {};
  if (node.type === "INSTANCE") meta.instance = true;
  if (node.type === "COMPONENT" || node.type === "COMPONENT_SET") meta.component = true;
  if (node.type === "TEXT") meta.chars = safe(() => node.characters.slice(0, 40), "");
  if ("isMask" in node && node.isMask) meta.mask = true;
  if ("clipsContent" in node && node.clipsContent === false) meta.noClip = true;
  // The layer icon reflects the flow direction, so wrap counts as its own mode.
  if ("layoutMode" in node && node.layoutMode && node.layoutMode !== "NONE") {
    meta.autolayout = safe(() => node.layoutWrap, null) === "WRAP" ? "WRAP" : node.layoutMode;
  }
  return meta;
}

// Figma tints every layer that lives inside a component, instance or component
// set — not just the component node itself.
function insideComponent(node) {
  let p = node.parent;
  while (p && p.type !== "PAGE" && p.type !== "DOCUMENT") {
    if (COMPONENT_TYPES.has(p.type)) return true;
    p = p.parent;
  }
  return false;
}

function toRow(node, depth, parentId, inComponent) {
  const kids = HAS_LAYER_CHILDREN.has(node.type) ? safeChildren(node) : null;
  const row = {
    id: node.id,
    name: node.name,
    type: node.type,
    depth,
    parentId,
    visible: node.visible !== false,
    locked: node.locked === true,
    hasChildren: !!(kids && kids.length),
    expanded: expanded.has(node.id),
    inComponent: !!inComponent || COMPONENT_TYPES.has(node.type)
  };
  Object.assign(row, typeMeta(node));
  return row;
}

function isAutoLayout(node) {
  return "layoutMode" in node && !!node.layoutMode && node.layoutMode !== "NONE";
}

// Figma's layer list orders children two different ways, and getting this wrong
// inverts every auto-layout branch:
//   · plain frames / groups / sections → z-order, so the top-most layer (the
//     LAST entry of children[]) is listed first;
//   · auto-layout frames → layout order, children[0] first — which is why
//     dragging a row up in the panel moves the item earlier in the flow.
function childOrder(container) {
  const kids = safeChildren(container);
  if (!kids) return [];
  return isAutoLayout(container) ? kids.slice() : kids.slice().reverse();
}

// Walks only expanded branches — the whole point is that a 50k-layer file
// costs the same as a 50-layer one until you open something.
//
// `path` holds the ids of the containers above this one, because a layer can
// turn up inside itself: slot content and recursive instances both do it, and
// Figma's own panel only survives because it opens one level per click. This one
// opens every expanded branch at once, so an unguarded walk runs to MAX_ROWS
// with each row indented a level deeper — that is what once made the tree wider
// than the window and squeezed the inspector out of sight.
function collectRows(container, depth, out, state, inComponent, path) {
  const kids = childOrder(container);
  const chain = path || new Set([container.id]);
  for (const node of kids) {
    if (out.length >= MAX_ROWS) { state.truncated = true; return; }
    if (!nodeAlive(node)) continue;
    let row;
    try {
      row = toRow(node, depth, container.id, inComponent);
    } catch (e) {
      continue;                                  // skip the casualty, keep the list
    }
    if (chain.has(node.id)) {
      // The same layer as one of its own ancestors. Show it — the structure is
      // real — but end the branch here rather than repeat it forever.
      row.cycle = true;
      row.hasChildren = false;
      out.push(row);
      continue;
    }
    out.push(row);
    if (row.hasChildren && expanded.has(node.id)) {
      chain.add(node.id);
      collectRows(node, depth + 1, out, state, !!inComponent || COMPONENT_TYPES.has(node.type), chain);
      chain.delete(node.id);
    }
  }
}

function ancestorNames(node) {
  const path = [];
  let p = node.parent;
  while (p && p.type !== "PAGE" && p.type !== "DOCUMENT") {
    path.unshift(p.name);
    p = p.parent;
  }
  return path;
}

function searchRows() {
  const term = searchTerm.toLowerCase();
  const prev = figma.skipInvisibleInstanceChildren;
  figma.skipInvisibleInstanceChildren = true;
  let hits;
  try {
    // A text layer's name only follows its content until someone renames one of
    // them, so matching names alone cannot find "Sign in" inside a layer called
    // "Label" — and the rename popover offers to rewrite exactly that text.
    hits = figma.currentPage.findAll((n) => {
      if (safe(() => n.name, "").toLowerCase().includes(term)) return true;
      return n.type === "TEXT" && safe(() => n.characters, "").toLowerCase().includes(term);
    });
  } finally {
    figma.skipInvisibleInstanceChildren = prev;
  }
  const truncated = hits.length > MAX_SEARCH;
  const rows = hits.slice(0, MAX_SEARCH).map((n) => {
    const row = toRow(n, 0, n.parent ? n.parent.id : null, insideComponent(n));
    row.hasChildren = false;
    row.path = ancestorNames(n).join(" / ");
    // The bulk-rename popover previews and rewrites text content, so the rows it
    // works from carry it. Only these do — collectRows must not read a whole
    // page's worth of characters on every selection change.
    if (n.type === "TEXT") row.text = safe(() => n.characters, "");
    return row;
  });
  return { rows, truncated };
}

// Open every ancestor of the current selection so it is actually on screen.
function revealSelection() {
  for (const node of figma.currentPage.selection) {
    try {
      let p = node.parent;
      while (p && p.type !== "PAGE" && p.type !== "DOCUMENT") {
        expanded.add(p.id);
        p = p.parent;
      }
    } catch (e) { /* this one is gone; the others still reveal */ }
  }
}

function pushLayers() {
  let rows, truncated = false;
  if (searchTerm) {
    const r = searchRows();
    rows = r.rows;
    truncated = r.truncated;
  } else {
    const state = { truncated: false };
    rows = [];
    collectRows(figma.currentPage, 0, rows, state);
    truncated = state.truncated;
  }
  figma.ui.postMessage({
    type: "layers",
    rows,
    truncated,
    searching: !!searchTerm,
    selection: figma.currentPage.selection.map((n) => n.id),
    pageName: figma.currentPage.name,
    zoom: figma.viewport.zoom
  });
}

function pushPages() {
  figma.ui.postMessage({
    type: "pages",
    pages: figma.root.children.map((pg) => ({ id: pg.id, name: pg.name })),
    currentPageId: figma.currentPage.id
  });
}

/* =============================================================================
   Property reading
   ========================================================================== */

// Every variable / style id touched while reading the current selection. The UI
// gets a resolved dictionary alongside the props so it can render token chips
// ("radius/md", "color/bg/subtle") instead of raw ids.
let refSet = new Set();

function paintToObj(paint) {
  const o = {
    type: paint.type,
    visible: paint.visible !== false,
    opacity: paint.opacity == null ? 1 : paint.opacity,
    blendMode: paint.blendMode || "NORMAL"
  };
  if (paint.type === "SOLID") {
    o.color = rgbToHex(paint.color);
  } else if (paint.type.indexOf("GRADIENT") === 0) {
    o.stops = paint.gradientStops.map((s) => ({
      color: rgbToHex(s.color),
      a: s.color.a == null ? 1 : s.color.a,
      pos: s.position
    }));
    o.transform = paint.gradientTransform;
  } else if (paint.type === "IMAGE" || paint.type === "VIDEO") {
    o.scaleMode = paint.scaleMode;
    o.imageHash = paint.imageHash || null;
    o.rotation = paint.rotation || 0;
    o.scalingFactor = paint.scalingFactor == null ? 1 : paint.scalingFactor;
  }
  const bv = paint.boundVariables && paint.boundVariables.color;
  o.colorVar = bv ? bv.id : null;
  if (o.colorVar) refSet.add(o.colorVar);
  if (o.stops) {
    o.stopVars = paint.gradientStops.map((s) => {
      const sv = s.boundVariables && s.boundVariables.color;
      if (sv) refSet.add(sv.id);
      return sv ? sv.id : null;
    });
  }
  return o;
}

function effectToObj(e) {
  const o = {
    type: e.type,
    visible: e.visible !== false,
    radius: e.radius == null ? 0 : e.radius
  };
  if (e.type === "DROP_SHADOW" || e.type === "INNER_SHADOW") {
    o.color = rgbToHex(e.color);
    o.alpha = e.color.a == null ? 1 : e.color.a;
    o.offsetX = e.offset.x;
    o.offsetY = e.offset.y;
    o.spread = e.spread || 0;
    o.blendMode = e.blendMode || "NORMAL";
    o.behind = !!e.showShadowBehindNode;
  }
  o.vars = varsOf(e);
  return o;
}

function gridToObj(g) {
  return {
    pattern: g.pattern,
    visible: g.visible !== false,
    color: rgbToHex(g.color),
    alpha: g.color.a == null ? 1 : g.color.a,
    sectionSize: g.sectionSize == null ? null : g.sectionSize,
    count: g.count == null ? null : g.count,
    gutterSize: g.gutterSize == null ? null : g.gutterSize,
    offset: g.offset == null ? null : g.offset,
    alignment: g.alignment || null,
    vars: varsOf(g)
  };
}

// boundVariables on paints / effects / grids is a flat { field: alias } map.
function varsOf(obj) {
  const bv = obj.boundVariables;
  if (!bv) return null;
  const out = {};
  for (const k in bv) if (bv[k] && bv[k].id) { out[k] = bv[k].id; refSet.add(bv[k].id); }
  return Object.keys(out).length ? out : null;
}

function lengthUnit(v) {
  if (v === figma.mixed || v == null) return { value: null, unit: MIXED };
  if (v.unit === "AUTO") return { value: null, unit: "AUTO" };
  return { value: Math.round(v.value * 100) / 100, unit: v.unit };
}

function boundVarMap(node) {
  const out = {};
  const bv = node.boundVariables;
  if (!bv) return out;
  for (const key in bv) {
    const entry = bv[key];
    if (!entry) continue;
    if (Array.isArray(entry)) continue;          // fills / strokes handled per-paint
    if (entry.id) { out[key] = entry.id; refSet.add(entry.id); }
  }
  return out;
}

function styleRef(id) {
  if (id && id !== figma.mixed) refSet.add(id);
  return id === figma.mixed ? MIXED : (id || "");
}

function readProps(node) {
  const p = { id: node.id, name: node.name, type: node.type };

  p.visible = node.visible !== false;
  p.locked = node.locked === true;
  if ("isMask" in node) p.isMask = node.isMask;

  /* -- geometry -- */
  if ("x" in node) { p.x = round2(node.x); p.y = round2(node.y); }
  if ("width" in node) { p.width = round2(node.width); p.height = round2(node.height); }
  if ("rotation" in node) p.rotation = round2(node.rotation);

  /* -- corners -- */
  if ("cornerRadius" in node) {
    p.cornerRadius = m(node.cornerRadius);
    p.corners = {
      tl: safe(() => node.topLeftRadius, null),
      tr: safe(() => node.topRightRadius, null),
      br: safe(() => node.bottomRightRadius, null),
      bl: safe(() => node.bottomLeftRadius, null)
    };
  }
  if ("cornerSmoothing" in node) p.cornerSmoothing = node.cornerSmoothing;

  /* -- constraints -- */
  if ("constraints" in node && node.constraints) {
    p.constraints = {
      horizontal: node.constraints.horizontal,
      vertical: node.constraints.vertical
    };
  }

  /* -- auto layout (container side) -- */
  if ("layoutMode" in node) {
    p.layoutMode = node.layoutMode;
    if (node.layoutMode !== "NONE") {
      p.layout = {
        mode: node.layoutMode,
        itemSpacing: m(node.itemSpacing),
        counterAxisSpacing: safe(() => node.counterAxisSpacing, null),
        paddingTop: node.paddingTop,
        paddingRight: node.paddingRight,
        paddingBottom: node.paddingBottom,
        paddingLeft: node.paddingLeft,
        primaryAxisAlignItems: node.primaryAxisAlignItems,
        counterAxisAlignItems: node.counterAxisAlignItems,
        counterAxisAlignContent: safe(() => node.counterAxisAlignContent, null),
        layoutWrap: safe(() => node.layoutWrap, null),
        itemReverseZIndex: safe(() => node.itemReverseZIndex, false),
        strokesIncludedInLayout: safe(() => node.strokesIncludedInLayout, false)
      };
      // Grid auto layout (newer files); absent on older API builds.
      if (node.layoutMode === "GRID") {
        p.layout.gridRowCount = safe(() => node.gridRowCount, null);
        p.layout.gridColumnCount = safe(() => node.gridColumnCount, null);
        p.layout.gridRowGap = safe(() => node.gridRowGap, null);
        p.layout.gridColumnGap = safe(() => node.gridColumnGap, null);
      }
    }
  }
  if ("clipsContent" in node) p.clipsContent = node.clipsContent;
  if ("overflowDirection" in node) p.overflowDirection = node.overflowDirection;
  p.hasReactions = safe(() => (node.reactions || []).length, 0);

  /* -- auto layout (child side) -- */
  p.layoutSizingHorizontal = safe(() => node.layoutSizingHorizontal, null);
  p.layoutSizingVertical = safe(() => node.layoutSizingVertical, null);
  p.layoutPositioning = safe(() => node.layoutPositioning, null);
  p.layoutGrow = safe(() => node.layoutGrow, null);
  p.layoutAlign = safe(() => node.layoutAlign, null);
  ["minWidth", "maxWidth", "minHeight", "maxHeight"].forEach((k) => {
    const v = safe(() => node[k], undefined);
    if (v !== undefined) p[k] = v;
  });
  // Does the parent drive layout? Decides whether we show Position or Sizing.
  const parent = node.parent;
  p.inAutoLayout = !!(parent && "layoutMode" in parent && parent.layoutMode && parent.layoutMode !== "NONE");

  /* -- appearance -- */
  if ("opacity" in node) p.opacity = node.opacity;
  if ("blendMode" in node) p.blendMode = node.blendMode;

  /* -- paints -- */
  if ("fills" in node) {
    p.fills = node.fills === figma.mixed ? MIXED : node.fills.map(paintToObj);
    p.fillStyleId = safe(() => styleRef(node.fillStyleId), "");
  }
  if ("strokes" in node) {
    p.strokes = node.strokes.map(paintToObj);
    p.strokeStyleId = safe(() => styleRef(node.strokeStyleId), "");
    p.strokeWeight = safe(() => node.strokeWeight, null);
    p.strokeAlign = safe(() => node.strokeAlign, null);
    p.strokeCap = safe(() => node.strokeCap, null);

    // Open-ended shapes get separate Start / End point controls. Where those
    // caps live depends on the node:
    //   CONNECTOR → dedicated connectorStart/EndStrokeCap properties
    //   VECTOR    → the strokeCap of the first / last vector vertex
    //   LINE      → only one shared strokeCap is exposed by the API
    if (node.type === "CONNECTOR") {
      p.capMode = "connector";
      p.strokeCapStart = safe(() => node.connectorStartStrokeCap, "NONE");
      p.strokeCapEnd = safe(() => node.connectorEndStrokeCap, "NONE");
    } else if (node.type === "VECTOR" || node.type === "LINE") {
      const ends = safe(() => {
        const vn = node.vectorNetwork;
        if (!vn || !vn.vertices || vn.vertices.length < 2 || vn.vertices.length > 2000) return null;
        const first = vn.vertices[0], last = vn.vertices[vn.vertices.length - 1];
        return { start: first.strokeCap || "NONE", end: last.strokeCap || "NONE" };
      }, null);
      if (ends) {
        p.capMode = "vector";
        p.strokeCapStart = ends.start;
        p.strokeCapEnd = ends.end;
      } else {
        p.capMode = "shared";
        p.strokeCapStart = p.strokeCap;
        p.strokeCapEnd = p.strokeCap;
      }
    }
    p.strokeJoin = safe(() => node.strokeJoin, null);
    p.strokeMiterLimit = safe(() => node.strokeMiterLimit, null);
    p.dashPattern = safe(() => (node.dashPattern || []).join(", "), "");
    p.strokeSides = {
      top: safe(() => node.strokeTopWeight, null),
      right: safe(() => node.strokeRightWeight, null),
      bottom: safe(() => node.strokeBottomWeight, null),
      left: safe(() => node.strokeLeftWeight, null)
    };
  }
  if ("effects" in node) {
    p.effects = node.effects === figma.mixed ? MIXED : node.effects.map(effectToObj);
    p.effectStyleId = safe(() => styleRef(node.effectStyleId), "");
  }
  if ("layoutGrids" in node) {
    p.layoutGrids = node.layoutGrids.map(gridToObj);
    p.gridStyleId = safe(() => styleRef(node.gridStyleId), "");
  }

  /* -- text -- */
  if (node.type === "TEXT") {
    const fn = node.fontName;
    p.text = {
      fontFamily: fn === figma.mixed ? MIXED : fn.family,
      fontStyle: fn === figma.mixed ? MIXED : fn.style,
      fontSize: m(node.fontSize),
      lineHeight: lengthUnit(node.lineHeight),
      letterSpacing: lengthUnit(node.letterSpacing),
      paragraphSpacing: m(node.paragraphSpacing),
      paragraphIndent: m(node.paragraphIndent),
      textAlignHorizontal: node.textAlignHorizontal,
      textAlignVertical: node.textAlignVertical,
      textCase: m(node.textCase),
      textDecoration: m(node.textDecoration),
      textAutoResize: node.textAutoResize,
      textTruncation: safe(() => node.textTruncation, null),
      maxLines: safe(() => node.maxLines, null),
      leadingTrim: safe(() => m(node.leadingTrim), null),
      characters: node.characters.length
    };
    p.textStyleId = safe(() => styleRef(node.textStyleId), "");
  }

  /* -- vector-ish -- */
  if (node.type === "ELLIPSE") {
    p.arc = {
      start: node.arcData.startingAngle,
      end: node.arcData.endingAngle,
      ratio: node.arcData.innerRadius
    };
  }
  if (node.type === "POLYGON" || node.type === "STAR") {
    p.pointCount = node.pointCount;
    if (node.type === "STAR") p.innerRadius = node.innerRadius;
  }

  /* -- component / instance -- */
  if (node.type === "INSTANCE") {
    p.instance = {
      properties: safe(() => {
        const out = [];
        const defs = node.componentProperties || {};
        for (const key in defs) {
          const def = defs[key];
          const entry = {
            key,
            label: key.split("#")[0],
            type: def.type,
            value: def.value,
            options: def.variantOptions || null
          };
          // The raw value of a swap property is a component id / key; the UI
          // needs a name, so register it for the same resolve pass as styles.
          if (def.type === "INSTANCE_SWAP" && typeof def.value === "string") {
            entry.ref = "swap:" + def.value;
            refSet.add(entry.ref);
          }
          out.push(entry);
        }
        return out;
      }, []),
      exposed: safe(() => node.exposedInstances.length, 0)
    };
  }
  if (node.type === "COMPONENT" || node.type === "COMPONENT_SET") {
    p.componentInfo = {
      description: node.description || "",
      defs: safe(() => {
        const defs = node.componentPropertyDefinitions || {};
        return Object.keys(defs).map((k) => ({
          key: k, label: k.split("#")[0], type: defs[k].type, value: defs[k].defaultValue
        }));
      }, [])
    };
  }

  /* -- export -- */
  if ("exportSettings" in node) {
    p.exportSettings = node.exportSettings.map((s) => ({
      format: s.format,
      suffix: s.suffix || "",
      constraintType: s.constraint ? s.constraint.type : "SCALE",
      constraintValue: s.constraint ? s.constraint.value : 1
    }));
  }

  p.boundVariables = boundVarMap(node);

  /* -- variable modes (Figma's "Variables" section on frames) -- */
  const explicit = safe(() => node.explicitVariableModes, null);
  if (explicit) {
    p.variableModes = Object.keys(explicit).map((collectionId) => ({
      collectionId,
      modeId: explicit[collectionId]
    }));
  }

  /* -- relations -- */
  // Reaching for .parent or .children is exactly where an instance sublayer
  // throws; a panel missing its Contents row beats no panel at all.
  p.parent = safe(() => (node.parent
    ? { id: node.parent.id, name: node.parent.name, type: node.parent.type }
    : null), null);
  p.childCount = safe(() => {
    const kids = safeChildren(node);
    return kids ? kids.length : 0;
  }, 0);

  return p;
}

function round2(v) { return Math.round(v * 100) / 100; }

/* ---- merging a multi-selection into one payload -------------------------- */

function sameValue(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a === "object" && typeof b === "object") {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
}

// A key survives only if every node has it; differing values collapse to MIXED,
// exactly like Figma's "Mixed" placeholders.
function mergeProps(list) {
  if (list.length === 1) return list[0];
  const base = list[0];
  const out = {};
  for (const key in base) {
    let all = true;
    for (let i = 1; i < list.length; i++) {
      if (!(key in list[i])) { all = false; break; }
    }
    if (!all) continue;
    let value = base[key];
    for (let i = 1; i < list.length; i++) {
      if (!sameValue(value, list[i][key])) { value = MIXED; break; }
    }
    out[key] = value;
  }
  out.id = base.id;
  out.name = list.every((n) => n.name === base.name) ? base.name : MIXED;
  out.type = list.every((n) => n.type === base.type) ? base.type : MIXED;
  return out;
}

// The summary strip is asked for on every selection change, for up to
// MAX_INSPECT nodes at once — on a page of screen mockups a full subtree read is
// tens of thousands of nodes on the thread the editor draws with, and the canvas
// stutters. Sample breadth-first within a budget: the strip shows 24 colours, so
// what matters is covering the selection, not reading all of it.
function selectionColors(nodes) {
  const map = new Map();
  const queue = nodes.slice();
  const prev = figma.skipInvisibleInstanceChildren;
  figma.skipInvisibleInstanceChildren = true;
  try {
    for (let i = 0; i < queue.length && i < COLOR_SAMPLE_NODES; i++) {
      const node = queue[i];
      if (!nodeAlive(node)) continue;
      let fills = null;
      try { fills = "fills" in node ? node.fills : null; } catch (e) { fills = null; }
      if (fills && fills !== figma.mixed && Array.isArray(fills)) {
        for (const f of fills) {
          if (f.type === "SOLID" && f.visible !== false) {
            const hex = rgbToHex(f.color);
            map.set(hex, (map.get(hex) || 0) + 1);
          }
        }
      }
      const kids = queue.length < COLOR_SAMPLE_NODES ? safeChildren(node) : null;
      if (kids) for (const c of kids) queue.push(c);
    }
  } finally {
    figma.skipInvisibleInstanceChildren = prev;
  }
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 24)
    .map(([hex, count]) => ({ hex, count }));
}

// Turn the collected variable / style ids into display data. Library tokens
// resolve here too — an imported variable behaves like a local one.
// A swap property's value is either a node id (local component) or a library
// component key; try both so the row can show a real name.
async function resolveComponentRef(value) {
  let node = null;
  try { node = await figma.getNodeByIdAsync(value); } catch (e) { node = null; }
  if (!node) {
    try { node = await figma.importComponentByKeyAsync(value); } catch (e) { node = null; }
  }
  if (!node) {
    try { node = await figma.importComponentSetByKeyAsync(value); } catch (e) { node = null; }
  }
  if (!node) return null;
  const set = node.parent && node.parent.type === "COMPONENT_SET" ? node.parent : null;
  return {
    kind: "component",
    id: node.id,
    name: set ? set.name + " / " + node.name : node.name,
    short: node.name,
    set: set ? set.name : null,
    remote: !!node.remote
  };
}

async function resolveRefs(ids) {
  const refs = {};
  for (const id of ids) {
    try {
      if (id.indexOf("swap:") === 0) {
        const info = await resolveComponentRef(id.slice(5));
        if (info) refs[id] = info;
      } else if (id.indexOf("VariableID:") === 0) {
        const v = await figma.variables.getVariableByIdAsync(id);
        if (!v) continue;
        const col = await figma.variables.getVariableCollectionByIdAsync(v.variableCollectionId);
        refs[id] = {
          kind: "variable",
          name: v.name,
          short: v.name.split("/").pop(),
          type: v.resolvedType,
          collection: col ? col.name : "",
          remote: v.remote,
          modes: col
            ? col.modes.map((md) => ({
              name: md.name,
              value: previewValue(v.valuesByMode[md.modeId], v.resolvedType)
            }))
            : []
        };
      } else {
        const s = await figma.getStyleByIdAsync(id);
        if (!s) continue;
        refs[id] = {
          kind: "style",
          name: s.name,
          short: s.name.split("/").pop(),
          type: s.type,
          remote: s.remote,
          color: s.type === "PAINT" ? firstPaintHex(s.paints) : null
        };
      }
    } catch (e) { /* deleted or inaccessible reference */ }
  }
  return refs;
}

function previewValue(raw, type) {
  if (raw == null) return null;
  if (raw.type === "VARIABLE_ALIAS") return "→ alias";
  if (type === "COLOR" && raw.r != null) {
    return rgbToHex(raw) + (raw.a != null && raw.a < 1 ? " " + Math.round(raw.a * 100) + "%" : "");
  }
  return String(raw);
}

function firstPaintHex(paints) {
  const p = paints && paints[0];
  if (!p) return null;
  if (p.type === "SOLID") return rgbToHex(p.color);
  if (p.type.indexOf("GRADIENT") === 0 && p.gradientStops.length) return rgbToHex(p.gradientStops[0].color);
  return null;
}

async function pushSelection() {
  const sel = figma.currentPage.selection;
  if (sel.length === 0) {
    figma.ui.postMessage({ type: "props", props: null, count: 0 });
    return;
  }
  if (!sel.some(nodeAlive)) {
    figma.ui.postMessage({ type: "props", props: null, count: 0 });
    return;
  }
  refSet = new Set();
  const slice = sel.slice(0, MAX_INSPECT).filter(nodeAlive);
  const read = [];
  let firstError = null;
  for (const node of slice) {
    try {
      read.push(readProps(node));
    } catch (e) {
      if (!firstError) firstError = { node: node, error: e };
    }
  }

  if (!read.length) {
    figma.ui.postMessage({ type: "props", props: null, count: 0 });
    // Swallowing this is how "I selected a layer and the panel went blank"
    // happens: an empty panel and no clue why. Say what broke instead.
    if (firstError) {
      const where = safe(() => firstError.node.type + " “" + firstError.node.name + "”", "the selection");
      figma.ui.postMessage({
        type: "error",
        message: "Could not read " + where + ": " + (firstError.error.message || firstError.error),
        stack: firstError.error.stack || null
      });
      figma.notify("Could not read the selected layer", { error: true });
    }
    return;
  }
  const props = mergeProps(read);
  const refs = await resolveRefs(refSet);

  // Figma titles the panel with the component behind an instance and shows the
  // set name plus its description underneath.
  if (props && props.instance && sel.length === 1) {
    try {
      const main = await sel[0].getMainComponentAsync();
      if (main) {
        const set = main.parent && main.parent.type === "COMPONENT_SET" ? main.parent : null;

        // componentProperties on an instance comes back in arbitrary order, but
        // componentPropertyDefinitions is keyed in the order the panel shows —
        // so take the ordering from there. Variant properties are defined on the
        // set, not on the individual variant.
        props.propertyOrder = safe(() => {
          const owner = set || main;
          return Object.keys(owner.componentPropertyDefinitions || {});
        }, null) || null;

        props.mainComponent = {
          id: main.id,
          name: main.name,
          setName: set ? set.name : null,
          title: set ? set.name : main.name,
          description: (set && set.description) || main.description || "",
          remote: !!main.remote,
          missing: false
        };
      } else {
        props.mainComponent = { missing: true, title: props.name, description: "" };
      }
    } catch (e) {
      props.mainComponent = { missing: true, title: props.name, description: "" };
    }
  }
  figma.ui.postMessage({
    type: "props",
    props,
    refs,
    count: sel.length,
    inspected: read.length,   // what was actually readable, not what was tried
    ids: sel.map((n) => n.id),
    types: [...new Set(sel.map((n) => n.type))],
    colors: sel.length > 1 ? selectionColors(slice) : null
  });
}

function noop() { /* fire-and-forget push */ }
function pushSelectionSoon() { pushSelection().catch(noop); }

function pushAll() { revealSelection(); pushPages(); pushLayers(); pushSelectionSoon(); }

/* =============================================================================
   Live sync
   ========================================================================== */

function scheduleRefresh(withProps) {
  if (withProps) inspectDirty = true;
  if (refreshTimer) return;
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    if (selectionDirty) {
      selectionDirty = false;
      try { revealSelection(); } catch (e) { /* stale nodes; the rows still push */ }
    }
    try {
      pushLayers();
    } catch (e) { /* the tree moved under us; the next event repaints */ }
    if (inspectDirty) { inspectDirty = false; pushSelectionSoon(); }
  }, 90);
}

let nodeChangeHandler = null;

// PageNode.on("nodechange") is the dynamic-page-safe alternative to
// figma.on("documentchange"), which would force loadAllPagesAsync() and stall
// on large files. It only reports the current page — which is all we render.
function bindPageWatcher() {
  const page = figma.currentPage;
  if (nodeChangeHandler) {
    try { nodeChangeHandler.page.off("nodechange", nodeChangeHandler.fn); } catch (e) { /* page gone */ }
  }
  const fn = (event) => {
    try {
      onNodeChange(event);
    } catch (e) { /* a change event referencing dead nodes must stay silent */ }
  };

  const onNodeChange = (event) => {
    lastDocChangeAt = Date.now();
    scheduleRefresh(true);
    // Keep the design-system index current without a full rescan: only the
    // nodes that actually changed get inspected.
    const changed = (event && event.nodeChanges ? event.nodeChanges : [])
      .map((c) => c.node)
      .filter(Boolean);
    if (changed.length) queueNodeIndex(changed);
  };

  try {
    page.on("nodechange", fn);
    nodeChangeHandler = { page, fn };
  } catch (e) {
    nodeChangeHandler = null;   // older API build: fall back to event-only refresh
  }
}

// Dragging a marquee fires this on every pointer move, and each one used to
// reveal, re-list, re-read and re-harvest the whole selection straight away.
// One coalesced pass per burst instead — 90 ms is under the eye's threshold, and
// the token harvest can wait for the pointer to stop altogether.
figma.on("selectionchange", () => {
  selectionDirty = true;
  scheduleRefresh(true);
  // Whatever you just clicked is the cheapest possible source of new tokens.
  queueNodeIndex(figma.currentPage.selection);
});

figma.on("currentpagechange", () => {
  expanded.clear();
  bindPageWatcher();
  pushAll();
  startBackgroundScan(false);
});

bindPageWatcher();

/* =============================================================================
   Mutations
   ========================================================================== */

async function loadNodeFonts(node) {
  if (node.type !== "TEXT") return;
  const len = node.characters.length;
  const fonts = len > 0
    ? node.getRangeAllFontNames(0, len)
    : (node.fontName === figma.mixed ? [] : [node.fontName]);
  await Promise.all(fonts.map((f) => figma.loadFontAsync(f)));
}

async function selectedNodes() {
  return figma.currentPage.selection.slice(0, MAX_INSPECT);
}

function setPaintAt(node, prop, index, patch) {
  const src = node[prop];
  const arr = src === figma.mixed ? [] : clone(src);
  if (!arr[index]) return;
  arr[index] = Object.assign({}, arr[index], patch);
  node[prop] = arr;
}

function setEffectAt(node, index, patch) {
  const src = node.effects;
  if (src === figma.mixed) return;
  const arr = clone(src);
  if (!arr[index]) return;
  arr[index] = Object.assign({}, arr[index], patch);
  node.effects = arr;
}

function setGridAt(node, index, patch) {
  const arr = clone(node.layoutGrids);
  if (!arr[index]) return;
  arr[index] = Object.assign({}, arr[index], patch);
  node.layoutGrids = arr;
}

function withAlpha(hex, a) {
  const c = hexToRgb(hex);
  return { r: c.r, g: c.g, b: c.b, a: a == null ? 1 : a };
}

const NUMBER_VAR_FIELDS = new Set([
  "width", "height", "itemSpacing", "counterAxisSpacing",
  "paddingLeft", "paddingRight", "paddingTop", "paddingBottom",
  "topLeftRadius", "topRightRadius", "bottomLeftRadius", "bottomRightRadius",
  "strokeWeight", "opacity", "minWidth", "maxWidth", "minHeight", "maxHeight"
]);

async function applyUpdate(node, key, value, index, extra) {
  switch (key) {
    /* identity */
    case "name": node.name = value; break;
    case "visible": node.visible = value; break;
    case "locked": node.locked = value; break;
    case "isMask": node.isMask = value; break;

    /* geometry */
    case "x": node.x = value; break;
    case "y": node.y = value; break;
    case "width": node.resize(Math.max(0.01, value), node.height); break;
    case "height": node.resize(node.width, Math.max(0.01, value)); break;
    case "rotation": node.rotation = value; break;
    case "flipH": flipNode(node, true); break;
    case "flipV": flipNode(node, false); break;

    /* corners */
    case "cornerRadius": node.cornerRadius = value; break;
    case "topLeftRadius": node.topLeftRadius = value; break;
    case "topRightRadius": node.topRightRadius = value; break;
    case "bottomRightRadius": node.bottomRightRadius = value; break;
    case "bottomLeftRadius": node.bottomLeftRadius = value; break;
    case "cornerSmoothing": node.cornerSmoothing = value; break;

    /* constraints */
    case "constraintH":
      node.constraints = { horizontal: value, vertical: node.constraints.vertical }; break;
    case "constraintV":
      node.constraints = { horizontal: node.constraints.horizontal, vertical: value }; break;

    /* auto layout — container */
    case "layoutMode": node.layoutMode = value; break;
    case "itemSpacing": node.itemSpacing = value; break;
    case "counterAxisSpacing": node.counterAxisSpacing = value; break;
    case "paddingTop": node.paddingTop = value; break;
    case "paddingRight": node.paddingRight = value; break;
    case "paddingBottom": node.paddingBottom = value; break;
    case "paddingLeft": node.paddingLeft = value; break;
    case "paddingAll":
      node.paddingTop = node.paddingRight = node.paddingBottom = node.paddingLeft = value; break;
    case "primaryAxisAlignItems": node.primaryAxisAlignItems = value; break;
    case "counterAxisAlignItems": node.counterAxisAlignItems = value; break;
    case "counterAxisAlignContent": node.counterAxisAlignContent = value; break;
    case "layoutWrap": node.layoutWrap = value; break;
    case "itemReverseZIndex": node.itemReverseZIndex = value; break;
    case "strokesIncludedInLayout": node.strokesIncludedInLayout = value; break;
    case "clipsContent": node.clipsContent = value; break;
    case "overflowDirection": node.overflowDirection = value; break;
    case "gridRowCount": node.gridRowCount = value; break;
    case "gridColumnCount": node.gridColumnCount = value; break;
    case "gridRowGap": node.gridRowGap = value; break;
    case "gridColumnGap": node.gridColumnGap = value; break;

    /* auto layout — child */
    case "layoutSizingHorizontal": node.layoutSizingHorizontal = value; break;
    case "layoutSizingVertical": node.layoutSizingVertical = value; break;
    case "layoutPositioning": node.layoutPositioning = value; break;
    case "minWidth": node.minWidth = value; break;
    case "maxWidth": node.maxWidth = value; break;
    case "minHeight": node.minHeight = value; break;
    case "maxHeight": node.maxHeight = value; break;

    /* appearance */
    case "opacity": node.opacity = Math.max(0, Math.min(1, value / 100)); break;
    case "blendMode": node.blendMode = value; break;

    /* fills & strokes */
    case "fill.color": setPaintAt(node, "fills", index, { color: hexToRgb(value) }); break;
    case "fill.opacity": setPaintAt(node, "fills", index, { opacity: value / 100 }); break;
    case "fill.visible": setPaintAt(node, "fills", index, { visible: value }); break;
    case "fill.blendMode": setPaintAt(node, "fills", index, { blendMode: value }); break;
    case "fill.scaleMode": setPaintAt(node, "fills", index, { scaleMode: value }); break;
    case "fill.add": addPaint(node, "fills"); break;
    case "fill.remove": removeAt(node, "fills", index); break;
    case "fill.reorder": reorder(node, "fills", index, extra); break;
    case "fill.gradientStop": setGradientStop(node, "fills", index, extra, value); break;
    case "fill.gradientStopAdd": addGradientStop(node, "fills", index, extra, value); break;
    case "fill.gradientStopRemove": removeGradientStop(node, "fills", index, extra); break;
    case "fill.gradientReverse": reverseGradient(node, "fills", index); break;
    case "fill.gradientRotate": rotateGradient(node, "fills", index); break;
    case "fill.toGradient": convertPaint(node, "fills", index, value); break;

    case "stroke.color": setPaintAt(node, "strokes", index, { color: hexToRgb(value) }); break;
    case "stroke.opacity": setPaintAt(node, "strokes", index, { opacity: value / 100 }); break;
    case "stroke.visible": setPaintAt(node, "strokes", index, { visible: value }); break;
    case "stroke.blendMode": setPaintAt(node, "strokes", index, { blendMode: value }); break;
    case "stroke.add": addPaint(node, "strokes"); break;
    case "stroke.remove": removeAt(node, "strokes", index); break;
    case "stroke.gradientStop": setGradientStop(node, "strokes", index, extra, value); break;
    case "stroke.gradientStopAdd": addGradientStop(node, "strokes", index, extra, value); break;
    case "stroke.gradientStopRemove": removeGradientStop(node, "strokes", index, extra); break;
    case "stroke.gradientReverse": reverseGradient(node, "strokes", index); break;
    case "stroke.gradientRotate": rotateGradient(node, "strokes", index); break;
    case "stroke.scaleMode": setPaintAt(node, "strokes", index, { scaleMode: value }); break;
    case "stroke.toGradient": convertPaint(node, "strokes", index, value); break;
    case "stroke.reorder": reorder(node, "strokes", index, extra); break;
    case "strokeWeight": node.strokeWeight = value; break;
    case "strokeAlign": node.strokeAlign = value; break;
    case "strokeCap": node.strokeCap = value; break;
    case "strokeCapStart": await setEndCap(node, value, true); break;
    case "strokeCapEnd": await setEndCap(node, value, false); break;
    case "strokeJoin": node.strokeJoin = value; break;
    case "strokeTopWeight": node.strokeTopWeight = value; break;
    case "strokeRightWeight": node.strokeRightWeight = value; break;
    case "strokeBottomWeight": node.strokeBottomWeight = value; break;
    case "strokeLeftWeight": node.strokeLeftWeight = value; break;
    case "dashPattern":
      node.dashPattern = String(value).split(/[, ]+/).map(Number).filter((n) => !isNaN(n) && n >= 0);
      break;

    /* effects */
    case "effect.add": addEffect(node, value); break;
    case "effect.remove": removeAt(node, "effects", index); break;
    case "effect.visible": setEffectAt(node, index, { visible: value }); break;
    case "effect.radius": setEffectAt(node, index, { radius: Math.max(0, value) }); break;
    case "effect.spread": setEffectAt(node, index, { spread: value }); break;
    case "effect.offsetX": setEffectAt(node, index, { offset: { x: value, y: node.effects[index].offset.y } }); break;
    case "effect.offsetY": setEffectAt(node, index, { offset: { x: node.effects[index].offset.x, y: value } }); break;
    case "effect.color":
      setEffectAt(node, index, { color: withAlpha(value, node.effects[index].color.a) }); break;
    case "effect.alpha":
      setEffectAt(node, index, { color: withAlpha(rgbToHex(node.effects[index].color), value / 100) }); break;
    case "effect.behind": setEffectAt(node, index, { showShadowBehindNode: value }); break;
    case "effect.blendMode": setEffectAt(node, index, { blendMode: value }); break;
    case "effect.type": changeEffectType(node, index, value); break;

    /* layout grids */
    case "grid.add": addGrid(node); break;
    case "grid.remove": removeAt(node, "layoutGrids", index); break;
    case "grid.visible": setGridAt(node, index, { visible: value }); break;
    case "grid.pattern": changeGridPattern(node, index, value); break;
    case "grid.count": setGridAt(node, index, { count: value }); break;
    case "grid.gutterSize": setGridAt(node, index, { gutterSize: value }); break;
    case "grid.offset": setGridAt(node, index, { offset: value }); break;
    case "grid.sectionSize": setGridAt(node, index, { sectionSize: Math.max(0.01, value) }); break;
    case "grid.alignment": setGridAt(node, index, { alignment: value }); break;
    case "grid.color":
      setGridAt(node, index, { color: withAlpha(value, node.layoutGrids[index].color.a) }); break;
    case "grid.alpha":
      setGridAt(node, index, { color: withAlpha(rgbToHex(node.layoutGrids[index].color), value / 100) }); break;

    /* text */
    case "fontFamily":
    case "fontStyle": {
      await figma.loadFontAsync(value);
      await loadNodeFonts(node);
      node.fontName = value;
      break;
    }
    case "fontSize": await loadNodeFonts(node); node.fontSize = Math.max(1, value); break;
    case "lineHeight":
      await loadNodeFonts(node);
      node.lineHeight = value == null ? { unit: "AUTO" } : { value, unit: extra || "PIXELS" };
      break;
    case "letterSpacing":
      await loadNodeFonts(node);
      node.letterSpacing = { value: value || 0, unit: extra || "PIXELS" };
      break;
    case "paragraphSpacing": await loadNodeFonts(node); node.paragraphSpacing = value; break;
    case "paragraphIndent": await loadNodeFonts(node); node.paragraphIndent = value; break;
    case "textAlignHorizontal": await loadNodeFonts(node); node.textAlignHorizontal = value; break;
    case "textAlignVertical": await loadNodeFonts(node); node.textAlignVertical = value; break;
    case "textCase": await loadNodeFonts(node); node.textCase = value; break;
    case "textDecoration": await loadNodeFonts(node); node.textDecoration = value; break;
    case "textAutoResize": await loadNodeFonts(node); node.textAutoResize = value; break;
    case "textTruncation": await loadNodeFonts(node); node.textTruncation = value; break;
    case "maxLines": await loadNodeFonts(node); node.maxLines = value || null; break;
    case "leadingTrim": await loadNodeFonts(node); node.leadingTrim = value; break;

    /* shapes */
    case "pointCount": node.pointCount = Math.max(3, Math.round(value)); break;
    case "innerRadius": node.innerRadius = Math.max(0, Math.min(1, value / 100)); break;
    case "arcStart": node.arcData = Object.assign({}, node.arcData, { startingAngle: value * Math.PI / 180 }); break;
    case "arcEnd": node.arcData = Object.assign({}, node.arcData, { endingAngle: value * Math.PI / 180 }); break;
    case "arcRatio": node.arcData = Object.assign({}, node.arcData, { innerRadius: Math.max(0, Math.min(1, value / 100)) }); break;

    /* styles */
    case "style.fill": await node.setFillStyleIdAsync(value); break;
    case "style.stroke": await node.setStrokeStyleIdAsync(value); break;
    case "style.text": await node.setTextStyleIdAsync(value); break;
    case "style.effect": await node.setEffectStyleIdAsync(value); break;
    case "style.grid": await node.setGridStyleIdAsync(value); break;

    /* instance properties */
    case "instanceProp": {
      const patch = {};
      patch[extra] = value;
      node.setProperties(patch);
      break;
    }

    /* export settings */
    case "export.add":
      node.exportSettings = node.exportSettings.concat([
        { format: "PNG", suffix: "", constraint: { type: "SCALE", value: 1 } }
      ]);
      break;
    case "export.remove":
      node.exportSettings = node.exportSettings.filter((_, i) => i !== index);
      break;
    case "export.format":
    case "export.suffix":
    case "export.scale": {
      const arr = clone(node.exportSettings);
      if (!arr[index]) break;
      if (key === "export.format") arr[index].format = value;
      if (key === "export.suffix") arr[index].suffix = value;
      if (key === "export.scale") arr[index].constraint = { type: extra || "SCALE", value };
      node.exportSettings = arr;
      break;
    }

    default:
      throw new Error("Unknown property " + key);
  }
}

// Set the cap on one end of an open shape, through whichever mechanism the node
// actually supports.
async function setEndCap(node, cap, isStart) {
  if (node.type === "CONNECTOR") {
    if (isStart) node.connectorStartStrokeCap = cap;
    else node.connectorEndStrokeCap = cap;
    return;
  }

  const vn = safe(() => node.vectorNetwork, null);
  if (vn && vn.vertices && vn.vertices.length >= 2 && typeof node.setVectorNetworkAsync === "function") {
    const vertices = vn.vertices.map((v) => Object.assign({}, v));
    const index = isStart ? 0 : vertices.length - 1;
    vertices[index].strokeCap = cap;
    const network = {
      vertices,
      segments: vn.segments.map((s) => Object.assign({}, s))
    };
    if (vn.regions && vn.regions.length) network.regions = vn.regions.map((r) => Object.assign({}, r));
    await node.setVectorNetworkAsync(network);
    return;
  }

  // A plain LINE exposes a single cap for both ends; write it and let the UI
  // show that they move together.
  node.strokeCap = cap;
}

function addPaint(node, prop) {
  const src = node[prop];
  const arr = src === figma.mixed ? [] : clone(src);
  arr.push({
    type: "SOLID",
    color: prop === "fills" ? { r: 0.85, g: 0.85, b: 0.85 } : { r: 0, g: 0, b: 0 },
    opacity: 1,
    visible: true,
    blendMode: "NORMAL"
  });
  node[prop] = arr;
  if (prop === "strokes" && node.strokeWeight === 0) node.strokeWeight = 1;
}

function removeAt(node, prop, index) {
  const src = node[prop];
  if (src === figma.mixed) return;
  node[prop] = clone(src).filter((_, i) => i !== index);
}

function reorder(node, prop, from, to) {
  const arr = clone(node[prop]);
  const [item] = arr.splice(from, 1);
  arr.splice(to, 0, item);
  node[prop] = arr;
}

/* ---- gradients ----------------------------------------------------------- */

function gradientAt(arr, index) {
  const paint = arr[index];
  return paint && paint.gradientStops ? paint : null;
}

/*
  Figma reads gradientStops in array order, so a stop dragged past its neighbour
  has to change places with it or the ramp folds back on itself. Sorting the
  array — rather than rebuilding it from colours — keeps every stop object, and
  with it the variable bound to that stop's colour.
*/
function sortStops(paint) {
  paint.gradientStops.sort((a, b) => a.position - b.position);
}

function setGradientStop(node, prop, paintIndex, stopIndex, patch) {
  const arr = clone(node[prop]);
  const paint = gradientAt(arr, paintIndex);
  if (!paint) return;
  const stop = paint.gradientStops[stopIndex];
  if (!stop) return;
  if (patch.color) {
    const c = hexToRgb(patch.color);
    stop.color = { r: c.r, g: c.g, b: c.b, a: stop.color.a };
  }
  if (patch.a != null) stop.color.a = patch.a;
  if (patch.pos != null) {
    stop.position = Math.max(0, Math.min(1, patch.pos));
    sortStops(paint);
  }
  node[prop] = arr;
}

// The panel says where the stop goes and what colour it is — it has the ramp
// under the pointer and can read the colour already showing at that point.
function addGradientStop(node, prop, paintIndex, at, stop) {
  const arr = clone(node[prop]);
  const paint = gradientAt(arr, paintIndex);
  if (!paint || !stop) return;
  const c = hexToRgb(stop.color || "#FFFFFF");
  const pos = Math.max(0, Math.min(1, stop.pos == null ? 0.5 : stop.pos));
  const i = at == null ? paint.gradientStops.length
    : Math.max(0, Math.min(paint.gradientStops.length, at));
  paint.gradientStops.splice(i, 0, {
    color: { r: c.r, g: c.g, b: c.b, a: stop.a == null ? 1 : stop.a },
    position: pos
  });
  sortStops(paint);
  node[prop] = arr;
}

// Two stops are what makes a gradient one; Figma's own picker stops there.
function removeGradientStop(node, prop, paintIndex, stopIndex) {
  const arr = clone(node[prop]);
  const paint = gradientAt(arr, paintIndex);
  if (!paint || paint.gradientStops.length <= 2) return;
  if (!paint.gradientStops[stopIndex]) return;
  paint.gradientStops.splice(stopIndex, 1);
  node[prop] = arr;
}

// Mirroring the ramp moves the stop objects, not their colours, so each one
// keeps whatever variable is bound to it.
function reverseGradient(node, prop, paintIndex) {
  const arr = clone(node[prop]);
  const paint = gradientAt(arr, paintIndex);
  if (!paint) return;
  paint.gradientStops.forEach((s) => { s.position = 1 - s.position; });
  sortStops(paint);
  node[prop] = arr;
}

/*
  gradientTransform maps the object's unit square into the space the ramp runs
  across, so turning the gradient means composing that matrix with a quarter
  turn about the square's centre — (x, y) -> (y, 1 - x). Four presses come back
  to where they started, exactly.
*/
const QUARTER_TURN = [[0, 1, 0], [-1, 0, 1]];

function rotateGradient(node, prop, paintIndex) {
  const arr = clone(node[prop]);
  const paint = gradientAt(arr, paintIndex);
  if (!paint) return;
  paint.gradientTransform = mulTransform(
    paint.gradientTransform || [[1, 0, 0], [0, 1, 0]], QUARTER_TURN);
  node[prop] = arr;
}

// 2x3 affine product, the third row being an implied [0, 0, 1].
function mulTransform(m, n) {
  const out = [[0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < 2; i++) {
    out[i][0] = m[i][0] * n[0][0] + m[i][1] * n[1][0];
    out[i][1] = m[i][0] * n[0][1] + m[i][1] * n[1][1];
    out[i][2] = m[i][0] * n[0][2] + m[i][1] * n[1][2] + m[i][2];
  }
  return out;
}

// SOLID <-> gradient conversion, keeping the current colour as the first stop.
function convertPaint(node, prop, index, targetType) {
  const arr = clone(node[prop]);
  const paint = arr[index];
  if (!paint) return;
  const base = paint.type === "SOLID" ? paint.color : { r: 0, g: 0, b: 0 };
  if (targetType === "SOLID") {
    const first = paint.gradientStops ? paint.gradientStops[0].color : base;
    arr[index] = {
      type: "SOLID", color: { r: first.r, g: first.g, b: first.b },
      opacity: paint.opacity, visible: paint.visible, blendMode: paint.blendMode
    };
  } else {
    arr[index] = {
      type: targetType,
      gradientTransform: paint.gradientTransform || [[1, 0, 0], [0, 1, 0]],
      gradientStops: paint.gradientStops || [
        { color: { r: base.r, g: base.g, b: base.b, a: 1 }, position: 0 },
        { color: { r: base.r, g: base.g, b: base.b, a: 0 }, position: 1 }
      ],
      opacity: paint.opacity, visible: paint.visible, blendMode: paint.blendMode
    };
  }
  node[prop] = arr;
}

function addEffect(node, type) {
  if (node.effects === figma.mixed) return;
  const arr = clone(node.effects);
  const kind = type || "DROP_SHADOW";
  arr.push(kind === "LAYER_BLUR" || kind === "BACKGROUND_BLUR"
    ? { type: kind, radius: 4, visible: true }
    : {
      type: kind,
      color: { r: 0, g: 0, b: 0, a: 0.25 },
      offset: { x: 0, y: 4 },
      radius: 4,
      spread: 0,
      visible: true,
      blendMode: "NORMAL"
    });
  node.effects = arr;
}

function changeEffectType(node, index, type) {
  const arr = clone(node.effects);
  const old = arr[index];
  if (!old) return;
  const blur = type === "LAYER_BLUR" || type === "BACKGROUND_BLUR";
  arr[index] = blur
    ? { type, radius: old.radius || 4, visible: old.visible }
    : {
      type,
      color: old.color || { r: 0, g: 0, b: 0, a: 0.25 },
      offset: old.offset || { x: 0, y: 4 },
      radius: old.radius || 4,
      spread: old.spread || 0,
      visible: old.visible,
      blendMode: old.blendMode || "NORMAL"
    };
  node.effects = arr;
}

function addGrid(node) {
  node.layoutGrids = clone(node.layoutGrids).concat([{
    pattern: "GRID", sectionSize: 8, visible: true,
    color: { r: 1, g: 0, b: 0, a: 0.1 }
  }]);
}

function changeGridPattern(node, index, pattern) {
  const arr = clone(node.layoutGrids);
  const old = arr[index];
  if (!old) return;
  arr[index] = pattern === "GRID"
    ? { pattern: "GRID", sectionSize: old.sectionSize || 8, visible: old.visible, color: old.color }
    : {
      pattern,
      alignment: old.alignment || "STRETCH",
      gutterSize: old.gutterSize == null ? 20 : old.gutterSize,
      count: old.count == null ? 5 : old.count,
      offset: old.offset == null ? 0 : old.offset,
      sectionSize: old.sectionSize == null ? 100 : old.sectionSize,
      visible: old.visible,
      color: old.color
    };
  node.layoutGrids = arr;
}

/* ---- transform helpers --------------------------------------------------- */

function matMul(a, b) {
  return [
    [
      a[0][0] * b[0][0] + a[0][1] * b[1][0],
      a[0][0] * b[0][1] + a[0][1] * b[1][1],
      a[0][0] * b[0][2] + a[0][1] * b[1][2] + a[0][2]
    ],
    [
      a[1][0] * b[0][0] + a[1][1] * b[1][0],
      a[1][0] * b[0][1] + a[1][1] * b[1][1],
      a[1][0] * b[0][2] + a[1][1] * b[1][2] + a[1][2]
    ]
  ];
}

function flipNode(node, horizontal) {
  if (!("relativeTransform" in node)) throw new Error("no transform");
  const F = horizontal
    ? [[-1, 0, node.width], [0, 1, 0]]
    : [[1, 0, 0], [0, -1, node.height]];
  node.relativeTransform = matMul(node.relativeTransform, F);
}

/* ---- align & distribute -------------------------------------------------- */

function bounds(nodes) {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const n of nodes) {
    x1 = Math.min(x1, n.x);
    y1 = Math.min(y1, n.y);
    x2 = Math.max(x2, n.x + n.width);
    y2 = Math.max(y2, n.y + n.height);
  }
  return { x1, y1, x2, y2, w: x2 - x1, h: y2 - y1 };
}

function alignNodes(nodes, mode) {
  const movable = nodes.filter((n) => "x" in n && !isLayoutManaged(n));
  if (!movable.length) {
    figma.notify("These layers are positioned by auto layout");
    return;
  }
  let box;
  if (movable.length === 1) {
    const parent = movable[0].parent;
    if (!parent || !("width" in parent)) {
      figma.notify("Nothing to align to — the layer sits on the canvas");
      return;
    }
    box = { x1: 0, y1: 0, x2: parent.width, y2: parent.height, w: parent.width, h: parent.height };
  } else {
    box = bounds(movable);
  }
  for (const n of movable) {
    if (mode === "left") n.x = box.x1;
    else if (mode === "centerH") n.x = box.x1 + (box.w - n.width) / 2;
    else if (mode === "right") n.x = box.x2 - n.width;
    else if (mode === "top") n.y = box.y1;
    else if (mode === "centerV") n.y = box.y1 + (box.h - n.height) / 2;
    else if (mode === "bottom") n.y = box.y2 - n.height;
  }
}

function isLayoutManaged(node) {
  const p = node.parent;
  if (!p || !("layoutMode" in p) || !p.layoutMode || p.layoutMode === "NONE") return false;
  return safe(() => node.layoutPositioning, "AUTO") !== "ABSOLUTE";
}

function distributeNodes(nodes, axis) {
  const list = nodes.filter((n) => "x" in n && !isLayoutManaged(n));
  if (list.length < 3) { figma.notify("Select at least 3 layers to distribute"); return; }
  const horiz = axis === "h";
  list.sort((a, b) => (horiz ? a.x - b.x : a.y - b.y));
  const box = bounds(list);
  const used = list.reduce((s, n) => s + (horiz ? n.width : n.height), 0);
  const gap = ((horiz ? box.w : box.h) - used) / (list.length - 1);
  let cursor = horiz ? box.x1 : box.y1;
  for (const n of list) {
    if (horiz) { n.x = cursor; cursor += n.width + gap; }
    else { n.y = cursor; cursor += n.height + gap; }
  }
}

// Figma's "Tidy up": guess whether the selection reads as a row, a column or a
// grid, then even out the spacing along that axis.
function tidyUp(nodes) {
  const list = nodes.filter((n) => "x" in n && !isLayoutManaged(n));
  if (list.length < 2) return;
  const box = bounds(list);
  const spanX = box.w, spanY = box.h;
  const avgW = list.reduce((s, n) => s + n.width, 0) / list.length;
  const avgH = list.reduce((s, n) => s + n.height, 0) / list.length;
  const cols = Math.max(1, Math.round(spanX / Math.max(1, avgW)));
  const rows = Math.max(1, Math.round(spanY / Math.max(1, avgH)));

  if (rows <= 1) { alignNodes(list, "centerV"); distributeEven(list, "h", 20); return; }
  if (cols <= 1) { alignNodes(list, "centerH"); distributeEven(list, "v", 20); return; }

  list.sort((a, b) => (a.y - b.y) || (a.x - b.x));
  const perRow = Math.ceil(list.length / rows);
  let x = box.x1, y = box.y1, rowH = 0;
  list.forEach((n, i) => {
    if (i > 0 && i % perRow === 0) { y += rowH + 20; x = box.x1; rowH = 0; }
    n.x = x; n.y = y;
    x += n.width + 20;
    rowH = Math.max(rowH, n.height);
  });
}

function distributeEven(nodes, axis, gap) {
  const horiz = axis === "h";
  const list = nodes.slice().sort((a, b) => (horiz ? a.x - b.x : a.y - b.y));
  let cursor = horiz ? list[0].x : list[0].y;
  for (const n of list) {
    if (horiz) { n.x = cursor; cursor += n.width + gap; }
    else { n.y = cursor; cursor += n.height + gap; }
  }
}

/* ---- reordering / reparenting -------------------------------------------- */

function isAncestorOf(maybeAncestor, node) {
  let p = node.parent;
  while (p) {
    if (p.id === maybeAncestor.id) return true;
    p = p.parent;
  }
  return false;
}

async function moveNodes(ids, targetId, pos) {
  const target = await figma.getNodeByIdAsync(targetId);
  if (!target) return;

  let parent, index;
  if (pos === "inside") {
    if (!DROP_TARGETS.has(target.type)) { figma.notify("Can't drop layers into this node"); return; }
    parent = target;
    index = target.children.length;             // top of the stack
  } else {
    parent = target.parent;
    if (!parent || !("children" in parent)) return;
    const at = parent.children.indexOf(target);
    // "above"/"below" are what the user sees, so they map to an index according
    // to the same rule childOrder() uses to lay the rows out.
    index = isAutoLayout(parent)
      ? (pos === "above" ? at : at + 1)          // layout order: up == earlier
      : (pos === "above" ? at + 1 : at);         // z-order: up == higher index
  }

  if (parent.type === "INSTANCE") { figma.notify("Instance children can't be rearranged"); return; }

  const nodes = [];
  for (const id of ids) {
    const n = await figma.getNodeByIdAsync(id);
    if (!n || n.removed) continue;
    if (n.id === parent.id || isAncestorOf(n, parent)) {
      figma.notify("Can't move a layer into itself");
      return;
    }
    nodes.push(n);
  }
  if (!nodes.length) return;

  // Insert bottom-most first so the original stacking order is preserved.
  const zIndex = (n) => (n.parent ? n.parent.children.indexOf(n) : 0);
  nodes.sort((a, b) => zIndex(a) - zIndex(b));

  for (const n of nodes) {
    const cur = n.parent === parent ? parent.children.indexOf(n) : -1;
    let idx = index;
    if (cur !== -1 && cur < idx) idx -= 1;       // removing the node shifts the target
    const max = parent.children.length - (cur !== -1 ? 1 : 0);
    idx = Math.max(0, Math.min(idx, max));
    try {
      parent.insertChild(idx, n);
    } catch (e) {
      figma.notify("Can't move “" + n.name + "”: " + e.message);
      return;
    }
    index = parent.children.indexOf(n) + 1;
  }
  figma.commitUndo();
}

/* ---- bulk rename --------------------------------------------------------- */

// Writing .characters needs every font the node uses loaded first, and a text
// node may use several — one per styled run. Returns false when the node did not
// survive the loads, so it is counted as skipped rather than as done.
async function setCharacters(node, text) {
  const fonts = [];
  const seen = new Set();
  const add = (fn) => {
    if (!fn || fn === figma.mixed || !fn.family) return;
    const key = fn.family + "|" + fn.style;
    if (seen.has(key)) return;
    seen.add(key);
    fonts.push(fn);
  };
  const single = node.fontName;
  if (single === figma.mixed) {
    for (const seg of node.getStyledTextSegments(["fontName"])) add(seg.fontName);
  } else {
    add(single);
  }
  for (const fn of fonts) await figma.loadFontAsync(fn);
  if (!nodeAlive(node)) return false;            // gone while a font loaded
  node.characters = text;
  return true;
}

// The panel computes the new strings, because the preview it showed and the write
// have to agree; this side only applies them. `target` is "name" for the layer
// name or "text" for a text layer's content. Every node is fetched and written on
// its own: an instance sublayer that refuses the write must not take the rest of
// the batch with it, and any of them may have died since the panel listed it.
async function renameMatches(renames, target) {
  if (!Array.isArray(renames) || !renames.length) return;
  const text = target === "text";
  let done = 0;
  const failures = [];
  for (const r of renames) {
    if (!r || !r.id || !r.name) continue;
    const node = await figma.getNodeByIdAsync(r.id);
    if (!nodeAlive(node)) continue;
    try {
      if (text) {
        if (node.type !== "TEXT") continue;      // the panel filters these out already
        if (await setCharacters(node, r.name)) done++;
      } else {
        node.name = r.name;
        done++;
      }
    } catch (e) {
      // Reading .name for the message can throw for the same reason the write did.
      failures.push(safe(() => node.name, r.id) + ": " + e.message);
    }
  }
  if (done) figma.commitUndo();
  const what = text ? " text layer" : " layer";
  if (failures.length) {
    figma.notify(failures.length === 1
      ? "Couldn't change " + failures[0]
      : failures.length + " layers couldn't be changed — " + failures[0],
      { error: true });
  } else if (done) {
    figma.notify((text ? "Replaced text in " : "Renamed ") + done + what + (done === 1 ? "" : "s"));
  }
}

/* ---- context-menu actions ------------------------------------------------ */

async function runAction(action, ids) {
  const nodes = [];
  for (const id of ids) {
    const n = await figma.getNodeByIdAsync(id);
    if (n && !n.removed) nodes.push(n);
  }
  if (!nodes.length && action !== "paste") return;

  const first = nodes[0];
  const parent = first.parent || figma.currentPage;

  switch (action) {
    case "zoomTo":
      figma.viewport.scrollAndZoomIntoView(nodes);
      break;

    case "delete":
      nodes.forEach((n) => n.remove());
      break;

    case "duplicate": {
      const copies = nodes.map((n) => {
        const c = n.clone();
        if (n.parent && "insertChild" in n.parent) {
          n.parent.insertChild(n.parent.children.indexOf(n) + 1, c);
        }
        if ("x" in c && !isLayoutManaged(c)) { c.x = n.x + 20; c.y = n.y + 20; }
        return c;
      });
      figma.currentPage.selection = copies;
      break;
    }

    case "group": {
      const g = figma.group(nodes, parent, parent.children.indexOf(first) + 1);
      g.name = "Group";
      expanded.add(g.id);
      figma.currentPage.selection = [g];
      break;
    }

    case "ungroup": {
      const out = [];
      for (const n of nodes) {
        if (n.type === "GROUP" || n.type === "FRAME") out.push(...figma.ungroup(n));
      }
      if (out.length) figma.currentPage.selection = out;
      else figma.notify("Only groups and frames can be ungrouped");
      break;
    }

    case "frame": {
      const box = bounds(nodes.filter((n) => "x" in n));
      const f = figma.createFrame();
      f.name = "Frame";
      f.x = box.x1; f.y = box.y1;
      f.resize(Math.max(1, box.w), Math.max(1, box.h));
      f.fills = [];
      parent.insertChild(parent.children.indexOf(first) + 1, f);
      for (const n of nodes) {
        const nx = n.x - box.x1, ny = n.y - box.y1;
        f.appendChild(n);
        n.x = nx; n.y = ny;
      }
      expanded.add(f.id);
      figma.currentPage.selection = [f];
      break;
    }

    case "bringFront":
      nodes.forEach((n) => { if (n.parent) n.parent.appendChild(n); });
      break;
    case "sendBack":
      nodes.slice().reverse().forEach((n) => { if (n.parent) n.parent.insertChild(0, n); });
      break;
    case "forward":
      nodes.forEach((n) => {
        const p = n.parent; if (!p) return;
        const i = p.children.indexOf(n);
        if (i < p.children.length - 1) p.insertChild(i + 1, n);
      });
      break;
    case "backward":
      nodes.forEach((n) => {
        const p = n.parent; if (!p) return;
        const i = p.children.indexOf(n);
        if (i > 0) p.insertChild(i - 1, n);
      });
      break;

    case "flatten":
      figma.currentPage.selection = [figma.flatten(nodes, parent)];
      break;

    case "outline":
      for (const n of nodes) if ("outlineStroke" in n) {
        const o = n.outlineStroke();
        if (o && n.parent) n.parent.insertChild(n.parent.children.indexOf(n) + 1, o);
      }
      break;

    case "union": figma.currentPage.selection = [figma.union(nodes, parent)]; break;
    case "subtract": figma.currentPage.selection = [figma.subtract(nodes, parent)]; break;
    case "intersect": figma.currentPage.selection = [figma.intersect(nodes, parent)]; break;
    case "exclude": figma.currentPage.selection = [figma.exclude(nodes, parent)]; break;

    case "mask":
      for (const n of nodes) if ("isMask" in n) n.isMask = !n.isMask;
      break;

    case "createComponent": {
      if (nodes.length === 1) {
        figma.currentPage.selection = [figma.createComponentFromNode(nodes[0])];
      } else {
        const comps = nodes.map((n) => figma.createComponentFromNode(n));
        figma.currentPage.selection = comps;
      }
      break;
    }

    case "detach": {
      const out = [];
      for (const n of nodes) if (n.type === "INSTANCE") out.push(n.detachInstance());
      if (out.length) figma.currentPage.selection = out;
      else figma.notify("Select an instance to detach");
      break;
    }

    case "resetOverrides":
      for (const n of nodes) if (n.type === "INSTANCE") n.resetOverrides();
      break;

    case "goToMain": {
      for (const n of nodes) {
        if (n.type !== "INSTANCE") continue;
        const main = await n.getMainComponentAsync();
        // An instance of a library component does answer this call, but the node
        // it hands back belongs to no page of this document, and a page's
        // selection only accepts its own nodes. There is no way to open the
        // library file from here, so say so rather than throw.
        const page = main ? mainPageOf(main) : null;
        if (!main || main.remote || !page) { figma.notify("Main component is in a library"); return; }
        if (page !== figma.currentPage) await figma.setCurrentPageAsync(page);
        page.selection = [main];
        figma.viewport.scrollAndZoomIntoView([main]);
        return;
      }
      break;
    }

    case "selectChildren": {
      const kids = [];
      for (const n of nodes) if ("children" in n) kids.push(...n.children);
      if (kids.length) figma.currentPage.selection = kids;
      break;
    }

    case "selectParent": {
      const parents = nodes.map((n) => n.parent).filter((p) => p && p.type !== "PAGE");
      if (parents.length) figma.currentPage.selection = [...new Set(parents)];
      break;
    }

    case "toggleVisible": {
      const anyVisible = nodes.some((n) => n.visible);
      nodes.forEach((n) => { n.visible = !anyVisible; });
      break;
    }
    case "toggleLock": {
      const anyUnlocked = nodes.some((n) => !n.locked);
      nodes.forEach((n) => { n.locked = anyUnlocked; });
      break;
    }
  }
  figma.commitUndo();
}

// Null for a node that hangs off no page — a library component, or one that
// died while we were awaiting it. Reading .parent on either can throw.
function mainPageOf(node) {
  try {
    let p = node.parent;
    while (p && p.type !== "PAGE") p = p.parent;
    return p && p.type === "PAGE" ? p : null;
  } catch (e) { return null; }
}

/* =============================================================================
   Resource lookups (fonts, styles, variables, images)
   ========================================================================== */

let fontCache = null;

async function pushFonts() {
  if (!fontCache) {
    const all = await figma.listAvailableFontsAsync();
    const byFamily = new Map();
    for (const f of all) {
      const fam = f.fontName.family;
      if (!byFamily.has(fam)) byFamily.set(fam, []);
      byFamily.get(fam).push(f.fontName.style);
    }
    fontCache = [...byFamily.entries()].map(([family, styles]) => ({ family, styles }));
  }
  figma.ui.postMessage({ type: "fonts", fonts: fontCache });
}

const STYLE_ID_FIELDS = ["fillStyleId", "strokeStyleId", "textStyleId", "effectStyleId", "gridStyleId"];

/* -----------------------------------------------------------------------------
   Design-system index

   The Plugin API cannot list a library's styles, and its variable catalogue is
   only there when the file subscribes to the library. So the panel keeps its own
   index of the design system, built from what the document references — and it
   keeps that index warm instead of making you press a button:

     · restored from clientStorage on open, so the first paint is instant;
     · topped up incrementally whenever the document or the selection changes;
     · refreshed by a chunked background walk that never blocks the UI.

   "Scan all pages" stays as an explicit deep sweep.
   -------------------------------------------------------------------------- */

const LIB_INDEX_VERSION = 4;

const libStore = {
  styles: new Map(),        // library style KEY -> descriptor. Keyed by key, not
                            // id: a file accumulates several local ids for the
                            // same library style, and each one would show up as
                            // its own row.
  vars: new Map(),          // library variable KEY -> descriptor + collectionKey
  collections: new Map(),   // collection key -> { key, id, name, modes, defaultModeId }
  seenStyleIds: new Set(),  // every id we already resolved, local ones included
  seenVarIds: new Set(),
  scannedAll: false,
  savedAt: 0,
  restored: false
};

let scanState = null;       // in-flight background walk
let lastDocChangeAt = 0;    // set from nodechange; the scan yields to editing

// Tuned so the editor keeps its frames: a short slice of work, a real gap after
// it, and nothing at all until the panel has painted.
const SCAN_SLICE_MS = 6;
const SCAN_IDLE_MS = 24;
const SCAN_START_DELAY_MS = 1500;
const SCAN_EDIT_QUIET_MS = 400;
let saveTimer = null;
let pendingIds = null;      // ids gathered from nodechange, awaiting resolution
let pendingTimer = null;

function indexKey() { return "libIndex:" + figma.root.id; }

async function restoreIndex() {
  let saved;
  try { saved = await figma.clientStorage.getAsync(indexKey()); } catch (e) { saved = null; }
  if (!saved || saved.v !== LIB_INDEX_VERSION) return false;
  (saved.collections || []).forEach((c) => libStore.collections.set(c.key, c));
  (saved.styles || []).forEach((st) => {
    libStore.styles.set(st.key || st.id, st);
    libStore.seenStyleIds.add(st.id);
  });
  (saved.vars || []).forEach((v) => {
    libStore.vars.set(v.key || v.id, v);
    libStore.seenVarIds.add(v.id);
  });
  libStore.scannedAll = !!saved.scannedAll;
  libStore.savedAt = saved.savedAt || 0;
  libStore.restored = true;
  return libStore.styles.size > 0 || libStore.vars.size > 0;
}

function saveIndexSoon() {
  if (saveTimer) return;
  saveTimer = setTimeout(async () => {
    saveTimer = null;
    libStore.savedAt = Date.now();
    try {
      await figma.clientStorage.setAsync(indexKey(), {
        v: LIB_INDEX_VERSION,
        savedAt: libStore.savedAt,
        scannedAll: libStore.scannedAll,
        collections: [...libStore.collections.values()],
        styles: [...libStore.styles.values()],
        vars: [...libStore.vars.values()]
      });
    } catch (e) { /* quota or storage disabled — the index still works in-session */ }
  }, 1500);
}

/* ---- harvesting ---------------------------------------------------------- */

// Pull every VARIABLE_ALIAS out of an arbitrary Figma value (boundVariables
// maps, paints, effects and grids all nest them differently).
function collectAliases(value, out, depth) {
  if (!value || typeof value !== "object" || (depth || 0) > 6) return;
  if (value.type === "VARIABLE_ALIAS" && value.id) { out.add(value.id); return; }
  if (Array.isArray(value)) {
    for (const item of value) collectAliases(item, out, (depth || 0) + 1);
    return;
  }
  for (const key in value) collectAliases(value[key], out, (depth || 0) + 1);
}

// A node reference that survived an await may be dead. For instance sublayers
// and table cells even reading .removed or .children throws, so every access
// goes through these.
function nodeAlive(node) {
  try { return !!node && node.removed !== true; } catch (e) { return false; }
}

function safeChildren(node) {
  try {
    if (!("children" in node)) return null;
    return node.children;
  } catch (e) {
    return null;                                 // sublayer disappeared
  }
}

function harvestNode(node, styleIds, varIds) {
  try {
    harvestNodeInner(node, styleIds, varIds);
  } catch (e) { /* node died between ticks */ }
}

function harvestNodeInner(node, styleIds, varIds) {
  for (const key of STYLE_ID_FIELDS) {
    if (!(key in node)) continue;
    const value = node[key];
    if (typeof value === "string" && value && !libStore.seenStyleIds.has(value)) styleIds.add(value);
  }
  if (node.boundVariables) collectAliases(node.boundVariables, varIds, 0);
  for (const prop of ["fills", "strokes", "effects", "layoutGrids"]) {
    if (!(prop in node)) continue;
    let value;
    try { value = node[prop]; } catch (e) { continue; }
    if (value === figma.mixed || !Array.isArray(value)) continue;
    collectAliases(value, varIds, 0);
  }
}

/* ---- resolving new ids into the index ------------------------------------ */

async function mergeStyleIds(ids) {
  let added = 0;
  for (const id of ids) {
    if (libStore.seenStyleIds.has(id)) continue;
    libStore.seenStyleIds.add(id);
    let style;
    try { style = await figma.getStyleByIdAsync(id); } catch (e) { continue; }
    if (!style || !style.remote) continue;         // local styles are listed live
    const dedupeKey = style.key || style.id;
    if (libStore.styles.has(dedupeKey)) continue;
    libStore.styles.set(dedupeKey, describeStyle(style, true));
    added++;
  }
  return added;
}

async function mergeVariableIds(ids) {
  let added = 0;
  for (const id of ids) {
    if (libStore.seenVarIds.has(id)) continue;
    libStore.seenVarIds.add(id);
    let v;
    try { v = await figma.variables.getVariableByIdAsync(id); } catch (e) { continue; }
    if (!v || !v.remote) continue;                 // local ones come from pushVariables

    let col = null;
    try { col = await figma.variables.getVariableCollectionByIdAsync(v.variableCollectionId); } catch (e) { col = null; }
    const colKey = col ? (col.key || col.id) : "unknown";
    if (!libStore.collections.has(colKey)) {
      libStore.collections.set(colKey, {
        key: colKey,
        id: col ? col.id : "used:" + colKey,
        name: col ? col.name : "Library tokens",
        modes: col ? col.modes.map((md) => ({ id: md.modeId, name: md.name })) : [],
        defaultModeId: col ? col.defaultModeId : null
      });
    }

    const byMode = {};
    if (col) {
      for (const md of col.modes) {
        const raw = v.valuesByMode[md.modeId];
        const resolved = await deepResolve(raw);
        byMode[md.modeId] = {
          alias: !!(raw && raw.type === "VARIABLE_ALIAS"),
          aliasName: raw && raw.type === "VARIABLE_ALIAS" ? await aliasName(raw.id) : null,
          color: v.resolvedType === "COLOR" && resolved && resolved.r != null ? rgbToHex(resolved) : null,
          alpha: v.resolvedType === "COLOR" && resolved && resolved.a != null ? resolved.a : 1,
          text: v.resolvedType !== "COLOR" && resolved != null ? String(resolved) : null
        };
      }
    }
    const varKey = v.key || v.id;
    if (libStore.vars.has(varKey)) continue;
    libStore.vars.set(varKey, {
      id: v.id,
      key: v.key,
      collectionKey: colKey,
      name: v.name,
      group: v.name.indexOf("/") > -1 ? v.name.slice(0, v.name.lastIndexOf("/")) : "",
      short: v.name.split("/").pop(),
      type: v.resolvedType,
      description: v.description || "",
      scopes: v.scopes || [],
      byMode
    });
    added++;
  }
  return added;
}

// What the nodes you touched are made of, so clicking a layer is usually enough
// to surface its tokens without waiting for the scan to reach them.
async function indexNodes(nodes) {
  const styleIds = new Set(), varIds = new Set();
  // Every id gathered here costs a getStyleByIdAsync / getVariableByIdAsync round
  // trip below, so the walk is capped as tightly as the reading is: clicking a
  // screen must not queue thousands of lookups the background scan will make anyway.
  let budget = INDEX_SAMPLE_NODES;
  const visit = (node, depth) => {
    if (budget-- <= 0 || !nodeAlive(node)) return;
    harvestNode(node, styleIds, varIds);
    if (depth >= 6) return;
    const kids = safeChildren(node);
    if (kids) for (const c of kids) {
      if (budget <= 0) return;
      visit(c, depth + 1);
    }
  };
  // A burst reports the same nodes repeatedly; without this they would eat the
  // budget and the rest of the batch would never be looked at.
  const seenIds = new Set();
  const unique = [];
  for (const n of nodes) {
    const id = safe(() => n.id, null);
    if (!id || seenIds.has(id)) continue;
    seenIds.add(id);
    unique.push(n);
  }
  const prev = figma.skipInvisibleInstanceChildren;
  figma.skipInvisibleInstanceChildren = true;
  try {
    for (const n of unique.slice(0, 50)) {
      if (budget <= 0) break;
      visit(n, 0);
    }
  } finally {
    figma.skipInvisibleInstanceChildren = prev;
  }
  if (!styleIds.size && !varIds.size) return 0;
  const added = (await mergeStyleIds(styleIds)) + (await mergeVariableIds(varIds));
  if (added) { saveIndexSoon(); pushLibraryData(); }
  return added;
}

// nodechange and selectionchange both fire in bursts, so batch the nodes and
// resolve once things settle. A long drag reports the same nodes over and over,
// hence the ceiling — the batch is deduped by id when it is read.
function queueNodeIndex(nodes) {
  if (!pendingIds) pendingIds = [];
  for (const n of nodes) {
    if (pendingIds.length >= 500) break;
    if (nodeAlive(n)) pendingIds.push(n);
  }
  if (pendingTimer) return;
  pendingTimer = setTimeout(async () => {
    pendingTimer = null;
    const batch = (pendingIds || []).filter(nodeAlive);
    pendingIds = null;
    try { await indexNodes(batch); } catch (e) { /* nodes vanished mid-flight */ }
  }, 400);
}

/* ---- chunked background walk -------------------------------------------- */

function startBackgroundScan(scanAll) {
  if (scanState) scanState.cancelled = true;
  scanState = {
    pages: scanAll ? figma.root.children.slice() : [figma.currentPage],
    stack: [],
    styleIds: new Set(),
    varIds: new Set(),
    scanAll: !!scanAll,
    budget: 200000,
    truncated: false,
    cancelled: false
  };
  pushLibStatus("scanning");
  // Let the panel paint and the first interactions land before touching the
  // document tree.
  setTimeout(stepScan, SCAN_START_DELAY_MS);
}

function stepScan() {
  try {
    stepScanInner();
  } catch (e) {
    // Never let a dead node abort the scan or surface as a plugin error toast.
    if (scanState) setTimeout(stepScan, SCAN_IDLE_MS);
  }
}

function stepScanInner() {
  const st = scanState;
  if (!st || st.cancelled) return;

  // Someone is editing — come back later rather than compete for the thread.
  if (Date.now() - lastDocChangeAt < SCAN_EDIT_QUIET_MS) {
    setTimeout(stepScan, SCAN_IDLE_MS * 4);
    return;
  }

  // Invisible instance children carry nothing the visible tree does not, and
  // skipping them is most of the saving on component-heavy files.
  const prevSkip = figma.skipInvisibleInstanceChildren;
  figma.skipInvisibleInstanceChildren = true;

  const deadline = Date.now() + SCAN_SLICE_MS;
  let sinceClockCheck = 0;

  try {
    for (;;) {
      // Checking the clock every node costs more than it saves.
      if (++sinceClockCheck >= 256) {
        sinceClockCheck = 0;
        if (Date.now() >= deadline) break;
      }

      if (!st.stack.length) {
        if (!st.pages.length) { finishScan().catch(noop); return; }
        const page = st.pages.shift();
        if (page.id !== figma.currentPage.id) {
          page.loadAsync().then(() => {
            if (st.cancelled) return;
            for (const child of page.children) st.stack.push(child);
            setTimeout(stepScan, SCAN_IDLE_MS);
          }).catch(() => setTimeout(stepScan, SCAN_IDLE_MS));
          return;
        }
        for (const child of page.children) st.stack.push(child);
        continue;
      }

      if (st.budget-- <= 0) { st.truncated = true; finishScan().catch(noop); return; }
      const node = st.stack.pop();
      if (!nodeAlive(node)) continue;
      harvestNode(node, st.styleIds, st.varIds);
      const kids = safeChildren(node);
      if (kids) for (let i = 0; i < kids.length; i++) st.stack.push(kids[i]);
    }
  } finally {
    figma.skipInvisibleInstanceChildren = prevSkip;
  }

  setTimeout(stepScan, SCAN_IDLE_MS);
}

async function finishScan() {
  const st = scanState;
  scanState = null;
  if (!st || st.cancelled) return;
  const added = (await mergeStyleIds(st.styleIds)) + (await mergeVariableIds(st.varIds));
  if (st.scanAll && !st.truncated) libStore.scannedAll = true;
  saveIndexSoon();
  pushLibraryData();
  pushLibStatus(st.truncated ? "truncated" : "idle");
}

function pushLibStatus(state) {
  figma.ui.postMessage({
    type: "libStatus",
    state,
    styles: libStore.styles.size,
    tokens: libStore.vars.size,
    scannedAll: libStore.scannedAll,
    savedAt: libStore.savedAt,
    restored: libStore.restored
  });
}

function pushLibraryData(opts) {
  pushStyles().catch(noop);
  // The team-library catalogue is a network round trip. At startup the saved
  // index is enough; the catalogue is fetched when a picker actually asks.
  pushLibraryVariables(opts).catch(noop);
}

function libStylesOfType(type) {
  const out = [];
  for (const st of libStore.styles.values()) if (st.type === type) out.push(st);
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

function firstPaintOf(style) {
  const p = style.paints && style.paints[0];
  if (!p) return null;
  if (p.type === "SOLID") return rgbToHex(p.color);
  if (p.type.indexOf("GRADIENT") === 0 && p.gradientStops.length) return rgbToHex(p.gradientStops[0].color);
  return null;
}

function describeStyle(style, remote) {
  const out = {
    id: style.id,
    key: style.key,
    name: style.name,
    type: style.type,
    remote: !!remote,
    color: null,
    desc: ""
  };
  if (style.type === "PAINT") out.color = firstPaintOf(style);
  else if (style.type === "TEXT") {
    out.desc = style.fontName.family + " " + style.fontName.style + " · " + style.fontSize;
  } else if (style.type === "EFFECT") {
    out.desc = style.effects.length + " effect" + (style.effects.length === 1 ? "" : "s");
  }
  return out;
}

async function pushStyles() {
  // Local styles are cheap to enumerate, so they are always read live; library
  // styles come from the persistent index.
  const [paint, text, effect, grid] = await Promise.all([
    figma.getLocalPaintStylesAsync(),
    figma.getLocalTextStylesAsync(),
    figma.getLocalEffectStylesAsync(),
    figma.getLocalGridStylesAsync()
  ]);

  figma.ui.postMessage({
    type: "styles",
    paint: paint.map((s) => describeStyle(s, false)),
    text: text.map((s) => describeStyle(s, false)),
    effect: effect.map((s) => describeStyle(s, false)),
    grid: grid.map((s) => describeStyle(s, false)),
    library: {
      paint: libStylesOfType("PAINT"),
      text: libStylesOfType("TEXT"),
      effect: libStylesOfType("EFFECT"),
      grid: libStylesOfType("GRID"),
      scannedAll: libStore.scannedAll,
      savedAt: libStore.savedAt,
      truncated: false
    }
  });
}

// Resolve a value one alias hop at a time so the token browser can show the
// concrete colour / number a variable ends up at, not just "→ alias".
async function deepResolve(value, depth) {
  let v = value;
  let hops = depth || 0;
  while (v && v.type === "VARIABLE_ALIAS" && hops < 8) {
    const target = await figma.variables.getVariableByIdAsync(v.id);
    if (!target) return null;
    const col = await figma.variables.getVariableCollectionByIdAsync(target.variableCollectionId);
    v = target.valuesByMode[col ? col.defaultModeId : Object.keys(target.valuesByMode)[0]];
    hops++;
  }
  return v;
}

async function collectionPayload(col, variables, remote) {
  const vars = [];
  for (const v of variables) {
    const byMode = {};
    for (const md of col.modes) {
      const raw = v.valuesByMode[md.modeId];
      const resolved = await deepResolve(raw);
      byMode[md.modeId] = {
        alias: !!(raw && raw.type === "VARIABLE_ALIAS"),
        aliasName: raw && raw.type === "VARIABLE_ALIAS" ? await aliasName(raw.id) : null,
        color: v.resolvedType === "COLOR" && resolved && resolved.r != null ? rgbToHex(resolved) : null,
        alpha: v.resolvedType === "COLOR" && resolved && resolved.a != null ? resolved.a : 1,
        text: v.resolvedType !== "COLOR" && resolved != null ? String(resolved) : null
      };
    }
    vars.push({
      id: v.id,
      key: v.key,
      name: v.name,
      group: v.name.indexOf("/") > -1 ? v.name.slice(0, v.name.lastIndexOf("/")) : "",
      short: v.name.split("/").pop(),
      type: v.resolvedType,
      description: v.description || "",
      scopes: v.scopes || [],
      byMode
    });
  }
  vars.sort((a, b) => a.name.localeCompare(b.name));
  return {
    id: col.id,
    name: col.name,
    remote: !!remote,
    modes: col.modes.map((md) => ({ id: md.modeId, name: md.name })),
    defaultModeId: col.defaultModeId,
    variables: vars
  };
}

async function aliasName(id) {
  const v = await figma.variables.getVariableByIdAsync(id);
  return v ? v.name : null;
}

async function pushVariables() {
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  const out = [];
  for (const col of collections) {
    const vars = [];
    for (const id of col.variableIds) {
      const v = await figma.variables.getVariableByIdAsync(id);
      if (v) vars.push(v);
    }
    out.push(await collectionPayload(col, vars, false));
  }
  figma.ui.postMessage({ type: "variables", collections: out });
}

/* ---- library (design-system) tokens -------------------------------------- */

// figma.teamLibrary only lists *variable* collections. There is no API to
// enumerate library styles, so the style pickers stay local-only by necessity.
async function pushLibraryVariables(opts) {
  const useCatalogue = !(opts && opts.indexOnly);
  // Two independent sources, because either one can come back empty:
  //   · teamLibrary — the full catalogue, but only when the file actually
  //     subscribes to the library and the plan exposes the API;
  //   · the document scan — whatever is already in use, always available.
  let libs = [];
  let teamError = null;
  if (useCatalogue) {
    try {
      libs = await figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync();
    } catch (e) {
      teamError = e.message || String(e);
    }
  }

  // Rebuild the collection payload from the index.
  const byKey = new Map();
  for (const col of libStore.collections.values()) {
    byKey.set(col.key, {
      key: col.key,
      id: col.id,
      name: col.name,
      library: "in use",
      remote: true,
      modes: col.modes,
      defaultModeId: col.defaultModeId,
      variables: []
    });
  }
  for (const v of libStore.vars.values()) {
    const bucket = byKey.get(v.collectionKey);
    if (bucket) bucket.variables.push(v);
  }
  for (const bucket of byKey.values()) {
    bucket.variables.sort((a, b) => a.name.localeCompare(b.name));
  }

  for (const lib of libs) {
    let entries;
    try {
      entries = await figma.teamLibrary.getVariablesInLibraryCollectionAsync(lib.key);
    } catch (e) {
      continue;
    }
    const existing = byKey.get(lib.key);
    const seen = new Set(existing ? existing.variables.map((v) => v.key) : []);
    const extra = entries
      .filter((e) => !seen.has(e.key))
      .map((e) => ({
        key: e.key,
        id: "libvar:" + e.key,           // imported on demand when bound
        name: e.name,
        group: e.name.indexOf("/") > -1 ? e.name.slice(0, e.name.lastIndexOf("/")) : "",
        short: e.name.split("/").pop(),
        type: e.resolvedType,
        byMode: {},
        libraryOnly: true
      }));

    if (existing) {
      existing.library = lib.libraryName;
      existing.variables = existing.variables.concat(extra)
        .sort((a, b) => a.name.localeCompare(b.name));
    } else {
      byKey.set(lib.key, {
        key: lib.key,
        id: "lib:" + lib.key,
        name: lib.name,
        library: lib.libraryName,
        remote: true,
        modes: [],
        defaultModeId: null,
        variables: extra.sort((a, b) => a.name.localeCompare(b.name))
      });
    }
  }

  // The catalogue and the document scan overlap; a variable key must surface in
  // exactly one collection.
  const emitted = new Set();
  const collections = [];
  for (const col of byKey.values()) {
    const vars = col.variables.filter((v) => {
      const k = v.key || v.id;
      if (emitted.has(k)) return false;
      emitted.add(k);
      return true;
    });
    if (vars.length) collections.push(Object.assign({}, col, { variables: vars }));
  }

  figma.ui.postMessage({
    type: "libraryVariables",
    collections: collections,
    teamLibraryError: teamError,
    scannedAll: libStore.scannedAll,
    savedAt: libStore.savedAt,
    truncated: false
  });
}

// A library variable has to be imported into the file before it can be bound.
async function resolveVariableForBinding(variableId) {
  if (!variableId) return null;
  if (variableId.indexOf("libvar:") === 0) {
    return figma.variables.importVariableByKeyAsync(variableId.slice(7));
  }
  return figma.variables.getVariableByIdAsync(variableId);
}

const TEXT_VAR_FIELDS = new Set([
  "fontSize", "lineHeight", "letterSpacing", "paragraphSpacing",
  "paragraphIndent", "fontFamily", "fontStyle", "characters"
]);

// `field` may be an array: the padding and corner-radius controls each stand in
// for several node fields, and Figma binds all of them in one go.
async function bindVariable(nodes, field, variableId, index, sub) {
  const variable = await resolveVariableForBinding(variableId);
  const fields = Array.isArray(field) ? field : [field];
  let failed = null;
  for (const node of nodes) {
    for (const one of fields) {
      const err = await bindOne(node, one, variable, index, sub);
      if (err) failed = err;
    }
  }
  if (failed) figma.notify("Can't bind token: " + failed, { error: true });
  figma.commitUndo();
}

async function bindOne(node, field, variable, index, sub) {
  try {
    if (field === "fill" || field === "stroke") {
      const prop = field === "fill" ? "fills" : "strokes";
      const src = node[prop];
      if (src === figma.mixed) return null;
      const arr = clone(src);
      if (!arr[index]) return null;
      if (sub != null && arr[index].gradientStops) {
        // No public helper for gradient stops — ColorStop.boundVariables is a
        // plain alias map, so write it directly.
        const stop = arr[index].gradientStops[sub];
        if (!stop) return null;
        stop.boundVariables = variable
          ? { color: { type: "VARIABLE_ALIAS", id: variable.id } }
          : {};
      } else {
        arr[index] = figma.variables.setBoundVariableForPaint(arr[index], "color", variable);
      }
      node[prop] = arr;
    } else if (field === "effect") {
      const arr = clone(node.effects);
      if (!arr[index]) return null;
      arr[index] = figma.variables.setBoundVariableForEffect(arr[index], sub || "color", variable);
      node.effects = arr;
    } else if (field === "grid") {
      const arr = clone(node.layoutGrids);
      if (!arr[index]) return null;
      arr[index] = figma.variables.setBoundVariableForLayoutGrid(arr[index], sub || "sectionSize", variable);
      node.layoutGrids = arr;
    } else if (NUMBER_VAR_FIELDS.has(field) || TEXT_VAR_FIELDS.has(field) || field === "visible") {
      if (TEXT_VAR_FIELDS.has(field)) await loadNodeFonts(node);
      node.setBoundVariable(field, variable);
    } else {
      node.setBoundVariable(field, variable);
    }
  } catch (e) {
    return e.message;
  }
  return null;
}

/* ---- variable modes on a node -------------------------------------------- */

async function setVariableMode(nodes, collectionId, modeId) {
  const col = await figma.variables.getVariableCollectionByIdAsync(collectionId);
  if (!col) return;
  for (const node of nodes) {
    try {
      if (modeId === "__AUTO__") node.clearExplicitVariableModeForCollection(col);
      else node.setExplicitVariableModeForCollection(col, modeId);
    } catch (e) {
      figma.notify("Can't set mode: " + e.message, { error: true });
    }
  }
  figma.commitUndo();
}

// Everything that can carry an explicit mode override, for the Variables section.
async function pushModeCollections() {
  const cols = await figma.variables.getLocalVariableCollectionsAsync();
  figma.ui.postMessage({
    type: "modeCollections",
    collections: cols
      .filter((c) => c.modes.length > 1)
      .map((c) => ({
        id: c.id,
        name: c.name,
        defaultModeId: c.defaultModeId,
        modes: c.modes.map((md) => ({ id: md.modeId, name: md.name }))
      }))
  });
}

/* =============================================================================
   Message router
   ========================================================================== */

figma.ui.onmessage = async (msg) => {
  try {
    await handleMessage(msg);
  } catch (e) {
    figma.notify(e.message || String(e), { error: true });
    // Mirror it into the panel too, where it can be copied as text.
    figma.ui.postMessage({
      type: "error",
      message: (msg && msg.type ? "[" + msg.type + "] " : "") + (e.message || String(e)),
      stack: e.stack || null
    });
    pushSelectionSoon();
  }
};

async function handleMessage(msg) {
  switch (msg.type) {
    case "ready": {
      const boot = (step, detail) => figma.ui.postMessage({ type: "boot", step, detail });

      await loadPrefs();

      boot("Reading the page structure…", figma.currentPage.name);
      pushAll();                                   // the layer push clears the screen

      boot("Restoring the design-system index…");
      const hadIndex = await restoreIndex();
      pushLibraryData({ indexOnly: true });
      pushLibStatus(hadIndex ? "idle" : "scanning");
      startBackgroundScan(libStore.scannedAll);
      return;
    }

    case "resize": {
      const w = Math.max(UI_MIN.w, Math.round(msg.w));
      const h = Math.max(UI_MIN.h, Math.round(msg.h));
      figma.ui.resize(w, h);
      saveLater("ui-size", { w, h });
      return;
    }

    case "refresh":
      fontCache = null;
      pushAll();
      startBackgroundScan(libStore.scannedAll);
      return;

    /* ---- layer tree ---- */

    case "setExpanded": {
      if (msg.expanded) expanded.add(msg.id); else expanded.delete(msg.id);
      if (msg.deep) {
        const node = await figma.getNodeByIdAsync(msg.id);
        if (node && "children" in node) {
          const seen = new Set([msg.id]);         // a layer can contain itself
          const walk = (n) => {
            if (!("children" in n) || seen.has(n.id)) return;
            seen.add(n.id);
            if (msg.expanded) expanded.add(n.id); else expanded.delete(n.id);
            (safeChildren(n) || []).forEach(walk);
          };
          (safeChildren(node) || []).forEach(walk);
        }
      }
      pushLayers();
      return;
    }

    case "collapseAll":
      expanded.clear();
      pushLayers();
      return;

    case "search":
      searchTerm = (msg.term || "").trim();
      pushLayers();
      return;

    case "select": {
      const nodes = [];
      for (const id of msg.ids) {
        const n = await figma.getNodeByIdAsync(id);
        if (n && !n.removed && n.type !== "PAGE") nodes.push(n);
      }
      figma.currentPage.selection = nodes;
      if (msg.zoom) figma.viewport.scrollAndZoomIntoView(nodes);
      return;
    }

    case "rename": {
      const node = await figma.getNodeByIdAsync(msg.id);
      if (node) { node.name = msg.name; figma.commitUndo(); }
      pushLayers();
      await pushSelection();
      return;
    }

    case "renameMatches":
      await renameMatches(msg.renames, msg.target);
      pushLayers();
      await pushSelection();
      return;

    case "move":
      await moveNodes(msg.ids, msg.targetId, msg.pos);
      pushLayers();
      return;

    case "action":
      await runAction(msg.action, msg.ids);
      pushLayers();
      await pushSelection();
      return;

    /* ---- pages ---- */

    case "selectPage": {
      const pg = await figma.getNodeByIdAsync(msg.id);
      if (pg && pg.type === "PAGE") await figma.setCurrentPageAsync(pg);
      return;                                    // currentpagechange pushes state
    }

    case "addPage": {
      const pg = figma.createPage();
      pg.name = "Page " + figma.root.children.length;
      await figma.setCurrentPageAsync(pg);
      return;
    }

    case "renamePage": {
      const pg = await figma.getNodeByIdAsync(msg.id);
      if (pg && pg.type === "PAGE") pg.name = msg.name;
      pushPages();
      return;
    }

    /* ---- property edits ---- */

    case "update": {
      const nodes = await selectedNodes();

      // Align / distribute / tidy act on the selection as a whole, not per node.
      if (msg.key === "align" || msg.key === "distribute" || msg.key === "tidy") {
        if (msg.key === "align") alignNodes(nodes, msg.value);
        else if (msg.key === "distribute") distributeNodes(nodes, msg.value);
        else tidyUp(nodes);
        figma.commitUndo();
        await pushSelection();
        return;
      }

      if (msg.key === "__none__") return;

      // "Selection colours": swap one solid colour for another everywhere below
      // the selection, mirroring Figma's swatch editor.
      if (msg.key === "replaceColor") {
        const from = String(msg.extra || "").toUpperCase();
        const to = hexToRgb(msg.value);
        let hits = 0;
        const swap = (node) => {
          for (const prop of ["fills", "strokes"]) {
            if (!(prop in node)) continue;
            const src = node[prop];
            if (src === figma.mixed) continue;
            let changed = false;
            const arr = clone(src);
            for (const paint of arr) {
              if (paint.type === "SOLID" && rgbToHex(paint.color).toUpperCase() === from) {
                paint.color = to;
                changed = true;
              }
            }
            if (changed) { node[prop] = arr; hits++; }
          }
          if ("children" in node) node.children.forEach(swap);
        };
        nodes.forEach(swap);
        if (msg.commit !== false) figma.commitUndo();
        if (hits) await pushSelection();
        return;
      }

      const failures = [];
      for (const node of nodes) {
        try {
          await applyUpdate(node, msg.key, msg.value, msg.index, msg.extra);
        } catch (e) {
          failures.push(node.name + ": " + e.message);
        }
      }
      if (failures.length === nodes.length && failures.length) {
        figma.notify(failures[0], { error: true });
      } else if (failures.length) {
        figma.notify(failures.length + " layers couldn't be updated");
      }
      if (msg.commit !== false) figma.commitUndo();
      await pushSelection();
      if (msg.key === "name" || msg.key === "visible" || msg.key === "locked" || msg.key === "isMask") {
        pushLayers();
      }
      return;
    }

    case "bindVariable":
      await bindVariable(await selectedNodes(), msg.field, msg.variableId, msg.index, msg.sub);
      await pushSelection();
      return;

    case "setVariableMode":
      await setVariableMode(await selectedNodes(), msg.collectionId, msg.modeId);
      await pushSelection();
      return;

    /* ---- resources ---- */

    case "getFonts": await pushFonts(); return;
    case "getStyles": await pushStyles(); return;
    // Forget what we know and re-walk; the walk is chunked, so this returns
    // immediately and the panel fills in as results land.
    case "rescanLibrary":
      libStore.styles.clear();
      libStore.vars.clear();
      libStore.collections.clear();
      libStore.seenStyleIds.clear();
      libStore.seenVarIds.clear();
      libStore.scannedAll = false;
      libStore.restored = false;
      startBackgroundScan(!!msg.scanAll);
      pushLibraryData();
      return;
    case "getVariables": await pushVariables(); return;
    case "getLibraryVariables": await pushLibraryVariables(); return;
    case "getModeCollections": await pushModeCollections(); return;

    // Apply a token straight from the token browser to whatever the selection
    // supports — colour tokens go to fills, numbers to the field you name.
    case "applyToken": {
      const nodes = await selectedNodes();
      const variable = await resolveVariableForBinding(msg.variableId);
      if (!variable) return;
      let applied = 0;
      for (const node of nodes) {
        try {
          if (variable.resolvedType === "COLOR") {
            const prop = msg.target === "stroke" ? "strokes" : "fills";
            if (!(prop in node)) continue;
            const src = node[prop];
            const arr = src === figma.mixed ? [] : clone(src);
            if (!arr.length) {
              arr.push({ type: "SOLID", color: { r: 0, g: 0, b: 0 }, opacity: 1, visible: true, blendMode: "NORMAL" });
            }
            const at = arr.length - 1;
            arr[at] = figma.variables.setBoundVariableForPaint(arr[at], "color", variable);
            node[prop] = arr;
            if (prop === "strokes" && node.strokeWeight === 0) node.strokeWeight = 1;
          } else if (msg.field) {
            if (TEXT_VAR_FIELDS.has(msg.field)) await loadNodeFonts(node);
            node.setBoundVariable(msg.field, variable);
          } else {
            continue;
          }
          applied++;
        } catch (e) { /* node doesn't accept this token */ }
      }
      figma.notify(applied
        ? "Applied " + variable.name + " to " + applied + " layer" + (applied === 1 ? "" : "s")
        : "No selected layer accepts " + variable.name);
      figma.commitUndo();
      await pushSelection();
      return;
    }

    case "getImage": {
      const image = figma.getImageByHash(msg.hash);
      if (!image) return;
      const bytes = await image.getBytesAsync();
      figma.ui.postMessage({ type: "image", hash: msg.hash, bytes });
      return;
    }

    /* ---- export ---- */

    case "export": {
      const nodes = await selectedNodes();
      const files = [];
      for (const node of nodes) {
        const settings = node.exportSettings.length
          ? node.exportSettings
          : [{ format: "PNG", suffix: "", constraint: { type: "SCALE", value: 1 } }];
        for (const s of settings) {
          try {
            const bytes = await node.exportAsync(s);
            files.push({
              name: node.name.replace(/[\\/:*?"<>|]/g, "_") + (s.suffix || "") + "." + s.format.toLowerCase(),
              format: s.format,
              bytes
            });
          } catch (e) {
            figma.notify("Export failed for " + node.name);
          }
        }
      }
      figma.ui.postMessage({ type: "exported", files });
      return;
    }

    // Candidates for an instance-swap dropdown: the component's own preferred
    // values first, then every component available in this document.
    case "getSwapOptions": {
      const sel = figma.currentPage.selection;
      const node = sel.length === 1 && sel[0].type === "INSTANCE" ? sel[0] : null;
      const preferred = [];
      const seen = new Set();

      if (node) {
        const main = await node.getMainComponentAsync();
        const defs = main && main.parent && main.parent.type === "COMPONENT_SET"
          ? main.parent.componentPropertyDefinitions
          : (main ? main.componentPropertyDefinitions : null);
        const def = defs && defs[msg.propKey];
        for (const pref of (def && def.preferredValues) || []) {
          let comp = null;
          try {
            comp = pref.type === "COMPONENT_SET"
              ? await figma.importComponentSetByKeyAsync(pref.key)
              : await figma.importComponentByKeyAsync(pref.key);
          } catch (e) { comp = null; }
          if (comp && !seen.has(comp.id)) {
            seen.add(comp.id);
            preferred.push({ id: comp.id, name: comp.name, set: comp.parent && comp.parent.type === "COMPONENT_SET" ? comp.parent.name : null });
          }
        }
      }

      const local = [];
      const prevSkip = figma.skipInvisibleInstanceChildren;
      figma.skipInvisibleInstanceChildren = true;
      try {
        let budget = 4000;
        for (const comp of figma.currentPage.findAllWithCriteria({ types: ["COMPONENT"] })) {
          if (budget-- <= 0) break;
          if (seen.has(comp.id)) continue;
          seen.add(comp.id);
          local.push({
            id: comp.id,
            name: comp.name,
            set: comp.parent && comp.parent.type === "COMPONENT_SET" ? comp.parent.name : null
          });
        }
      } catch (e) { /* findAllWithCriteria unavailable */ } finally {
        figma.skipInvisibleInstanceChildren = prevSkip;
      }
      local.sort((a, b) => (a.set || a.name).localeCompare(b.set || b.name));

      figma.ui.postMessage({ type: "swapOptions", propKey: msg.propKey, preferred, local });
      return;
    }

    case "swapInstance": {
      const comp = await figma.getNodeByIdAsync(msg.componentId);
      if (!comp || (comp.type !== "COMPONENT" && comp.type !== "COMPONENT_SET")) return;
      const target = comp.type === "COMPONENT_SET" ? comp.defaultVariant : comp;
      if (!target) return;
      let swapped = 0;
      for (const node of await selectedNodes()) {
        if (node.type !== "INSTANCE") continue;
        try { node.swapComponent(target); swapped++; } catch (e) {
          figma.notify("Can't swap “" + node.name + "”: " + e.message, { error: true });
        }
      }
      if (swapped) figma.commitUndo();
      await pushSelection();
      return;
    }

    /* ---- prototype ---- */

    case "getReactions": {
      const nodes = await selectedNodes();
      const out = [];
      for (const node of nodes) {
        const reactions = await readReactions(node);
        for (let i = 0; i < reactions.length; i++) {
          out.push({
            nodeId: node.id,
            nodeName: node.name,
            index: i,
            trigger: describeTrigger(reactions[i].trigger),
            actions: (reactions[i].actions || []).map(describeAction)
          });
        }
      }
      figma.ui.postMessage({
        type: "reactions",
        reactions: out,
        flowStarts: safe(() => figma.currentPage.flowStartingPoints
          .map((f) => ({ id: f.nodeId, name: f.name })), [])
      });
      return;
    }

    case "removeReaction": {
      const node = await figma.getNodeByIdAsync(msg.nodeId);
      if (!node) return;
      if (typeof node.setReactionsAsync !== "function") {
        figma.notify("This layer can't hold interactions", { error: true });
        return;
      }
      const reactions = await readReactions(node);
      await node.setReactionsAsync(reactions.filter((_, i) => i !== msg.index));
      figma.commitUndo();
      await handleMessage({ type: "getReactions" });
      return;
    }

    /* ---- viewport ---- */

    // There is no viewport-change event, so the zoom readout refreshes with the
    // next selection / document push rather than continuously.
    case "setZoom": {
      if (msg.mode === "selection") {
        const sel = figma.currentPage.selection;
        figma.viewport.scrollAndZoomIntoView(sel.length ? sel : figma.currentPage.children);
      } else if (msg.mode === "fit") {
        figma.viewport.scrollAndZoomIntoView(figma.currentPage.children);
      } else {
        figma.viewport.zoom = msg.value;
      }
      pushLayers();
      return;
    }

    case "setPref": {
      if (msg.theme) prefs.theme = msg.theme;
      try { await figma.clientStorage.setAsync("ui-prefs", prefs); } catch (e) { /* quota */ }
      return;
    }

    case "notify":
      figma.notify(msg.message);
      return;
  }
}

// Not every node type carries interactions — getReactionsAsync is simply absent
// on some of them, and the Prototype tab asks for whatever happens to be
// selected. Prefer the async getter, fall back to the deprecated array, and
// treat "this node has none" as an empty list rather than a failure.
async function readReactions(node) {
  try {
    if (typeof node.getReactionsAsync === "function") return await node.getReactionsAsync();
    if (Array.isArray(node.reactions)) return node.reactions;
  } catch (e) { /* unreadable on this node */ }
  return [];
}

function describeTrigger(t) {
  if (!t) return "None";
  const map = {
    ON_CLICK: "On click", ON_HOVER: "While hovering", ON_PRESS: "While pressing",
    ON_DRAG: "On drag", MOUSE_ENTER: "Mouse enter", MOUSE_LEAVE: "Mouse leave",
    MOUSE_DOWN: "Mouse down", MOUSE_UP: "Mouse up", AFTER_TIMEOUT: "After delay",
    ON_KEY_DOWN: "On key/gamepad", ON_MEDIA_HIT: "On media hit", ON_MEDIA_END: "On media end"
  };
  const label = map[t.type] || t.type;
  if (t.type === "AFTER_TIMEOUT") return label + " " + t.timeout + "ms";
  return label;
}

function describeAction(a) {
  if (!a) return "—";
  switch (a.type) {
    case "NODE": {
      const nav = {
        NAVIGATE: "Navigate to", SWAP: "Swap with", OVERLAY: "Open overlay",
        SCROLL_TO: "Scroll to", CHANGE_TO: "Change to"
      };
      return (nav[a.navigation] || a.navigation) + " " + (a.destinationId || "—");
    }
    case "URL": return "Open link " + a.url;
    case "BACK": return "Back";
    case "CLOSE": return "Close overlay";
    case "UPDATE_MEDIA_RUNTIME": return "Media: " + (a.mediaAction || "");
    case "SET_VARIABLE": return "Set variable";
    case "SET_VARIABLE_MODE": return "Set variable mode";
    case "CONDITIONAL": return "Conditional";
    default: return a.type;
  }
}
