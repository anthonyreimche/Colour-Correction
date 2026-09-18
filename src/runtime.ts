// The scoped API captured at activate(), for modules that render or reset
// outside the activate call. React comes from the host (api.react); elements
// are built with createElement, so nothing external resolves at bundle time.

import type { SafelightAPI } from "./safelight";

let current: SafelightAPI | null = null;

export function initRuntime(api: SafelightAPI): void {
  current = api;
}

export function api(): SafelightAPI {
  if (!current) throw new Error("[colour-correction] api used before activate()");
  return current;
}
