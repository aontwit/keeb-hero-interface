# keeb-hero

A hero-section web experience: a 75% high-profile mechanical keyboard that
assembles itself from exploded parts, then comes back apart as you scroll.

Vite + React 19 + TypeScript (strict) + Three.js.
**anime.js v4 owns all animation timing and easing.**

---

## Run

```bash
npm install
npm run dev      # http://localhost:5174
```

> On Windows, Vite binds to `localhost` over IPv6 (`::1`) only.
> `http://127.0.0.1:5174` will time out — use `localhost`.

```bash
npm run typecheck    # tsc --noEmit
npm run build        # typecheck, then vite build
npm run preview
```

Press **D** for the lil-gui art-direction panel.

---

## The model

`public/assets/keyboard_75.glb` — 753 KB uncompressed (180 KB Draco),
64,066 triangles, 91 meshes, 13 animated parts. Each of the 84 keycaps is its
own object, parented to a row Empty — that is what makes a click press one key
and lets the exploded view fan the keys apart individually. The brass plate carries a real
14 mm cutout under every key — a solid slab was the loudest fake tell in the
exploded view.

Regenerate it from `build_keyboard_75.py` (Blender 4.x/5.x):

```bash
blender -b -P build_keyboard_75.py
```

It prints a per-row unit-width check and a vertical-stack assertion on every run.
Tune `KEY_LAYOUT`, `ROW_TILT_DEG`, `CASE_TOTAL_H` and re-run; the script is
idempotent (it wipes every `KB_*` object first).

**Scene scale is 1 unit = 1 cm.** The board is ~32 × 12.6 × 4.7 units. Anything
you add to the lighting rig must be in centimetres.

Compress before shipping:

```bash
npx @gltf-transform/cli draco public/assets/keyboard_75.glb out.glb
```

`optimize` also joins meshes, which merges the named nodes the loader resolves
parts by. `draco` alone compresses 753 KB -> 180 KB and leaves the graph intact.

`loader.js` already installs a `DRACOLoader`, so a compressed file drops in with
no code change.

### Parts

| object | role |
|---|---|
| `KB_Case_Bottom` | tub — floor + 4 walls, chamfered front lip |
| `KB_Feet` | flip-out rear legs, 7° typing angle |
| `KB_PCB` / `KB_Plate` | board + brass plate |
| `KB_Switches_Group` | empty parenting 84 linked-duplicate switches |
| `KB_Case_Top` | high-profile frame/bezel |
| `KB_SideControls` | USB-C recess + 2 slide nubs, left edge |
| `KB_Keycaps_Row0..Row5` | Empty per row; Row0 = F-row, Row5 = bottom row |
| `KB_Key_R{row}_{nn}` | one object per keycap, parented to its row |
| `KB_Cable_USB` | optional stub, left side |

`loader.js` resolves each name **exactly first, then by prefix**, and reports
anything missing or unexpected — so a rename in Blender surfaces as a warning
instead of an `undefined` at animation time.

Keycap rows and switches arrive as `Group{ Name, Name_1 }`: glTF splits
multi-material objects into one primitive each. Drive the **Group**, not the
child meshes.

---

## Architecture

```
src/main.tsx              React entry (StrictMode)
src/App.tsx               DOM shell + the one effect that mounts the engine
src/content.ts            section copy; LAYERS.length drives scroll stages
src/styles.css
src/three/types.ts        PartName union, PartState, Orbit — the shared contract
src/three/scene.ts        renderer, camera, lights, contact shadow, bloom
src/three/loader.ts       GLTF + Draco, part resolution, scene-graph report
src/three/scrollExplode.ts per-part state, exploded transforms, staged scrub
src/three/timelineAssemble.ts anime.js intro timeline
src/three/interactions.ts pointer parallax, idle sway, click-to-press
src/three/materials.ts    PBR pass: clearcoat, sheen, transmission, brass
src/three/switches.ts     blue/red/brown — one stem colour + one easing
src/three/heroSwitches.ts the three switches that climb out for the picker
src/three/callouts.ts     SVG leader lines into a fixed label column
src/three/debug.ts        lil-gui panel (D)
src/three/engine.ts       wiring, render loop, dispose
```

**React owns the DOM shell and nothing else.** Everything that changes per frame
is imperative: `src/three/*` mutates Object3D transforms directly, and the
progress bar reads a CSS custom property the loop writes. There are exactly two
pieces of React state (`ready`, `error`) and each flips at most once. Putting
scroll or animation values in state would re-render at 60fps — the thing to
avoid.

**One writer for transforms.** Every part carries a scalar `t` (1 = assembled,
0 = exploded). The intro timeline and the scroll scrub both write `t`; a single
`applyStates()` lerps position and rotation once per frame. Two systems can
never fight over the same `position.y`, and nothing is allocated per frame.

**Labels live in slots, not next to their parts.** `callouts.ts` projects an
anchor point on each part to screen every frame, but the label end of the line
is pinned to a fixed column in the top-left. A slot cannot collide with another
label, land on the body copy, or leave the frame, so the anchors only have to
sit on the part — no per-part label placement to re-tune when the explode
changes. Which set is up comes from an IntersectionObserver over the sections
that declare `data-parts`.

Idle sway, float and pointer parallax live on a wrapper `rig`, so they compose
with part motion instead of overwriting it.

**Types carry the model contract.** `EXPECTED_PARTS` is `as const`, and
`PartName` is derived from it — rename a part in Blender and every downstream
reference is a compile error instead of a silent `undefined` at animation time.

### Reduced motion

`prefers-reduced-motion: reduce` removes the motion nobody asked for and keeps
the motion the user is driving:

| removed | kept |
|---|---|
| the autoplay intro relay (parts land assembled, copy visible from frame one) | the scroll explode — it *is* the content, and it tracks scroll 1:1 |
| idle sway + float | the click press, minus the elastic overshoot |
| pointer parallax | |
| the camera sweep across the scroll | |
| the damping tail that keeps the board drifting after scrolling stops | |

The engine listens for changes, so toggling the OS setting takes effect on a
live page — no reload.

### StrictMode

Dev double-mounts effects, so the engine is built to survive it:

- every listener in every module hangs off one `AbortController`
- `dispose()` stops the loop, destroys the GUI, frees geometries/materials, and
  disposes the WebGL context
- the `.glb` can still be in flight when cleanup runs — the load is guarded by
  `signal.aborted`, and the losing engine tears itself down on arrival
- `window.__keeb` is only cleared if it still points at the engine being
  disposed. An unconditional `delete` there wipes the *live* engine's handle,
  which is exactly the bug that showed up on the first run after the migration.

---

## Deviations from the brief

**Scroll uses a damped progress lerp, not `onScroll`.** anime.js v4.5 ships
`ScrollObserver`, but the intro timeline already owns every part's `t`. A second
animation graph writing the same property is the exact fight the single-writer
design avoids, and the brief allows the lerp as the alternative. `scrollOrbit`
in the debug panel drives the camera sweep off the same progress value.

**Per-key press costs draw calls.** Splitting the caps into 84 objects took the
scene from 23 meshes / 15 shadow casters to 104 / 87 — roughly 190 draw calls a
frame, still a third of the 540 the switch merge was written to fix, and it
holds 60 fps on desktop. If it ever bites, the next step is merging the caps
back per row and moving one key's vertices through `addUpdateRange`, which keeps
6 draw calls at the cost of real complexity.

**Rows are 16.00u, not 15.75u.** 15.75u does not tile with standard keycap
widths. `KEY_UNIT` is scaled to 1.875 cm instead, so total width still lands on
the specified 313 mm — which also delivers the dense, minimal-gap look.

**`KB_Knob` / `KB_Badge` removed** per the v2 spec; `KB_Feet` and
`KB_SideControls` replace them in the explode choreography.

---

## Performance

- DPR capped at 2 (1.5 on mobile)
- 84 switches share one geometry — instanced by glTF, not duplicated
- Bloom and antialiasing disabled on mobile; pointer parallax off on coarse pointers
- No per-frame allocation: shared vectors, materials collected once

---

## Known rough edges

- Intro fade toggles `material.transparent`, which forces a shader recompile on
  first play. Precompile with `renderer.compile(scene, camera)` if the first
  frame hitches.
- `KB_Feet` sits on the ground via a post-tilt correction that reads
  `matrix_world` before the depsgraph settles. It measures correctly now, but
  add `bpy.context.view_layer.update()` before the read if the feet ever drift.
- Material colours were verified after the GLB round-trip (`#17181c`, `#a9abad`,
  `#4a4c50`, `#e8500f`, `#2fa8e0` all exact). The Blender viewport on the
  authoring machine renders untextured, so trust the browser, not the viewport.
