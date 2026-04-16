import { StructureType, type AnalysisResult, type Load, type SolverElement, type SolverNode, type SolverParams } from '@/types';
import { sendChatCompletion, sendChatCompletionStream } from '@/utils/aiClient';
import { buildModelSummary, describeModelSummary } from './modelSummary';
import type { AgentExplainerContext } from './types';

const weakExplanationPatterns = ['已知事实', '没有提供任何', '缺乏', '无法解释', '无法判断', '信息不足', '不能解释'];

export function summarizeResultFacts(_params: SolverParams, results: AnalysisResult): string[] {
  if (results.error) return [`求解失败：${results.error}`];

  const facts: string[] = [`最大位移为 ${results.maxDeflection.toFixed(4)} m`];

  if (results.reactions.length > 0) {
    const maxReaction = [...results.reactions].sort((a, b) => Math.abs(b.fy) - Math.abs(a.fy))[0];
    facts.push(`最大竖向反力出现在节点 ${maxReaction.nodeId}，数值为 ${maxReaction.fy.toFixed(2)} kN`);
  }

  if (results.elements.length > 0) {
    const maxMoment = [...results.elements].sort((a, b) => Math.abs(b.maxMoment) - Math.abs(a.maxMoment))[0];
    facts.push(`最大弯矩出现在单元 ${maxMoment.elementId}，数值为 ${maxMoment.maxMoment.toFixed(2)} kN·m`);
  }

  return facts;
}

function supportLabel(node?: SolverNode): string {
  if (!node) return '未知约束';
  const [rx, ry, rm] = node.restraints;
  if (rx && ry && rm) return '固支';
  if (rx && ry) return '铰支';
  if (ry || rx) return '滚支/单向约束';
  if (rm) return '转角约束';
  return '自由连接';
}

function elementLabel(params: SolverParams, elementId: number): string {
  const index = params.elements.findIndex(element => element.id === elementId);
  if (index < 0) return `单元 ${elementId}`;
  if (params.structureType === StructureType.MultiSpanBeam) return `第 ${index + 1} 跨对应单元 ${elementId}`;
  return `第 ${index + 1} 个单元（ID ${elementId}）`;
}

function loadText(load: Load, params: SolverParams): string {
  const element = load.elementId ? params.elements.find(item => item.id === load.elementId) : undefined;
  const elementIndex = element ? params.elements.findIndex(item => item.id === element.id) : -1;
  const targetText =
    load.elementId !== undefined
      ? params.structureType === StructureType.MultiSpanBeam && elementIndex >= 0
        ? `第 ${elementIndex + 1} 跨`
        : `单元 ${load.elementId}`
      : load.nodeId !== undefined
        ? `节点 ${load.nodeId}`
        : '当前位置';

  if (load.type === 'distributed') {
    return `${targetText}上的 ${Math.abs(load.magnitude)} kN/m 分布荷载`;
  }

  if (load.type === 'moment') {
    return `${targetText}处 ${Math.abs(load.magnitude)} kN·m 力矩`;
  }

  const locationText = load.elementId
    ? Math.abs((load.location ?? 0.5) - 0.5) < 0.05
      ? '跨中'
      : `${Math.round((load.location ?? 0.5) * 100)}% 跨长处`
    : '';
  const directionText = load.direction === 'x' ? (load.magnitude >= 0 ? '向右' : '向左') : load.magnitude >= 0 ? '向上' : '向下';
  return `${targetText}${locationText}的 ${Math.abs(load.magnitude)} kN ${directionText}集中力`;
}

function nearbyElementIds(params: SolverParams, elementId: number): number[] {
  const index = params.elements.findIndex(element => element.id === elementId);
  if (index < 0) return [elementId];
  return [params.elements[index - 1]?.id, params.elements[index]?.id, params.elements[index + 1]?.id].filter(
    (value): value is number => typeof value === 'number',
  );
}

function relatedLoads(context: AgentExplainerContext, elementId?: number, nodeId?: number): Load[] {
  if (typeof nodeId === 'number') {
    return context.loads.filter(load => load.nodeId === nodeId || load.elementId !== undefined);
  }

  if (typeof elementId !== 'number') return context.loads;

  const element = context.params.elements.find(item => item.id === elementId);
  const nodeIds = new Set<number>(
    [element?.startNode, element?.endNode].filter((value): value is number => typeof value === 'number'),
  );
  const candidateIds = new Set<number>(nearbyElementIds(context.params, elementId));
  return context.loads.filter(
    load =>
      (typeof load.elementId === 'number' && candidateIds.has(load.elementId)) ||
      (typeof load.nodeId === 'number' && nodeIds.has(load.nodeId)),
  );
}

function structureMechanism(params: SolverParams, element?: SolverElement): string {
  if (params.structureType === StructureType.Beam) {
    return '对简支梁而言，弯矩通常在荷载作用较集中且距离支座较远的位置增大。';
  }

  if (params.structureType === StructureType.MultiSpanBeam) {
    const index = element ? params.elements.findIndex(item => item.id === element.id) : -1;
    if (index > 0 && index < params.elements.length - 1) {
      return '由于连续梁中间跨同时受到相邻跨连续性的转角约束，内力会发生重分配，峰值更容易集中在中跨控制段。';
    }
    return '连续梁的跨间连续性会改变单跨梁的弯矩分布，支座附近和受荷较重的跨段都可能成为控制位置。';
  }

  if (params.structureType === StructureType.PortalFrame || params.structureType === StructureType.GableFrame) {
    return '刚架节点能够传递弯矩，梁柱连接处与受荷更集中的杆件往往会形成更高的弯矩峰值。';
  }

  return '该结果由结构形式、杆件刚度分布和荷载作用路径共同决定。';
}

function summarizeReasoningContext(context: AgentExplainerContext, question: string): string {
  const normalizedQuestion = question.replace(/\s+/g, '');

  if (normalizedQuestion.includes('弯矩')) {
    const target = [...context.results.elements].sort((a, b) => Math.abs(b.maxMoment) - Math.abs(a.maxMoment))[0];
    if (!target) return '当前结果中没有可用于分析弯矩峰值的单元数据。';
    const element = context.params.elements.find(item => item.id === target.elementId);
    const startNode = element ? context.params.nodes.find(node => node.id === element.startNode) : undefined;
    const endNode = element ? context.params.nodes.find(node => node.id === element.endNode) : undefined;
    const loads = relatedLoads(context, target.elementId)
      .slice(0, 3)
      .map(load => loadText(load, context.params));
    const loadSummary = loads.length > 0 ? `相关荷载包括：${loads.join('；')}。` : '当前该控制段附近没有直接标注的荷载，峰值更可能来自相邻荷载通过结构连续性传递。';
    return `${elementLabel(context.params, target.elementId)}的最大弯矩为 ${target.maxMoment.toFixed(2)} kN·m。该单元两端约束状态分别为 ${supportLabel(startNode)} 和 ${supportLabel(endNode)}。${loadSummary}${structureMechanism(context.params, element)}`;
  }

  if (normalizedQuestion.includes('位移')) {
    const target = [...context.results.displacements].sort(
      (a, b) => Math.abs(b.dy) + Math.abs(b.dx) - (Math.abs(a.dy) + Math.abs(a.dx)),
    )[0];
    if (!target) return '当前结果中没有可用于分析位移峰值的节点数据。';
    const node = context.params.nodes.find(item => item.id === target.nodeId);
    const connectedElements = context.params.elements.filter(
      element => element.startNode === target.nodeId || element.endNode === target.nodeId,
    );
    const loads = connectedElements.length > 0 ? relatedLoads(context, connectedElements[0].id) : context.loads;
    const loadSummary = loads.length > 0 ? `该节点附近的主要荷载有：${loads.slice(0, 3).map(load => loadText(load, context.params)).join('；')}。` : '该节点附近未识别到直接荷载，位移更可能由整体柔度控制。';
    return `最大位移控制节点为 ${target.nodeId}，位移约为 ${Math.abs(target.dy || target.dx).toFixed(4)} m。该节点约束状态为 ${supportLabel(node)}。${loadSummary}位移峰值通常出现在约束较弱、距离主要支座较远且受荷更集中的位置。`;
  }

  if (normalizedQuestion.includes('反力')) {
    const target = [...context.results.reactions].sort((a, b) => Math.abs(b.fy) - Math.abs(a.fy))[0];
    if (!target) return '当前结果中没有可用于分析支座反力的数据。';
    const node = context.params.nodes.find(item => item.id === target.nodeId);
    const loads = relatedLoads(context, undefined, target.nodeId).slice(0, 3);
    const loadSummary = loads.length > 0 ? `与该支座传力路径最相关的荷载有：${loads.map(load => loadText(load, context.params)).join('；')}。` : '当前未找到与该支座直接关联的荷载描述，但反力仍由整体荷载路径决定。';
    return `最大竖向反力出现在节点 ${target.nodeId}，数值为 ${target.fy.toFixed(2)} kN。该节点约束状态为 ${supportLabel(node)}。${loadSummary}反力峰值通常出现在约束更强、离主要荷载路径更近的支承点。`;
  }

  return describeModelSummary(buildModelSummary(context.params, context.results));
}

export function explainResultsLocally(context: AgentExplainerContext, question: string): string {
  if (context.results.error) return `当前模型求解失败：${context.results.error}`;

  const facts = summarizeResultFacts(context.params, context.results).join('；');
  const normalizedQuestion = question.replace(/\s+/g, '');
  const asksWhy = normalizedQuestion.includes('为什么') || normalizedQuestion.includes('原因') || normalizedQuestion.includes('为何');
  const reasoning = summarizeReasoningContext(context, question);

  if (asksWhy) {
    return `${reasoning}因此，这里的结果峰值并不是孤立出现的，而是由结构形式、边界约束和荷载位置共同控制。`;
  }

  return `${facts}。结合当前模型看，${reasoning}`;
}

export function buildExplainerPrompt(context: AgentExplainerContext, question: string): string {
  const facts = summarizeResultFacts(context.params, context.results).join('；');
  const modelSummary = describeModelSummary(buildModelSummary(context.params, context.results));
  const reasoning = summarizeReasoningContext(context, question);
  return `你是结构力学助教。请基于当前模型、支座条件、荷载位置与计算结果回答用户。你可以做定性因果解释，但不要编造不存在的数值。\n当前模型：${modelSummary}\n关键结果：${facts}\n补充分析线索：${reasoning}\n用户问题：${question}\n回答要求：先直接回答问题，再说明结构形式、边界约束和荷载路径如何共同导致这个结果。`;
}

function shouldUseLocalFallback(answer: string, question: string): boolean {
  const normalizedAnswer = answer.replace(/\s+/g, '');
  if (!normalizedAnswer) return true;
  const asksWhy = /为什么|原因|为何/.test(question);
  return asksWhy && weakExplanationPatterns.some(pattern => normalizedAnswer.includes(pattern));
}

export async function explainResultsWithLLM(
  context: AgentExplainerContext,
  question: string,
  onChunk?: (delta: string) => void,
): Promise<string> {
  const messages: { role: 'system' | 'user'; content: string }[] = [
    {
      role: 'system',
      content: '你是结构力学助教。请优先基于提供的模型、荷载、支座和结果进行解释。允许做结构力学上的定性因果分析，但不得编造新的数值或与结果相矛盾的结论。',
    },
    {
      role: 'user',
      content: buildExplainerPrompt(context, question),
    },
  ];

  let answer: string;
  if (onChunk) {
    answer = (await sendChatCompletionStream(messages, onChunk)).trim();
  } else {
    answer = (await sendChatCompletion(messages)).trim();
  }

  if (shouldUseLocalFallback(answer, question)) {
    return explainResultsLocally(context, question);
  }
  return answer;
}
