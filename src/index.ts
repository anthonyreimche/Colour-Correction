// Colour Correction — SafeLight extension (GPL-3.0-or-later).
//
// A port of darktable's colour correction module: a Lab split-tone (a shadow
// tint and a highlight tint interpolated over lightness) plus global
// saturation, with darktable's colour-board interaction. Registers one
// display-referred GPU stage and a Develop panel.
//
// See model.ts for the maths, stage.ts for the GPU side and Panel.ts for the UI.

import type { SafelightAPI } from "./safelight";
import { api, initRuntime } from "./runtime";
import { colourCorrectionStage } from "./stage";
import { ColourCorrectionPanel } from "./Panel";
import { BASE_ID, DEFAULT_PARAMS, STAGE_ID, bagPatch } from "./model";

const PANEL_ID = `${BASE_ID}.panel`;

function resetPanel(): void {
  const store = api().stores.useDevelopStore.getState();
  store.setDynParams(bagPatch(DEFAULT_PARAMS));
  void store.commitEdit("Colour Correction reset");
}

export function activate(host: SafelightAPI): void {
  initRuntime(host);
  // At the defaults the stage's branch is never taken, so an untouched photo
  // renders bit-for-bit unchanged.
  host.registerProcessingStage(colourCorrectionStage());
  host.registerPanel({
    id: PANEL_ID,
    title: "Colour Correction",
    component: ColourCorrectionPanel,
    defaultDock: { module: "develop", direction: "right", order: 7, width: 268 },
    onReset: resetPanel,
  });
}

export function deactivate(): void {
  // The host sweeps this extension's registrations on disable or uninstall;
  // dropping the stage explicitly keeps a re-enable clean.
  api().unregisterProcessingStage(STAGE_ID);
}
