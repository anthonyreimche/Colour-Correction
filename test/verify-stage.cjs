// The GPU stage's contract: where it runs, which uniforms it exposes (darktable's
// five params, under their own names), that its GLSL is gated off at the
// defaults, costs no texture fetches, carries no bare-integer literals (GLSL ES
// has no int→float promotion), and takes its colour constants from the model
// so the shader and the CPU reference can never drift apart.
const path = require("path");
const M = require(path.join(__dirname, ".build", "model.js"));
const S = require(path.join(__dirname, ".build", "stage.js"));

let fails = 0;
const check = (name, ok, detail) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) fails++;
};
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const uses = (src, ident) => new RegExp(`\\b${ident}\\b`).test(src);

const stage = S.colourCorrectionStage();
const inline = strip(stage.glsl);
const helpers = strip(stage.helpers || "");
const all = `${helpers}\n${inline}`;

check("stage id is the model's", stage.id === M.STAGE_ID, stage.id);
check("named for the panel", stage.name === "Colour Correction");
check("runs display-referred, like darktable's Lab section", stage.phase === "display-adjust");
check("single inline fragment, no prepass", !stage.passes);
check(
  "declares the display's own space, so the host adds no clip outside the gate",
  JSON.stringify(stage.space) === '{"encoding":"perceptual"}',
  JSON.stringify(stage.space),
);
check("clips its own input inside the gate", /if \([^)]*\) \{\s*vec3 lab = ccLab\(srgbToLinear\(clamp\(c, 0\.0, 1\.0\)\)\)/.test(inline));

const want = [
  ["hia", 0, -40, 40],
  ["hib", 0, -40, 40],
  ["loa", 0, -40, 40],
  ["lob", 0, -40, 40],
  ["saturation", 1, -3, 3],
];
check("five float uniforms in darktable's order", stage.uniforms.map((u) => u.key).join() === want.map((w) => w[0]).join() && stage.uniforms.every((u) => u.glslType === "float"), stage.uniforms.map((u) => u.key).join());
for (const [key, def, min, max] of want) {
  const u = stage.uniforms.find((x) => x.key === key);
  check(`${key}: default ${def}, range ${min}..${max}, labelled`, !!u && u.default === def && !!u.range && u.range.min === min && u.range.max === max && typeof u.label === "string" && u.label.length > 0);
  check(`${key} drives the inline GLSL`, uses(inline, key));
}

check("gated: the branch is skipped at the defaults", /\bsaturation\s*!=\s*1\.0\b/.test(inline) && ["hia", "hib", "loa", "lob"].every((k) => new RegExp(`\\b${k}\\s*!=\\s*0\\.0\\b`).test(inline)));
check("input clamped before decoding (pow on negatives is NaN)", /clamp\(\s*c\s*,\s*0\.0\s*,\s*1\.0\s*\)/.test(inline));
check("decodes with the host's srgbToLinear and re-encodes with linearToSrgb", uses(inline, "srgbToLinear") && uses(inline, "linearToSrgb"));

// Helper names the host will namespace — every one defined must be used, and
// nothing the inline calls beyond host builtins may be undefined.
const defined = [];
const re = /\b(?:float|vec[234]|mat[234]|int|uint|void|bool|[iub]vec[234])\s+([a-zA-Z_]\w*)\s*\(/g;
let m;
while ((m = re.exec(helpers)) !== null) defined.push(m[1]);
check("helpers define the Lab conversions", defined.length >= 2, defined.join());
const callCount = (n) => (all.match(new RegExp(`\\b${n}\\s*\\(`, "g")) || []).length;
check("no dead helpers (each is called somewhere besides its definition)", defined.every((n) => callCount(n) >= 2), defined.filter((n) => callCount(n) < 2).join());
check("the inline GLSL converts through the helpers", uses(inline, "ccLab") && uses(inline, "ccRgb"));
const HOST = new Set(["srgbToLinear", "linearToSrgb", "clamp", "pow", "max", "min", "mix", "step", "vec3", "vec4", "vec2", "mat3", "sign", "abs", "if", "dot", "length", "float", "any", "notEqual", "greaterThan"]);
const called = new Set();
const callRe = /\b([a-zA-Z_]\w*)\s*\(/g;
while ((m = callRe.exec(all)) !== null) called.add(m[1]);
const unknown = [...called].filter((n) => !HOST.has(n) && !defined.includes(n));
check("no calls to undefined functions", unknown.length === 0, unknown.join());

check("zero texture fetches and no loops (constant per-pixel cost)", !/\b(texture|readPrev|texelFetch)\s*\(/.test(all) && !/\b(for|while|do)\b/.test(all));
const bareInts = all.match(/(?<![\w.])\d+(?![\w.])/g) || [];
check("every numeric literal carries a decimal point", bareInts.length === 0, bareInts.slice(0, 5).join());

// Single source of truth: the matrices and Lab constants in the GLSL are the
// model's numbers, formatted by the stage's own literal helper.
const literals = [...M.SRGB_TO_XYZ_D50, ...M.XYZ_D50_TO_SRGB, ...M.D50_WHITE, M.LAB_EPSILON, M.LAB_KAPPA].map(S.glslLiteral);
check("GLSL literals have a decimal point and full precision", literals.every((s) => /^-?\d+\.\d+$/.test(s) && s.length > 6), literals.slice(0, 3).join());
const missing = literals.filter((s) => !helpers.includes(s));
check("GLSL carries the model's D50 matrices, white point and CIE constants", missing.length === 0, missing.slice(0, 4).join());
check("inverse matrix literals are the model's exact inverse (not a rounded published copy)", M.XYZ_D50_TO_SRGB.some((v) => String(v).replace(/^-/, "").length > 12));

console.log(fails ? `\n${fails} FAILURE(S)` : "\nALL STAGE CHECKS PASS");
process.exit(fails ? 1 : 0);
