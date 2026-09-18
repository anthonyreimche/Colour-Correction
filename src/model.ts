// The data model and maths of darktable's colour correction module,
// reimplemented. darktable's `colorcorrection` IOP (GPL-3.0) works in Lab on
// the display-referred image: it leaves L alone and shifts a and b by a shadow
// tint at L = 0 and a highlight tint at L = 100, linearly in between, then
// scales both by a global saturation. Its GUI is an a/b "colour board" with a
// dark dot for the shadow tint and a light dot for the highlight tint. The
// parameters, ranges, presets, board mapping and picking rules here are the
// C's, so the tool feels the way darktable users know it.
//
// Reference: darktable src/iop/colorcorrection.c.

export interface Params {
  /** Shadow tint (a, b at L = 0). */
  loa: number;
  lob: number;
  /** Highlight tint (a, b at L = 100). */
  hia: number;
  hib: number;
  saturation: number;
}

export const DEFAULT_PARAMS: Readonly<Params> = Object.freeze({
  loa: 0,
  lob: 0,
  hia: 0,
  hib: 0,
  saturation: 1,
});

/** DT_COLORCORRECTION_MAX: the board spans ±40 in a and b. */
export const BOARD_MAX = 40;
export const SATURATION_MIN = -3;
export const SATURATION_MAX = 3;
/** One wheel notch over the board. */
export const SATURATION_WHEEL_STEP = 0.1;
/** COLORCORRECTION_DEFAULT_STEP: one arrow key on the selected dot. */
export const NUDGE_STEP = 0.5;
/** darktable's hover threshold, in a/b units. */
export const PICK_RADIUS = 5;
export const CELLS = 8;

export type Dot = "lo" | "hi";
export type Vec3 = readonly [number, number, number];

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

// ── process() ────────────────────────────────────────────────────────────────

/** commit_params + process: a' = s·(a + L·(hia−loa)/100 + loa), same for b. */
export function correctLab(lab: Vec3, p: Params): Vec3 {
  const [L, a, b] = lab;
  const aScale = (p.hia - p.loa) / 100;
  const bScale = (p.hib - p.lob) / 100;
  return [L, p.saturation * (a + L * aScale + p.loa), p.saturation * (b + L * bScale + p.lob)];
}

// ── colour plumbing ──────────────────────────────────────────────────────────
//
// The transfer functions are the host shader's srgbToLinear / linearToSrgb,
// threshold semantics included. Lab is D50 like darktable's, reached from
// linear sRGB through the Bradford-adapted matrix; the inverse is computed from
// it so the round trip is exact rather than a second rounded table.

export function srgbToLinear(v: number): number {
  return v < 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

export function linearToSrgb(v: number): number {
  const c = clamp(v, 0, 1);
  return c < 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

export const D50_WHITE: Vec3 = [0.96422, 1.0, 0.82521];

/** Linear sRGB → XYZ (D50), row-major. */
export const SRGB_TO_XYZ_D50: readonly number[] = [
  0.4360747, 0.3850649, 0.1430804,
  0.2225045, 0.7168786, 0.0606169,
  0.0139322, 0.0971045, 0.7141733,
];

function invert3(m: readonly number[]): number[] {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  return [
    A / det, -(b * i - c * h) / det, (b * f - c * e) / det,
    B / det, (a * i - c * g) / det, -(a * f - c * d) / det,
    C / det, -(a * h - b * g) / det, (a * e - b * d) / det,
  ];
}

/** XYZ (D50) → linear sRGB, row-major: the exact inverse of SRGB_TO_XYZ_D50. */
export const XYZ_D50_TO_SRGB: readonly number[] = invert3(SRGB_TO_XYZ_D50);

/** CIE Lab constants (216/24389 and 24389/27). */
export const LAB_EPSILON = 216 / 24389;
export const LAB_KAPPA = 24389 / 27;

function mul3(m: readonly number[], v: Vec3): Vec3 {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];
}

const labF = (t: number): number => (t > LAB_EPSILON ? Math.cbrt(t) : (LAB_KAPPA * t + 16) / 116);

export function labFromLinearSrgb(rgb: Vec3): Vec3 {
  const xyz = mul3(SRGB_TO_XYZ_D50, rgb);
  const fx = labF(xyz[0] / D50_WHITE[0]);
  const fy = labF(xyz[1] / D50_WHITE[1]);
  const fz = labF(xyz[2] / D50_WHITE[2]);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function linearSrgbFromLab(lab: Vec3): Vec3 {
  const [L, a, b] = lab;
  const fy = (L + 16) / 116;
  const fx = a / 500 + fy;
  const fz = fy - b / 200;
  const fx3 = fx * fx * fx;
  const fz3 = fz * fz * fz;
  const xr = fx3 > LAB_EPSILON ? fx3 : (116 * fx - 16) / LAB_KAPPA;
  const yr = L > LAB_KAPPA * LAB_EPSILON ? fy * fy * fy : L / LAB_KAPPA;
  const zr = fz3 > LAB_EPSILON ? fz3 : (116 * fz - 16) / LAB_KAPPA;
  return mul3(XYZ_D50_TO_SRGB, [xr * D50_WHITE[0], yr * D50_WHITE[1], zr * D50_WHITE[2]]);
}

/** The whole per-pixel path the shader runs, on a display-encoded pixel:
 *  decode, Lab, darktable's correction, back, encode (clipping to gamut). */
export function correctPixel(c: Vec3, p: Params): Vec3 {
  const lin: Vec3 = [
    srgbToLinear(clamp(c[0], 0, 1)),
    srgbToLinear(clamp(c[1], 0, 1)),
    srgbToLinear(clamp(c[2], 0, 1)),
  ];
  const rgb = linearSrgbFromLab(correctLab(labFromLinearSrgb(lin), p));
  return [linearToSrgb(rgb[0]), linearToSrgb(rgb[1]), linearToSrgb(rgb[2])];
}

// ── presets (init_presets) ───────────────────────────────────────────────────

export interface Preset {
  id: string;
  label: string;
  params: Readonly<Params>;
}

export const PRESETS: readonly Preset[] = [
  { id: "warm-tone", label: "Warm tone", params: { loa: 0, lob: 0, hia: 0, hib: 3, saturation: 1 } },
  { id: "warming-filter", label: "Warming filter", params: { loa: 3.55, lob: 0, hia: -0.95, hib: 4.5, saturation: 1 } },
  { id: "cooling-filter", label: "Cooling filter", params: { loa: -3.55, lob: 0, hia: 0.95, hib: -4.5, saturation: 1 } },
];

// ── the colour board (draw / motion_notify / button_press / scrolled / key) ──

/** a or b → position along a board edge of `size` px (0 = −MAX, size = +MAX). */
export function toBoard(v: number, size: number): number {
  return 0.5 * (size + (size * v) / BOARD_MAX);
}

/** Board position → a or b, the pointer clamped to the board first. */
export function fromBoard(px: number, size: number): number {
  const m = clamp(px, 0, size);
  return ((2 * m - size) * BOARD_MAX) / size;
}

/** The dot under the pointer: within PICK_RADIUS, the nearer one; on a tie
 *  the highlight dot, which is drawn on top (darktable's `<=`). */
export function pickDot(p: Params, a: number, b: number): Dot | null {
  const r2 = PICK_RADIUS * PICK_RADIUS;
  const dLo = (p.loa - a) * (p.loa - a) + (p.lob - b) * (p.lob - b);
  const dHi = (p.hia - a) * (p.hia - a) + (p.hib - b) * (p.hib - b);
  if (dLo < r2 && dLo < dHi) return "lo";
  if (dHi < r2 && dHi <= dLo) return "hi";
  return null;
}

export function moveDot(p: Params, dot: Dot, a: number, b: number): Params {
  return dot === "lo" ? { ...p, loa: a, lob: b } : { ...p, hia: a, hib: b };
}

/** Double-click: the selected dot back to neutral, or everything when none. */
export function resetDot(p: Params, dot: Dot | null): Params {
  if (dot === "lo") return { ...p, loa: 0, lob: 0 };
  if (dot === "hi") return { ...p, hia: 0, hib: 0 };
  return { ...DEFAULT_PARAMS };
}

export function nudgeDot(p: Params, dot: Dot, da: number, db: number): Params {
  const a = clamp((dot === "lo" ? p.loa : p.hia) + da, -BOARD_MAX, BOARD_MAX);
  const b = clamp((dot === "lo" ? p.lob : p.hib) + db, -BOARD_MAX, BOARD_MAX);
  return moveDot(p, dot, a, b);
}

/** Wheel over the board: one notch is ±0.1 of saturation (up raises it),
 *  kept on hundredths so saved edits carry no float dust. */
export function wheelSaturation(p: Params, deltaY: number): Params {
  if (deltaY === 0) return p;
  const next = p.saturation - SATURATION_WHEEL_STEP * Math.sign(deltaY);
  return { ...p, saturation: clamp(Math.round(next * 100) / 100, SATURATION_MIN, SATURATION_MAX) };
}

/** darktable's board grey: sRGB 0.5 in Lab. */
const BOARD_GREY_L = 53.390011;

/** Cell (i → a, j → b, both 0..CELLS−1): darktable's
 *  Lab(53.39, s·L·0.05·MAX·(i/7 − ½), s·L·0.05·MAX·(j/7 − ½)). */
export function cellLab(i: number, j: number, saturation: number): Vec3 {
  const L = BOARD_GREY_L;
  const spread = L * 0.05 * BOARD_MAX;
  return [L, saturation * (spread * (i / (CELLS - 1) - 0.5)), saturation * (spread * (j / (CELLS - 1) - 0.5))];
}

/** A cell's sRGB colour, clipped to gamut the way lcms clips the board. */
export function cellColour(i: number, j: number, saturation: number): Vec3 {
  const rgb = linearSrgbFromLab(cellLab(i, j, saturation));
  return [linearToSrgb(rgb[0]), linearToSrgb(rgb[1]), linearToSrgb(rgb[2])];
}

// ── param bag ────────────────────────────────────────────────────────────────
//
// The five params live in the develop store's param bag under the stage's
// qualified keys; they are the GPU uniforms directly, so there is nothing to
// derive. Missing or foreign values read as darktable's defaults.

export const BASE_ID = "colour-correction";
export const STAGE_ID = `${BASE_ID}.lab`;

export type ParamKey = keyof Params;
/** darktable's struct order. */
export const PARAM_KEYS: readonly ParamKey[] = ["hia", "hib", "loa", "lob", "saturation"];

export const paramKey = (k: ParamKey): string => `${STAGE_ID}.${k}`;

export function bagPatch(p: Params): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of PARAM_KEYS) out[paramKey(k)] = p[k];
  return out;
}

/** `bag` is the host's untyped per-photo bag (any extension writes to it). */
export function readParams(bag: Record<string, unknown>): Params {
  const out: Params = { ...DEFAULT_PARAMS };
  for (const k of PARAM_KEYS) {
    const v = bag[paramKey(k)];
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  }
  return out;
}
