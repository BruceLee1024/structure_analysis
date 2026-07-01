import { describe, expect, it } from 'vitest';
import { calculateSectionProperties } from './sectionLibrary';

describe('calculateSectionProperties', () => {
  it('calculates rectangle area and strong-axis inertia from mm dimensions', () => {
    const section = calculateSectionProperties({ shape: 'rectangle', widthMm: 300, heightMm: 500 });

    expect(section?.A).toBeCloseTo(1500, 6);
    expect(section?.I).toBeCloseTo(3125, 6);
  });

  it('calculates H section properties by subtracting the web voids', () => {
    const section = calculateSectionProperties({ shape: 'hSection', widthMm: 150, heightMm: 300, webMm: 6.5, flangeMm: 9 });

    expect(section?.A).toBeCloseTo(45.33, 2);
    expect(section?.I).toBeCloseTo(69.325, 3);
  });

  it('rejects invalid pipe geometry', () => {
    expect(calculateSectionProperties({ shape: 'pipe', diameterMm: 200, thicknessMm: 120 })).toBeNull();
  });
});
