# Colour Correction for SafeLight

A [SafeLight](https://github.com/anthonyreimche/SafeLight) extension that ports
[**darktable**](https://www.darktable.org/)'s *color correction* module — tint
the shadows and the highlights separately on an a/b colour board, and set the
global saturation — into SafeLight's Develop module. If you came from darktable
and miss its quickest split-toning tool, this is that tool, with the same board,
the same interaction and the same Lab maths.

## What it does

The module works in Lab and leaves lightness alone. It shifts the two colour
axes, a (green ↔ red) and b (blue ↔ yellow), by a **shadow tint** that applies
in full at L = 0 and a **highlight tint** that applies in full at L = 100,
blending linearly in between; then it multiplies both axes by a global
**saturation**. Two equal tints give the whole image a cast; two different ones
split-tone it; saturation 0 is monochrome and a negative saturation turns every
colour into its complement.

### The colour board (same as darktable)

The board is the a/b plane at darktable's mid grey: +a to the right, +b upward,
an 8×8 swatch grid that follows the saturation. The **dark dot** is the shadow
tint, the **light dot** the highlight tint, and a line joins them.

- **Hover** picks the dot under the pointer (within darktable's five units;
  when both sit together, the light dot on top wins); **drag** moves it.
- **Double-click** resets the picked dot, or everything — saturation
  included — when nothing is picked.
- **Mouse wheel** over the board steps saturation by 0.1.
- **Arrow keys** nudge the picked dot by 0.5; Shift makes it ×10, Ctrl ×0.1.
- **Saturation** slider, −3 to 3 (double-click resets to 1).
- **Presets** are darktable's own, with its exact values: Warm tone, Warming
  filter, Cooling filter.
- Right-click the panel header for *Reset to defaults*.

The board sits on the panel's themed surface; the dots keep darktable's dark
and light greys because they mean something ("bright means highlights, dark
means shadows").

## The math

Faithful to darktable's `colorcorrection` module (`src/iop/colorcorrection.c`):

```
a' = saturation · (a + L · (hia − loa) / 100 + loa)
b' = saturation · (b + L · (hib − lob) / 100 + lob)
L' = L
```

where `(loa, lob)` is the shadow tint, `(hia, hib)` the highlight tint, the
board spans ±40 on both axes and saturation runs from −3 to 3. Every number in
the panel — the board mapping, the pick radius, the wheel and arrow steps, the
preset values — is darktable's.

### How it maps onto SafeLight

darktable applies this in the Lab section of its pipeline, on the
display-referred image. SafeLight's equivalent is its display-adjust phase: the
stage runs on the display-encoded colour after the tone pipeline and before
vignette and grain. Per pixel it decodes with the host's transfer function,
converts to D50 Lab (darktable's Lab is D50, reached here through the
Bradford-adapted sRGB matrices, so an sRGB working image gives the same
numbers), applies the formula, and encodes back — which clips anything the
tint pushed out of gamut, as darktable's output stage would. At the defaults
the stage's branch is never taken and an untouched photo renders bit for bit
unchanged. There is no pre-pass; the cost is a handful of instructions per
pixel.

Differences from darktable to be aware of:

- darktable feeds the module the Lab of its input profile; SafeLight converts
  from its display sRGB. Neutrals match exactly, tints match for an sRGB
  working space, and very saturated colours can differ slightly in hue angle.
- No blend modes or masks yet (SafeLight's per-mask extension stages are still
  pending in core).

### Tests

`npm test` runs on the CPU: the model against a transcription of the C
(`process()` on a grid of Lab values and parameter sets), the Lab plumbing
(grey is neutral, sRGB 0.5 is darktable's L = 53.39, exact round trips), the
presets verbatim, the board mapping and darktable's picking rule, wheel and
arrow clamps, the swatch colours, and the param-bag contract. A second script
pins the GPU stage's contract: the phase, the five uniforms and their defaults,
the gate that idles the shader at the defaults, zero texture fetches, no bare
integer literals, and that the shader's matrices are formatted from the model's
constants so the two can never drift apart.

`npm run test:gpu` runs the stage through a SafeLight checkout's WebGL harness
(headless Chromium on SwiftShader): the shader compiles inside the develop
program, an untouched photo is a bit-exact no-op, and darktable's presets plus
stronger edits render to within half-float capture precision of the model. It
needs the SafeLight repository beside this one (or `SAFELIGHT_CORE=<path>`)
with its dev dependencies installed.

## Install

Install from the SafeLight **Extensions** window, or load this folder via
Developer Tools ▸ Extensions during development. A **Colour Correction** panel
appears in Develop (right dock). Build from source with `npm install && npm run
build` (outputs `dist/index.js`). Needs SafeLight 2.5.0 or newer.

## License & credits

**GPL-3.0-or-later.** The algorithm and UI are a reimplementation of
darktable's color correction module, which is GPL-3.0; this extension is
licensed under the GPL to respect that. darktable is © its authors — see
[darktable-org/darktable](https://github.com/darktable-org/darktable). This is
an independent port and is not affiliated with or endorsed by the darktable
project.
