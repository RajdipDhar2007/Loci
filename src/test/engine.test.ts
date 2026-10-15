import { describe, it, expect } from 'vitest';
import { parseGraphExpression } from '../math/engine';

const noParams = new Set<string>();

describe('graph type detection', () => {
  it('detects explicit 2D function y = f(x)', () => {
    const p = parseGraphExpression('y = x^2', noParams);
    expect(p.kind).toBe('explicit2d');
    expect(p.plane).toBe('xy');
    expect(p.evalExplicit?.({ x: 3 })).toBeCloseTo(9);
  });

  it('detects explicit 2D function x = f(y)', () => {
    const p = parseGraphExpression('x = y^2', noParams);
    expect(p.kind).toBe('explicit2d');
    expect(p.explicitVar).toBe('x');
  });

  it('detects implicit 2D equation', () => {
    const p = parseGraphExpression('x^2 + y^2 = 25', noParams);
    expect(p.kind).toBe('implicit2d');
    expect(p.evalDiff?.({ x: 3, y: 4 })).toBeCloseTo(0);
  });

  it('detects explicit XZ-plane curve z = sin(x)', () => {
    const p = parseGraphExpression('z = sin(x)', noParams);
    expect(p.kind).toBe('explicit2d');
    expect(p.plane).toBe('xz');
    expect(p.explicitVar).toBe('z');
    expect(p.evalExplicit?.({ x: 0 })).toBeCloseTo(0);
  });

  it('detects explicit XZ-plane curve x = z^2', () => {
    const p = parseGraphExpression('x = z^2', noParams);
    expect(p.kind).toBe('explicit2d');
    expect(p.plane).toBe('xz');
    expect(p.explicitVar).toBe('x');
  });

  it('detects explicit YZ-plane curve y = sin(z)', () => {
    const p = parseGraphExpression('y = sin(z)', noParams);
    expect(p.kind).toBe('explicit2d');
    expect(p.plane).toBe('yz');
    expect(p.explicitVar).toBe('y');
  });

  it('detects explicit YZ-plane curve z = cos(y)', () => {
    const p = parseGraphExpression('z = cos(y)', noParams);
    expect(p.kind).toBe('explicit2d');
    expect(p.plane).toBe('yz');
    expect(p.explicitVar).toBe('z');
  });

  it('detects implicit XZ-plane circle x^2 + z^2 = 25', () => {
    const p = parseGraphExpression('x^2 + z^2 = 25', noParams);
    expect(p.kind).toBe('implicit2d');
    expect(p.plane).toBe('xz');
  });

  it('detects 3D surface y = x + z', () => {
    const p = parseGraphExpression('y = x + z', noParams);
    expect(p.kind).toBe('explicit3d');
    expect(p.explicitVar).toBe('y');
  });

  it('detects 3D surface z = x^2 + y^2', () => {
    const p = parseGraphExpression('z = x^2 + y^2', noParams);
    expect(p.kind).toBe('explicit3d');
    expect(p.explicitVar).toBe('z');
  });

  it('detects a constant plane x = 3 spanning y and z', () => {
    const p = parseGraphExpression('x = 3', noParams);
    expect(p.kind).toBe('explicit3d');
    expect(p.spatialVars).toEqual(['x', 'y', 'z']);
  });

  it('detects 2D inequality', () => {
    const p = parseGraphExpression('x < y^2', noParams);
    expect(p.kind).toBe('inequality2d');
    expect(p.op).toBe('<');
  });

  it('detects explicit 3D surface z = f(x,y)', () => {
    const p = parseGraphExpression('z = x^2 + y^2', noParams);
    expect(p.kind).toBe('explicit3d');
    expect(p.evalExplicit?.({ x: 2, y: 1 })).toBeCloseTo(5);
  });

  it('detects implicit 3D surface (sphere)', () => {
    const p = parseGraphExpression('x^2 + y^2 + z^2 = 25', noParams);
    expect(p.kind).toBe('implicit3d');
    expect(p.evalDiff?.({ x: 0, y: 0, z: 5 })).toBeCloseTo(0);
  });

  it('detects 3D inequality (volume)', () => {
    const p = parseGraphExpression('x^2 + y^2 + z^2 <= 25', noParams);
    expect(p.kind).toBe('inequality3d');
    expect(p.op).toBe('<=');
  });

  it('detects XZ-plane 2D equation', () => {
    const p = parseGraphExpression('x^2 + z^2 = 25', noParams);
    expect(p.kind).toBe('implicit2d');
    expect(p.plane).toBe('xz');
  });

  it('detects YZ-plane 2D equation', () => {
    const p = parseGraphExpression('y^2 + z^2 = 25', noParams);
    expect(p.plane).toBe('yz');
  });

  it('detects parameter definitions', () => {
    const p = parseGraphExpression('a = 5', noParams);
    expect(p.kind).toBe('parameter');
    expect(p.paramName).toBe('a');
    expect(p.paramValue).toBe(5);
  });

  it('detects 2D parametric curves', () => {
    const p = parseGraphExpression('(cos(t), sin(t))', noParams);
    expect(p.kind).toBe('parametric2d');
    expect(p.evalParamX?.({ t: 0 })).toBeCloseTo(1);
    expect(p.evalParamY?.({ t: 0 })).toBeCloseTo(0);
  });

  it('detects 3D parametric curves (helix)', () => {
    const p = parseGraphExpression('(cos(t), sin(t), t)', noParams);
    expect(p.kind).toBe('parametric3d');
  });

  it('handles bare implicit expression with no relation', () => {
    const p = parseGraphExpression('x^2 + y^2 - 9', noParams);
    expect(p.kind).toBe('implicit2d');
    expect(p.evalDiff?.({ x: 3, y: 0 })).toBeCloseTo(0);
  });

  it('gracefully reports invalid/malformed syntax', () => {
    const p = parseGraphExpression('y = x^^2 +', noParams);
    expect(p.kind).toBe('error');
    expect(p.error).toBeTruthy();
  });

  it('handles unknown identifiers as free parameters', () => {
    const p = parseGraphExpression('y = a*x^2 + b', noParams);
    expect(p.kind).toBe('explicit2d');
    expect(p.freeVars.sort()).toEqual(['a', 'b']);
  });

  it('returns empty for constant-only expression', () => {
    const p = parseGraphExpression('5 + 3', noParams);
    expect(p.kind).toBe('empty');
  });

  it('handles division by zero without throwing', () => {
    const p = parseGraphExpression('y = 1/x', noParams);
    expect(p.kind).toBe('explicit2d');
    const val = p.evalExplicit?.({ x: 0 });
    expect(Number.isFinite(val as number)).toBe(false);
  });

  it('handles invalid sqrt domain without throwing', () => {
    const p = parseGraphExpression('y = sqrt(x)', noParams);
    const val = p.evalExplicit?.({ x: -4 });
    expect(Number.isFinite(val as number)).toBe(false);
  });

  it('parses trig, hyperbolic, and inverse function families', () => {
    for (const fn of ['sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'sinh', 'cosh', 'tanh', 'asin', 'acos', 'atan']) {
      const p = parseGraphExpression(`y = ${fn}(x)`, noParams);
      expect(p.kind, `${fn} should parse`).toBe('explicit2d');
    }
  });

  it('supports pi and e constants', () => {
    const p = parseGraphExpression('y = pi*x + e', noParams);
    expect(p.evalExplicit?.({ x: 0 })).toBeCloseTo(Math.E);
  });

  it('supports empty input', () => {
    const p = parseGraphExpression('', noParams);
    expect(p.kind).toBe('empty');
  });
});
