import { StructureType } from '@/types';
import type { AgentAction } from './types';

type ActionTense = 'future' | 'past';

function describeStructureType(type: StructureType): string {
  switch (type) {
    case StructureType.MultiSpanBeam:
      return '连续梁';
    case StructureType.Beam:
      return '简支梁';
    case StructureType.PortalFrame:
      return '门式刚架';
    case StructureType.MultiStoryFrame:
      return '多层多跨框架';
    case StructureType.Truss:
      return '桁架';
    case StructureType.GableFrame:
      return '人字刚架';
    case StructureType.Cantilever:
      return '悬臂结构';
    case StructureType.Custom:
      return '自定义结构';
    default:
      return '结构模型';
  }
}

function describeLocation(location?: unknown): string {
  const value = Number(location);
  if (!Number.isFinite(value)) return '跨中';
  if (Math.abs(value - 0.5) < 0.05) return '跨中';
  if (value <= 0.05) return '左端';
  if (value >= 0.95) return '右端';
  return `${Math.round(value * 100)}% 位置`;
}

function describeLoadTarget(action: AgentAction): string {
  if (typeof action.payload.loadOrdinal === 'number') return `第 ${action.payload.loadOrdinal} 个荷载`;
  if (typeof action.payload.loadId === 'string') return `荷载 ${action.payload.loadId}`;
  return '目标荷载';
}

export function describeAgentAction(action: AgentAction, tense: ActionTense = 'past'): string {
  if (action.kind === 'create_structure') {
    const structureType = (action.payload.structureType as StructureType) ?? StructureType.Beam;
    const width = Number(action.payload.width);
    const spanText = Number.isFinite(Number(action.payload.numSpans)) ? `${Number(action.payload.numSpans)} 跨` : '';
    const widthText = Number.isFinite(width) ? `，总宽 ${width} m` : '';
    return `${tense === 'future' ? '创建' : '已新建'}${spanText}${describeStructureType(structureType)}${widthText}`;
  }

  if (action.kind === 'create_custom_structure') {
    const nodeCount = Array.isArray(action.payload.nodes) ? action.payload.nodes.length : 0;
    const elemCount = Array.isArray(action.payload.elements) ? action.payload.elements.length : 0;
    const loadCount = Array.isArray(action.payload.loads) ? action.payload.loads.length : 0;
    return `${tense === 'future' ? '创建' : '已创建'}自定义结构（${nodeCount} 个节点、${elemCount} 个单元、${loadCount} 个荷载）`;
  }

  if (action.kind === 'add_load') {
    const targetSpan = Number(action.payload.targetSpan);
    const magnitude = Math.abs(Number(action.payload.magnitude) || 0);
    const spanText = Number.isFinite(targetSpan) ? `第 ${targetSpan} 跨` : '当前结构';
    if (action.payload.loadType === 'distributed') {
      return `${tense === 'future' ? '在' : '已在'}${spanText}添加 ${magnitude} kN/m 分布荷载`;
    }
    if (action.payload.loadType === 'moment') {
      return `${tense === 'future' ? '在' : '已在'}${spanText}${describeLocation(action.payload.location)}添加 ${magnitude} kN·m 力矩`;
    }
    return `${tense === 'future' ? '在' : '已在'}${spanText}${describeLocation(action.payload.location)}添加 ${magnitude} kN 集中力`;
  }

  if (action.kind === 'update_geometry') {
    return `${tense === 'future' ? '更新' : '已更新'}结构几何参数`;
  }

  if (action.kind === 'update_material') {
    return `${tense === 'future' ? '更新' : '已更新'}截面与材料参数`;
  }

  if (action.kind === 'update_load') {
    const target = describeLoadTarget(action);
    if (typeof action.payload.magnitude === 'number') {
      return `${tense === 'future' ? '把' : '已把'}${target}改为 ${Math.abs(action.payload.magnitude)} kN`;
    }
    if (typeof action.payload.magnitudeDelta === 'number') {
      return `${tense === 'future' ? '把' : '已把'}${target}${action.payload.magnitudeDelta < 0 ? '增大' : '减小'} ${Math.abs(action.payload.magnitudeDelta)} kN`;
    }
    if (typeof action.payload.magnitudeScale === 'number') {
      if (Math.abs(action.payload.magnitudeScale - 0.5) < 0.01) return `${tense === 'future' ? '将' : '已将'}${target}减半`;
      if (Math.abs(action.payload.magnitudeScale - 2) < 0.01) return `${tense === 'future' ? '将' : '已将'}${target}翻倍`;
      return `${tense === 'future' ? '将' : '已将'}${target}调整为原来的 ${(action.payload.magnitudeScale * 100).toFixed(0)}%`;
    }
    if (typeof action.payload.location === 'number') {
      return `${tense === 'future' ? '把' : '已把'}${target}移到${describeLocation(action.payload.location)}`;
    }
    if (typeof action.payload.locationDelta === 'number') {
      return `${tense === 'future' ? '将' : '已将'}${target}${action.payload.locationDelta > 0 ? '向右移动' : '向左移动'} ${Math.abs(action.payload.locationDelta * 100).toFixed(0)}% 跨长`;
    }
    return `${tense === 'future' ? '调整' : '已更新'}${target}`;
  }

  if (action.kind === 'remove_load') {
    if (action.payload.scope === 'all') return `${tense === 'future' ? '清空' : '已清空'}全部荷载`;
    return `${tense === 'future' ? '删除' : '已删除'}${describeLoadTarget(action)}`;
  }

  if (action.kind === 'update_support') {
    return `${tense === 'future' ? '把' : '已把'}${action.payload.target === 'right_end' ? '右端' : '左端'}支座改为${action.payload.supportType === 'Fixed' ? '固支' : action.payload.supportType === 'Pinned' ? '铰支' : action.payload.supportType === 'Roller' ? '滚支' : '自由端'}`;
  }

  if (action.kind === 'explain_results') {
    return `${tense === 'future' ? '解释' : '已解释'}调整后的结果变化`;
  }

  if (action.kind === 'summarize_model') {
    return `${tense === 'future' ? '总结' : '已总结'}当前模型`;
  }

  if (action.kind === 'undo_last_agent_action') {
    return `${tense === 'future' ? '撤销' : '已撤销'}上一条 Agent 操作`;
  }

  return `${tense === 'future' ? '执行' : '已执行'} ${action.kind}`;
}
