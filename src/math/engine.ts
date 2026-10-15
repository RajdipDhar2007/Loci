import { parse, type MathNode } from 'mathjs';
import type { ParsedGraph, Plane, RelOp } from '../types';

const SPATIAL = new Set(['x', 'y', 'z']);
const RESERVED = new Set([
  'x', 'y', 'z',
  'pi', 'e', 'i', 'true', 'false', 'infinity', 'inf', 'nan',
  'sin', 'cos', 'tan', 'cot', 'sec', 'csc',
  'asin', 'acos', 'atan', 'acot', 'asec', 'acsc', 'atan2',
  'sinh', 'cosh', 'tanh', 'coth', 'sech', 'csch',
  'asinh', 'acosh', 'atanh',
  'log', 'log10', 'log2', 'ln', 'sqrt', 'cbrt', 'abs',
  'floor', 'ceil', 'round', 'exp', 'sign', 'min', 'max',
  'pow', 'mod', 'gcd', 'lcm', 'hypot', 'gamma', 'factorial',
]);

/** Normalize common notation into mathjs-friendly syntax. */
export function normalizeExpression(raw: string): string {
  let s = raw.trim();
  s = s.replace(/π/g, 'pi');
  s = s.replace(/−/g, '-');
  s = s.replace(/×/g, '*');
  s = s.replace(/÷/g, '/');
  s = s.replace(/≤/g, '<=');
  s = s.replace(/≥/g, '>=');
  s = s.replace(/≠/g, '!=');
  s = s.replace(/\u2212/g, '-');
  return s;
}

/** Split a raw string on the top-level (paren-depth 0) relational operator. */
function splitRelational(s: string): { lhs: string; op: RelOp; rhs: string } | null {
  let depth = 0;
  for (let idx = 0; idx < s.length; idx++) {
    const c = s[idx];
    if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    if (depth !== 0) continue;
    // check two-char ops first
    const two = s.slice(idx, idx + 2);
    if ((two === '<=' || two === '>=') && depth === 0) {
      return { lhs: s.slice(0, idx), op: two as RelOp, rhs: s.slice(idx + 2) };
    }
    if (c === '<' || c === '>') {
      return { lhs: s.slice(0, idx), op: c as RelOp, rhs: s.slice(idx + 1) };
    }
    if (c === '=' && s[idx + 1] !== '=' && s[idx - 1] !== '=' && s[idx-1] !== '<' && s[idx-1] !== '>' && s[idx+1] !== '<' && s[idx+1] !== '>') {
      return { lhs: s.slice(0, idx), op: '=', rhs: s.slice(idx + 1) };
    }
  }
  return null;
}

function extractSymbols(node: MathNode): Set<string> {
  const symbols = new Set<string>();
  node.traverse((n: MathNode) => {
    if (n.type === 'FunctionNode') {
      // skip the function name itself, but still traverse args (traverse continues automatically)
      return;
    }
    if (n.type === 'SymbolNode') {
      const name = (n as unknown as { name: string }).name;
      if (!RESERVED.has(name.toLowerCase()) || SPATIAL.has(name)) {
        if (!isFunctionNameUsage(node, n)) symbols.add(name);
      }
    }
  });
  return symbols;
}

function isFunctionNameUsage(root: MathNode, target: MathNode): boolean {
  let found = false;
  root.traverse((n: MathNode) => {
    if (n.type === 'FunctionNode') {
      const fnNode = (n as unknown as { fn: MathNode }).fn;
      if (fnNode === target) found = true;
    }
  });
  return found;
}

/** Detect a parenthesized tuple like (cos(t), sin(t)) or (cos(t), sin(t), t). */
function tryParseTuple(s: string): string[] | null {
  const trimmed = s.trim();
  if (!trimmed.startsWith('(') || !trimmed.endsWith(')')) return null;
  const inner = trimmed.slice(1, -1);
  const parts: string[] = [];
  let depth = 0;
  let cur = '';
  for (const c of inner) {
    if (c === '(' || c === '[') depth++;
    if (c === ')' || c === ']') depth--;
    if (c === ',' && depth === 0) {
      parts.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  parts.push(cur);
  if (parts.length < 2 || parts.length > 3) return null;
  return parts.map((p) => p.trim());
}

function compileSafe(exprStr: string): { fn: (scope: Record<string, number>) => number; node: MathNode } {
  const node = parse(exprStr);
  const compiled = node.compile();
  const fn = (scope: Record<string, number>): number => {
    try {
      const result = compiled.evaluate(scope);
      if (typeof result === 'object' && result !== null && 're' in result) {
        const c = result as { re: number; im: number };
        if (Math.abs(c.im) > 1e-9) return NaN; // discard non-real results
        return Number.isFinite(c.re) ? c.re : NaN;
      }
      const num = Number(result);
      return Number.isFinite(num) ? num : NaN;
    } catch {
      return NaN;
    }
  };
  return { fn, node };
}

export function parseGraphExpression(
  rawInput: string,
  knownParams: Set<string>
): ParsedGraph {
  const raw = normalizeExpression(rawInput);
  if (!raw) return { kind: 'empty', spatialVars: [], freeVars: [] };

  try {
    // Parametric tuple, e.g. (cos(t), sin(t)) or (cos(t), sin(t), t)
    const rel = splitRelational(raw);
    let tupleSource = raw;
    if (rel && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(rel.lhs.trim())) {
      // form like p(t) = (..., ...) -- ignore lhs name, use rhs tuple
      tupleSource = rel.rhs.trim();
    }
    const tuple = tryParseTuple(tupleSource);
    if (tuple) {
      const compiledParts = tuple.map((p) => compileSafe(p));
      const allSymbols = new Set<string>();
      compiledParts.forEach(({ node }) => extractSymbols(node).forEach((s) => allSymbols.add(s)));
      const paramVar = allSymbols.has('t') ? 't' : [...allSymbols].find((s) => !SPATIAL.has(s));
      if (paramVar) {
        const freeVars = [...allSymbols].filter((s) => s !== paramVar);
        if (tuple.length === 2) {
          return {
            kind: 'parametric2d',
            spatialVars: ['x', 'y'],
            freeVars,
            evalParamX: compiledParts[0].fn,
            evalParamY: compiledParts[1].fn,
          };
        } else {
          return {
            kind: 'parametric3d',
            spatialVars: ['x', 'y', 'z'],
            freeVars,
            evalParamX: compiledParts[0].fn,
            evalParamY: compiledParts[1].fn,
            evalParamZ: compiledParts[2].fn,
          };
        }
      }
    }

    if (!rel) {
      // bare expression -> implicit F(...) = 0
      const { fn, node } = compileSafe(raw);
      const symbols = extractSymbols(node);
      const spatialVars = [...symbols].filter((s) => SPATIAL.has(s));
      const freeVars = [...symbols].filter((s) => !SPATIAL.has(s));
      if (spatialVars.length === 0) {
        return { kind: 'empty', spatialVars: [], freeVars, error: 'No graphing variable found' };
      }
      return buildFromDiff(fn, spatialVars, freeVars, '=');
    }

    const lhsTrim = rel.lhs.trim();
    const rhsTrim = rel.rhs.trim();

    // Parameter definition: ident = expr(no spatial vars)
    if (rel.op === '=' && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(lhsTrim) && !SPATIAL.has(lhsTrim)) {
      const { fn: rhsFn, node: rhsNode } = compileSafe(rhsTrim);
      const rhsSymbols = extractSymbols(rhsNode);
      const hasSpatial = [...rhsSymbols].some((s) => SPATIAL.has(s));
      if (!hasSpatial) {
        const scope: Record<string, number> = {};
        knownParams.forEach((p) => (scope[p] = 1));
        const val = rhsFn(scope);
        return {
          kind: 'parameter',
          spatialVars: [],
          freeVars: [...rhsSymbols],
          paramName: lhsTrim,
          paramValue: Number.isFinite(val) ? val : 0,
        };
      }
    }

    const { fn: lhsFn, node: lhsNode } = compileSafe(lhsTrim);
    const { fn: rhsFn, node: rhsNode } = compileSafe(rhsTrim);
    const lhsSymbols = extractSymbols(lhsNode);
    const rhsSymbols = extractSymbols(rhsNode);
    const allSymbols = new Set([...lhsSymbols, ...rhsSymbols]);
    const spatialVars = [...allSymbols].filter((s) => SPATIAL.has(s));
    const freeVars = [...allSymbols].filter((s) => !SPATIAL.has(s));

    if (spatialVars.length === 0) {
      return { kind: 'empty', spatialVars: [], freeVars, error: 'No graphing variable found' };
    }

    const diffFn = (scope: Record<string, number>) => lhsFn(scope) - rhsFn(scope);

    // Explicit form detection: one side is a bare spatial symbol not present on other side
    const lhsIsBareSpatial = SPATIAL.has(lhsTrim) && !rhsSymbols.has(lhsTrim);
    const rhsIsBareSpatial = SPATIAL.has(rhsTrim) && !lhsSymbols.has(rhsTrim);

    if (rel.op === '=' && (lhsIsBareSpatial || rhsIsBareSpatial)) {
      const explicitVar = (lhsIsBareSpatial ? lhsTrim : rhsTrim) as 'x' | 'y' | 'z';
      const exprFn = lhsIsBareSpatial ? rhsFn : lhsFn;
      const otherVars = spatialVars.filter((v) => v !== explicitVar);
      if (otherVars.length <= 2) {
        return buildExplicit(exprFn, explicitVar, otherVars, freeVars);
      }
    }

    return buildFromDiff(diffFn, spatialVars, freeVars, rel.op);
  } catch (err) {
    return {
      kind: 'error',
      spatialVars: [],
      freeVars: [],
      error: err instanceof Error ? err.message : 'Parse error',
    };
  }
}

function buildExplicit(
  exprFn: (scope: Record<string, number>) => number,
  explicitVar: 'x' | 'y' | 'z',
  otherVars: string[],
  freeVars: string[]
): ParsedGraph {
  const ALL_AXES: ('x' | 'y' | 'z')[] = ['x', 'y', 'z'];
  const remaining = ALL_AXES.filter((a) => a !== explicitVar);

  // Two independent spatial vars -> a full 3D surface (works for any dependent axis).
  if (otherVars.length === 2) {
    return {
      kind: 'explicit3d',
      spatialVars: [explicitVar, ...otherVars],
      freeVars,
      explicitVar,
      evalExplicit: exprFn,
    };
  }

  // No other spatial vars -> a constant-coordinate plane (e.g. x = 3), spanning both
  // remaining axes. Rendered the same way as a general 3D surface (a flat one).
  if (otherVars.length === 0) {
    return {
      kind: 'explicit3d',
      spatialVars: [explicitVar, ...remaining],
      freeVars,
      explicitVar,
      evalExplicit: exprFn,
    };
  }

  // Exactly one other spatial var -> a genuine 2D curve, living on whichever of the
  // three coordinate planes (xy, xz, yz) is spanned by {explicitVar, other}.
  const other = otherVars[0] as 'x' | 'y' | 'z';
  let plane: Plane;
  if ((explicitVar === 'x' && other === 'y') || (explicitVar === 'y' && other === 'x')) plane = 'xy';
  else if ((explicitVar === 'x' && other === 'z') || (explicitVar === 'z' && other === 'x')) plane = 'xz';
  else plane = 'yz';

  return {
    kind: 'explicit2d',
    plane,
    spatialVars: [explicitVar, other],
    freeVars,
    explicitVar,
    evalExplicit: exprFn,
  };
}

function buildFromDiff(
  diffFn: (scope: Record<string, number>) => number,
  spatialVars: string[],
  freeVars: string[],
  op: RelOp
): ParsedGraph {
  const isEq = op === '=';
  const dims = spatialVars.length;

  if (dims <= 2 && !spatialVars.includes('z')) {
    return {
      kind: isEq ? 'implicit2d' : 'inequality2d',
      plane: 'xy',
      spatialVars,
      freeVars,
      op,
      evalDiff: diffFn,
    };
  }
  if (dims <= 2 && spatialVars.includes('z')) {
    const plane = spatialVars.includes('x') ? 'xz' : 'yz';
    return {
      kind: isEq ? 'implicit2d' : 'inequality2d',
      plane,
      spatialVars,
      freeVars,
      op,
      evalDiff: diffFn,
    };
  }
  // 3 spatial vars
  return {
    kind: isEq ? 'implicit3d' : 'inequality3d',
    spatialVars,
    freeVars,
    op,
    evalDiff: diffFn,
  };
}
