import type { AnalysisResult, AnalysisTargetType, ResultSelection, ResultSelectionKind } from '../types';

export interface EnvelopeTarget {
  type: AnalysisTargetType;
  id: string;
  label: string;
}

export interface EnvelopeInput {
  target: EnvelopeTarget;
  result: AnalysisResult;
}

export type EnvelopeRowKey =
  | 'moment-max'
  | 'moment-min'
  | 'shear-max'
  | 'shear-min'
  | 'axial-max'
  | 'axial-min'
  | 'deflection-abs';

export interface EnvelopeRow {
  key: EnvelopeRowKey;
  label: string;
  value: number | null;
  unit: string;
  sourceLabel: string;
  sourceType?: AnalysisTargetType;
  sourceId?: string;
  location: string;
  selection: ResultSelection | null;
}

interface EnvelopeCandidate {
  value: number;
  sourceLabel: string;
  sourceType: AnalysisTargetType;
  sourceId: string;
  location: string;
  selection: ResultSelection;
}

const rowMeta: Record<EnvelopeRowKey, { label: string; unit: string }> = {
  'moment-max': { label: '弯矩最大正值', unit: 'kN·m' },
  'moment-min': { label: '弯矩最大负值', unit: 'kN·m' },
  'shear-max': { label: '剪力最大正值', unit: 'kN' },
  'shear-min': { label: '剪力最大负值', unit: 'kN' },
  'axial-max': { label: '轴力最大拉力', unit: 'kN' },
  'axial-min': { label: '轴力最大压力', unit: 'kN' },
  'deflection-abs': { label: '位移最大绝对值', unit: 'mm' },
};

function emptyRow(key: EnvelopeRowKey): EnvelopeRow {
  const meta = rowMeta[key];
  return {
    key,
    label: meta.label,
    value: null,
    unit: meta.unit,
    sourceLabel: '无',
    location: '无',
    selection: null,
  };
}

function toRow(key: EnvelopeRowKey, candidate: EnvelopeCandidate | null): EnvelopeRow {
  if (!candidate) return emptyRow(key);
  const meta = rowMeta[key];
  return {
    key,
    label: meta.label,
    value: candidate.value,
    unit: meta.unit,
    sourceLabel: candidate.sourceLabel,
    sourceType: candidate.sourceType,
    sourceId: candidate.sourceId,
    location: candidate.location,
    selection: candidate.selection,
  };
}

function elementSelection(
  kind: ResultSelectionKind,
  label: string,
  elementId: number,
  x: number,
  globalX: number,
  globalY: number,
): ResultSelection {
  return { kind, label, elementId, x, globalX, globalY };
}

function updateSignedCandidate(
  current: EnvelopeCandidate | null,
  candidate: EnvelopeCandidate,
  sense: 'max' | 'min',
) {
  if (!current) return candidate;
  return sense === 'max'
    ? candidate.value > current.value ? candidate : current
    : candidate.value < current.value ? candidate : current;
}

export function buildResultEnvelopeRows(items: EnvelopeInput[]): EnvelopeRow[] {
  let momentMax: EnvelopeCandidate | null = null;
  let momentMin: EnvelopeCandidate | null = null;
  let shearMax: EnvelopeCandidate | null = null;
  let shearMin: EnvelopeCandidate | null = null;
  let axialMax: EnvelopeCandidate | null = null;
  let axialMin: EnvelopeCandidate | null = null;
  let deflectionAbs: EnvelopeCandidate | null = null;

  items.forEach(({ target, result }) => {
    result.elements.forEach(element => {
      element.stations.forEach(station => {
        const base = {
          sourceLabel: target.label,
          sourceType: target.type,
          sourceId: target.id,
          location: `单元 ${element.elementId} · x=${station.x.toFixed(2)} m`,
        };

        const moment = {
          ...base,
          value: station.moment,
          selection: elementSelection('moment', rowMeta['moment-max'].label, element.elementId, station.x, station.globalX, station.globalY),
        };
        momentMax = updateSignedCandidate(momentMax, { ...moment, selection: { ...moment.selection, label: rowMeta['moment-max'].label } }, 'max');
        momentMin = updateSignedCandidate(momentMin, { ...moment, selection: { ...moment.selection, label: rowMeta['moment-min'].label } }, 'min');

        const shear = {
          ...base,
          value: station.shear,
          selection: elementSelection('shear', rowMeta['shear-max'].label, element.elementId, station.x, station.globalX, station.globalY),
        };
        shearMax = updateSignedCandidate(shearMax, { ...shear, selection: { ...shear.selection, label: rowMeta['shear-max'].label } }, 'max');
        shearMin = updateSignedCandidate(shearMin, { ...shear, selection: { ...shear.selection, label: rowMeta['shear-min'].label } }, 'min');

        const axial = {
          ...base,
          value: station.axial,
          selection: elementSelection('axial', rowMeta['axial-max'].label, element.elementId, station.x, station.globalX, station.globalY),
        };
        axialMax = updateSignedCandidate(axialMax, { ...axial, selection: { ...axial.selection, label: rowMeta['axial-max'].label } }, 'max');
        axialMin = updateSignedCandidate(axialMin, { ...axial, selection: { ...axial.selection, label: rowMeta['axial-min'].label } }, 'min');
      });
    });

    result.displacements.forEach(displacement => {
      (['dx', 'dy'] as const).forEach(component => {
        const value = displacement[component];
        if (!deflectionAbs || Math.abs(value) > Math.abs(deflectionAbs.value)) {
          deflectionAbs = {
            value,
            sourceLabel: target.label,
            sourceType: target.type,
            sourceId: target.id,
            location: `节点 ${displacement.nodeId} · ${component}`,
            selection: {
              kind: 'deflection',
              label: rowMeta['deflection-abs'].label,
              nodeId: displacement.nodeId,
              component,
            },
          };
        }
      });
    });
  });

  return [
    toRow('moment-max', momentMax),
    toRow('moment-min', momentMin),
    toRow('shear-max', shearMax),
    toRow('shear-min', shearMin),
    toRow('axial-max', axialMax),
    toRow('axial-min', axialMin),
    toRow('deflection-abs', deflectionAbs),
  ];
}
