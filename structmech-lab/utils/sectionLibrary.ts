import type { SolverElement, SolverParams } from '../types';

export interface MaterialPreset {
  id: string;
  name: string;
  E: number;
}

export interface SectionPreset {
  id: string;
  name: string;
  A: number;
  I: number;
}

export const MATERIAL_PRESETS: MaterialPreset[] = [
  { id: 'q235', name: '钢 Q235', E: 206 },
  { id: 'q355', name: '钢 Q355', E: 206 },
  { id: 'c30', name: '混凝土 C30', E: 30 },
  { id: 'glulam', name: '胶合木 GL24', E: 11 },
];

export const SECTION_PRESETS: SectionPreset[] = [
  { id: 'rect-300x500', name: '矩形 300x500', A: 1500, I: 3125 },
  { id: 'h-300x150', name: 'H 300x150', A: 46.78, I: 7210 },
  { id: 'h-400x200', name: 'H 400x200', A: 84.12, I: 23700 },
  { id: 'box-250x250x10', name: '箱形 250x250x10', A: 96, I: 8890 },
  { id: 'pipe-219x8', name: '圆管 219x8', A: 53.03, I: 2920 },
];

export function applyPropertiesToElements(elements: SolverElement[], E: number, A: number, I: number): SolverElement[] {
  return elements.map(element => ({ ...element, E, A, I }));
}

export function applyMaterialAndSection(
  params: SolverParams,
  material: MaterialPreset | undefined,
  section: SectionPreset | undefined,
): SolverParams {
  const E = material?.E ?? params.elasticModulus;
  const A = section?.A ?? params.crossSectionArea;
  const I = section?.I ?? params.momentOfInertia;

  return {
    ...params,
    elasticModulus: E,
    crossSectionArea: A,
    momentOfInertia: I,
    elements: applyPropertiesToElements(params.elements, E, A, I),
  };
}
