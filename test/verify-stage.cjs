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

// The source as the host's GLSL preprocessor leaves it for a photo at
// `version`: the `#if SL_PROCESS_VERSION >= n` branches resolved and the
// directive lines gone.
const forVersion = (src, version) => {
  const taking = [];
  const out = [];
  for (const line of src.split("\n")) {
    const open = /^\s*#if SL_PROCESS_VERSION >= (\d+)\s*$/.exec(line);
    if (open) taking.push(version >= Number(open[1]));
    else if (/^\s*#else\s*$/.test(line)) taking.push(!taking.pop());
    else if (/^\s*#endif\s*$/.test(line)) taking.pop();
    else if (taking.every(Boolean)) out.push(line);
  }
  if (taking.length) throw new Error("unbalanced #if");
  return out.join("\n");
};

const stage = S.colourCorrectionStage();
const inline = strip(forVersion(stage.glsl, 2));
const helpers = strip(forVersion(stage.helpers || "", 2));
const all = `${helpers}\n${inline}`;

// Colour Correction 1.1.0's shader, which process version 1 photos keep: it
// clipped the display colour to [0, 1] and decoded and encoded it with the
// host's curves, the encode clipping again.
const V1_INLINE = `
{
  if (saturation != 1.0 || hia != 0.0 || hib != 0.0 || loa != 0.0 || lob != 0.0) {
    vec3 lab = ccLab(srgbToLinear(clamp(c, 0.0, 1.0)));
    lab.y = saturation * (lab.y + lab.x * (hia - loa) * 0.01 + loa);
    lab.z = saturation * (lab.z + lab.x * (hib - lob) * 0.01 + lob);
    c = linearToSrgb(ccRgb(lab));
  }
}
`;
check("process version 1 renders 1.1.0's clipping shader, character for character", forVersion(stage.glsl, 1) === V1_INLINE, JSON.stringify(forVersion(stage.glsl, 1)));
const v1Helpers = forVersion(stage.helpers || "", 1);
check(
  "process version 1's helpers are 1.1.0's, without the signed curves",
  v1Helpers === forVersion(stage.helpers || "", 2).replace(/\nvec3 ccDecode\([\s\S]*?\n\}\nvec3 ccEncode\([\s\S]*?\n\}/, "") && !/\bcc(Decode|Encode)\b/.test(v1Helpers),
);
check(
  "version 3 takes the version 2 path; each directive sits on its own line",
  stage.glsl.includes("#if SL_PROCESS_VERSION >= 2") &&
    [stage.glsl, stage.helpers || ""].every(
      (src) => forVersion(src, 3) === forVersion(src, 2) && src.split("\n").filter((l) => l.trim().startsWith("#")).every((l) => /^(#if SL_PROCESS_VERSION >= 2|#else|#endif)$/.test(l)),
    ),
);
const manifest = require(path.join(__dirname, "..", "safelight.json"));
check("needs Safelight 3.2.0, the first to define SL_PROCESS_VERSION", manifest.minAppVersion === "3.2.0", manifest.minAppVersion);

check("stage id is the model's", stage.id === M.STAGE_ID, stage.id);
check("named for the panel", stage.name === "Colour Correction");
check("runs display-referred, like darktable's Lab section", stage.phase === "display-adjust");
check("single inline fragment, no prepass", !stage.passes);
check(
  "declares the display's own space, so the host adds no clip outside the gate",
  JSON.stringify(stage.space) === '{"encoding":"perceptual"}',
  JSON.stringify(stage.space),
);
check(
  "runs again inside each mask that holds its keys, with that mask's values",
  JSON.stringify(stage.mask) === '{"maskable":true}',
  JSON.stringify(stage.mask),
);
check("decodes its signed input inside the gate", /if \([^)]*\) \{\s*vec3 lab = ccLab\(ccDecode\(c\)\);/.test(inline));
check("encodes its result signed, with no ceiling", /c = ccEncode\(ccRgb\(lab\)\);/.test(inline));
check("clips nothing (no clamp, min, max, saturate or the host's clipping encode)", !/\b(clamp|saturate|min|max|linearToSrgb|srgbToLinear)\s*\(/.test(all));
check(
  "the transfer curves run on |x| with the sign put back, so pow never sees a negative base",
  /vec3 ccDecode\(vec3 y\) \{\s*vec3 a = abs\(y\);\s*return sign\(y\) \* mix\(a \/ 12\.92, pow\(\(a \+ 0\.055\) \/ 1\.055, vec3\(2\.4\)\), step\(0\.04045, a\)\);/.test(helpers) &&
    /vec3 ccEncode\(vec3 x\) \{\s*vec3 a = abs\(x\);\s*return sign\(x\) \* mix\(a \* 12\.92, 1\.055 \* pow\(a, vec3\(1\.0 \/ 2\.4\)\) - 0\.055, step\(0\.0031308, a\)\);/.test(helpers),
);

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
const v1Ints = strip(forVersion(`${stage.helpers}\n${stage.glsl}`, 1)).match(/(?<![\w.])\d+(?![\w.])/g) || [];
check("every numeric literal on process version 1 carries a decimal point", v1Ints.length === 0, v1Ints.slice(0, 5).join());

// Single source of truth: the matrices and Lab constants in the GLSL are the
// model's numbers, formatted by the stage's own literal helper.
const literals = [...M.SRGB_TO_XYZ_D50, ...M.XYZ_D50_TO_SRGB, ...M.D50_WHITE, M.LAB_EPSILON, M.LAB_KAPPA].map(S.glslLiteral);
check("GLSL literals have a decimal point and full precision", literals.every((s) => /^-?\d+\.\d+$/.test(s) && s.length > 6), literals.slice(0, 3).join());
const missing = literals.filter((s) => !helpers.includes(s));
check("GLSL carries the model's D50 matrices, white point and CIE constants", missing.length === 0, missing.slice(0, 4).join());
check("inverse matrix literals are the model's exact inverse (not a rounded published copy)", M.XYZ_D50_TO_SRGB.some((v) => String(v).replace(/^-/, "").length > 12));

console.log(fails ? `\n${fails} FAILURE(S)` : "\nALL STAGE CHECKS PASS");
process.exit(fails ? 1 : 0);
