// Drawing the colour board and mapping the pointer onto it — darktable's
// dt_iop_colorcorrection_draw and the coordinate part of its motion callback.
// The 8×8 cells are the a/b plane at darktable's board grey, +a to the right
// and +b upwards, 1 px gaps between them; a 2 px grey line joins the shadow
// tint to the highlight tint; the shadow dot is dark and the highlight dot
// light ("bright means highlights, dark means shadows"), the selected one
// drawn larger. The board sits on the panel's themed surface, which shows
// through the gaps and the inset.

import { CELLS, cellColour, fromBoard, toBoard, type Dot, type Params, type Vec3 } from "./model";

/** DT_COLORCORRECTION_INSET. */
export const INSET = 5;
const DOT_RADIUS = 3;
const DOT_RADIUS_SELECTED = 5;
const LINE = "rgb(153,153,153)";
const SHADOW_DOT = "rgb(26,26,26)";
const HIGHLIGHT_DOT = "rgb(230,230,230)";

const css = (rgb: Vec3): string =>
  `rgb(${Math.round(rgb[0] * 255)},${Math.round(rgb[1] * 255)},${Math.round(rgb[2] * 255)})`;

function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

/** Paint a square board of `size` CSS px; the caller has set the DPR transform. */
export function drawBoard(ctx: CanvasRenderingContext2D, size: number, p: Params, selected: Dot | null): void {
  ctx.clearRect(0, 0, size, size);
  const edge = size - 2 * INSET;

  const at = (k: number) => Math.round((edge * k) / CELLS);
  for (let j = 0; j < CELLS; j++) {
    const yBottom = INSET + edge - at(j);
    const yTop = INSET + edge - at(j + 1);
    for (let i = 0; i < CELLS; i++) {
      const x0 = INSET + at(i);
      const x1 = INSET + at(i + 1);
      ctx.fillStyle = css(cellColour(i, j, p.saturation));
      ctx.fillRect(x0, yTop + 1, x1 - x0 - 1, yBottom - yTop - 1);
    }
  }

  const ax = (v: number) => INSET + toBoard(v, edge);
  const by = (v: number) => INSET + edge - toBoard(v, edge);
  ctx.lineWidth = 2;
  ctx.strokeStyle = LINE;
  ctx.beginPath();
  ctx.moveTo(ax(p.loa), by(p.lob));
  ctx.lineTo(ax(p.hia), by(p.hib));
  ctx.stroke();

  dot(ctx, ax(p.loa), by(p.lob), selected === "lo" ? DOT_RADIUS_SELECTED : DOT_RADIUS, SHADOW_DOT);
  dot(ctx, ax(p.hia), by(p.hib), selected === "hi" ? DOT_RADIUS_SELECTED : DOT_RADIUS, HIGHLIGHT_DOT);
}

/** Board pixel (canvas CSS px, y down) → a/b, clamped to the board. */
export function boardPoint(px: number, py: number, size: number): { a: number; b: number } {
  const edge = size - 2 * INSET;
  return { a: fromBoard(px - INSET, edge), b: fromBoard(edge - (py - INSET), edge) };
}
