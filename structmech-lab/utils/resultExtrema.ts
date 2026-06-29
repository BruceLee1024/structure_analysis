import type { AnalysisResult, ResultSelection, ResultSelectionKind } from '../types';

export interface ElementExtreme {
  elementId: number;
  value: number;
  x: number;
  globalX: number;
  globalY: number;
}

export interface DisplacementExtreme {
  nodeId: number;
  value: number;
  component: 'dx' | 'dy';
}

export interface ResultExtrema {
  moment: ElementExtreme | null;
  shear: ElementExtreme | null;
  axial: ElementExtreme | null;
  deflection: DisplacementExtreme | null;
}

function pickElementExtreme(
  result: AnalysisResult,
  key: 'moment' | 'shear' | 'axial',
): ElementExtreme | null {
  let extreme: ElementExtreme | null = null;

  result.elements.forEach(element => {
    element.stations.forEach(station => {
      const value = station[key];
      if (!extreme || Math.abs(value) > Math.abs(extreme.value)) {
        extreme = {
          elementId: element.elementId,
          value,
          x: station.x,
          globalX: station.globalX,
          globalY: station.globalY,
        };
      }
    });
  });

  return extreme;
}

function pickDisplacementExtreme(result: AnalysisResult): DisplacementExtreme | null {
  let extreme: DisplacementExtreme | null = null;

  result.displacements.forEach(displacement => {
    (['dx', 'dy'] as const).forEach(component => {
      const value = displacement[component];
      if (!extreme || Math.abs(value) > Math.abs(extreme.value)) {
        extreme = { nodeId: displacement.nodeId, value, component };
      }
    });
  });

  return extreme;
}

export function getResultExtrema(result: AnalysisResult): ResultExtrema {
  return {
    moment: pickElementExtreme(result, 'moment'),
    shear: pickElementExtreme(result, 'shear'),
    axial: pickElementExtreme(result, 'axial'),
    deflection: pickDisplacementExtreme(result),
  };
}

const selectionLabels: Record<ResultSelectionKind, string> = {
  moment: '最大弯矩',
  shear: '最大剪力',
  axial: '最大轴力',
  deflection: '最大位移',
};

export function getSelectionForExtreme(
  extrema: ResultExtrema,
  kind: ResultSelectionKind,
): ResultSelection | null {
  if (kind === 'deflection') {
    const deflection = extrema.deflection;
    if (!deflection) return null;
    return {
      kind,
      label: selectionLabels[kind],
      nodeId: deflection.nodeId,
      component: deflection.component,
    };
  }

  const extreme = extrema[kind];
  if (!extreme) return null;
  return {
    kind,
    label: selectionLabels[kind],
    elementId: extreme.elementId,
    x: extreme.x,
    globalX: extreme.globalX,
    globalY: extreme.globalY,
  };
}
