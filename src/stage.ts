// The GPU side: darktable's colour correction as one inline fragment in the
// host's display-adjust phase — the point in SafeLight's pipeline that matches
// darktable's Lab section (display-referred, after the tone transform, before
// vignette and grain). There is no prepass; the correction is per pixel.
//
// The display colour `c` arrives sRGB-encoded. The stage declares the display's
// own space, so on process version 2 the host hands it unclipped and the branch
// clips it to [0, 1] itself, then decodes it with the host's transfer function,
// takes it to D50 Lab through the Bradford-adapted sRGB matrices (darktable's
// Lab is D50), corrects it, and encodes it back, which clips anything the shift
// pushed out of gamut. The matrices, white point and CIE constants are
// formatted from the model's numbers, so the shader and the CPU reference
// cannot drift apart. At the defaults the branch is not taken and the stage is
// a bit-exact no-op, values outside [0, 1] included.

import type { ProcessingStageContribution, UniformDeclaration } from "./safelight";
import {
  BOARD_MAX,
  D50_WHITE,
  DEFAULT_PARAMS,
  LAB_EPSILON,
  LAB_KAPPA,
  PARAM_KEYS,
  SATURATION_MAX,
  SATURATION_MIN,
  SRGB_TO_XYZ_D50,
  STAGE_ID,
  XYZ_D50_TO_SRGB,
  type ParamKey,
} from "./model";

/** A GLSL float literal at full single precision, always with a decimal point
 *  (GLSL ES never promotes an integer literal to float). */
export function glslLiteral(v: number): string {
  const s = v.toPrecision(10);
  return s.includes("e") ? v.toFixed(12) : s;
}

/** A row-major 3×3 as a GLSL mat3 constructor (column-major arguments). */
function glslMat3(rowMajor: readonly number[]): string {
  const cols = [0, 3, 6, 1, 4, 7, 2, 5, 8].map((i) => glslLiteral(rowMajor[i]));
  return `mat3(${cols.join(", ")})`;
}

const EPS = glslLiteral(LAB_EPSILON);
const KAPPA = glslLiteral(LAB_KAPPA);
const WHITE = `vec3(${D50_WHITE.map(glslLiteral).join(", ")})`;

const HELPERS = `
float ccF(float t) {
  return t > ${EPS} ? pow(t, 1.0 / 3.0) : (${KAPPA} * t + 16.0) / 116.0;
}
vec3 ccLab(vec3 rgb) {
  const mat3 toXyz = ${glslMat3(SRGB_TO_XYZ_D50)};
  vec3 r = (toXyz * rgb) / ${WHITE};
  vec3 f = vec3(ccF(r.x), ccF(r.y), ccF(r.z));
  return vec3(116.0 * f.y - 16.0, 500.0 * (f.x - f.y), 200.0 * (f.y - f.z));
}
vec3 ccRgb(vec3 lab) {
  const mat3 toRgb = ${glslMat3(XYZ_D50_TO_SRGB)};
  float fy = (lab.x + 16.0) / 116.0;
  float fx = lab.y / 500.0 + fy;
  float fz = fy - lab.z / 200.0;
  float fx3 = fx * fx * fx;
  float fz3 = fz * fz * fz;
  float xr = fx3 > ${EPS} ? fx3 : (116.0 * fx - 16.0) / ${KAPPA};
  float yr = lab.x > ${KAPPA} * ${EPS} ? fy * fy * fy : lab.x / ${KAPPA};
  float zr = fz3 > ${EPS} ? fz3 : (116.0 * fz - 16.0) / ${KAPPA};
  return toRgb * (vec3(xr, yr, zr) * ${WHITE});
}
`;

// darktable's process(): a' = s·(a + L·(hia−loa)/100 + loa), same for b.
const INLINE = `
{
  if (saturation != 1.0 || hia != 0.0 || hib != 0.0 || loa != 0.0 || lob != 0.0) {
    vec3 lab = ccLab(srgbToLinear(clamp(c, 0.0, 1.0)));
    lab.y = saturation * (lab.y + lab.x * (hia - loa) * 0.01 + loa);
    lab.z = saturation * (lab.z + lab.x * (hib - lob) * 0.01 + lob);
    c = linearToSrgb(ccRgb(lab));
  }
}
`;

const LABELS: Record<ParamKey, string> = {
  hia: "highlight a",
  hib: "highlight b",
  loa: "shadow a",
  lob: "shadow b",
  saturation: "saturation",
};

const UNIFORMS: UniformDeclaration[] = PARAM_KEYS.map((key) => ({
  key,
  glslType: "float",
  default: DEFAULT_PARAMS[key],
  range:
    key === "saturation"
      ? { min: SATURATION_MIN, max: SATURATION_MAX, step: 0.01 }
      : { min: -BOARD_MAX, max: BOARD_MAX, step: 0.5 },
  label: LABELS[key],
}));

export function colourCorrectionStage(): ProcessingStageContribution {
  return {
    id: STAGE_ID,
    name: "Colour Correction",
    phase: "display-adjust",
    space: { encoding: "perceptual" },
    glsl: INLINE,
    helpers: HELPERS,
    uniforms: UNIFORMS,
  };
}
