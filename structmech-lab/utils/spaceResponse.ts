import type { SpaceElement } from './spaceSolver';

// Coefficients use r=x/L. Displacements are in m, forces in kN/kN·m.
export const evaluateSpacePolynomial = (coefficients: number[], r: number) => coefficients.reduceRight((sum, value) => sum * r + value, 0);
const derivative = (p: number[]) => p.slice(1).map((value, index) => value * (index + 1));
const unique = (values: number[]) => values.sort((a, b) => a - b).filter((value, index, all) => index === 0 || value - all[index - 1] > 1e-10);

/** Isolate roots between derivative roots, including repeated roots. */
export function spacePolynomialRoots(coefficients: number[]): number[] {
  const p = [...coefficients];
  const scale = Math.max(...p.map(Math.abs), 0);
  if (scale === 0 || !Number.isFinite(scale)) return [];
  while (p.length > 1 && Math.abs(p.at(-1)!) <= scale * 1e-14) p.pop();
  if (p.length === 1) return [];
  if (p.length === 2) {
    const root = -p[0] / p[1];
    return root >= 0 && root <= 1 ? [root] : [];
  }
  const boundaries = unique([0, ...spacePolynomialRoots(derivative(p)), 1]);
  const roots = boundaries.filter(r => Math.abs(evaluateSpacePolynomial(p, r)) <= scale * 1e-12);
  for (let index = 1; index < boundaries.length; index++) {
    let left = boundaries[index - 1];
    let right = boundaries[index];
    let value = evaluateSpacePolynomial(p, left);
    const rightValue = evaluateSpacePolynomial(p, right);
    if (Math.abs(value) <= scale * 1e-12 || Math.abs(rightValue) <= scale * 1e-12 || value * rightValue >= 0) continue;
    for (let step = 0; step < 60; step++) {
      const mid = (left + right) / 2;
      const next = evaluateSpacePolynomial(p, mid);
      if (value * next > 0) { left = mid; value = next; } else right = mid;
    }
    roots.push((left + right) / 2);
  }
  return unique(roots);
}

function bendingCurve(L: number, EI: number, start: number, end: number, slopeStart: number, slopeEnd: number, qStart: number, qEnd: number) {
  const p4 = qStart * L ** 4 / (24 * EI);
  const p5 = (qEnd - qStart) * L ** 4 / (120 * EI);
  const displacement = end - start - L * slopeStart - p4 - p5;
  const slope = L * (slopeEnd - slopeStart) - 4 * p4 - 5 * p5;
  return [start, L * slopeStart, 3 * displacement - slope, slope - 2 * displacement, p4, p5];
}

export function buildSpaceDisplacementCurve(element: SpaceElement, length: number, u: number[], qStart: number[], qEnd: number[]) {
  const E = element.E * 1e6;
  const EA = E * element.A * 1e-4;
  const a2 = -qStart[0] * length ** 2 / (2 * EA);
  const a3 = -(qEnd[0] - qStart[0]) * length ** 2 / (6 * EA);
  return {
    x: [u[0], u[6] - u[0] - a2 - a3, a2, a3],
    y: bendingCurve(length, E * element.Iz * 1e-6, u[1], u[7], u[5], u[11], qStart[1], qEnd[1]),
    z: bendingCurve(length, E * element.Iy * 1e-6, u[2], u[8], -u[4], -u[10], qStart[2], qEnd[2]),
  };
}

export function getSpaceTransverseDeflection(curve: { y: number[]; z: number[] }, length: number, reference: 'chord' | 'fixed-start' | 'fixed-end' = 'chord') {
  const relative = (p: number[]) => {
    const result = [...p];
    result[0] -= reference === 'fixed-end' ? evaluateSpacePolynomial(p, 1) : p[0];
    if (reference === 'chord') result[1] -= evaluateSpacePolynomial(p, 1) - p[0];
    return result;
  };
  const y = relative(curve.y);
  const z = relative(curve.z);
  const squared = Array(Math.max(y.length, z.length) * 2 - 1).fill(0);
  for (const p of [y, z]) p.forEach((a, i) => p.forEach((b, j) => { squared[i + j] += a * b; }));
  const ratios = unique([0, ...spacePolynomialRoots(derivative(squared)), 1]);
  const peak = ratios.reduce((best, r) => {
    const value = Math.hypot(evaluateSpacePolynomial(y, r), evaluateSpacePolynomial(z, r));
    return value > best.value ? { value, r } : best;
  }, { value: 0, r: 0 });
  return { maxMm: peak.value * 1000, locationM: peak.r * length, reference };
}

export function buildSpaceForceStations(length: number, f: number[], qStart: number[], qEnd: number[]) {
  const L = length;
  const polynomials = {
    // N and T are positive in tension / positive local-x twist.
    axial: [-f[0], -qStart[0] * L, -(qEnd[0] - qStart[0]) * L / 2],
    shearY: [f[1], qStart[1] * L, (qEnd[1] - qStart[1]) * L / 2],
    shearZ: [f[2], qStart[2] * L, (qEnd[2] - qStart[2]) * L / 2],
    torsion: [-f[3]],
    momentY: [f[4], f[2] * L, qStart[2] * L ** 2 / 2, (qEnd[2] - qStart[2]) * L ** 2 / 6],
    momentZ: [f[5], -f[1] * L, -qStart[1] * L ** 2 / 2, -(qEnd[1] - qStart[1]) * L ** 2 / 6],
  };
  const ratios = unique([
    ...Array.from({ length: 11 }, (_, index) => index / 10),
    ...Object.values(polynomials).flatMap(p => spacePolynomialRoots(derivative(p))),
  ]);
  return ratios.map(r => ({
    x: r * L,
    axial: evaluateSpacePolynomial(polynomials.axial, r),
    shearY: evaluateSpacePolynomial(polynomials.shearY, r),
    shearZ: evaluateSpacePolynomial(polynomials.shearZ, r),
    torsion: evaluateSpacePolynomial(polynomials.torsion, r),
    momentY: evaluateSpacePolynomial(polynomials.momentY, r),
    momentZ: evaluateSpacePolynomial(polynomials.momentZ, r),
  }));
}
