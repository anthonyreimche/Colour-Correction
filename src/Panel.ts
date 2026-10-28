// The Colour Correction panel: darktable's colour board with its interaction
// (colorcorrection.c gui — motion_notify / button_press / scrolled /
// key_press), the saturation slider and darktable's presets.
//
// Hovering picks the dot under the pointer; pressing and dragging moves it
// (a press that does not travel is a click, so double-click never nudges the
// dot); double-click resets the picked dot, or everything when none is
// picked; the wheel steps saturation; arrow keys nudge the picked dot (Shift
// coarse, Ctrl fine). A drag commits on release; wheel and keys commit after a
// short pause so one gesture is one undo entry. Rendered with the host's React
// through createElement — no JSX, nothing to resolve at bundle time.
//
// It edits whatever useParamScope hands it: the photo's bag in the dock, a
// mask's in the Masking panel's Adjust tab. Nothing here measures or picks from
// the photo, so a mask gets the whole panel, presets included.

import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import { api } from "./runtime";
import { boardPoint, drawBoard } from "./board";
import {
  DEFAULT_PARAMS,
  NUDGE_STEP,
  PRESETS,
  SATURATION_MAX,
  SATURATION_MIN,
  bagPatch,
  moveDot,
  nudgeDot,
  pickDot,
  readParams,
  resetDot,
  wheelSaturation,
  type Dot,
  type Params,
} from "./model";

const COMMIT_LABEL = "Colour Correction";
/** Wheel and keys: one gesture, one undo entry. */
const COMMIT_DELAY_MS = 300;
/** A press has to travel this far before it moves the dot. */
const DRAG_THRESHOLD_PX = 3;
/** darktable's accelerator speed multipliers. */
const COARSE = 10;
const FINE = 0.1;

const ARROWS: Record<string, readonly [number, number]> = {
  ArrowUp: [0, 1],
  ArrowDown: [0, -1],
  ArrowRight: [1, 0],
  ArrowLeft: [-1, 0],
};

const TOOLTIP =
  "drag the line for split-toning. bright means highlights, dark means shadows. use mouse wheel to change saturation.";

interface Press {
  x: number;
  y: number;
  moved: boolean;
}

type CanvasPointerEvent = ReactPointerEvent<HTMLCanvasElement>;

export function ColourCorrectionPanel() {
  const { createElement: h, useEffect, useRef, useState } = api().react;
  const { Slider } = api().components;
  const { Select, tokens } = api().ui;
  const scope = api().develop.useParamScope();

  const bag = scope.getParams();
  const params = readParams(bag);
  // Edits are relative (a notch, a nudge) or must keep the other four values,
  // and wheel and key repeats outrun React's renders, so they start from the
  // bag the scope holds now rather than this render's snapshot.
  const live = (): Params => readParams(scope.getParams());

  const [selected, setSelected] = useState<Dot | null>(null);
  const [size, setSize] = useState(240);
  const [pressing, setPressing] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pressRef = useRef<Press | null>(null);
  const commitTimer = useRef<number | null>(null);

  const apply = (next: Params) => scope.setParams(bagPatch(next));
  const commit = () => scope.commit(COMMIT_LABEL);
  const commitSoon = () => {
    if (commitTimer.current !== null) window.clearTimeout(commitTimer.current);
    commitTimer.current = window.setTimeout(() => {
      commitTimer.current = null;
      commit();
    }, COMMIT_DELAY_MS);
  };

  useEffect(
    () => () => {
      if (commitTimer.current === null) return;
      window.clearTimeout(commitTimer.current);
      commit();
    },
    [],
  );

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0].contentRect.width;
      if (w > 0) setSize(Math.round(w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Attached natively and non-passive so the dock does not scroll; React's
  // onWheel is passive and cannot preventDefault. The Masking panel keeps this
  // instance when another mask is selected, so the listener follows the scope.
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      apply(wheelSaturation(live(), e.deltaY));
      commitSoon();
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [scope.maskId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawBoard(ctx, size, params, selected);
  }, [bag, selected, size]);

  // Pointer → board a/b through the rendered rect, so interface-scale zoom
  // and CSS sizing cannot desync the hit-test from the drawing.
  const pointAt = (e: CanvasPointerEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    const scale = r.width > 0 ? size / r.width : 1;
    return boardPoint((e.clientX - r.left) * scale, (e.clientY - r.top) * scale, size);
  };

  const onPointerMove = (e: CanvasPointerEvent) => {
    const { a, b } = pointAt(e);
    const press = pressRef.current;
    if (press) {
      if (!selected) return;
      if (!press.moved && Math.hypot(e.clientX - press.x, e.clientY - press.y) < DRAG_THRESHOLD_PX) return;
      press.moved = true;
      apply(moveDot(live(), selected, a, b));
      return;
    }
    setSelected(pickDot(params, a, b));
  };

  const onPointerDown = (e: CanvasPointerEvent) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.focus({ preventScroll: true });
    pressRef.current = { x: e.clientX, y: e.clientY, moved: false };
    setPressing(true);
  };

  const onPointerUp = () => {
    const press = pressRef.current;
    pressRef.current = null;
    setPressing(false);
    if (press?.moved) commit();
  };

  const onDoubleClick = () => {
    apply(resetDot(live(), selected));
    commit();
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLCanvasElement>) => {
    const dir = ARROWS[e.key];
    if (!dir || !selected) return;
    e.preventDefault();
    const step = NUDGE_STEP * (e.shiftKey ? COARSE : e.ctrlKey ? FINE : 1);
    apply(nudgeDot(live(), selected, dir[0] * step, dir[1] * step));
    commitSoon();
  };

  const board = h(
    "div",
    { ref: wrapRef, style: { width: "100%" } },
    h("canvas", {
      ref: canvasRef,
      tabIndex: 0,
      title: TOOLTIP,
      "aria-label": "Colour board: light dot tints highlights, dark dot tints shadows",
      style: {
        width: size,
        height: size,
        display: "block",
        borderRadius: 4,
        background: tokens.surface0,
        touchAction: "none",
        outline: "none",
        cursor: pressing && selected ? "grabbing" : selected ? "grab" : "default",
      },
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
      onDoubleClick,
      onKeyDown,
    }),
  );

  const saturation = h(Slider, {
    label: "Saturation",
    value: params.saturation,
    min: SATURATION_MIN,
    max: SATURATION_MAX,
    step: 0.01,
    defaultValue: DEFAULT_PARAMS.saturation,
    onChange: (v: number) => apply({ ...live(), saturation: v }),
    onCommit: commit,
  });

  const presets = h(Select, {
    value: "",
    ariaLabel: "Presets",
    options: [{ value: "", label: "Presets…" }, ...PRESETS.map((p) => ({ value: p.id, label: p.label }))],
    onChange: (id: string) => {
      const preset = PRESETS.find((p) => p.id === id);
      if (!preset) return;
      apply({ ...preset.params });
      commit();
    },
  });

  const hint = h(
    "p",
    { style: { margin: "2px 0 0", fontSize: 10, color: tokens.textMuted, lineHeight: 1.35 } },
    "Drag the light dot to tint highlights and the dark dot to tint shadows · wheel sets saturation · arrows nudge the picked dot · double-click resets.",
  );

  return h(
    "div",
    { style: { display: "flex", flexDirection: "column", gap: 6, padding: 8 } },
    board,
    saturation,
    presets,
    hint,
  );
}
