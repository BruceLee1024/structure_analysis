import type { AnalysisResult, SolverElement, SolverNode } from '../types';
import type { SpaceAnalysisResult, SpaceElement, SpaceNode } from './spaceSolver';

export interface ServiceabilityRow {
  elementId: number;
  lengthM: number;
  limitRatio: number;
  limitMm: number;
  deflectionMm: number;
  utilization: number;
  locationM: number;
  passed: boolean;
}

export interface SpaceServiceabilityRow {
  elementId: number;
  lengthM: number;
  limitRatio: number;
  limitMm: number;
  displacementMm: number;
  utilization: number;
  controllingNodeId: number;
  passed: boolean;
}

const DEFAULT_DEFLECTION_LIMIT_RATIO = 250;

const elementLength = (element: SolverElement, nodes: SolverNode[]) => {
  const start = nodes.find(node => node.id === element.startNode);
  const end = nodes.find(node => node.id === element.endNode);
  if (!start || !end) return 0;
  return Math.hypot(end.x - start.x, end.y - start.y);
};

const spaceElementLength = (element: SpaceElement, nodes: SpaceNode[]) => {
  const start = nodes.find(node => node.id === element.startNode);
  const end = nodes.find(node => node.id === element.endNode);
  if (!start || !end) return 0;
  return Math.hypot(end.x - start.x, end.y - start.y, end.z - start.z);
};

export function normalizeDeflectionLimitRatio(value?: number) {
  if (!Number.isFinite(value) || (value ?? 0) <= 0) return DEFAULT_DEFLECTION_LIMIT_RATIO;
  return Math.max(50, Math.min(1000, Math.round(value ?? DEFAULT_DEFLECTION_LIMIT_RATIO)));
}

export function buildServiceabilityRows(
  result: AnalysisResult,
  elements: SolverElement[],
  nodes: SolverNode[],
  limitRatioInput?: number,
): ServiceabilityRow[] {
  const limitRatio = normalizeDeflectionLimitRatio(limitRatioInput);

  return result.elements.flatMap(elementResult => {
    const element = elements.find(item => item.id === elementResult.elementId);
    if (!element || elementResult.stations.length === 0) return [];

    const lengthM = elementLength(element, nodes);
    if (lengthM <= 0) return [];

    const controllingStation = elementResult.stations.reduce((current, station) => (
      Math.abs(station.deflectionY) > Math.abs(current.deflectionY) ? station : current
    ), elementResult.stations[0]);

    const deflectionMm = Math.abs(controllingStation.deflectionY);
    const limitMm = lengthM * 1000 / limitRatio;
    const utilization = limitMm > 0 ? deflectionMm / limitMm : 0;

    return [{
      elementId: elementResult.elementId,
      lengthM,
      limitRatio,
      limitMm,
      deflectionMm,
      utilization,
      locationM: controllingStation.x,
      passed: utilization <= 1 + 1e-9,
    }];
  });
}

export function getWorstServiceabilityRow(rows: ServiceabilityRow[]) {
  return rows.reduce<ServiceabilityRow | null>((worst, row) => {
    if (!worst || row.utilization > worst.utilization) return row;
    return worst;
  }, null);
}

export function buildSpaceServiceabilityRows(
  result: SpaceAnalysisResult,
  elements: SpaceElement[],
  nodes: SpaceNode[],
  limitRatioInput?: number,
): SpaceServiceabilityRow[] {
  const limitRatio = normalizeDeflectionLimitRatio(limitRatioInput);
  const displacementMap = new Map(result.displacements.map(displacement => [displacement.nodeId, displacement]));

  return result.elements.flatMap(elementResult => {
    const element = elements.find(item => item.id === elementResult.elementId);
    if (!element) return [];

    const lengthM = spaceElementLength(element, nodes);
    if (lengthM <= 0) return [];

    const startDisplacement = displacementMap.get(element.startNode);
    const endDisplacement = displacementMap.get(element.endNode);
    if (!startDisplacement || !endDisplacement) return [];

    const startMagnitude = Math.hypot(startDisplacement.dx, startDisplacement.dy, startDisplacement.dz);
    const endMagnitude = Math.hypot(endDisplacement.dx, endDisplacement.dy, endDisplacement.dz);
    const controllingNodeId = endMagnitude >= startMagnitude ? element.endNode : element.startNode;
    const displacementMm = Math.max(startMagnitude, endMagnitude);
    const limitMm = lengthM * 1000 / limitRatio;
    const utilization = limitMm > 0 ? displacementMm / limitMm : 0;

    return [{
      elementId: elementResult.elementId,
      lengthM,
      limitRatio,
      limitMm,
      displacementMm,
      utilization,
      controllingNodeId,
      passed: utilization <= 1 + 1e-9,
    }];
  });
}

export function getWorstSpaceServiceabilityRow(rows: SpaceServiceabilityRow[]) {
  return rows.reduce<SpaceServiceabilityRow | null>((worst, row) => {
    if (!worst || row.utilization > worst.utilization) return row;
    return worst;
  }, null);
}
