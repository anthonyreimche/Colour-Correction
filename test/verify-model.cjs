// The model against darktable's colorcorrection.c: the process() formula, the
// Lab plumbing it needs, the presets, the board geometry and picking rules of
// its GUI, and the param-bag contract the panel and the GPU stage share.
const path = require("path");
const M = require(path.join(__dirname, ".build", "model.js"));

let fails = 0;
const check = (name, ok, detail) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) fails++;
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const sameParams = (a, b) => ["loa", "lob", "hia", "hib", "saturation"].every((k) => a[k] === b[k]);

// darktable src/iop/colorcorrection.c: commit_params + process, transcribed.
function dtProcess([L, a, b], p) {
  const a_scale = (p.hia - p.loa) / 100.0;
  const a_base = p.loa;
  const b_scale = (p.hib - p.lob) / 100.0;
  const b_base = p.lob;
  return [L, p.saturation * (a + L * a_scale + a_base), p.saturation * (b + L * b_scale + b_base)];
}

const P = (loa, lob, hia, hib, saturation = 1) => ({ loa, lob, hia, hib, saturation });

// ── darktable's constants ────────────────────────────────────────────────────
check("board range is DT_COLORCORRECTION_MAX (40)", M.BOARD_MAX === 40);
check("saturation range -3..3, wheel step 0.1", M.SATURATION_MIN === -3 && M.SATURATION_MAX === 3 && M.SATURATION_WHEEL_STEP === 0.1);
check("arrow nudge is COLORCORRECTION_DEFAULT_STEP (0.5)", M.NUDGE_STEP === 0.5);
check("pick radius is darktable's thrs (5 a/b units)", M.PICK_RADIUS === 5);
check("board is 8x8 cells", M.CELLS === 8);
check("defaults: no shift, saturation 1", sameParams(M.DEFAULT_PARAMS, P(0, 0, 0, 0, 1)));

// ── process() ────────────────────────────────────────────────────────────────
{
  const paramSets = [M.DEFAULT_PARAMS, ...M.PRESETS.map((p) => p.params), P(-40, 33, 12, -7, -2.5), P(3, -3, -3, 3, 0), P(40, 40, -40, -40, 3)];
  let worst = 0;
  let lMoved = false;
  for (const p of paramSets) {
    for (let L = 0; L <= 100; L += 12.5) {
      for (const a of [-60, -20, 0, 7, 45]) {
        for (const b of [-60, -20, 0, 7, 45]) {
          const want = dtProcess([L, a, b], p);
          const got = M.correctLab([L, a, b], p);
          for (let k = 0; k < 3; k++) worst = Math.max(worst, Math.abs(want[k] - got[k]));
          if (got[0] !== L) lMoved = true;
        }
      }
    }
  }
  check("correctLab is darktable's process() (shadow/highlight a,b shift over L, then saturation)", worst < 1e-12, `max diff ${worst.toExponential(1)}`);
  check("L is never touched", !lMoved);
  const id = M.correctLab([47, -13, 22], M.DEFAULT_PARAMS);
  check("defaults are a Lab identity", id[0] === 47 && id[1] === -13 && id[2] === 22);
}

// ── transfer functions (must match the host's GLSL srgbToLinear / linearToSrgb) ──
{
  check("srgbToLinear: linear segment c/12.92 below 0.04045", M.srgbToLinear(0.03) === 0.03 / 12.92);
  check("srgbToLinear: ((c+0.055)/1.055)^2.4 above", near(M.srgbToLinear(0.5), 0.214041, 1e-6));
  check("linearToSrgb: 12.92*c below 0.0031308", M.linearToSrgb(0.002) === 0.002 * 12.92);
  check("linearToSrgb clamps to [0,1]", near(M.linearToSrgb(1.5), 1, 1e-12) && M.linearToSrgb(-0.2) === 0);
  let worst = 0;
  for (let i = 0; i <= 200; i++) {
    const v = i / 200;
    worst = Math.max(worst, Math.abs(M.linearToSrgb(M.srgbToLinear(v)) - v));
  }
  check("encode(decode(v)) round-trips", worst < 1e-9, `max ${worst.toExponential(1)}`);
}

// ── Lab (D50, Bradford-adapted sRGB, like darktable's Lab profile) ───────────
{
  const g = M.srgbToLinear(0.5);
  const grey = M.labFromLinearSrgb([g, g, g]);
  check("sRGB 0.5 grey gives L ~ 53.39 (darktable's grey)", near(grey[0], 53.39, 0.02), `L=${grey[0].toFixed(3)}`);
  check("grey is neutral (a = b = 0)", Math.abs(grey[1]) < 1e-6 && Math.abs(grey[2]) < 1e-6, `a=${grey[1].toExponential(1)} b=${grey[2].toExponential(1)}`);
  const white = M.labFromLinearSrgb([1, 1, 1]);
  const black = M.labFromLinearSrgb([0, 0, 0]);
  check("white gives L 100, black L 0", near(white[0], 100, 1e-9) && near(black[0], 0, 1e-12));
  const red = M.labFromLinearSrgb([1, 0, 0]);
  const blue = M.labFromLinearSrgb([0, 0, 1]);
  const yellow = M.labFromLinearSrgb([1, 1, 0]);
  check("axes: red is +a, blue is -b, yellow is +b", red[1] > 50 && blue[2] < -50 && yellow[2] > 50);
  let worst = 0;
  let seed = 7;
  const rnd = () => ((seed = (seed * 48271) % 2147483647) / 2147483647);
  for (let i = 0; i < 500; i++) {
    const rgb = [rnd(), rnd(), rnd()];
    const back = M.linearSrgbFromLab(M.labFromLinearSrgb(rgb));
    for (let k = 0; k < 3; k++) worst = Math.max(worst, Math.abs(back[k] - rgb[k]));
  }
  check("Lab <-> linear sRGB round-trips (inverse derived from the forward matrix)", worst < 1e-9, `max ${worst.toExponential(1)}`);
}

// ── correctPixel: the whole per-pixel path the shader runs, on a display pixel ──
{
  let worst = 0;
  for (let i = 0; i <= 20; i++) {
    for (let j = 0; j <= 20; j++) {
      const c = [i / 20, j / 20, ((i + j) % 21) / 20];
      const out = M.correctPixel(c, M.DEFAULT_PARAMS);
      for (let k = 0; k < 3; k++) worst = Math.max(worst, Math.abs(out[k] - c[k]));
    }
  }
  check("defaults leave a pixel unchanged", worst < 1e-9, `max ${worst.toExponential(1)}`);
  const warm = M.correctPixel([0.5, 0.5, 0.5], M.PRESETS[0].params);
  check("warm tone on mid grey: yellower (blue drops below red/green)", warm[2] < warm[0] - 0.005 && warm[2] < warm[1] - 0.005, warm.map((v) => v.toFixed(3)).join(","));
  const split = P(-20, -15, 25, 30);
  const dark = M.correctPixel([0.15, 0.15, 0.15], split);
  const bright = M.correctPixel([0.85, 0.85, 0.85], split);
  check("split-tone: shadows take the shadow tint (-a -b: blue/green), highlights the highlight tint", dark[2] > dark[0] && bright[0] > bright[2]);
  const extreme = M.correctPixel([0.9, 0.2, 0.1], P(-40, -40, 40, 40, 3));
  check("out-of-gamut results are clipped to [0,1]", extreme.every((v) => v >= 0 && v <= 1));
  const flat = M.correctPixel([0.7, 0.3, 0.4], P(0, 0, 0, 0, 0));
  check("saturation 0 gives a neutral grey of the same L", Math.abs(flat[0] - flat[1]) < 1e-9 && Math.abs(flat[1] - flat[2]) < 1e-9 && flat[0] > 0.3 && flat[0] < 0.7);
  const pinkIn = M.labFromLinearSrgb([M.srgbToLinear(0.8), M.srgbToLinear(0.4), M.srgbToLinear(0.5)]);
  const inverted = M.correctPixel([0.8, 0.4, 0.5], P(0, 0, 0, 0, -1));
  const invLab = M.labFromLinearSrgb(inverted.map(M.srgbToLinear));
  check("saturation -1 mirrors a and b (complementary hue)", pinkIn[1] > 0 && invLab[1] < 0 && Math.sign(invLab[2]) === -Math.sign(pinkIn[2]));
}

// ── presets (init_presets, verbatim) ─────────────────────────────────────────
{
  const want = [
    ["warm-tone", "Warm tone", P(0, 0, 0, 3)],
    ["warming-filter", "Warming filter", P(3.55, 0, -0.95, 4.5)],
    ["cooling-filter", "Cooling filter", P(-3.55, -0, 0.95, -4.5)],
  ];
  check("three darktable presets", M.PRESETS.length === 3);
  want.forEach(([id, label, params], k) => {
    const p = M.PRESETS[k];
    check(`preset ${k}: ${label}`, !!p && p.id === id && p.label === label && sameParams(p.params, params) && p.params.saturation === 1, p && JSON.stringify(p.params));
  });
}

// ── board geometry (draw / motion_notify) ────────────────────────────────────
{
  check("toBoard: 0 is the centre, +-MAX the edges", M.toBoard(0, 200) === 100 && M.toBoard(40, 200) === 200 && M.toBoard(-40, 200) === 0);
  let worst = 0;
  for (const v of [-40, -12.5, 0, 3.55, 40]) worst = Math.max(worst, Math.abs(M.fromBoard(M.toBoard(v, 173), 173) - v));
  check("fromBoard inverts toBoard", worst < 1e-12, `max ${worst.toExponential(1)}`);
  check("fromBoard clamps the pointer to the board", M.fromBoard(-10, 200) === -40 && M.fromBoard(250, 200) === 40);
}

// ── picking (motion_notify without a button) ─────────────────────────────────
{
  const p = P(10, 10, -10, -10);
  check("inside 5 units of the shadow dot picks lo", M.pickDot(p, 12, 13) === "lo");
  check("inside 5 units of the highlight dot picks hi", M.pickDot(p, -8, -12) === "hi");
  check("beyond the radius picks nothing", M.pickDot(p, 16, 10) === null && M.pickDot(p, 0, 0) === null);
  check("exactly on the radius is outside (strict <)", M.pickDot(p, 15, 10) === null);
  const tie = P(0, 0, 6, 0);
  check("equidistant picks hi (darktable's <= on the highlight test)", M.pickDot(tie, 3, 0) === "hi");
  check("overlapping dots (defaults) pick hi, the one drawn on top", M.pickDot(M.DEFAULT_PARAMS, 1, 1) === "hi");
  check("the nearer dot wins when both are in range", M.pickDot(tie, 1, 0) === "lo" && M.pickDot(tie, 5, 0) === "hi");
}

// ── editing (drag / double-click / arrows / wheel) ───────────────────────────
{
  const p = P(1, 2, 3, 4, 1.5);
  check("moveDot lo", sameParams(M.moveDot(p, "lo", 5, -7), P(5, -7, 3, 4, 1.5)));
  check("moveDot hi", sameParams(M.moveDot(p, "hi", -9, 8), P(1, 2, -9, 8, 1.5)));
  check("moveDot leaves the input untouched", sameParams(p, P(1, 2, 3, 4, 1.5)));
  check("double-click on lo resets the shadow dot only", sameParams(M.resetDot(p, "lo"), P(0, 0, 3, 4, 1.5)));
  check("double-click on hi resets the highlight dot only", sameParams(M.resetDot(p, "hi"), P(1, 2, 0, 0, 1.5)));
  check("double-click on nothing resets everything, saturation included", sameParams(M.resetDot(p, null), M.DEFAULT_PARAMS));
  check("arrow nudge moves the selected dot by the step", sameParams(M.nudgeDot(p, "hi", 0.5, -0.5), P(1, 2, 3.5, 3.5, 1.5)) && sameParams(M.nudgeDot(p, "lo", -5, 0), P(-4, 2, 3, 4, 1.5)));
  check("nudge clamps to +-MAX", M.nudgeDot(P(0, 0, 39.8, -39.8), "hi", 0.5, -0.5).hia === 40 && M.nudgeDot(P(0, 0, 39.8, -39.8), "hi", 0.5, -0.5).hib === -40);
  check("wheel up raises saturation by 0.1, down lowers it", near(M.wheelSaturation(p, -100).saturation, 1.6, 1e-12) && near(M.wheelSaturation(p, 3).saturation, 1.4, 1e-12));
  check("wheel clamps to +-3", M.wheelSaturation(P(0, 0, 0, 0, 2.95), -1).saturation === 3 && M.wheelSaturation(P(0, 0, 0, 0, -2.95), 1).saturation === -3);
  check("wheel with no vertical delta changes nothing", M.wheelSaturation(p, 0).saturation === 1.5);
  let s = M.DEFAULT_PARAMS;
  for (let i = 0; i < 3; i++) s = M.wheelSaturation(s, 1);
  check("wheel steps land on hundredths (no float dust in saved edits)", s.saturation === 0.7);
}

// ── the colour board's cells (draw) ──────────────────────────────────────────
{
  const L = 53.390011;
  const lab = M.cellLab(5, 2, 0.8);
  check("cellLab is darktable's Lab(53.390011, s*L*2*(i/7-1/2), s*L*2*(j/7-1/2))", lab[0] === L && near(lab[1], 0.8 * (L * 0.05 * 40 * (5 / 7 - 0.5)), 1e-9) && near(lab[2], 0.8 * (L * 0.05 * 40 * (2 / 7 - 0.5)), 1e-9));
  let inGamut = true;
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) inGamut = inGamut && M.cellColour(i, j, 1).every((v) => v >= 0 && v <= 1);
  check("every cell colour is a valid sRGB triple (clipped)", inGamut);
  const g = M.cellColour(3, 4, 0);
  check("saturation 0 gives mid-grey cells", Math.abs(g[0] - g[1]) < 1e-9 && Math.abs(g[1] - g[2]) < 1e-9 && near(g[0], 0.5, 0.002), g.map((v) => v.toFixed(4)).join(","));
  check("a runs left (green) to right (red)", M.cellColour(7, 3, 1)[0] > M.cellColour(0, 3, 1)[0] && M.cellColour(7, 3, 1)[1] < M.cellColour(0, 3, 1)[1]);
  check("b runs bottom (blue) to top (yellow)", M.cellColour(3, 7, 1)[2] < M.cellColour(3, 0, 1)[2]);
  check("negative saturation flips the board", M.cellColour(7, 3, -1)[0] < M.cellColour(0, 3, -1)[0]);
}

// ── param bag ────────────────────────────────────────────────────────────────
{
  check("stage id", M.STAGE_ID === "colour-correction.lab");
  check("keys are qualified by the stage id", M.paramKey("hia") === "colour-correction.lab.hia");
  const p = P(-1.5, 2, 3.25, -4, 0.4);
  const patch = M.bagPatch(p);
  const keys = Object.keys(patch).sort();
  check("bagPatch writes exactly the five darktable params", keys.join() === ["hia", "hib", "loa", "lob", "saturation"].map(M.paramKey).sort().join(), keys.join());
  check("bagPatch values", patch[M.paramKey("loa")] === -1.5 && patch[M.paramKey("saturation")] === 0.4);
  check("readParams of an empty bag gives the defaults", sameParams(M.readParams({}), M.DEFAULT_PARAMS));
  check("readParams round-trips bagPatch", sameParams(M.readParams(patch), p));
  check("partial bags merge with defaults", sameParams(M.readParams({ [M.paramKey("hib")]: 3 }), P(0, 0, 0, 3, 1)));
  check("non-numeric or non-finite values fall back to defaults", sameParams(M.readParams({ [M.paramKey("hia")]: "3", [M.paramKey("saturation")]: NaN, [M.paramKey("lob")]: null }), M.DEFAULT_PARAMS));
  check("foreign keys are ignored", sameParams(M.readParams({ "other.stage.hia": 9 }), M.DEFAULT_PARAMS));
}

console.log(fails ? `\n${fails} FAILURE(S)` : "\nALL MODEL CHECKS PASS");
process.exit(fails ? 1 : 0);
