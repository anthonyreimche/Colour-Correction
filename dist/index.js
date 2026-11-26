let k = null;
function vt(t) {
  k = t;
}
function P() {
  if (!k) throw new Error("[colour-correction] api used before activate()");
  return k;
}
const _ = Object.freeze({
  loa: 0,
  lob: 0,
  hia: 0,
  hib: 0,
  saturation: 1
}), S = 40, N = -3, B = 3, wt = 0.1, Et = 0.5, K = 5, A = 8, D = (t, o, n) => t < o ? o : t > n ? n : t;
function z(t) {
  const o = D(t, 0, 1);
  return o < 31308e-7 ? o * 12.92 : 1.055 * Math.pow(o, 1 / 2.4) - 0.055;
}
const I = [0.96422, 1, 0.82521], et = [
  0.4360747,
  0.3850649,
  0.1430804,
  0.2225045,
  0.7168786,
  0.0606169,
  0.0139322,
  0.0971045,
  0.7141733
];
function Rt(t) {
  const [o, n, r, c, s, b, d, i, g] = t, h = s * g - b * i, l = -(c * g - b * d), v = c * i - s * d, u = o * h + n * l + r * v;
  return [
    h / u,
    -(n * g - r * i) / u,
    (n * b - r * s) / u,
    l / u,
    (o * g - r * d) / u,
    -(o * b - r * c) / u,
    v / u,
    -(o * i - n * d) / u,
    (o * s - n * c) / u
  ];
}
const rt = Rt(et), x = 216 / 24389, T = 24389 / 27;
function Pt(t, o) {
  return [
    t[0] * o[0] + t[1] * o[1] + t[2] * o[2],
    t[3] * o[0] + t[4] * o[1] + t[5] * o[2],
    t[6] * o[0] + t[7] * o[1] + t[8] * o[2]
  ];
}
function yt(t) {
  const [o, n, r] = t, c = (o + 16) / 116, s = n / 500 + c, b = c - r / 200, d = s * s * s, i = b * b * b, g = d > x ? d : (116 * s - 16) / T, h = o > T * x ? c * c * c : o / T, l = i > x ? i : (116 * b - 16) / T;
  return Pt(rt, [g * I[0], h * I[1], l * I[2]]);
}
const Y = [
  { id: "warm-tone", label: "Warm tone", params: { loa: 0, lob: 0, hia: 0, hib: 3, saturation: 1 } },
  { id: "warming-filter", label: "Warming filter", params: { loa: 3.55, lob: 0, hia: -0.95, hib: 4.5, saturation: 1 } },
  { id: "cooling-filter", label: "Cooling filter", params: { loa: -3.55, lob: 0, hia: 0.95, hib: -4.5, saturation: 1 } }
];
function j(t, o) {
  return 0.5 * (o + o * t / S);
}
function V(t, o) {
  return (2 * D(t, 0, o) - o) * S / o;
}
function Tt(t, o, n) {
  const r = K * K, c = (t.loa - o) * (t.loa - o) + (t.lob - n) * (t.lob - n), s = (t.hia - o) * (t.hia - o) + (t.hib - n) * (t.hib - n);
  return c < r && c < s ? "lo" : s < r && s <= c ? "hi" : null;
}
function ct(t, o, n, r) {
  return o === "lo" ? { ...t, loa: n, lob: r } : { ...t, hia: n, hib: r };
}
function At(t, o) {
  return o === "lo" ? { ...t, loa: 0, lob: 0 } : o === "hi" ? { ...t, hia: 0, hib: 0 } : { ..._ };
}
function Dt(t, o, n, r) {
  const c = D((o === "lo" ? t.loa : t.hia) + n, -S, S), s = D((o === "lo" ? t.lob : t.hib) + r, -S, S);
  return ct(t, o, c, s);
}
function _t(t, o) {
  if (o === 0) return t;
  const n = t.saturation - wt * Math.sign(o);
  return { ...t, saturation: D(Math.round(n * 100) / 100, N, B) };
}
const Lt = 53.390011;
function Ct(t, o, n) {
  const r = Lt, c = r * 0.05 * S;
  return [r, n * (c * (t / (A - 1) - 0.5)), n * (c * (o / (A - 1) - 0.5))];
}
function It(t, o, n) {
  const r = yt(Ct(t, o, n));
  return [z(r[0]), z(r[1]), z(r[2])];
}
const at = "colour-correction", H = `${at}.lab`, O = ["hia", "hib", "loa", "lob", "saturation"], U = (t) => `${H}.${t}`;
function st(t) {
  const o = {};
  for (const n of O) o[U(n)] = t[n];
  return o;
}
function Z(t) {
  const o = { ..._ };
  for (const n of O) {
    const r = t[U(n)];
    typeof r == "number" && Number.isFinite(r) && (o[n] = r);
  }
  return o;
}
function M(t) {
  const o = t.toPrecision(10);
  return o.includes("e") ? t.toFixed(12) : o;
}
function q(t) {
  return `mat3(${[0, 3, 6, 1, 4, 7, 2, 5, 8].map((n) => M(t[n])).join(", ")})`;
}
const C = M(x), y = M(T), J = `vec3(${I.map(M).join(", ")})`, xt = `
#if SL_PROCESS_VERSION >= 2
vec3 ccDecode(vec3 y) {
  vec3 a = abs(y);
  return sign(y) * mix(a / 12.92, pow((a + 0.055) / 1.055, vec3(2.4)), step(0.04045, a));
}
vec3 ccEncode(vec3 x) {
  vec3 a = abs(x);
  return sign(x) * mix(a * 12.92, 1.055 * pow(a, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, a));
}
#endif
float ccF(float t) {
  return t > ${C} ? pow(t, 1.0 / 3.0) : (${y} * t + 16.0) / 116.0;
}
vec3 ccLab(vec3 rgb) {
  const mat3 toXyz = ${q(et)};
  vec3 r = (toXyz * rgb) / ${J};
  vec3 f = vec3(ccF(r.x), ccF(r.y), ccF(r.z));
  return vec3(116.0 * f.y - 16.0, 500.0 * (f.x - f.y), 200.0 * (f.y - f.z));
}
vec3 ccRgb(vec3 lab) {
  const mat3 toRgb = ${q(rt)};
  float fy = (lab.x + 16.0) / 116.0;
  float fx = lab.y / 500.0 + fy;
  float fz = fy - lab.z / 200.0;
  float fx3 = fx * fx * fx;
  float fz3 = fz * fz * fz;
  float xr = fx3 > ${C} ? fx3 : (116.0 * fx - 16.0) / ${y};
  float yr = lab.x > ${y} * ${C} ? fy * fy * fy : lab.x / ${y};
  float zr = fz3 > ${C} ? fz3 : (116.0 * fz - 16.0) / ${y};
  return toRgb * (vec3(xr, yr, zr) * ${J});
}
`, Ot = `
{
  if (saturation != 1.0 || hia != 0.0 || hib != 0.0 || loa != 0.0 || lob != 0.0) {
#if SL_PROCESS_VERSION >= 2
    vec3 lab = ccLab(ccDecode(c));
#else
    vec3 lab = ccLab(srgbToLinear(clamp(c, 0.0, 1.0)));
#endif
    lab.y = saturation * (lab.y + lab.x * (hia - loa) * 0.01 + loa);
    lab.z = saturation * (lab.z + lab.x * (hib - lob) * 0.01 + lob);
#if SL_PROCESS_VERSION >= 2
    c = ccEncode(ccRgb(lab));
#else
    c = linearToSrgb(ccRgb(lab));
#endif
  }
}
`, Mt = {
  hia: "highlight a",
  hib: "highlight b",
  loa: "shadow a",
  lob: "shadow b",
  saturation: "saturation"
}, $t = O.map((t) => ({
  key: t,
  glslType: "float",
  default: _[t],
  range: t === "saturation" ? { min: N, max: B, step: 0.01 } : { min: -S, max: S, step: 0.5 },
  label: Mt[t]
}));
function zt() {
  return {
    id: H,
    name: "Colour Correction",
    phase: "display-adjust",
    space: { encoding: "perceptual" },
    glsl: Ot,
    helpers: xt,
    uniforms: $t,
    // A mask's copy runs at the defaults until its board moves, so the gate
    // keeps an untouched mask bit-exact too.
    mask: { maskable: !0 }
  };
}
const m = 5, Q = 3, tt = 5, kt = "rgb(153,153,153)", Nt = "rgb(26,26,26)", Bt = "rgb(230,230,230)", Ht = (t) => `rgb(${Math.round(t[0] * 255)},${Math.round(t[1] * 255)},${Math.round(t[2] * 255)})`;
function ot(t, o, n, r, c) {
  t.beginPath(), t.arc(o, n, r, 0, Math.PI * 2), t.fillStyle = c, t.fill();
}
function Ut(t, o, n, r) {
  t.clearRect(0, 0, o, o);
  const c = o - 2 * m, s = (i) => Math.round(c * i / A);
  for (let i = 0; i < A; i++) {
    const g = m + c - s(i), h = m + c - s(i + 1);
    for (let l = 0; l < A; l++) {
      const v = m + s(l), u = m + s(l + 1);
      t.fillStyle = Ht(It(l, i, n.saturation)), t.fillRect(v, h + 1, u - v - 1, g - h - 1);
    }
  }
  const b = (i) => m + j(i, c), d = (i) => m + c - j(i, c);
  t.lineWidth = 2, t.strokeStyle = kt, t.beginPath(), t.moveTo(b(n.loa), d(n.lob)), t.lineTo(b(n.hia), d(n.hib)), t.stroke(), ot(t, b(n.loa), d(n.lob), r === "lo" ? tt : Q, Nt), ot(t, b(n.hia), d(n.hib), r === "hi" ? tt : Q, Bt);
}
function Ft(t, o, n) {
  const r = n - 2 * m;
  return { a: V(t - m, r), b: V(r - (o - m), r) };
}
const Xt = "Colour Correction", Wt = 300, Gt = 3, Kt = 10, Yt = 0.1, jt = {
  ArrowUp: [0, 1],
  ArrowDown: [0, -1],
  ArrowRight: [1, 0],
  ArrowLeft: [-1, 0]
}, Vt = "drag the line for split-toning. bright means highlights, dark means shadows. use mouse wheel to change saturation.";
function nt() {
  const { createElement: t, useEffect: o, useRef: n, useState: r } = P().react, { Slider: c } = P().components, { Select: s, tokens: b } = P().ui, d = P().develop.useParamScope(), i = d.getParams(), g = Z(i), h = () => Z(d.getParams()), [l, v] = r(null), [u, it] = r(240), [lt, F] = r(!1), X = n(null), $ = n(null), L = n(null), w = n(null), E = (e) => d.setParams(st(e)), R = () => d.commit(Xt), W = () => {
    w.current !== null && window.clearTimeout(w.current), w.current = window.setTimeout(() => {
      w.current = null, R();
    }, Wt);
  };
  o(
    () => () => {
      w.current !== null && (window.clearTimeout(w.current), R());
    },
    []
  ), o(() => {
    const e = X.current;
    if (!e) return;
    const a = new ResizeObserver((f) => {
      const p = f[0].contentRect.width;
      p > 0 && it(Math.round(p));
    });
    return a.observe(e), () => a.disconnect();
  }, []), o(() => {
    const e = $.current;
    if (!e) return;
    const a = (f) => {
      f.preventDefault(), E(_t(h(), f.deltaY)), W();
    };
    return e.addEventListener("wheel", a, { passive: !1 }), () => e.removeEventListener("wheel", a);
  }, [d.maskId]), o(() => {
    const e = $.current;
    if (!e) return;
    const a = window.devicePixelRatio || 1;
    e.width = u * a, e.height = u * a;
    const f = e.getContext("2d");
    f && (f.setTransform(a, 0, 0, a, 0, 0), Ut(f, u, g, l));
  }, [i, l, u]);
  const ut = (e) => {
    const a = e.currentTarget.getBoundingClientRect(), f = a.width > 0 ? u / a.width : 1;
    return Ft((e.clientX - a.left) * f, (e.clientY - a.top) * f, u);
  }, ft = (e) => {
    const { a, b: f } = ut(e), p = L.current;
    if (p) {
      if (!l || !p.moved && Math.hypot(e.clientX - p.x, e.clientY - p.y) < Gt) return;
      p.moved = !0, E(ct(h(), l, a, f));
      return;
    }
    v(Tt(g, a, f));
  }, dt = (e) => {
    e.button === 0 && (e.currentTarget.setPointerCapture(e.pointerId), e.currentTarget.focus({ preventScroll: !0 }), L.current = { x: e.clientX, y: e.clientY, moved: !1 }, F(!0));
  }, G = () => {
    const e = L.current;
    L.current = null, F(!1), e != null && e.moved && R();
  }, bt = () => {
    E(At(h(), l)), R();
  }, ht = (e) => {
    const a = jt[e.key];
    if (!a || !l) return;
    e.preventDefault();
    const f = Et * (e.shiftKey ? Kt : e.ctrlKey ? Yt : 1);
    E(Dt(h(), l, a[0] * f, a[1] * f)), W();
  }, gt = t(
    "div",
    { ref: X, style: { width: "100%" } },
    t("canvas", {
      ref: $,
      tabIndex: 0,
      title: Vt,
      "aria-label": "Colour board: light dot tints highlights, dark dot tints shadows",
      style: {
        width: u,
        height: u,
        display: "block",
        borderRadius: 4,
        background: b.surface0,
        touchAction: "none",
        outline: "none",
        cursor: lt && l ? "grabbing" : l ? "grab" : "default"
      },
      onPointerDown: dt,
      onPointerMove: ft,
      onPointerUp: G,
      onPointerCancel: G,
      onDoubleClick: bt,
      onKeyDown: ht
    })
  ), mt = t(c, {
    label: "Saturation",
    value: g.saturation,
    min: N,
    max: B,
    step: 0.01,
    defaultValue: _.saturation,
    onChange: (e) => E({ ...h(), saturation: e }),
    onCommit: R
  }), St = t(s, {
    value: "",
    ariaLabel: "Presets",
    options: [{ value: "", label: "Presets…" }, ...Y.map((e) => ({ value: e.id, label: e.label }))],
    onChange: (e) => {
      const a = Y.find((f) => f.id === e);
      a && (E({ ...a.params }), R());
    }
  }), pt = t(
    "p",
    { style: { margin: "2px 0 0", fontSize: 10, color: b.textMuted, lineHeight: 1.35 } },
    "Drag the light dot to tint highlights and the dark dot to tint shadows · wheel sets saturation · arrows nudge the picked dot · double-click resets."
  );
  return t(
    "div",
    { style: { display: "flex", flexDirection: "column", gap: 6, padding: 8 } },
    gt,
    mt,
    St,
    pt
  );
}
const Zt = `${at}.panel`;
function qt() {
  const t = P().stores.useDevelopStore.getState();
  t.setDynParams(st(_)), t.commitEdit("Colour Correction reset");
}
function Jt(t) {
  vt(t), t.registerProcessingStage(zt()), t.registerPanel({
    id: Zt,
    title: "Colour Correction",
    component: nt,
    defaultDock: { module: "develop", direction: "right", order: 7, width: 268 },
    modules: ["develop"],
    onReset: qt,
    // The same panel edits a mask's correction in the Masking panel's Adjust tab.
    mask: { component: nt, owns: O.map(U) }
  });
}
function Qt() {
  P().unregisterProcessingStage(H);
}
export {
  Jt as activate,
  Qt as deactivate
};
//# sourceMappingURL=index.js.map
