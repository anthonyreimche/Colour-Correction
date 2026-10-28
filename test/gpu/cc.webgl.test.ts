// The stage on the real renderer. Run via `npm run test:gpu` (test/gpu/run.cjs
// copies this file into a SafeLight checkout and runs it under its headless
// Chromium + SwiftShader rig). What the CPU suite cannot check:
//
//  • the inline GLSL compiles and links inside the develop shader on a real
//    GLSL ES 3.00 driver, with the host's uniform/helper namespacing applied;
//  • at the defaults the stage is a bit-exact no-op;
//  • the rendered pixels equal the model's correctPixel — darktable's
//    formula through the same Lab plumbing — to capture precision, for
//    darktable's presets and stronger edits;
//  • a mask's copy of the stage applies the mask's correction inside the mask
//    only, leaving every pixel outside it as the photo's own correction left it.
//
// The stage's input is the display colour after the host's tone chain, which
// carries an 8-bit tone-curve LUT (about 1/512 of drift even at identity), so
// the reference starts from the captured idle frame rather than the scene.
// That capture is RGBA16F, so the GPU's true input sits within half a
// half-float step of it: each pixel is evaluated at the corners of that box
// and the GPU result is measured against the hull, which separates shader
// error from input quantisation. What remains is the output capture's own
// half-float step.

import { describe, expect, it } from "vitest";
import { CURRENT_PROCESS_VERSION, DEFAULT_GRAIN, DEFAULT_VIGNETTE, defaultMaskAdjustments, type Mask } from "@/catalog/types";
import { colourCorrectionStage } from "@cc/stage";
import { DEFAULT_PARAMS, PRESETS, bagPatch, correctPixel, type Params } from "@cc/model";
import type { ProcessingStageContribution } from "@cc/safelight";
import {
  LINEAR_PROBE_PIPELINE,
  type Frame,
  builtinStages,
  floatImage,
  identityParams,
  withRenderer,
} from "@/rendering/webgl/webgl.test-support";

const W = 128;
const H = 128;
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

// Luminance ramps left→right; the top rows stay neutral, below them a hue
// sweep with growing chroma, so shadows, highlights and every tint direction
// are all exercised. Luminance stays under the host's filmic knee (0.85 at
// default params) so the tone chain does not roll the highlights off.
const SCENE = floatImage(W, H, (x, y) => {
  const t = x / (W - 1);
  const u = y / (H - 1);
  const L = 0.02 + 0.68 * t;
  const chroma = u < 0.15 ? 0 : 0.2 * Math.min(1, (u - 0.15) / 0.3);
  const ang = u * Math.PI * 2 * 1.7;
  return [
    clamp01(L + chroma * Math.cos(ang)),
    clamp01(L + chroma * Math.cos(ang - 2.094)),
    clamp01(L + chroma * Math.cos(ang + 2.094)),
  ];
});

/** Half of the RGBA16F step at `v`: how far the true value can sit from its capture. */
function halfStep(v: number): number {
  if (v === 0) return 2 ** -25;
  return 2 ** (Math.floor(Math.log2(Math.abs(v))) - 11);
}

interface Comparison {
  /** Largest distance of a GPU value from the hull of the model over the input box. */
  max: number;
  rmse: number;
  /** rms of the change itself, the scale the error is judged on. */
  changeRms: number;
  /** The worst pixel: where, what went in, what came out, what should have. */
  worst: string;
}

const CORNERS = [-1, 1];

/** The GPU frame against the model, over the columns `inside` picks (all by default). */
function compare(on: Frame, off: Frame, params: Params, inside = (_x: number) => true): Comparison {
  let se = 0;
  let max = 0;
  let change = 0;
  let worst = "";
  let n = 0;
  for (let p = 0; p < W * H; p++) {
    if (!inside(p % W)) continue;
    n += 3;
    const o = p * 4;
    const c: [number, number, number] = [off.data[o], off.data[o + 1], off.data[o + 2]];
    const centre = correctPixel(c, params);
    const lo = [...centre];
    const hi = [...centre];
    for (const sx of CORNERS) {
      for (const sy of CORNERS) {
        for (const sz of CORNERS) {
          const r = correctPixel(
            [c[0] + sx * halfStep(c[0]), c[1] + sy * halfStep(c[1]), c[2] + sz * halfStep(c[2])],
            params,
          );
          for (let ch = 0; ch < 3; ch++) {
            if (r[ch] < lo[ch]) lo[ch] = r[ch];
            if (r[ch] > hi[ch]) hi[ch] = r[ch];
          }
        }
      }
    }
    for (let ch = 0; ch < 3; ch++) {
      const g = on.data[o + ch];
      const e = g < lo[ch] ? lo[ch] - g : g > hi[ch] ? g - hi[ch] : 0;
      se += e * e;
      change += (centre[ch] - c[ch]) ** 2;
      if (e > max) {
        max = e;
        worst =
          `(${p % W},${Math.floor(p / W)}) ch${ch}: in ${c.map((v) => v.toFixed(5)).join("/")} ` +
          `gpu ${g.toFixed(5)} ref ${centre[ch].toFixed(5)} [${lo[ch].toFixed(5)}, ${hi[ch].toFixed(5)}]`;
      }
    }
  }
  return { max, rmse: Math.sqrt(se / n), changeRms: Math.sqrt(change / n), worst };
}

/** Every param off its default, so a mask's copy is seen to bind all five. */
const SPLIT_TONE: Params = { loa: -20, lob: -15, hia: 25, hib: 30, saturation: 1.5 };

const cases: [string, Params][] = [
  ...PRESETS.map((p): [string, Params] => [p.label, p.params]),
  ["strong split-tone", SPLIT_TONE],
  ["saturation 0", { ...DEFAULT_PARAMS, saturation: 0 }],
  ["saturation -1 (complementary)", { ...DEFAULT_PARAMS, saturation: -1 }],
  ["saturation 3 with a cold shadow tint", { loa: -8, lob: -12, hia: 0, hib: 0, saturation: 3 }],
];

// The output capture is half-float: one step is 4.9e-4 just below 1.0 and
// shrinks with the value; the GLSL pow paths add far less than that.
const MAX_ABS_ERROR = 1e-3;
const MAX_RMS_ERROR = 2e-4;

/** Over-range display values on process version 2, which clips nothing
 *  upstream: channels past white and colours outside sRGB. */
const WIDE_SCENE = floatImage(W, H, (x, y) => {
  const u = x / (W - 1);
  const v = y / (H - 1);
  if (y < H / 4) return [0.5 + 3.5 * u, 0.3 + 2.2 * u, 0.2 + 1.4 * u];
  if (y < H / 2) return [0.2 + 1.2 * u, -0.05 - 0.45 * v, 0.1 + 0.9 * u];
  if (y < (3 * H) / 4) return [-0.2 - 0.3 * u, 0.4 + 0.8 * v, -0.1 - 0.4 * v];
  return [0.05 + 0.8 * u, 0.05 + 0.8 * u, 0.05 + 0.8 * u];
});

const V2_WITH_EFFECTS = {
  processVersion: CURRENT_PROCESS_VERSION,
  vignette: { ...DEFAULT_VIGNETTE, amount: 30 },
  grain: { ...DEFAULT_GRAIN, amount: 100 },
};

// A linear gradient whose step sits at u = 0.5: the right half is covered.
const RIGHT_HALF: Mask["components"][number] = {
  id: "right",
  kind: "linear",
  mode: "add",
  invert: false,
  linear: { x0: 0.5, y0: 0, x1: 0.5001, y1: 0 },
};

function wideFrame(stages: ProcessingStageContribution[], bag: Record<string, unknown> = {}): Frame {
  return withRenderer({ stages: [...builtinStages(), ...stages], pipeline: LINEAR_PROBE_PIPELINE }, (r) => {
    r.setImage(WIDE_SCENE);
    r.setParams(identityParams(V2_WITH_EFFECTS));
    r.setContributedParams(bag);
    const f = r.captureFloatFrame();
    if (!f) throw new Error("captureFloatFrame returned null");
    return f;
  });
}

describe("Colour Correction stage on the real renderer", () => {
  // On version 2 the host clips a display stage that declares no space to
  // [0, 1] ahead of its block, outside its gate, for as long as the stage is
  // registered, and the Vignette and Grain behind it then read clipped values.
  // A bare stage that declares nothing is the positive control: it must change
  // this frame, or the scene doesn't reach the display phase over range.
  it("is a bit-exact no-op at the defaults on version 2 with values outside [0, 1]", () => {
    const clipsAhead: ProcessingStageContribution = {
      id: "test.clips-ahead",
      name: "Clips ahead",
      phase: "display-adjust",
      glsl: "c = c;",
      uniforms: [],
    };
    const bare = wideFrame([]);
    const clipped = wideFrame([clipsAhead]);
    let moved = 0;
    for (let i = 0; i < bare.data.length; i++) if (bare.data[i] !== clipped.data[i]) moved++;
    expect(moved).toBeGreaterThan(W * H * 0.1);
    const idle = wideFrame([colourCorrectionStage()], bagPatch(DEFAULT_PARAMS));
    let differing = 0;
    for (let i = 0; i < idle.data.length; i++) if (idle.data[i] !== bare.data[i]) differing++;
    expect(differing).toBe(0);
  });

  it("is a bit-exact no-op at the defaults", () => {
    // Renderers share one context and a nested one's dispose() tears down GL
    // state the outer one relies on, so the two frames are taken in sequence.
    const bare = withRenderer({ stages: builtinStages(), pipeline: LINEAR_PROBE_PIPELINE }, (r) => {
      r.setImage(SCENE);
      r.setParams(identityParams());
      return r.captureFloatFrame();
    });
    const idle = withRenderer(
      { stages: [...builtinStages(), colourCorrectionStage()], pipeline: LINEAR_PROBE_PIPELINE },
      (r) => {
        r.setImage(SCENE);
        r.setParams(identityParams());
        r.setContributedParams(bagPatch(DEFAULT_PARAMS));
        return r.captureFloatFrame();
      },
    );
    expect(bare).not.toBeNull();
    expect(idle).not.toBeNull();
    expect(idle!.width).toBe(W);
    for (let i = 0; i < idle!.data.length; i++) expect(idle!.data[i]).toBe(bare!.data[i]);
    // The probe path is the tone chain at identity params; its 8-bit
    // tone-curve LUT is why the reference starts from a captured frame.
    let drift = 0;
    for (let p = 0; p < W * H; p++) {
      for (let ch = 0; ch < 3; ch++) drift = Math.max(drift, Math.abs(bare!.data[p * 4 + ch] - SCENE.data[p * 4 + ch]));
    }
    console.log(`[cc-gpu] probe pipeline drift from the scene: ${drift.toExponential(2)}`);
    expect(drift).toBeLessThan(4e-3);
  });

  it("renders darktable's formula for every preset and edit", () => {
    withRenderer(
      { stages: [...builtinStages(), colourCorrectionStage()], pipeline: LINEAR_PROBE_PIPELINE },
      (renderer) => {
        renderer.setImage(SCENE);
        renderer.setParams(identityParams());
        renderer.setContributedParams(bagPatch(DEFAULT_PARAMS));
        const off = renderer.captureFloatFrame();
        expect(off).not.toBeNull();

        for (const [name, params] of cases) {
          renderer.setContributedParams(bagPatch(params));
          const t0 = performance.now();
          const on = renderer.captureFloatFrame();
          const ms = performance.now() - t0;
          expect(on).not.toBeNull();
          const s = compare(on!, off!, params);
          console.log(
            `[cc-gpu] ${name}: ${ms.toFixed(0)} ms; change rms ${s.changeRms.toExponential(2)}; ` +
              `error rms ${s.rmse.toExponential(2)}, max ${s.max.toExponential(2)} at ${s.worst}`,
          );
          expect(s.changeRms).toBeGreaterThan(1e-3);
          expect(s.max).toBeLessThan(MAX_ABS_ERROR);
          expect(s.rmse).toBeLessThan(MAX_RMS_ERROR);
        }
      },
    );
  });

  it("applies a mask's correction inside the mask, and the photo's everywhere else", () => {
    const mask: Mask = {
      id: "m",
      name: "Mask",
      visible: true,
      invert: false,
      opacity: 100,
      adj: defaultMaskAdjustments(),
      panels: ["colour-correction.panel"],
      bag: bagPatch(SPLIT_TONE),
      components: [RIGHT_HALF],
    };
    withRenderer(
      { stages: [...builtinStages(), colourCorrectionStage()], pipeline: LINEAR_PROBE_PIPELINE },
      (renderer) => {
        renderer.setImage(SCENE);
        renderer.setContributedParams(bagPatch(DEFAULT_PARAMS));
        renderer.setParams(identityParams({ processVersion: 2 }));
        const off = renderer.captureFloatFrame();
        renderer.setParams(identityParams({ processVersion: 2, masks: [mask] }));
        const on = renderer.captureFloatFrame();
        expect(off).not.toBeNull();
        expect(on).not.toBeNull();

        // Columns either side of the step, clear of the pixel it straddles.
        const left = (x: number) => x < W / 2 - 1;
        const right = (x: number) => x > W / 2;
        for (let p = 0; p < W * H; p++) {
          if (!left(p % W)) continue;
          for (let ch = 0; ch < 3; ch++) expect(on!.data[p * 4 + ch]).toBe(off!.data[p * 4 + ch]);
        }
        const s = compare(on!, off!, SPLIT_TONE, right);
        console.log(
          `[cc-gpu] masked strong split-tone: change rms ${s.changeRms.toExponential(2)}; ` +
            `error rms ${s.rmse.toExponential(2)}, max ${s.max.toExponential(2)} at ${s.worst}`,
        );
        expect(s.changeRms).toBeGreaterThan(1e-3);
        expect(s.max).toBeLessThan(MAX_ABS_ERROR);
        expect(s.rmse).toBeLessThan(MAX_RMS_ERROR);
      },
    );
  });
});
