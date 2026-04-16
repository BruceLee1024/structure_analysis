import { StructureType } from '@/types';
import type { AgentAction, AgentParseResult } from './types';

const chineseDigits: Record<string, number> = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
};

function readSpanCount(text: string): number | null {
  const match = text.match(/([一二三四五六]|\d+)跨/);
  if (!match) return null;
  return Number(match[1]) || chineseDigits[match[1]] || null;
}

function readOrdinalSpan(text: string): number | null {
  const arabicMatch = text.match(/第(\d+)跨/);
  if (arabicMatch) return Number(arabicMatch[1]);

  const chineseMatch = text.match(/第([一二三四五六])跨/);
  if (chineseMatch) return chineseDigits[chineseMatch[1]] || null;

  return null;
}

function readOrdinalLoad(text: string): number | null {
  const arabicMatch = text.match(/第(\d+)个?荷载/);
  if (arabicMatch) return Number(arabicMatch[1]);

  const chineseMatch = text.match(/第([一二三四五六])个?荷载/);
  if (chineseMatch) return chineseDigits[chineseMatch[1]] || null;

  return null;
}

function readNumber(text: string, pattern: RegExp): number | null {
  const match = text.match(pattern);
  return match ? Number(match[1]) : null;
}

function readCount(text: string, suffix: string): number | null {
  const match = text.match(new RegExp(`([一二三四五六]|\\d+)${suffix}`));
  if (!match) return null;
  return Number(match[1]) || chineseDigits[match[1]] || null;
}

function readStructureType(text: string): StructureType | null {
  if (text.includes('连续梁')) return StructureType.MultiSpanBeam;
  if (text.includes('简支梁')) return StructureType.Beam;
  if (text.includes('人字刚架')) return StructureType.GableFrame;
  if (text.includes('门式刚架') || text.includes('门架')) return StructureType.PortalFrame;
  if ((text.includes('框架') && text.includes('层')) || text.includes('多层框架') || text.includes('多跨框架')) {
    return StructureType.MultiStoryFrame;
  }
  if (text.includes('桁架')) return StructureType.Truss;
  if (text.includes('悬臂')) return StructureType.Cantilever;
  return null;
}

function readLocation(text: string): number | null {
  if (text.includes('跨中') || text.includes('中点')) return 0.5;
  if (text.includes('左端')) return 0;
  if (text.includes('右端')) return 1;
  if (text.includes('左1/3') || text.includes('左三分之一')) return 1 / 3;
  if (text.includes('右1/3') || text.includes('右三分之一') || text.includes('靠右一点')) return 2 / 3;
  if (text.includes('靠左一点')) return 1 / 3;

  const ratio = text.match(/(\d+)\/(\d+)跨/);
  if (ratio) return Number(ratio[1]) / Number(ratio[2]);

  const percentage = text.match(/(\d+(?:\.\d+)?)%跨/);
  if (percentage) return Number(percentage[1]) / 100;

  return null;
}

function readLocationDelta(text: string): number | null {
  const shiftPercent = text.match(/([左右])移(\d+(?:\.\d+)?)%/);
  if (shiftPercent) {
    return (shiftPercent[1] === '右' ? 1 : -1) * (Number(shiftPercent[2]) / 100);
  }

  if (text.includes('右移一点') || text.includes('往右一点') || text.includes('向右一点')) return 0.15;
  if (text.includes('左移一点') || text.includes('往左一点') || text.includes('向左一点')) return -0.15;

  return null;
}

function readExplicitMagnitudeUpdate(text: string): number | null {
  return (
    readNumber(text, /(?:改成|改为|调成|调为|调到|改到)(\d+(?:\.\d+)?)kN(?!\/m|·m|m)/i) ??
    readNumber(text, /(?:设为|设成)(\d+(?:\.\d+)?)kN(?!\/m|·m|m)/i)
  );
}

function readRelativeMagnitudeDelta(text: string): number | null {
  const increase = text.match(/(?:增大|增加|加大|调大)(\d+(?:\.\d+)?)kN(?!\/m|·m|m)/i);
  if (increase) return -Number(increase[1]);

  const decrease = text.match(/(?:减小|减少|调小)(\d+(?:\.\d+)?)kN(?!\/m|·m|m)/i);
  if (decrease) return Number(decrease[1]);

  return null;
}

function readMagnitudeScale(text: string): number | null {
  if (text.includes('减半')) return 0.5;
  if (text.includes('翻倍') || text.includes('加倍') || text.includes('放大一倍')) return 2;
  return null;
}

function withDefaults<T extends Record<string, number | string | boolean | undefined>>(payload: T): Record<string, number | string | boolean> {
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined && value !== null));
}

function parseCreateStructureAction(text: string): AgentAction | null {
  const structureType = readStructureType(text);
  if (!structureType) return null;

  const spans = readSpanCount(text) ?? readCount(text, '榀');
  const stories = readCount(text, '层');
  const bays = readCount(text, '跨');
  const eachSpan =
    readNumber(text, /(?:跨长都|每跨|跨长|每榀)(\d+(?:\.\d+)?)米/) ??
    readNumber(text, /(?:跨度|总长|长度)(\d+(?:\.\d+)?)米/);
  const totalWidth =
    readNumber(text, /(?:总长|总跨度|长度)(\d+(?:\.\d+)?)米/) ??
    readNumber(text, /(?:跨度)(\d+(?:\.\d+)?)米/);
  const height =
    readNumber(text, /(?:柱高|层高|高度|高)(\d+(?:\.\d+)?)米/) ??
    (stories ? stories * 3 : null);
  const roofHeight = readNumber(text, /(?:屋脊高|屋顶高|坡顶高)(\d+(?:\.\d+)?)米/);

  if (structureType === StructureType.MultiSpanBeam) {
    const numSpans = spans ?? 3;
    const width = totalWidth ?? (eachSpan ? eachSpan * numSpans : numSpans * 6);
    return {
      kind: 'create_structure',
      payload: withDefaults({ structureType, numSpans, width }),
    };
  }

  if (structureType === StructureType.Beam) {
    const width = totalWidth ?? eachSpan ?? 6;
    return {
      kind: 'create_structure',
      payload: withDefaults({ structureType, width }),
    };
  }

  if (structureType === StructureType.PortalFrame) {
    const width = totalWidth ?? eachSpan ?? 12;
    return {
      kind: 'create_structure',
      payload: withDefaults({ structureType, width, height: height ?? 5 }),
    };
  }

  if (structureType === StructureType.MultiStoryFrame) {
    const numStories = stories ?? 2;
    const numBays = bays ?? 2;
    const width = totalWidth ?? (eachSpan ? eachSpan * numBays : numBays * 6);
    return {
      kind: 'create_structure',
      payload: withDefaults({ structureType, numStories, numBays, width, height: height ?? numStories * 3 }),
    };
  }

  if (structureType === StructureType.Truss) {
    const numSpans = spans ?? 3;
    const width = totalWidth ?? (eachSpan ? eachSpan * numSpans : numSpans * 3);
    return {
      kind: 'create_structure',
      payload: withDefaults({ structureType, numSpans, width, height: height ?? 3 }),
    };
  }

  if (structureType === StructureType.GableFrame) {
    const width = totalWidth ?? eachSpan ?? 15;
    return {
      kind: 'create_structure',
      payload: withDefaults({ structureType, width, height: height ?? 6, roofHeight: roofHeight ?? 2 }),
    };
  }

  return {
    kind: 'create_structure',
    payload: withDefaults({ structureType, width: totalWidth ?? eachSpan ?? 6, height: height ?? 4 }),
  };
}

function parseLoadAction(text: string): AgentAction | null {
  const hasDistributed = text.includes('分布荷载') || text.includes('均布荷载') || /kN\/m/i.test(text);
  const hasMoment = text.includes('力矩') || /kN·m|kNm/i.test(text);
  const hasPoint = text.includes('集中力') || (/(加|施加|作用)/.test(text) && /kN/i.test(text) && !hasDistributed && !hasMoment);

  if (!hasDistributed && !hasMoment && !hasPoint) return null;

  const targetSpan = readOrdinalSpan(text) ?? 1;
  const location = readLocation(text) ?? 0.5;
  const direction = text.includes('向左') ? 'x' : text.includes('向右') ? 'x' : 'y';

  if (hasDistributed) {
    const magnitude = readNumber(text, /(\d+(?:\.\d+)?)kN\/m/i) ?? 5;
    return {
      kind: 'add_load',
      payload: {
        loadType: 'distributed',
        magnitude: direction === 'y' && !text.includes('向上') ? -magnitude : magnitude,
        direction,
        targetSpan,
      },
    };
  }

  if (hasMoment) {
    const magnitude = readNumber(text, /(\d+(?:\.\d+)?)(?:kN·m|kNm)/i) ?? 10;
    return {
      kind: 'add_load',
      payload: {
        loadType: 'moment',
        magnitude: text.includes('顺时针') ? -magnitude : magnitude,
        targetSpan,
        location,
      },
    };
  }

  const magnitude = readNumber(text, /(\d+(?:\.\d+)?)kN(?!\/m|·m|m)/i) ?? 10;
  const signedMagnitude =
    direction === 'x'
      ? text.includes('向左')
        ? -magnitude
        : magnitude
      : text.includes('向上')
        ? magnitude
        : -magnitude;

  return {
    kind: 'add_load',
    payload: {
      loadType: 'point',
      magnitude: signedMagnitude,
      direction,
      targetSpan,
      location,
    },
  };
}

function parseFollowUpLoadUpdate(text: string): AgentAction | null {
  const hasRelativeMagnitudeUpdate =
    text.includes('再大一点') ||
    text.includes('大一点') ||
    text.includes('增大一点') ||
    text.includes('再小一点') ||
    text.includes('小一点') ||
    text.includes('减小一点') ||
    text.includes('调大一点') ||
    text.includes('调小一点');

  const loadOrdinal = readOrdinalLoad(text);
  const location = readLocation(text);
  const locationDelta = readLocationDelta(text);
  const magnitudeScale = readMagnitudeScale(text);
  const explicitMagnitude = readExplicitMagnitudeUpdate(text);
  const explicitMagnitudeDelta = readRelativeMagnitudeDelta(text);
  const mentionsMove = text.includes('移到') || text.includes('挪到') || text.includes('改到') || locationDelta !== null;
  const requestsDelete =
    !text.includes('所有荷载') &&
    !text.includes('全部荷载') &&
    (text.includes('删掉') || text.includes('删除') || text.includes('去掉') || text.includes('移除')) &&
    (text.includes('荷载') || text.includes('它'));

  if (requestsDelete) {
    return {
      kind: 'remove_load',
      payload: withDefaults({ loadOrdinal }),
    };
  }

  if (!hasRelativeMagnitudeUpdate && explicitMagnitude === null && explicitMagnitudeDelta === null && magnitudeScale === null && !(mentionsMove && (location !== null || locationDelta !== null))) {
    return null;
  }

  const payload: Record<string, number | string | boolean | undefined> = {};

  if (loadOrdinal !== null) payload.loadOrdinal = loadOrdinal;

  if (explicitMagnitude !== null) {
    payload.magnitude = text.includes('向上') ? explicitMagnitude : -explicitMagnitude;
  } else if (magnitudeScale !== null) {
    payload.magnitudeScale = magnitudeScale;
  } else if (explicitMagnitudeDelta !== null) {
    payload.magnitudeDelta = explicitMagnitudeDelta;
  } else if (hasRelativeMagnitudeUpdate) {
    payload.magnitudeDelta =
      text.includes('再小一点') || text.includes('小一点') || text.includes('减小一点') || text.includes('调小一点')
        ? 5
        : -5;
  }

  if (location !== null && mentionsMove) {
    payload.location = location;
  }

  if (locationDelta !== null) {
    payload.locationDelta = locationDelta;
  }

  const targetSpan = readOrdinalSpan(text);
  if (targetSpan !== null) payload.targetSpan = targetSpan;

  return {
    kind: 'update_load',
    payload,
  };
}

export function parseRuleInput(text: string): AgentParseResult | null {
  const normalized = text.replace(/\s+/g, '');
  const createAction = parseCreateStructureAction(normalized);
  const loadAction = parseLoadAction(normalized);
  const followUpLoadUpdate = parseFollowUpLoadUpdate(normalized);

  if (createAction || loadAction) {
    const actions = [createAction, loadAction].filter(Boolean) as AgentAction[];
    const summaryParts: string[] = [];
    if (createAction?.payload.structureType === StructureType.MultiSpanBeam) {
      summaryParts.push(`识别为 ${createAction.payload.numSpans ?? 3} 跨连续梁`);
    } else if (createAction) {
      summaryParts.push('识别为新建结构模型');
    }
    if (loadAction) {
      summaryParts.push(loadAction.payload.loadType === 'distributed' ? '并添加分布荷载' : '并添加荷载');
    }

    return {
      userText: text,
      summary: summaryParts.join('，') || '识别为结构建模指令',
      confidence: actions.length > 1 ? 0.97 : 0.94,
      actions,
      riskLevel: actions.length > 1 ? 'medium' : 'low',
      requiresConfirmation: false,
    };
  }

  if (followUpLoadUpdate) {
    const summaryParts: string[] = ['识别为跟进式荷载调整'];
    if (followUpLoadUpdate.kind === 'remove_load') summaryParts.push('删除目标荷载');
    if (typeof followUpLoadUpdate.payload.magnitude === 'number') summaryParts.push('更新荷载大小');
    if (typeof followUpLoadUpdate.payload.magnitudeDelta === 'number') summaryParts.push('相对调整荷载大小');
    if (typeof followUpLoadUpdate.payload.magnitudeScale === 'number') summaryParts.push('按比例调整荷载大小');
    if (typeof followUpLoadUpdate.payload.location === 'number') summaryParts.push('更新荷载位置');
    if (typeof followUpLoadUpdate.payload.locationDelta === 'number') summaryParts.push('相对移动荷载位置');
    if (typeof followUpLoadUpdate.payload.loadOrdinal === 'number') summaryParts.push(`目标为第 ${followUpLoadUpdate.payload.loadOrdinal} 个荷载`);

    return {
      userText: text,
      summary: summaryParts.join('，'),
      confidence: 0.91,
      actions: [followUpLoadUpdate],
      riskLevel: 'medium',
      requiresConfirmation: true,
    };
  }

  if (normalized.includes('跨长改成')) {
    const width = readNumber(normalized, /跨长改成(\d+(?:\.\d+)?)米/) ?? 0;
    return {
      userText: text,
      summary: `识别为把跨长改为 ${width}m`,
      confidence: 0.91,
      actions: [{ kind: 'update_geometry', payload: { width } }],
      riskLevel: 'low',
      requiresConfirmation: false,
    };
  }

  if (normalized.includes('删除所有荷载') || normalized.includes('清除所有荷载')) {
    return {
      userText: text,
      summary: '识别为删除全部荷载',
      confidence: 0.93,
      actions: [{ kind: 'remove_load', payload: { scope: 'all' } }],
      riskLevel: 'high',
      requiresConfirmation: true,
    };
  }

  if (normalized.includes('固支') || normalized.includes('滚支') || normalized.includes('铰支')) {
    const target = normalized.includes('左端') ? 'left_end' : 'right_end';
    const supportType = normalized.includes('固支')
      ? 'Fixed'
      : normalized.includes('铰支')
        ? 'Pinned'
        : 'Roller';
    return {
      userText: text,
      summary: `识别为修改 ${target} 支座`,
      confidence: 0.9,
      actions: [{ kind: 'update_support', payload: { target, supportType } }],
      riskLevel: 'low',
      requiresConfirmation: false,
    };
  }

  if (normalized.includes('E改成') || normalized.includes('弹性模量改成')) {
    const elasticModulus = readNumber(normalized, /(\d+(?:\.\d+)?)/) ?? 200;
    return {
      userText: text,
      summary: `识别为把弹性模量改为 ${elasticModulus}`,
      confidence: 0.9,
      actions: [{ kind: 'update_material', payload: { elasticModulus } }],
      riskLevel: 'low',
      requiresConfirmation: false,
    };
  }

  if (normalized.includes('为什么') || normalized.includes('最大')) {
    return {
      userText: text,
      summary: '识别为结果解释请求',
      confidence: 0.88,
      actions: [{ kind: 'explain_results', payload: { question: text } }],
      riskLevel: 'low',
      requiresConfirmation: false,
    };
  }

  return null;
}
