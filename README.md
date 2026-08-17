# Layers & Design

A Figma plugin that reproduces the native **Layers** and **Design** panels, adds a
**Scale** panel, and lets you arrange the three however you like — so you can
collapse Figma's own panels and work from the plugin window instead.

![no screenshot yet](https://img.shields.io/badge/figma-plugin-black) ![tests](https://img.shields.io/badge/tests-52-green)

## Install

1. Figma → **Plugins → Development → Import plugin from manifest…**
2. Pick `plugin/manifest.json`.

No build step. Figma loads `plugin/code.js` and `plugin/ui.html` as they are.

```
plugin/   manifest, main thread, panel — what Figma loads
tests/    integrity checks, harnesses and behavioural tests
```

## What it does

**Layers panel**

- Lazy tree: only expanded branches are walked, so a 50 000-layer file costs the
  same as a 50-layer one until you open something
- Multi-select (⌘-click, ⇧-range), inline rename, drag-and-drop reordering and
  reparenting with a drop indicator
- Context menu: grouping, boolean operations, ordering, components, masks
- Keyboard: arrows, ⏎, ⌘G / ⇧⌘G, ⌘D, ⌫, ⇧⌘H, ⇧⌘L
- Search with the path to each match; horizontal scrolling for long names
- Colour-coded like Figma: components purple, slots orange, the selection's
  subtree tinted; auto-layout direction shown in the layer icon

**Design panel**

Position, Auto layout, Appearance, Typography, Fill, Stroke, Effects, Layout
grid, Component / Instance, Variable modes, Export — plus Prototype and Tokens
tabs.

Small things that matter in daily use: drag-to-scrub on field icons, arrow keys
(⇧ for ×10), arithmetic in number fields (`100*2+10`), `Mixed` placeholders,
`auto` and `120%` in line-height, a full HSV colour picker whose gradient ramp
edits like Figma's — click to add a stop, drag to move it, a row per stop, reverse
and rotate.

**Scale panel**

The Scale tool by the numbers: a target width, a target height or a multiplier
(0.25× to 10×), around any of nine anchor points. Scaling goes through
`rescale()`, so strokes, corner radii and font sizes come with it, and a
multiple selection scales as one thing — the gaps included.

**Arrangement**

The three panels can be laid out as three columns, three rows, or Layers and
Design side by side with Scale across the bottom, and any of them can be switched
off. Every divider stays draggable, and each layout remembers its own sizes.

Where the window sits, how big it is, how the panels are arranged, which are
switched on and which anchor you scale from are all kept in `clientStorage` — on
your machine, for you, outside the file and outside the repository.

**Design system**

Styles and variables from your libraries, kept in an index that survives between
sessions and tops itself up as you work — from the selection, from edits on
canvas, and from a chunked background pass. Tokens can be bound to any numeric
field, to fills and strokes, to effects and grids.

## Development

```sh
npm install     # jsdom, for the tests
npm test        # 52 files: integrity checks + behaviour
```

```sh
npm run test:checks    # syntax + the postMessage protocol
npm run test:ui        # the panel, in jsdom
npm run test:plugin    # the main thread, against a stubbed Figma API
node tests/run.js theme    # anything matching "theme"
```

The tests need no Figma: `tests/harness/ui.js` loads `plugin/ui.html` into jsdom and
speaks the plugin's postMessage protocol; `tests/harness/plugin.js` stubs enough
of the Figma API to load `plugin/code.js` and drive it.

Conventions, the reasoning behind the tricky parts, and what the Plugin API
cannot do are in [CLAUDE.md](CLAUDE.md). Read it before changing the message
protocol or the design-system index.

## Limits worth knowing

The plugin window floats — Figma has no docking API — though it does reopen where
and how big you left it. Hovering a row cannot highlight the layer on canvas,
because canvas hover events are not exposed. Library styles cannot be listed by
the API, so they are found by scanning what the document already uses; the Tokens
tab says as much and offers a deeper scan.

## Licence

MIT — see [LICENSE](LICENSE).
