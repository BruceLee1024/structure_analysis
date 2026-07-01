import { describe, expect, test } from 'vitest';
import { StructureType, type AnalysisResult, type SolverParams } from '../types';
import { createCalculationReport, createReportFileName } from './reportExport';

const params: SolverParams = {
  structureType: StructureType.PortalFrame,
  stiffnessType: 'Elastic',
  width: 10,
  height: 5,
  roofHeight: 2,
  numSpans: 2,
  numStories: 1,
  numBays: 1,
  overhangLeft: 0,
  overhangRight: 0,
  elasticModulus: 200,
  crossSectionArea: 50,
  momentOfInertia: 200,
  nodes: [
    { id: 1, x: 0, y: 0, restraints: [true, true, true] },
    { id: 2, x: 10, y: 0, restraints: [true, true, true] },
  ],
  elements: [
    { id: 1, startNode: 1, endNode: 2, E: 200, A: 50, I: 200 },
  ],
  loads: [{ id: 'q1', type: 'distributed', elementId: 1, magnitude: -5, direction: 'y', loadCaseId: 'dead' }],
  loadCases: [{ id: 'dead', name: '恒载 D', category: 'dead' }],
  loadCombinations: [],
  activeLoadCaseId: 'dead',
  activeAnalysisType: 'loadCase',
  activeAnalysisId: 'dead',
};

const result: AnalysisResult = {
  maxDeflection: 2.5,
  reactions: [{ nodeId: 1, fx: 0, fy: 25, m: 12 }],
  displacements: [{ nodeId: 2, dx: 0.01, dy: -1, rotation: 0.001 }],
  elements: [
    {
      elementId: 1,
      maxMoment: 31.25,
      maxShear: 25,
      maxAxial: 0,
      u_local: [],
      startForces: { fx: 0, fy: 0, m: 0 },
      stations: [
        { x: 0, globalX: 0, globalY: 0, moment: 0, shear: 25, axial: 0, deflectionY: 0 },
        { x: 5, globalX: 5, globalY: 0, moment: 31.25, shear: 0, axial: 0, deflectionY: -2.5 },
      ],
    },
  ],
};

describe('report export', () => {
  test('creates a calculation report with model, results, envelope and checks', () => {
    const report = createCalculationReport({
      params,
      results: result,
      activeAnalysis: { type: 'loadCase', id: 'dead', label: '恒载 D' },
      analysisLoads: params.loads,
      envelopeRows: [
        {
          key: 'moment-max',
          label: '弯矩最大正值',
          value: 31.25,
          unit: 'kN·m',
          sourceLabel: '恒载 D',
          sourceType: 'loadCase',
          sourceId: 'dead',
          location: '单元 1 · x=5.00 m',
          selection: null,
        },
      ],
      serviceabilityRows: [
        {
          elementId: 1,
          lengthM: 10,
          limitRatio: 250,
          limitMm: 40,
          deflectionMm: 2.5,
          utilization: 0.0625,
          locationM: 5,
          passed: true,
        },
      ],
      validationIssues: [{ id: 'ok', severity: 'info', title: '未发现明显建模问题', detail: '模型可计算。' }],
      generatedAt: new Date('2026-06-29T00:00:00.000Z'),
    });

    expect(report).toContain('# StructLab 结构计算报告');
    expect(report).toContain('生成时间：2026-06-29T00:00:00.000Z');
    expect(report).toContain('| 1 | 0.000 | 0.000 | 固定, 固定, 固定 |');
    expect(report).toContain('| q1 | distributed | EL 1 | -5.000 | y |');
    expect(report).toContain('| 最大弯矩 | 单元 1 · x=5.00 m | 31.25 | kN·m |');
    expect(report).toContain('| 最大位移 | 单元 1 · x=5.00 m | -2.5000 | mm |');
    expect(report).toContain('| 弯矩最大正值 | 恒载 D | 单元 1 · x=5.00 m | 31.25 | kN·m |');
    expect(report).toContain('| 1 | 10.000 | L/250 | 40.000 | 2.500 | 0.063 | 通过 |');
    expect(report).toContain('| info | 未发现明显建模问题 | 模型可计算。 |');
  });

  test('creates timestamped markdown filenames', () => {
    expect(createReportFileName(new Date('2026-06-29T01:02:03.000Z'))).toBe('structlab-report-2026-06-29-01-02-03.md');
  });
});
