import { describe, expect, it } from 'vitest';
import { buildSpaceDisplacementCurve, evaluateSpacePolynomial, getSpaceTransverseDeflection, spacePolynomialRoots } from './spaceResponse';
import type { SpaceElement } from './spaceSolver';

const element: SpaceElement = { id: 1, startNode: 1, endNode: 2, E: 200, A: 50, Iy: 200, Iz: 100, J: 100 };
const L = 4;
const EI = element.E * 1e6 * element.Iz * 1e-6;

describe('exact space beam response', () => {
  it('recovers the uniform-load particular solution at the middle of a simply supported beam', () => {
    const q = -2;
    const u = Array(12).fill(0);
    u[5] = q * L ** 3 / (24 * EI);
    u[11] = -u[5];
    const curve = buildSpaceDisplacementCurve(element, L, u, [0, q, 0], [0, q, 0]);
    const expected = 5 * q * L ** 4 / (384 * EI);
    expect(evaluateSpacePolynomial(curve.y, 0.5)).toBeCloseTo(expected, 12);
    const peak = getSpaceTransverseDeflection(curve, L);
    expect(peak.locationM).toBeCloseTo(L / 2, 10);
    expect(peak.maxMm).toBeCloseTo(Math.abs(expected) * 1000, 9);
  });

  it('preserves cantilever tip deflection and interior curvature under uniform load', () => {
    const q = -2;
    const u = Array(12).fill(0);
    u[7] = q * L ** 4 / (8 * EI);
    u[11] = q * L ** 3 / (6 * EI);
    const curve = buildSpaceDisplacementCurve(element, L, u, [0, q, 0], [0, q, 0]);
    const x = L / 2;
    expect(evaluateSpacePolynomial(curve.y, 0.5)).toBeCloseTo(q * x ** 2 * (6 * L ** 2 - 4 * L * x + x ** 2) / (24 * EI), 12);
    expect(getSpaceTransverseDeflection(curve, L, 'fixed-start').maxMm).toBeCloseTo(Math.abs(u[7]) * 1000, 9);
  });

  it('removes rigid translation and rotation from relative chord deflection', () => {
    const curve = { y: [0.1, 0.2], z: [0.3, -0.1] };
    expect(getSpaceTransverseDeflection(curve, L).maxMm).toBeLessThan(1e-10);
  });

  it('isolates multiple and repeated polynomial roots', () => {
    expect(spacePolynomialRoots([0.16, -0.8, 1])).toEqual([0.4]);
    const roots = spacePolynomialRoots([-0.08, 0.66, -1.5, 1]);
    expect(roots).toHaveLength(3);
    [0.2, 0.5, 0.8].forEach((value, index) => expect(roots[index]).toBeCloseTo(value, 10));
  });
});
