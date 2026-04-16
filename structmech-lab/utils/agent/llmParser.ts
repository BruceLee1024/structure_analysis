import type { AnalysisResult, SolverParams } from '@/types';
import { sendChatCompletionStream } from '@/utils/aiClient';
import { buildResultSummary } from './modelSummary';
import type { AgentAction, AgentParseResult, AgentSessionState } from './types';

const allowedActionKinds = new Set<AgentAction['kind']>([
  'create_structure',
  'update_geometry',
  'update_material',
  'add_load',
  'update_load',
  'remove_load',
  'update_support',
  'explain_results',
  'summarize_model',
  'undo_last_agent_action',
]);

function extractJsonPayload(content: string): string | null {
  const trimmed = content.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) return trimmed;

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) return fenced[1].trim();

  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first >= 0 && last > first) return trimmed.slice(first, last + 1);

  return null;
}

function sanitizeParseResult(text: string, raw: unknown): AgentParseResult | null {
  if (!raw || typeof raw !== 'object') return null;

  const candidate = raw as Partial<AgentParseResult> & { actions?: unknown[] };
  const actions = Array.isArray(candidate.actions)
    ? candidate.actions.filter(
        action =>
          Boolean(action) &&
          typeof action === 'object' &&
          allowedActionKinds.has((action as AgentAction).kind) &&
          typeof (action as AgentAction).payload === 'object',
      )
    : [];

  const clarification = typeof candidate.clarification === 'string' ? candidate.clarification : undefined;
  let requiresConfirmation = typeof candidate.requiresConfirmation === 'boolean' ? candidate.requiresConfirmation : actions.length !== 1;

  // Consistency: if LLM returned clarification text but didn't set requiresConfirmation, force it
  if (clarification && !requiresConfirmation && actions.length > 0) {
    requiresConfirmation = true;
  }

  return {
    userText: typeof candidate.userText === 'string' ? candidate.userText : text,
    summary: typeof candidate.summary === 'string' ? candidate.summary : '已根据上下文生成结构化动作。',
    confidence: typeof candidate.confidence === 'number' ? candidate.confidence : 0.6,
    actions: actions as AgentAction[],
    riskLevel:
      candidate.riskLevel === 'low' || candidate.riskLevel === 'medium' || candidate.riskLevel === 'high'
        ? candidate.riskLevel
        : 'medium',
    requiresConfirmation,
    clarification,
  };
}

function buildSystemPrompt(): string {
  return [
    '你是结构力学求解器 Agent 的语义解析器，同时也是一名经验丰富的结构工程师。',
    '你的任务是把用户的自然语言指令翻译成严格 JSON。只输出一个 JSON 对象，不要输出 Markdown、解释或代码块。',
    '',
    '═══ JSON 输出格式 ═══',
    '必含字段：userText(string), summary(string), confidence(0-1), actions(array), riskLevel("low"|"medium"|"high"), requiresConfirmation(boolean)',
    '可选字段：clarification(string)',
    'summary 应简洁描述即将执行的操作（如"在第2跨跨中添加 10kN 集中力"），不要鹦鹉学舌地复述用户原文。',
    '',
    '═══ 可用 action 及 payload ═══',
    '• create_structure: {structureType, numSpans?, width?(总宽m), height?(m), roofHeight?, numStories?, numBays?, overhangLeft?(左悬挑m), overhangRight?(右悬挑m)}',
    '  structureType 取值：Beam(简支梁), MultiSpanBeam(多跨连续梁), PortalFrame(门式刚架), MultiStoryFrame(多层框架), GableFrame(人字形刚架), Truss(桁架), Cantilever(悬臂梁)',
    '• add_load: {loadType("point"|"distributed"|"moment"), magnitude(kN,向下为负), direction?("x"|"y",默认"y"), targetSpan?(从1开始), location?(0-1,跨内相对位置,默认0.5)}',
    '• update_load: {loadId?|loadOrdinal?(从1开始), magnitude?, magnitudeScale?, magnitudeDelta?, loadType?, direction?, targetSpan?, location?, locationDelta?}',
    '• remove_load: {loadId?|loadOrdinal?, scope?("all"=清空所有)}',
    '• update_geometry: {width?, height?, numSpans?, numStories?, numBays?, roofHeight?, overhangLeft?(左悬挑m), overhangRight?(右悬挑m)}',
    '• update_material: {elasticModulus?(MPa), crossSectionArea?(cm²), momentOfInertia?(cm⁴)}',
    '• update_support: {target("left_end"|"right_end"), supportType("Fixed"|"Pinned"|"Roller"|"Free")}',
    '• explain_results: {question(用户的具体问题)}',
    '• summarize_model: {}',
    '• undo_last_agent_action: {}',
    '',
    '═══ 中文口语表达词典 ═══',
    '数值："十千牛"/"10千牛"→10kN，"两百"→200，"半"→0.5，"加大一倍"→magnitudeScale:2，"减半"→magnitudeScale:0.5，"增加5kN"→magnitudeDelta:-5',
    '位置："跨中"→location:0.5，"三分点"→location:0.333，"四分点"→location:0.25，"右边一点"→locationDelta:+0.1，"满跨"/"全跨"→distributed整跨',
    '结构："简支梁"/"两端简支"→Beam，"连续梁"→MultiSpanBeam，"悬臂"→Cantilever，"门架"/"门刚"→PortalFrame，"桁架"→Truss',
    '荷载："集中力"/"点荷载"/"竖向力"→point，"均布"/"线荷载"→distributed，"弯矩"/"力矩"→moment',
    '支座："固定"/"嵌固"/"刚接"→Fixed，"铰支"/"铰接"→Pinned，"滚支"/"滑动"→Roller，"自由端"→Free',
    '方向：默认向下(magnitude为负)。"向上"→magnitude为正。"水平"/"侧向"→direction:"x"',
    '',
    '═══ 结构力学领域知识 ═══',
    '• 荷载方向：重力向下为 magnitude 负值、direction:"y"；水平向右为正。用户不说方向时默认竖向向下。',
    '• "跨中"在多跨梁中指中间那一跨（3跨→第2跨，5跨→第3跨）；在单跨梁中指跨中位置 location:0.5。',
    '• "边跨"=第1跨和最后一跨；"中跨"=中间跨。',
    '• 集中力(point)单位 kN；均布荷载(distributed)单位 kN/m；力矩(moment)单位 kN·m。',
    '• 悬臂梁只有一端固定(Fixed)、另一端自由(Free)。简支梁一端铰支(Pinned)、一端滚支(Roller)。',
    '• 连续梁默认每跨6m，总宽=跨数×6。',
    '• 常用等效：均布荷载总力=q×L，集中力等效于跨中集中力=均布总力/2（用于粗估量级）。',
    '',
    '═══ 多轮对话与指代消解 ═══',
    '"它"/"这个荷载"/"上一个"→引用"最近对话记忆"中的最近荷载 lastLoadId，用 loadId 或 loadOrdinal 定位。',
    '"也加一个"/"同样"→沿用上一条荷载的类型、量级，改变跨号或位置。',
    '"不要…要…"/"不对，应该是…"→理解为纠正，撤销前一步再执行新指令（undo_last_agent_action + 新 action）。',
    '"每跨都加"/"所有跨"→为模型的每一跨各生成一个 add_load（根据当前模型的 numSpans 确定跨数）。',
    '"再加一个在第三跨"→在已有荷载基础上新增，不删除旧的。',
    '',
    '═══ 行为规则 ═══',
    '1. 工程推理优先：变更类指令（"均布改集中""加大""移到右边"等）从当前模型推断默认值——沿用原量级、跨中位置(0.5)、同一跨。能推断就直接执行，不求澄清。',
    '2. 荷载类型转换："改为集中力"=先 remove_load 再 add_load，沿用原量级和跨号，location 默认 0.5。',
    '3. 一致性：actions 可执行→requiresConfirmation:false，summary 不说"需要指定"。真缺关键信息（如完全没有量级来源）→不返回 actions，只返回 clarification+requiresConfirmation:true。',
    '4. 用户数值原样使用。缺失数值时优先从当前模型已有荷载继承，其次用工程常识默认值（集中力10kN、均布5kN/m）。',
    '5. 有【待补充的上一条指令】时，合并已知参数生成完整 action。',
    '6. confidence 校准：完全明确→0.9+，有合理推断→0.75-0.9，较模糊但可执行→0.6-0.75，需要澄清→<0.6。',
    '7. riskLevel：创建/删除结构→high，增删荷载→medium，查询/解释→low。',
  ].join('\n');
}


function buildFewShotExamples(): string {
  return [
    '--- 示例 ---',
    '输入：建一个三跨连续梁，跨长都 6 米，在第二跨跨中加 20kN 向下集中力',
    '输出：{"userText":"建一个三跨连续梁，跨长都 6 米，在第二跨跨中加 20kN 向下集中力","summary":"创建三跨连续梁（总宽18m），在第2跨跨中添加 20kN 向下集中力","confidence":0.96,"actions":[{"kind":"create_structure","payload":{"structureType":"MultiSpanBeam","numSpans":3,"width":18}},{"kind":"add_load","payload":{"loadType":"point","magnitude":-20,"direction":"y","targetSpan":2,"location":0.5}}],"riskLevel":"medium","requiresConfirmation":false}',
    '',
    '输入：连续梁，3跨，跨中均布荷载，10kN',
    '输出：{"userText":"连续梁，3跨，跨中均布荷载，10kN","summary":"创建三跨连续梁，在中间跨（第2跨）添加 10kN/m 均布荷载","confidence":0.93,"actions":[{"kind":"create_structure","payload":{"structureType":"MultiSpanBeam","numSpans":3,"width":18}},{"kind":"add_load","payload":{"loadType":"distributed","magnitude":-10,"targetSpan":2}}],"riskLevel":"medium","requiresConfirmation":false}',
    '',
    '输入：均布荷载改为集中荷载（当前模型已有第2跨 10kN/m 均布荷载）',
    '输出：{"userText":"均布荷载改为集中荷载","summary":"将第2跨均布荷载替换为 10kN 跨中集中力","confidence":0.90,"actions":[{"kind":"remove_load","payload":{"loadOrdinal":1}},{"kind":"add_load","payload":{"loadType":"point","magnitude":-10,"direction":"y","targetSpan":2,"location":0.5}}],"riskLevel":"medium","requiresConfirmation":false}',
    '',
    '输入：加大一倍（最近荷载=agent-1）',
    '输出：{"userText":"加大一倍","summary":"将荷载 agent-1 的量级加大为原来的2倍","confidence":0.85,"actions":[{"kind":"update_load","payload":{"loadId":"agent-1","magnitudeScale":2}}],"riskLevel":"medium","requiresConfirmation":false}',
    '',
    '输入：不对，应该是悬臂梁',
    '输出：{"userText":"不对，应该是悬臂梁","summary":"撤销上一步并改为创建悬臂梁","confidence":0.88,"actions":[{"kind":"undo_last_agent_action","payload":{}},{"kind":"create_structure","payload":{"structureType":"Cantilever","width":6}}],"riskLevel":"high","requiresConfirmation":false}',
    '',
    '输入：每跨都加 5kN/m 均布荷载（当前3跨连续梁）',
    '输出：{"userText":"每跨都加 5kN/m 均布荷载","summary":"在第1、2、3跨各添加 5kN/m 均布荷载","confidence":0.92,"actions":[{"kind":"add_load","payload":{"loadType":"distributed","magnitude":-5,"targetSpan":1}},{"kind":"add_load","payload":{"loadType":"distributed","magnitude":-5,"targetSpan":2}},{"kind":"add_load","payload":{"loadType":"distributed","magnitude":-5,"targetSpan":3}}],"riskLevel":"medium","requiresConfirmation":false}',
    '',
    '输入：把左端改为固定支座',
    '输出：{"userText":"把左端改为固定支座","summary":"将左端支座改为固定端","confidence":0.95,"actions":[{"kind":"update_support","payload":{"target":"left_end","supportType":"Fixed"}}],"riskLevel":"medium","requiresConfirmation":false}',
    '',
    '输入：为什么这里弯矩最大',
    '输出：{"userText":"为什么这里弯矩最大","summary":"分析弯矩峰值出现原因","confidence":0.95,"actions":[{"kind":"explain_results","payload":{"question":"为什么这里弯矩最大"}}],"riskLevel":"low","requiresConfirmation":false}',
  ].join('\n');
}

export async function parseWithLLM(
  text: string,
  context: {
    params: SolverParams;
    results: AnalysisResult;
    modelSummary: string;
    session?: AgentSessionState;
  },
  onChunk?: (delta: string) => void,
): Promise<AgentParseResult | null> {
  const lastSummary = context.session?.lastSummary;
  const pendingContext = lastSummary
    ? `【待补充的上一条指令】：${lastSummary}（用户当前输入是对这条指令的补充或确认，请结合上一条指令的已知参数合并生成完整 action，不要重新要求澄清已经明确的参数）`
    : null;
  const sessionSummary = context.session
    ? `最近对话记忆：最近荷载=${context.session.lastLoadId ?? '无'}；最近跨号=${context.session.lastSpanIndex ?? '无'}；最近结构=${context.session.lastStructureType ?? '无'}`
    : '最近对话记忆：无';
  const resultSummary = `最新计算结果：${buildResultSummary(context.results).join('；')}`;
  const fewShotExamples = buildFewShotExamples();
  const userContent = [
    `当前模型：${context.modelSummary}`,
    resultSummary,
    sessionSummary,
    pendingContext,
    fewShotExamples,
    `用户输入：${text}`,
  ].filter(Boolean).join('\n');
  const messages = [
    { role: 'system' as const, content: buildSystemPrompt() },
    { role: 'user' as const, content: userContent },
  ];
  const response = await sendChatCompletionStream(
    messages,
    (delta) => onChunk?.(delta),
    { maxTokens: 500, temperature: 0.1 },
  );

  const payload = extractJsonPayload(response);
  if (!payload) return null;

  try {
    return sanitizeParseResult(text, JSON.parse(payload));
  } catch {
    return null;
  }
}
