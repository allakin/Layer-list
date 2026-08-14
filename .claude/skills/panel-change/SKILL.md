---
name: panel-change
description: Add or change a control in the Figma Layers/Design plugin — a property field, a section, a menu, a layer-row affordance. Use when the user asks to add, move, restyle or fix anything in the plugin panel, or mentions ui.html, code.js, a Design panel section, or a Figma property.
---

# Changing the panel

Read [CLAUDE.md](../../../CLAUDE.md) first — it lists the seven rules that came
out of real bugs, and what the Plugin API cannot do. Do not rediscover those.

## A new property control, end to end

A property crosses both files. Miss a step and the control renders but does
nothing — the failure `tests/checks/protocol.js` exists to catch.

1. **Read it** — `readProps(node)` in `code.js`. Wrap anything that can throw on
   the wrong node type in `safe()`. Convert `figma.mixed` to the `MIXED`
   sentinel; the panel renders that as a `Mixed` placeholder on its own.
2. **Write it** — a `case` in `applyUpdate`. Selection-wide operations
   (`align`, `distribute`, `tidy`, `replaceColor`) are intercepted earlier, in
   the `update` message, because they act on the selection as a whole.
3. **Render it** — the matching section builder in `ui.html`, using the shared
   controls rather than new markup:

   | Need | Use |
   | --- | --- |
   | number or text input | `field({ … })` |
   | two controls with labels | `pairGrid([{label, control}, …], trailing)` |
   | a labelled row | `grp("Label", [controls], { cls: "g2" })` |
   | icon segmented control | `seg(items, active, onPick)` |
   | dropdown | `select(items, active, onPick, opts)` |
   | boolean | `toggle(on, onChange)` — Figma uses a switch, not a checkbox |
   | anchored panel | `popOpen(anchor, body, opts)` / `menu(anchor, items)` |

4. **Bindable to a variable?** Pass `bindField` to `field()`. It may be an array
   when one control stands for several node fields — padding binds two sides,
   corner radius binds four. If the field already has its own menu offering
   "Apply variable…", pass `hideTokenButton: true` so the affordance is not
   duplicated.
5. **Test it.** Add a file under `tests/ui/`, copying the shape of a neighbour:
   post a `props` payload, assert what rendered, dispatch a click, assert the
   message that went out. Then `npm test`.

## Watch for

- `field()` returns a **token chip with no `<input>`** when the value is bound to
  a variable. Never query into a field after building it.
- Hide hover-only controls with `display: none`. `opacity: 0` still reserves the
  width and clips the value.
- Capture `e.currentTarget` into a local before building a menu; it is null by
  the time the menu's callbacks run.
- The panel re-renders on every document change. It restores scroll and focus by
  `data-key`, so give any new field a stable `dataKey`.

## Touching the main thread

Anything that runs from a timer or a Figma event callback must catch its own
exceptions — nothing above it does, and an escape becomes an orange Figma toast.
Node references held across an `await` go through `nodeAlive()` and
`safeChildren()`.

## Finish with

```sh
npm test
```
