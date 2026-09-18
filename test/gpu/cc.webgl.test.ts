// The stage on the real renderer. Run via `npm run test:gpu` (test/gpu/run.cjs
// copies this file into a SafeLight checkout and runs it under its headless
// Chromium + SwiftShader rig). What the CPU suite cannot check:
//
//  • the inline GLSL compiles and links inside the develop shader on a real
//    GLSL ES 3.00 driver, with the host's uniform/helper namespacing applied;
//  • at the defaults the stage is a bit-exact no-op;
//  • the rendered pixels equal the model's correctPixel — darktable's
//    formula through the same Lab plumbing — to capture precision, for
//    darktable's presets and stronger edits.
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
import { colourCorrectionStage } from "@cc/stage";
import { DEFAULT_PARAMS, PRESETS, bagPatch, correctPixel, type Params } from "@cc/model";
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

function compare(on: Frame, off: Frame, params: Params): Comparison {
  let se = 0;
  let max = 0;
  let change = 0;
  let worst = "";
  const n = W * H * 3;
  for (let p = 0; p < W * H; p++) {
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

const cases: [string, Params][] = [
  ...PRESETS.map((p): [string, Params] => [p.label, p.params]),
  ["strong split-tone", { loa: -20, lob: -15, hia: 25, hib: 30, saturation: 1.5 }],
  ["saturation 0", { ...DEFAULT_PARAMS, saturation: 0 }],
  ["saturation -1 (complementary)", { ...DEFAULT_PARAMS, saturation: -1 }],
  ["saturation 3 with a cold shadow tint", { loa: -8, lob: -12, hia: 0, hib: 0, saturation: 3 }],
];

// The output capture is half-float: one step is 4.9e-4 just below 1.0 and
// shrinks with the value; the GLSL pow paths add far less than that.
const MAX_ABS_ERROR = 1e-3;
const MAX_RMS_ERROR = 2e-4;

describe("Colour Correction stage on the real renderer", () => {
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
});
