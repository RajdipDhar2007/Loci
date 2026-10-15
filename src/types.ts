export type RelOp = '=' | '<' | '<=' | '>' | '>=';

export type GraphKind =
  | 'parameter'
  | 'explicit2d'
  | 'implicit2d'
  | 'inequality2d'
  | 'explicit3d'
  | 'implicit3d'
  | 'inequality3d'
  | 'parametric2d'
  | 'parametric3d'
  | 'empty'
  | 'error';

export type Plane = 'xy' | 'xz' | 'yz';

export interface ParsedGraph {
  kind: GraphKind;
  plane?: Plane;
  spatialVars: string[]; // subset of x,y,z actually present
  freeVars: string[]; // parameter symbols referenced (non x/y/z)
  op?: RelOp;
  // evaluators, all take a scope object with x,y,z,t and parameter values
  evalDiff?: (scope: Record<string, number>) => number; // lhs - rhs, for implicit/inequality
  evalExplicit?: (scope: Record<string, number>) => number; // for explicit forms, dependent var value
  explicitVar?: 'x' | 'y' | 'z'; // which var is isolated for explicit forms
  paramName?: string; // for 'parameter' kind
  paramValue?: number;
  evalParamX?: (scope: Record<string, number>) => number;
  evalParamY?: (scope: Record<string, number>) => number;
  evalParamZ?: (scope: Record<string, number>) => number;
  error?: string;
}

export type LineStyle = 'solid' | 'dashed' | 'dotted';

export interface GraphStyle {
  color: string;
  opacity: number;
  style: LineStyle;
  quality: 'low' | 'medium' | 'high';
  showBoundary: boolean;
  /** When true, a 2D curve/region (explicit2d, implicit2d, inequality2d) is swept
   * along the missing spatial axis into a full 3D surface/solid — e.g. x + y = 9
   * becomes a plane instead of a line confined to one plane. */
  extrude: boolean;
}

export interface ExpressionEntry {
  id: string;
  raw: string;
  visible: boolean;
  label?: string;
  style: GraphStyle;
  collapsed: boolean;
  parsed?: ParsedGraph;
}

export interface VariableDef {
  name: string;
  value: number;
  min: number;
  max: number;
  step: number;
  animating: boolean;
  animSpeed: number;
  animMode: 'loop' | 'pingpong';
  direction: 1 | -1;
}

export type ThemeMode = 'dark' | 'light';

export interface CameraState3D {
  azimuth: number;
  elevation: number;
  distance: number;
  target: [number, number, number];
}

export interface ViewSettings {
  showGrid: boolean;
  showAxes: boolean;
  showLabels: boolean;
  /** Master, uniform half-extent applied to every axis (x, y and z all run
   * from -axisLimit to +axisLimit). Controlled by a single slider/input. */
  axisLimit: number;
}
