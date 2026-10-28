// The registration contract: activate() registers the stage and the Develop
// panel, and offers that same panel in masks. The mask instance owns every key
// the panel writes, which are exactly the keys the stage's mask copy reads, so
// a mask is seeded with all five on add and keeps none of them after the panel
// is removed (a key left behind would keep the mask's copy running).
const path = require("path");
const M = require(path.join(__dirname, ".build", "model.js"));
const S = require(path.join(__dirname, ".build", "stage.js"));
const { ColourCorrectionPanel } = require(path.join(__dirname, ".build", "Panel.js"));
const { activate } = require(path.join(__dirname, ".build", "index.js"));

let fails = 0;
const check = (name, ok, detail) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) fails++;
};
const sorted = (keys) => [...keys].sort().join();

const stages = [];
const panels = [];
activate({
  registerProcessingStage: (s) => stages.push(s),
  registerPanel: (p) => panels.push(p),
  unregisterProcessingStage: () => {},
});

check("registers the one stage", stages.length === 1 && stages[0].id === M.STAGE_ID, stages.map((s) => s.id).join());
check("registers one panel", panels.length === 1, panels.map((p) => p.id).join());
const panel = panels[0] || {};
check("the dock panel is the Colour Correction panel", panel.component === ColourCorrectionPanel);
check("the same component serves a mask's Adjust tab", !!panel.mask && panel.mask.component === ColourCorrectionPanel);

const owns = (panel.mask && panel.mask.owns) || [];
check("owns every key the panel writes", sorted(owns) === sorted(Object.keys(M.bagPatch(M.DEFAULT_PARAMS))), owns.join());
check(
  "owns every uniform the stage's mask copy reads",
  sorted(owns) === sorted(S.colourCorrectionStage().uniforms.map((u) => `${M.STAGE_ID}.${u.key}`)),
);
check("owns each key once", new Set(owns).size === owns.length);

console.log(fails ? `\n${fails} FAILURE(S)` : "\nALL ACTIVATE CHECKS PASS");
process.exit(fails ? 1 : 0);
