// The slice of SafeLight's extension API this extension touches. Extensions are
// standalone bundles, so the host's types are declared here rather than
// imported; each declaration mirrors src/extensions/types.ts in the app.

import type { ComponentType } from "react";

export type GlslType =
  | "float" | "int" | "bool"
  | "vec2" | "vec3" | "vec4"
  | "ivec2" | "ivec3" | "ivec4"
  | "mat3" | "mat4"
  | "sampler2D";

export interface UniformDeclaration {
  key: string;
  glslType: GlslType;
  default: number | number[] | boolean;
  range?: { min: number; max: number; step?: number };
  label?: string;
}

export type ProcessingPhase =
  | "geometry"
  | "decode"
  | "noise-reduction"
  | "scene-linear"
  | "tone-map"
  | "display-adjust"
  | "effects"
  | "output-encode";

/** A GLSL fragment spliced into the develop shader. Display-space phases
 *  read and write `vec3 c`, the display-encoded colour; uniform keys and
 *  helper function names are namespaced by the host at identifier boundaries. */
export interface ProcessingStageContribution {
  id: string;
  name: string;
  phase: ProcessingPhase;
  priority?: number;
  glsl: string;
  helpers?: string;
  uniforms: UniformDeclaration[];
  presetScope?: "global" | "per-image";
}

export interface PanelDockDefault {
  module: "library" | "develop";
  direction: "left" | "right";
  order?: number;
  width?: number;
  height?: number;
}

export interface PanelContribution {
  id: string;
  title: string;
  component: ComponentType;
  order?: number;
  defaultDock?: PanelDockDefault;
  onReset?: () => void;
}

export interface SliderProps {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  /** Double-clicking the track resets to this. */
  defaultValue?: number;
  onChange: (value: number) => void;
  onCommit?: () => void;
}

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options?: SelectOption[];
  placeholder?: string;
  ariaLabel?: string;
  title?: string;
}

export interface DevelopState {
  /** Extension params by qualified key ("<stageId>.<uniform>"). Each value is
   *  whatever the owning extension wrote, so the host can only type it as
   *  unknown; readParams narrows this extension's own keys. */
  paramBag: Record<string, unknown>;
  setDynParams(patch: Record<string, unknown>): void;
  commitEdit(label: string): Promise<void>;
}

export interface DevelopStore {
  <T>(selector: (state: DevelopState) => T): T;
  getState(): DevelopState;
}

export interface SafelightAPI {
  version: 1;
  extensionId: string;
  /** The app's React instance — extensions must use it, not a copy of their own. */
  react: typeof import("react");
  registerProcessingStage(c: ProcessingStageContribution): void;
  unregisterProcessingStage(id: string): void;
  registerPanel(c: PanelContribution): void;
  components: {
    Slider: ComponentType<SliderProps>;
  };
  stores: {
    useDevelopStore: DevelopStore;
  };
  /** Shared, theme-styled UI kit (core ≥ 2.4.3). */
  ui: {
    Select: ComponentType<SelectProps>;
    tokens: {
      surface0: string;
      textMuted: string;
    };
  };
}

export interface ExtensionModule {
  activate(api: SafelightAPI): void;
  deactivate?(): void;
}
