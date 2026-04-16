import { StructureType, type AnalysisResult, type Load, type SolverParams } from '@/types';
import type { AgentModelSummary } from './types';

const structureLabels: Record<StructureType, string> = {
  [StructureType.Beam]: '简支梁',
  [StructureType.MultiSpanBeam]: '连续梁',
  [StructureType.PortalFrame]: '门式刚架',
  [StructureType.MultiStoryFrame]: '多层多跨框架',
  [StructureType.GableFrame]: '人字形刚架',
  [StructureType.Truss]: '桁架',
  [StructureType.Cantilever]: '悬臂刚架',
  [StructureType.Custom]: '自定义结构',
};

function toChineseCount(value: number): string {
  const digits = ['', '一', '二', '三', '四', '五', '六', '七', '八'];
  return digits[value] || `${value}`;
}

function describeStructure(params: SolverParams): string {
  if (params.structureType === StructureType.MultiSpanBeam) {
    return `${toChineseCount(params.numSpans)}跨连续梁`;
  }
  return structureLabels[params.structureType];
}

function findSpanIndex(params: SolverParams, elementId?: number): number | null {
  if (!elementId) return null;
  const index = params.elements.findIndex(element => element.id === elementId);
  return index >= 0 ? index + 1 : null;
}

function describeLoad(load: Load, params: SolverParams): string {
  const spanIndex = findSpanIndex(params, load.elementId);
  const targetLabel = spanIndex
    ? `第${toChineseCount(spanIndex)}跨`
    : load.nodeId
      ? `节点${load.nodeId}`
      : `单元${load.elementId}`;

  if (load.type === 'point') {
    const directionLabel =
      load.direction === 'x'
        ? load.magnitude >= 0
          ? '向右'
          : '向左'
        : load.magnitude >= 0
          ? '向上'
          : '向下';
    const locationLabel = load.elementId
      ? load.location === 0.5
        ? '跨中'
        : `${Math.round((load.location ?? 0.5) * 100)}%跨处`
      : '';
    return `${targetLabel}${locationLabel} ${Math.abs(load.magnitude)}kN ${directionLabel}集中力`;
  }

  if (load.type === 'distributed') {
    return `${targetLabel}上 ${Math.abs(load.magnitude)}kN/m 分布荷载`;
  }

  return `${targetLabel}处 ${Math.abs(load.magnitude)}kN·m 力矩`;
}

export function buildResultSummary(results: AnalysisResult): string[] {
  if (results.error) return [`求解失败：${results.error}`];

  const summary: string[] = [`最大位移 ${results.maxDeflection.toFixed(4)}m`];

  if (results.reactions.length > 0) {
    const maxReaction = [...results.reactions].sort((a, b) => Math.abs(b.fy) - Math.abs(a.fy))[0];
    summary.push(`最大竖向反力 节点 ${maxReaction.nodeId} ${maxReaction.fy.toFixed(2)}kN`);
  }

  if (results.elements.length > 0) {
    const maxMoment = [...results.elements].sort((a, b) => Math.abs(b.maxMoment) - Math.abs(a.maxMoment))[0];
    summary.push(`最大弯矩 单元 ${maxMoment.elementId} ${maxMoment.maxMoment.toFixed(2)}kN·m`);
  }

  return summary;
}

export function buildModelSummary(params: SolverParams, results: AnalysisResult): AgentModelSummary {
  const supportCount = params.nodes.filter(node => node.restraints.some(Boolean)).length;
  const geometrySummary =
    params.structureType === StructureType.MultiSpanBeam
      ? `${params.numSpans} 跨，总长 ${params.width}m`
      : `宽 ${params.width}m，高 ${params.height}m`;

  return {
    structureType: params.structureType,
    structureLabel: describeStructure(params),
    geometrySummary,
    supportSummary: `${supportCount} 个支承点`,
    loadCount: params.loads.length,
    loadDescriptions: params.loads.map(load => describeLoad(load, params)),
    resultSummary: buildResultSummary(results),
  };
}

export function describeModelSummary(summary: AgentModelSummary): string {
  const loads = summary.loadDescriptions.length > 0 ? summary.loadDescriptions.join('；') : '当前无荷载';
  const results = summary.resultSummary.length > 0 ? `，计算结果：${summary.resultSummary.join('；')}` : '';
  return `${summary.structureLabel}，${summary.geometrySummary}，${summary.supportSummary}，${loads}${results}`;
}
