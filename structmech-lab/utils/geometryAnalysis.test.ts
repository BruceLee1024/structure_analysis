import { describe, expect, it } from 'vitest';
import { evaluateGeometrySystem, geometryPresets } from './geometryAnalysis';

describe('evaluateGeometrySystem', () => {
  it('treats a simple beam preset as a statically determinate stable structure', () => {
    const preset = geometryPresets.find((item) => item.id === 'simple_beam');
    expect(preset).toBeTruthy();

    const result = evaluateGeometrySystem(preset!.counts, preset!.modelHint);

    expect(result.W).toBe(0);
    expect(result.quickTitle).toBe('满足几何不变必要条件');
    expect(result.modelTitle).toBe('静定结构');
  });

  it('treats a fixed-fixed beam preset as statically indeterminate only because the model is known stable', () => {
    const preset = geometryPresets.find((item) => item.id === 'fixed_fixed_beam');
    expect(preset).toBeTruthy();

    const result = evaluateGeometrySystem(preset!.counts, preset!.modelHint);

    expect(result.W).toBe(-3);
    expect(result.quickTitle).toBe('存在多余约束的可能');
    expect(result.modelTitle).toBe('3次超静定');
  });

  it('keeps a parallel-link mechanism unstable even when W is negative', () => {
    const preset = geometryPresets.find((item) => item.id === 'parallel_link_mechanism');
    expect(preset).toBeTruthy();

    const result = evaluateGeometrySystem(preset!.counts, preset!.modelHint);

    expect(result.W).toBe(-1);
    expect(result.quickTitle).toBe('存在多余约束的可能');
    expect(result.modelTitle).toBe('几何可变体系');
    expect(result.modelSummary).toContain('约束方向重复');
  });

  it('counts guided support as a two-constraint support', () => {
    const result = evaluateGeometrySystem({
      rigidBodies: 1,
      chainLinks: 0,
      simpleHinges: 0,
      rigidJoints: 0,
      rollerSupports: 0,
      pinSupports: 0,
      guidedSupports: 1,
      fixedSupports: 0,
    });

    expect(result.totalConstraints).toBe(2);
    expect(result.W).toBe(1);
  });
});
