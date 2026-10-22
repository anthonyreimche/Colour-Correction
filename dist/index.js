let B = null;
function yt(t) {
  B = t;
}
function E() {
  if (!B) throw new Error("[colour-correction] api used before activate()");
  return B;
}
const _ = Object.freeze({
  loa: 0,
  lob: 0,
  hia: 0,
  hib: 0,
  saturation: 1
}), p = 40, N = -3, k = 3, Tt = 0.1, At = 0.5, K = 5, v = 8, L = (t, o, n) => t < o ? o : t > n ? n : t;
function z(t) {
  const o = L(t, 0, 1);
  return o < 31308e-7 ? o * 12.92 : 1.055 * Math.pow(o, 1 / 2.4) - 0.055;
}
const x = [0.96422, 1, 0.82521], nt = [
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
function Dt(t) {
  const [o, n, r, a, i, f, d, s, g] = t, S = i * g - f * s, h = -(a * g - f * d), b = a * s - i * d, l = o * S + n * h + r * b;
  return [
    S / l,
    -(n * g - r * s) / l,
    (n * f - r * i) / l,
    h / l,
    (o * g - r * d) / l,
    -(o * f - r * a) / l,
    b / l,
    -(o * s - n * d) / l,
    (o * i - n * a) / l
  ];
}
const et = Dt(nt), M = 216 / 24389, R = 24389 / 27;
function Et(t, o) {
  return [
    t[0] * o[0] + t[1] * o[1] + t[2] * o[2],
    t[3] * o[0] + t[4] * o[1] + t[5] * o[2],
    t[6] * o[0] + t[7] * o[1] + t[8] * o[2]
  ];
}
function Pt(t) {
  const [o, n, r] = t, a = (o + 16) / 116, i = n / 500 + a, f = a - r / 200, d = i * i * i, s = f * f * f, g = d > M ? d : (116 * i - 16) / R, S = o > R * M ? a * a * a : o / R, h = s > M ? s : (116 * f - 16) / R;
  return Et(et, [g * x[0], S * x[1], h * x[2]]);
}
const Y = [
  { id: "warm-tone", label: "Warm tone", params: { loa: 0, lob: 0, hia: 0, hib: 3, saturation: 1 } },
  { id: "warming-filter", label: "Warming filter", params: { loa: 3.55, lob: 0, hia: -0.95, hib: 4.5, saturation: 1 } },
  { id: "cooling-filter", label: "Cooling filter", params: { loa: -3.55, lob: 0, hia: 0.95, hib: -4.5, saturation: 1 } }
];
function j(t, o) {
  return 0.5 * (o + o * t / p);
}
function Z(t, o) {
  return (2 * L(t, 0, o) - o) * p / o;
}
function Rt(t, o, n) {
  const r = K * K, a = (t.loa - o) * (t.loa - o) + (t.lob - n) * (t.lob - n), i = (t.hia - o) * (t.hia - o) + (t.hib - n) * (t.hib - n);
  return a < r && a < i ? "lo" : i < r && i <= a ? "hi" : null;
}
function rt(t, o, n, r) {
  return o === "lo" ? { ...t, loa: n, lob: r } : { ...t, hia: n, hib: r };
}
function vt(t, o) {
  return o === "lo" ? { ...t, loa: 0, lob: 0 } : o === "hi" ? { ...t, hia: 0, hib: 0 } : { ..._ };
}
function Lt(t, o, n, r) {
  const a = L((o === "lo" ? t.loa : t.hia) + n, -p, p), i = L((o === "lo" ? t.lob : t.hib) + r, -p, p);
  return rt(t, o, a, i);
}
function _t(t, o) {
  if (o === 0) return t;
  const n = t.saturation - Tt * Math.sign(o);
  return { ...t, saturation: L(Math.round(n * 100) / 100, N, k) };
}
const Ct = 53.390011;
function It(t, o, n) {
  const r = Ct, a = r * 0.05 * p;
  return [r, n * (a * (t / (v - 1) - 0.5)), n * (a * (o / (v - 1) - 0.5))];
}
function xt(t, o, n) {
  const r = Pt(It(t, o, n));
  return [z(r[0]), z(r[1]), z(r[2])];
}
const at = "colour-correction", H = `${at}.lab`, U = ["hia", "hib", "loa", "lob", "saturation"], ct = (t) => `${H}.${t}`;
function it(t) {
  const o = {};
  for (const n of U) o[ct(n)] = t[n];
  return o;
}
function V(t) {
  const o = { ..._ };
  for (const n of U) {
    const r = t[ct(n)];
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
const I = O(M), P = O(R), J = `vec3(${x.map(O).join(", ")})`, Mt = `
float ccF(float t) {
  return t > ${I} ? pow(t, 1.0 / 3.0) : (${P} * t + 16.0) / 116.0;
}
vec3 ccLab(vec3 rgb) {
  const mat3 toXyz = ${q(nt)};
  vec3 r = (toXyz * rgb) / ${J};
  vec3 f = vec3(ccF(r.x), ccF(r.y), ccF(r.z));
  return vec3(116.0 * f.y - 16.0, 500.0 * (f.x - f.y), 200.0 * (f.y - f.z));
}
vec3 ccRgb(vec3 lab) {
  const mat3 toRgb = ${q(et)};
  float fy = (lab.x + 16.0) / 116.0;
  float fx = lab.y / 500.0 + fy;
  float fz = fy - lab.z / 200.0;
  float fx3 = fx * fx * fx;
  float fz3 = fz * fz * fz;
  float xr = fx3 > ${I} ? fx3 : (116.0 * fx - 16.0) / ${P};
  float yr = lab.x > ${P} * ${I} ? fy * fy * fy : lab.x / ${P};
  float zr = fz3 > ${I} ? fz3 : (116.0 * fz - 16.0) / ${P};
  return toRgb * (vec3(xr, yr, zr) * ${J});
}
`, Ot = `
{
  if (saturation != 1.0 || hia != 0.0 || hib != 0.0 || loa != 0.0 || lob != 0.0) {
    vec3 lab = ccLab(srgbToLinear(clamp(c, 0.0, 1.0)));
    lab.y = saturation * (lab.y + lab.x * (hia - loa) * 0.01 + loa);
    lab.z = saturation * (lab.z + lab.x * (hib - lob) * 0.01 + lob);
    c = linearToSrgb(ccRgb(lab));
  }
}
`, $t = {
  hia: "highlight a",
  hib: "highlight b",
  loa: "shadow a",
  lob: "shadow b",
  saturation: "saturation"
}, zt = U.map((t) => ({
  key: t,
  glslType: "float",
  default: _[t],
  range: t === "saturation" ? { min: N, max: k, step: 0.01 } : { min: -p, max: p, step: 0.5 },
  label: $t[t]
}));
function Bt() {
  return {
    id: H,
    name: "Colour Correction",
    phase: "display-adjust",
    space: { encoding: "perceptual" },
    glsl: Ot,
    helpers: Mt,
    uniforms: zt
  };
}
const m = 5, Q = 3, tt = 5, Nt = "rgb(153,153,153)", kt = "rgb(26,26,26)", Ht = "rgb(230,230,230)", Ut = (t) => `rgb(${Math.round(t[0] * 255)},${Math.round(t[1] * 255)},${Math.round(t[2] * 255)})`;
function ot(t, o, n, r, a) {
  t.beginPath(), t.arc(o, n, r, 0, Math.PI * 2), t.fillStyle = a, t.fill();
}
function Ft(t, o, n, r) {
  t.clearRect(0, 0, o, o);
  const a = o - 2 * m, i = (s) => Math.round(a * s / v);
  for (let s = 0; s < v; s++) {
    const g = m + a - i(s), S = m + a - i(s + 1);
    for (let h = 0; h < v; h++) {
      const b = m + i(h), l = m + i(h + 1);
      t.fillStyle = Ut(xt(h, s, n.saturation)), t.fillRect(b, S + 1, l - b - 1, g - S - 1);
    }
  }
  const f = (s) => m + j(s, a), d = (s) => m + a - j(s, a);
  t.lineWidth = 2, t.strokeStyle = Nt, t.beginPath(), t.moveTo(f(n.loa), d(n.lob)), t.lineTo(f(n.hia), d(n.hib)), t.stroke(), ot(t, f(n.loa), d(n.lob), r === "lo" ? tt : Q, kt), ot(t, f(n.hia), d(n.hib), r === "hi" ? tt : Q, Ht);
}
function Xt(t, o, n) {
  const r = n - 2 * m;
  return { a: Z(t - m, r), b: Z(r - (o - m), r) };
}
const Wt = "Colour Correction", Gt = 300, Kt = 3, Yt = 10, jt = 0.1, Zt = {
  ArrowUp: [0, 1],
  ArrowDown: [0, -1],
  ArrowRight: [1, 0],
  ArrowLeft: [-1, 0]
}, Vt = "drag the line for split-toning. bright means highlights, dark means shadows. use mouse wheel to change saturation.";
function qt() {
  const { createElement: t, useEffect: o, useRef: n, useState: r } = E().react, { Slider: a } = E().components, { Select: i, tokens: f } = E().ui, d = E().stores.useDevelopStore, s = d((e) => e.paramBag), g = d((e) => e.setDynParams), S = d((e) => e.commitEdit), h = V(s), b = () => V(d.getState().paramBag), [l, st] = r(null), [w, lt] = r(240), [ut, F] = r(!1), X = n(null), $ = n(null), C = n(null), T = n(null), A = (e) => g(it(e)), D = () => void S(Wt), W = () => {
    T.current !== null && window.clearTimeout(T.current), T.current = window.setTimeout(() => {
      T.current = null, D();
    }, Gt);
  };
  o(
    () => () => {
      T.current !== null && (window.clearTimeout(T.current), D());
    },
    []
  ), o(() => {
    const e = X.current;
    if (!e) return;
    const c = new ResizeObserver((u) => {
      const y = u[0].contentRect.width;
      y > 0 && lt(Math.round(y));
    });
    return c.observe(e), () => c.disconnect();
  }, []), o(() => {
    const e = $.current;
    if (!e) return;
    const c = (u) => {
      u.preventDefault(), A(_t(b(), u.deltaY)), W();
    };
    return e.addEventListener("wheel", c, { passive: !1 }), () => e.removeEventListener("wheel", c);
  }, []), o(() => {
    const e = $.current;
    if (!e) return;
    const c = window.devicePixelRatio || 1;
    e.width = w * c, e.height = w * c;
    const u = e.getContext("2d");
    u && (u.setTransform(c, 0, 0, c, 0, 0), Ft(u, w, h, l));
  }, [s, l, w]);
  const ft = (e) => {
    const c = e.currentTarget.getBoundingClientRect(), u = c.width > 0 ? w / c.width : 1;
    return Xt((e.clientX - c.left) * u, (e.clientY - c.top) * u, w);
  }, dt = (e) => {
    const { a: c, b: u } = ft(e), y = C.current;
    if (y) {
      if (!l || !y.moved && Math.hypot(e.clientX - y.x, e.clientY - y.y) < Kt) return;
      y.moved = !0, A(rt(b(), l, c, u));
      return;
    }
    st(Rt(h, c, u));
  }, ht = (e) => {
    e.button === 0 && (e.currentTarget.setPointerCapture(e.pointerId), e.currentTarget.focus({ preventScroll: !0 }), C.current = { x: e.clientX, y: e.clientY, moved: !1 }, F(!0));
  }, G = () => {
    const e = C.current;
    C.current = null, F(!1), e != null && e.moved && D();
  }, bt = () => {
    A(vt(b(), l)), D();
  }, gt = (e) => {
    const c = Zt[e.key];
    if (!c || !l) return;
    e.preventDefault();
    const u = At * (e.shiftKey ? Yt : e.ctrlKey ? jt : 1);
    A(Lt(b(), l, c[0] * u, c[1] * u)), W();
  }, mt = t(
    "div",
    { ref: X, style: { width: "100%" } },
    t("canvas", {
      ref: $,
      tabIndex: 0,
      title: Vt,
      "aria-label": "Colour board: light dot tints highlights, dark dot tints shadows",
      style: {
        width: w,
        height: w,
        display: "block",
        borderRadius: 4,
        background: f.surface0,
        touchAction: "none",
        outline: "none",
        cursor: ut && l ? "grabbing" : l ? "grab" : "default"
      },
      onPointerDown: ht,
      onPointerMove: dt,
      onPointerUp: G,
      onPointerCancel: G,
      onDoubleClick: bt,
      onKeyDown: gt
    })
  ), St = t(a, {
    label: "Saturation",
    value: h.saturation,
    min: N,
    max: k,
    step: 0.01,
    defaultValue: _.saturation,
    onChange: (e) => A({ ...b(), saturation: e }),
    onCommit: D
  }), pt = t(i, {
    value: "",
    ariaLabel: "Presets",
    options: [{ value: "", label: "Presets…" }, ...Y.map((e) => ({ value: e.id, label: e.label }))],
    onChange: (e) => {
      const c = Y.find((u) => u.id === e);
      c && (A({ ...c.params }), D());
    }
  }), wt = t(
    "p",
    { style: { margin: "2px 0 0", fontSize: 10, color: f.textMuted, lineHeight: 1.35 } },
    "Drag the light dot to tint highlights and the dark dot to tint shadows · wheel sets saturation · arrows nudge the picked dot · double-click resets."
  );
  return t(
    "div",
    { style: { display: "flex", flexDirection: "column", gap: 6, padding: 8 } },
    mt,
    St,
    pt,
    wt
  );
}
const Jt = `${at}.panel`;
function Qt() {
  const t = E().stores.useDevelopStore.getState();
  t.setDynParams(it(_)), t.commitEdit("Colour Correction reset");
}
function to(t) {
  yt(t), t.registerProcessingStage(Bt()), t.registerPanel({
    id: Jt,
    title: "Colour Correction",
    component: qt,
    defaultDock: { module: "develop", direction: "right", order: 7, width: 268 },
    onReset: Qt
  });
}
function oo() {
  E().unregisterProcessingStage(H);
}
export {
  to as activate,
  oo as deactivate
};
//# sourceMappingURL=index.js.map
