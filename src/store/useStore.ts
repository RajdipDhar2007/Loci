import { create } from 'zustand';
import type {
  ExpressionEntry,
  VariableDef,
  ThemeMode,
  CameraState3D,
  ViewSettings,
} from '../types';
import { parseGraphExpression } from '../math/engine';

const STORAGE_KEY = 'graphcalc.workspace.v2';

const PALETTE = [
  '#5EEAD4', '#F5A623', '#818CF8', '#FB7185', '#4ADE80',
  '#38BDF8', '#F472B6', '#FBBF24', '#A78BFA', '#2DD4BF',
];

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function makeDefaultStyle(index: number) {
  return {
    color: PALETTE[index % PALETTE.length],
    opacity: 1,
    style: 'solid' as const,
    quality: 'medium' as const,
    showBoundary: true,
    extrude: false,
  };
}

const DEFAULT_CAMERA: CameraState3D = { azimuth: 0.8, elevation: 0.55, distance: 14, target: [0, 0, 0] };
const DEFAULT_VIEW: ViewSettings = { showGrid: true, showAxes: true, showLabels: true, axisLimit: 10 };

interface WorkspaceSnapshot {
  expressions: { id: string; raw: string; visible: boolean; label?: string; style: ExpressionEntry['style']; collapsed: boolean }[];
  variables: VariableDef[];
  theme: ThemeMode;
  view: ViewSettings;
}

interface StoreState {
  expressions: ExpressionEntry[];
  variables: Record<string, VariableDef>;
  theme: ThemeMode;
  camera: CameraState3D;
  view: ViewSettings;
  selectedId: string | null;

  addExpression: (raw?: string) => string;
  updateExpression: (id: string, raw: string) => void;
  removeExpression: (id: string) => void;
  duplicateExpression: (id: string) => void;
  toggleVisible: (id: string) => void;
  toggleCollapsed: (id: string) => void;
  setStyle: (id: string, patch: Partial<ExpressionEntry['style']>) => void;
  setLabel: (id: string, label: string) => void;
  select: (id: string | null) => void;

  setVariable: (name: string, patch: Partial<VariableDef>) => void;
  removeVariable: (name: string) => void;
  toggleAnimating: (name: string) => void;
  tickAnimations: (dt: number) => void;

  setTheme: (t: ThemeMode) => void;
  setCamera: (c: Partial<CameraState3D>) => void;
  setView: (v: Partial<ViewSettings>) => void;

  reparseAll: () => void;
  newWorkspace: () => void;
  exportWorkspace: () => string;
  importWorkspace: (json: string) => void;
  persist: () => void;
}

function reparseExpression(entry: ExpressionEntry, knownParams: Set<string>): ExpressionEntry {
  const parsed = parseGraphExpression(entry.raw, knownParams);
  return { ...entry, parsed };
}

function collectVariables(
  expressions: ExpressionEntry[],
  existing: Record<string, VariableDef>
): Record<string, VariableDef> {
  const next: Record<string, VariableDef> = {};

  for (const e of expressions) {
    if (!e.parsed) continue;
    if (e.parsed.kind === 'parameter' && e.parsed.paramName) {
      if (!next[e.parsed.paramName]) {
        const prev = existing[e.parsed.paramName];
        next[e.parsed.paramName] = prev
          ? { ...prev }
          : {
              name: e.parsed.paramName,
              value: e.parsed.paramValue ?? 1,
              min: -10,
              max: 10,
              step: 0.1,
              animating: false,
              animSpeed: 1,
              animMode: 'pingpong',
              direction: 1,
            };
      }
    }
    for (const v of e.parsed.freeVars ?? []) {
      if (!next[v]) {
        const prev = existing[v];
        next[v] = prev
          ? { ...prev }
          : {
              name: v,
              value: 1,
              min: -10,
              max: 10,
              step: 0.1,
              animating: false,
              animSpeed: 1,
              animMode: 'pingpong',
              direction: 1,
            };
      }
    }
  }
  return next;
}

export const useStore = create<StoreState>((set, get) => ({
  expressions: [reparseExpression({ id: uid(), raw: 'z = sin(x) * cos(y)', visible: true, style: makeDefaultStyle(0), collapsed: false }, new Set())],
  variables: {},
  theme: 'dark',
  camera: { ...DEFAULT_CAMERA },
  view: { ...DEFAULT_VIEW },
  selectedId: null,

  addExpression: (raw = '') => {
    const id = uid();
    set((s) => {
      const entry = reparseExpression(
        { id, raw, visible: true, style: makeDefaultStyle(s.expressions.length), collapsed: false },
        new Set(Object.keys(s.variables))
      );
      const expressions = [...s.expressions, entry];
      const variables = collectVariables(expressions, s.variables);
      return { expressions, variables, selectedId: id };
    });
    get().persist();
    return id;
  },

  updateExpression: (id, raw) => {
    set((s) => {
      const knownParams = new Set(Object.keys(s.variables));
      const expressions = s.expressions.map((e) =>
        e.id === id ? reparseExpression({ ...e, raw }, knownParams) : e
      );
      const variables = collectVariables(expressions, s.variables);
      return { expressions, variables };
    });
    get().persist();
  },

  removeExpression: (id) => {
    set((s) => {
      const expressions = s.expressions.filter((e) => e.id !== id);
      const variables = collectVariables(expressions, s.variables);
      return { expressions, variables, selectedId: s.selectedId === id ? null : s.selectedId };
    });
    get().persist();
  },

  duplicateExpression: (id) => {
    set((s) => {
      const src = s.expressions.find((e) => e.id === id);
      if (!src) return s;
      const copy = reparseExpression(
        { ...src, id: uid(), style: { ...src.style } },
        new Set(Object.keys(s.variables))
      );
      const idx = s.expressions.findIndex((e) => e.id === id);
      const expressions = [...s.expressions];
      expressions.splice(idx + 1, 0, copy);
      return { expressions };
    });
    get().persist();
  },

  toggleVisible: (id) => {
    set((s) => ({
      expressions: s.expressions.map((e) => (e.id === id ? { ...e, visible: !e.visible } : e)),
    }));
    get().persist();
  },

  toggleCollapsed: (id) => {
    set((s) => ({
      expressions: s.expressions.map((e) => (e.id === id ? { ...e, collapsed: !e.collapsed } : e)),
    }));
  },

  setStyle: (id, patch) => {
    set((s) => ({
      expressions: s.expressions.map((e) => (e.id === id ? { ...e, style: { ...e.style, ...patch } } : e)),
    }));
    get().persist();
  },

  setLabel: (id, label) => {
    set((s) => ({ expressions: s.expressions.map((e) => (e.id === id ? { ...e, label } : e)) }));
    get().persist();
  },

  select: (id) => set({ selectedId: id }),

  setVariable: (name, patch) => {
    set((s) => ({
      variables: { ...s.variables, [name]: { ...s.variables[name], ...patch } },
    }));
    get().persist();
  },

  removeVariable: (name) => {
    set((s) => {
      const variables = { ...s.variables };
      delete variables[name];
      return { variables };
    });
  },

  toggleAnimating: (name) => {
    set((s) => ({
      variables: {
        ...s.variables,
        [name]: { ...s.variables[name], animating: !s.variables[name].animating },
      },
    }));
  },

  tickAnimations: (dt) => {
    set((s) => {
      let changed = false;
      const variables = { ...s.variables };
      for (const key of Object.keys(variables)) {
        const v = variables[key];
        if (!v.animating) continue;
        changed = true;
        const range = v.max - v.min || 1;
        let value = v.value + v.direction * v.animSpeed * (range / 10) * dt;
        let direction = v.direction;
        if (value >= v.max) {
          if (v.animMode === 'pingpong') {
            value = v.max;
            direction = -1;
          } else {
            value = v.min;
          }
        } else if (value <= v.min) {
          if (v.animMode === 'pingpong') {
            value = v.min;
            direction = 1;
          } else {
            value = v.max;
          }
        }
        variables[key] = { ...v, value, direction };
      }
      return changed ? { variables } : {};
    });
  },

  setTheme: (theme) => {
    set({ theme });
    get().persist();
  },
  setCamera: (c) => set((s) => ({ camera: { ...s.camera, ...c } })),
  setView: (v) => {
    set((s) => {
      const merged = { ...s.view, ...v };
      if (v.axisLimit !== undefined) {
        merged.axisLimit = Math.min(100000, Math.max(2, v.axisLimit));
      }
      return { view: merged };
    });
    get().persist();
  },

  reparseAll: () => {
    set((s) => {
      const knownParams = new Set(Object.keys(s.variables));
      const expressions = s.expressions.map((e) => reparseExpression(e, knownParams));
      const variables = collectVariables(expressions, s.variables);
      return { expressions, variables };
    });
  },

  newWorkspace: () => {
    set({
      expressions: [],
      variables: {},
      camera: { ...DEFAULT_CAMERA },
      selectedId: null,
    });
    get().persist();
  },

  exportWorkspace: () => {
    const s = get();
    const snapshot: WorkspaceSnapshot = {
      expressions: s.expressions.map((e) => ({
        id: e.id, raw: e.raw, visible: e.visible, label: e.label, style: e.style, collapsed: e.collapsed,
      })),
      variables: Object.values(s.variables),
      theme: s.theme,
      view: s.view,
    };
    return JSON.stringify(snapshot, null, 2);
  },

  importWorkspace: (json) => {
    try {
      const snapshot: WorkspaceSnapshot = JSON.parse(json);
      const variables: Record<string, VariableDef> = {};
      for (const v of snapshot.variables ?? []) variables[v.name] = v;
      const knownParams = new Set(Object.keys(variables));
      const expressions = (snapshot.expressions ?? []).map((e) =>
        reparseExpression({ ...e, id: e.id ?? uid() }, knownParams)
      );
      set({
        expressions,
        variables: collectVariables(expressions, variables),
        theme: snapshot.theme ?? 'dark',
        view: { ...DEFAULT_VIEW, ...(snapshot.view ?? {}) },
      });
      get().persist();
    } catch {
      // ignore malformed import
    }
  },

  persist: () => {
    try {
      localStorage.setItem(STORAGE_KEY, get().exportWorkspace());
    } catch {
      // storage unavailable; ignore
    }
  },
}));

export function loadPersistedWorkspace() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) useStore.getState().importWorkspace(raw);
  } catch {
    // ignore
  }
}
