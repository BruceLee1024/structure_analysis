import { describe, expect, it } from 'vitest';
import { getBeamDiagram, type BeamDiagramInput } from './beamDiagram';
const base: BeamDiagramInput = { beamType: 'simple', loadType: 'point', L: 8, P: 27, q: 10, a: 40, overhang: 2 };

describe('engineering beam diagram data', () => {
  it('includes the exact point-load station and both shear limits', () => {
    const d = getBeamDiagram(base);
    expect(d.RA).toBeCloseTo(16.2);
    expect(d.RB).toBeCloseTo(10.8);
    expect(d.momentPeak).toMatchObject({ x: 3.2 });
    expect(d.Mmax).toBeCloseTo(51.84);
    expect(d.shear.filter(p => p.x === d.loadX).map(p => p.value)).toEqual([16.2, -10.8]);
    expect(d.shearAt(8)).toBeCloseTo(0);
  });
  it('uses the exact parabola and shear-zero station for a uniform load', () => {
    const d = getBeamDiagram({ ...base, loadType: 'distributed' });
    expect(d.momentAt(4)).toBe(80);
    expect(d.momentPeak.x).toBe(4);
    expect(d.shearAt(4)).toBe(0);
    expect(d.momentAt(8)).toBe(0);
  });
  it('keeps the cantilever moment negative and closes shear at a point load', () => {
    const d = getBeamDiagram({ ...base, beamType: 'cantilever' });
    expect(d.momentAt(0)).toBeCloseTo(-86.4);
    expect(d.momentAt(3.2)).toBe(0);
    expect(d.momentAt(8)).toBe(0);
    expect(d.shearAt(0)).toBe(27);
    expect(d.shearAt(3.2)).toBe(0);
  });
  it('uses a negative quadratic moment and positive linear shear for a cantilever UDL', () => {
    const d = getBeamDiagram({ ...base, beamType: 'cantilever', loadType: 'distributed' });
    expect(d.RA).toBe(80);
    expect(d.momentAt(0)).toBe(-320);
    expect(d.momentAt(4)).toBe(-80);
    expect(d.momentAt(8)).toBe(0);
    expect(d.shearAt(0)).toBe(80);
    expect(d.shearAt(4)).toBe(40);
    expect(d.shearAt(8)).toBe(0);
  });
  it('includes the second reaction on the overhang and the exact support jump', () => {
    const d = getBeamDiagram({ ...base, beamType: 'overhanging', a: 90, P: 20 });
    expect(d.RA).toBeCloseTo(-2.5);
    expect(d.RB).toBeCloseTo(22.5);
    expect(d.momentAt(8)).toBeCloseTo(-20);
    expect(d.momentAt(10)).toBeCloseTo(0);
    expect(d.Mmax).toBeCloseTo(20);
    expect(d.Vmax).toBeCloseTo(20);
    expect(d.shear.filter(p => p.x === 8).map(p => p.value)).toEqual([-2.5, 20]);
    expect(d.shear.filter(p => p.x === 9).map(p => p.value)).toEqual([20, 0]);
  });
  it('includes the main-span critical station and free-end closure for an overhang UDL', () => {
    const d = getBeamDiagram({ ...base, beamType: 'overhanging', loadType: 'distributed' });
    expect(d.RA).toBe(37.5);
    expect(d.RB).toBe(62.5);
    expect(d.momentAt(8)).toBe(-20);
    expect(d.momentAt(10)).toBe(0);
    expect(d.momentPeak.x).toBe(3.75);
    expect(d.Mmax).toBeCloseTo(70.3125);
    expect(d.Vmax).toBe(42.5);
  });
  it('sums coincident point-load and support jumps without inventing an intermediate force', () => {
    const d = getBeamDiagram({ ...base, beamType: 'overhanging', a: 80, P: 20 });
    expect(d.Mmax).toBe(0);
    expect(d.Vmax).toBe(0);
    expect(d.moment.every(p => Math.abs(p.value) < 1e-9)).toBe(true);
  });
});
