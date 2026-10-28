let k = null;
function wt(t) {
  k = t;
}
function A() {
  if (!k) throw new Error("[colour-correction] api used before activate()");
  return k;
}
const L = Object.freeze({
  loa: 0,
  lob: 0,
  hia: 0,
  hib: 0,
  saturation: 1
}), S = 40, B = -3, N = 3, Pt = 0.1, Tt = 0.5, K = 5, D = 8, v = (t, o, n) => t < o ? o : t > n ? n : t;
function z(t) {
  const o = v(t, 0, 1);
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
function yt(t) {
  const [o, n, r, a, s, h, d, i, g] = t, b = s * g - h * i, l = -(a * g - h * d), w = a * i - s * d, u = o * b + n * l + r * w;
  return [
    b / u,
    -(n * g - r * i) / u,
    (n * h - r * s) / u,
    l / u,
    (o * g - r * d) / u,
    -(o * h - r * a) / u,
    w / u,
    -(o * i - n * d) / u,
    (o * s - n * a) / u
  ];
}
const rt = yt(et), x = 216 / 24389, E = 24389 / 27;
function At(t, o) {
  return [
    t[0] * o[0] + t[1] * o[1] + t[2] * o[2],
    t[3] * o[0] + t[4] * o[1] + t[5] * o[2],
    t[6] * o[0] + t[7] * o[1] + t[8] * o[2]
  ];
}
function Rt(t) {
  const [o, n, r] = t, a = (o + 16) / 116, s = n / 500 + a, h = a - r / 200, d = s * s * s, i = h * h * h, g = d > x ? d : (116 * s - 16) / E, b = o > E * x ? a * a * a : o / E, l = i > x ? i : (116 * h - 16) / E;
  return At(rt, [g * I[0], b * I[1], l * I[2]]);
}
const Y = [
  { id: "warm-tone", label: "Warm tone", params: { loa: 0, lob: 0, hia: 0, hib: 3, saturation: 1 } },
  { id: "warming-filter", label: "Warming filter", params: { loa: 3.55, lob: 0, hia: -0.95, hib: 4.5, saturation: 1 } },
  { id: "cooling-filter", label: "Cooling filter", params: { loa: -3.55, lob: 0, hia: 0.95, hib: -4.5, saturation: 1 } }
];
function j(t, o) {
  return 0.5 * (o + o * t / S);
}
function Z(t, o) {
  return (2 * v(t, 0, o) - o) * S / o;
}
function Et(t, o, n) {
  const r = K * K, a = (t.loa - o) * (t.loa - o) + (t.lob - n) * (t.lob - n), s = (t.hia - o) * (t.hia - o) + (t.hib - n) * (t.hib - n);
  return a < r && a < s ? "lo" : s < r && s <= a ? "hi" : null;
}
function at(t, o, n, r) {
  return o === "lo" ? { ...t, loa: n, lob: r } : { ...t, hia: n, hib: r };
}
function Dt(t, o) {
  return o === "lo" ? { ...t, loa: 0, lob: 0 } : o === "hi" ? { ...t, hia: 0, hib: 0 } : { ...L };
}
function vt(t, o, n, r) {
  const a = v((o === "lo" ? t.loa : t.hia) + n, -S, S), s = v((o === "lo" ? t.lob : t.hib) + r, -S, S);
  return at(t, o, a, s);
}
function Lt(t, o) {
  if (o === 0) return t;
  const n = t.saturation - Pt * Math.sign(o);
  return { ...t, saturation: v(Math.round(n * 100) / 100, B, N) };
}
const _t = 53.390011;
function Ct(t, o, n) {
  const r = _t, a = r * 0.05 * S;
  return [r, n * (a * (t / (D - 1) - 0.5)), n * (a * (o / (D - 1) - 0.5))];
}
function It(t, o, n) {
  const r = Rt(Ct(t, o, n));
  return [z(r[0]), z(r[1]), z(r[2])];
}
const ct = "colour-correction", H = `${ct}.lab`, M = ["hia", "hib", "loa", "lob", "saturation"], U = (t) => `${H}.${t}`;
function st(t) {
  const o = {};
  for (const n of M) o[U(n)] = t[n];
  return o;
}
function V(t) {
  const o = { ...L };
  for (const n of M) {
    const r = t[U(n)];
    typeof r == "number" && Number.isFinite(r) && (o[n] = r);
  }
  return o;
}
function O(t) {
  const o = t.toPrecision(10);
  return o.includes("e") ? t.toFixed(12) : o;
}
function q(t) {
  return `mat3(${[0, 3, 6, 1, 4, 7, 2, 5, 8].map((n) => O(t[n])).join(", ")})`;
}
const C = O(x), R = O(E), J = `vec3(${I.map(O).join(", ")})`, xt = `
float ccF(float t) {
  return t > ${C} ? pow(t, 1.0 / 3.0) : (${R} * t + 16.0) / 116.0;
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
  float xr = fx3 > ${C} ? fx3 : (116.0 * fx - 16.0) / ${R};
  float yr = lab.x > ${R} * ${C} ? fy * fy * fy : lab.x / ${R};
  float zr = fz3 > ${C} ? fz3 : (116.0 * fz - 16.0) / ${R};
  return toRgb * (vec3(xr, yr, zr) * ${J});
}
`, Mt = `
{
  if (saturation != 1.0 || hia != 0.0 || hib != 0.0 || loa != 0.0 || lob != 0.0) {
    vec3 lab = ccLab(srgbToLinear(clamp(c, 0.0, 1.0)));
    lab.y = saturation * (lab.y + lab.x * (hia - loa) * 0.01 + loa);
    lab.z = saturation * (lab.z + lab.x * (hib - lob) * 0.01 + lob);
    c = linearToSrgb(ccRgb(lab));
  }
}
`, Ot = {
  hia: "highlight a",
  hib: "highlight b",
  loa: "shadow a",
  lob: "shadow b",
  saturation: "saturation"
}, $t = M.map((t) => ({
  key: t,
  glslType: "float",
  default: L[t],
  range: t === "saturation" ? { min: B, max: N, step: 0.01 } : { min: -S, max: S, step: 0.5 },
  label: Ot[t]
}));
function zt() {
  return {
    id: H,
    name: "Colour Correction",
    phase: "display-adjust",
    space: { encoding: "perceptual" },
    glsl: Mt,
    helpers: xt,
    uniforms: $t,
    // A mask's copy runs at the defaults until its board moves, so the gate
    // keeps an untouched mask bit-exact too.
    mask: { maskable: !0 }
  };
}
const m = 5, Q = 3, tt = 5, kt = "rgb(153,153,153)", Bt = "rgb(26,26,26)", Nt = "rgb(230,230,230)", Ht = (t) => `rgb(${Math.round(t[0] * 255)},${Math.round(t[1] * 255)},${Math.round(t[2] * 255)})`;
function ot(t, o, n, r, a) {
  t.beginPath(), t.arc(o, n, r, 0, Math.PI * 2), t.fillStyle = a, t.fill();
}
function Ut(t, o, n, r) {
  t.clearRect(0, 0, o, o);
  const a = o - 2 * m, s = (i) => Math.round(a * i / D);
  for (let i = 0; i < D; i++) {
    const g = m + a - s(i), b = m + a - s(i + 1);
    for (let l = 0; l < D; l++) {
      const w = m + s(l), u = m + s(l + 1);
      t.fillStyle = Ht(It(l, i, n.saturation)), t.fillRect(w, b + 1, u - w - 1, g - b - 1);
    }
  }
  const h = (i) => m + j(i, a), d = (i) => m + a - j(i, a);
  t.lineWidth = 2, t.strokeStyle = kt, t.beginPath(), t.moveTo(h(n.loa), d(n.lob)), t.lineTo(h(n.hia), d(n.hib)), t.stroke(), ot(t, h(n.loa), d(n.lob), r === "lo" ? tt : Q, Bt), ot(t, h(n.hia), d(n.hib), r === "hi" ? tt : Q, Nt);
}
function Ft(t, o, n) {
  const r = n - 2 * m;
  return { a: Z(t - m, r), b: Z(r - (o - m), r) };
}
const Xt = "Colour Correction", Wt = 300, Gt = 3, Kt = 10, Yt = 0.1, jt = {
  ArrowUp: [0, 1],
  ArrowDown: [0, -1],
  ArrowRight: [1, 0],
  ArrowLeft: [-1, 0]
}, Zt = "drag the line for split-toning. bright means highlights, dark means shadows. use mouse wheel to change saturation.";
function nt() {
  const { createElement: t, useEffect: o, useRef: n, useState: r } = A().react, { Slider: a } = A().components, { Select: s, tokens: h } = A().ui, d = A().develop.useParamScope(), i = d.getParams(), g = V(i), b = () => V(d.getParams()), [l, w] = r(null), [u, it] = r(240), [lt, F] = r(!1), X = n(null), $ = n(null), _ = n(null), P = n(null), T = (e) => d.setParams(st(e)), y = () => d.commit(Xt), W = () => {
    P.current !== null && window.clearTimeout(P.current), P.current = window.setTimeout(() => {
      P.current = null, y();
    }, Wt);
  };
  o(
    () => () => {
      P.current !== null && (window.clearTimeout(P.current), y());
    },
    []
  ), o(() => {
    const e = X.current;
    if (!e) return;
    const c = new ResizeObserver((f) => {
      const p = f[0].contentRect.width;
      p > 0 && it(Math.round(p));
    });
    return c.observe(e), () => c.disconnect();
  }, []), o(() => {
    const e = $.current;
    if (!e) return;
    const c = (f) => {
      f.preventDefault(), T(Lt(b(), f.deltaY)), W();
    };
    return e.addEventListener("wheel", c, { passive: !1 }), () => e.removeEventListener("wheel", c);
  }, [d.maskId]), o(() => {
    const e = $.current;
    if (!e) return;
    const c = window.devicePixelRatio || 1;
    e.width = u * c, e.height = u * c;
    const f = e.getContext("2d");
    f && (f.setTransform(c, 0, 0, c, 0, 0), Ut(f, u, g, l));
  }, [i, l, u]);
  const ut = (e) => {
    const c = e.currentTarget.getBoundingClientRect(), f = c.width > 0 ? u / c.width : 1;
    return Ft((e.clientX - c.left) * f, (e.clientY - c.top) * f, u);
  }, ft = (e) => {
    const { a: c, b: f } = ut(e), p = _.current;
    if (p) {
      if (!l || !p.moved && Math.hypot(e.clientX - p.x, e.clientY - p.y) < Gt) return;
      p.moved = !0, T(at(b(), l, c, f));
      return;
    }
    w(Et(g, c, f));
  }, dt = (e) => {
    e.button === 0 && (e.currentTarget.setPointerCapture(e.pointerId), e.currentTarget.focus({ preventScroll: !0 }), _.current = { x: e.clientX, y: e.clientY, moved: !1 }, F(!0));
  }, G = () => {
    const e = _.current;
    _.current = null, F(!1), e != null && e.moved && y();
  }, ht = () => {
    T(Dt(b(), l)), y();
  }, bt = (e) => {
    const c = jt[e.key];
    if (!c || !l) return;
    e.preventDefault();
    const f = Tt * (e.shiftKey ? Kt : e.ctrlKey ? Yt : 1);
    T(vt(b(), l, c[0] * f, c[1] * f)), W();
  }, gt = t(
    "div",
    { ref: X, style: { width: "100%" } },
    t("canvas", {
      ref: $,
      tabIndex: 0,
      title: Zt,
      "aria-label": "Colour board: light dot tints highlights, dark dot tints shadows",
      style: {
        width: u,
        height: u,
        display: "block",
        borderRadius: 4,
        background: h.surface0,
        touchAction: "none",
        outline: "none",
        cursor: lt && l ? "grabbing" : l ? "grab" : "default"
      },
      onPointerDown: dt,
      onPointerMove: ft,
      onPointerUp: G,
      onPointerCancel: G,
      onDoubleClick: ht,
      onKeyDown: bt
    })
  ), mt = t(a, {
    label: "Saturation",
    value: g.saturation,
    min: B,
    max: N,
    step: 0.01,
    defaultValue: L.saturation,
    onChange: (e) => T({ ...b(), saturation: e }),
    onCommit: y
  }), St = t(s, {
    value: "",
    ariaLabel: "Presets",
    options: [{ value: "", label: "Presets…" }, ...Y.map((e) => ({ value: e.id, label: e.label }))],
    onChange: (e) => {
      const c = Y.find((f) => f.id === e);
      c && (T({ ...c.params }), y());
    }
  }), pt = t(
    "p",
    { style: { margin: "2px 0 0", fontSize: 10, color: h.textMuted, lineHeight: 1.35 } },
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
const Vt = `${ct}.panel`;
function qt() {
  const t = A().stores.useDevelopStore.getState();
  t.setDynParams(st(L)), t.commitEdit("Colour Correction reset");
}
function Jt(t) {
  wt(t), t.registerProcessingStage(zt()), t.registerPanel({
    id: Vt,
    title: "Colour Correction",
    component: nt,
    defaultDock: { module: "develop", direction: "right", order: 7, width: 268 },
    onReset: qt,
    // The same panel edits a mask's correction in the Masking panel's Adjust tab.
    mask: { component: nt, owns: M.map(U) }
  });
}
function Qt() {
  A().unregisterProcessingStage(H);
}
export {
  Jt as activate,
  Qt as deactivate
};
//# sourceMappingURL=index.js.map
