import type { AnalysisResult, AnalysisTargetType, Load, ModelIssue, SolverParams } from '../types';
import { getResultExtrema } from './resultExtrema';
import type { EnvelopeRow } from './resultEnvelope';

interface ReportAnalysis {
  type: AnalysisTargetType;
  id: string;
  label: string;
}

export interface CalculationReportInput {
  params: SolverParams;
  results: AnalysisResult;
  activeAnalysis: ReportAnalysis;
  analysisLoads: Load[];
  envelopeRows: EnvelopeRow[];
  validationIssues: ModelIssue[];
  generatedAt?: Date;
}

const fmt = (value: number, digits = 2) => {
  if (Math.abs(value) < Math.pow(10, -digits) / 2) return (0).toFixed(digits);
  return value.toFixed(digits);
};

const md = (value: unknown) => String(value ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');

const targetText = (load: Load) => {
  if (load.nodeId !== undefined) return `ND ${load.nodeId}`;
  if (load.elementId !== undefined) return `EL ${load.elementId}`;
  return '-';
};

const restraintText = (restraints: [boolean, boolean, boolean]) => {
  const labels = ['固定', '固定', '固定'];
  return restraints.map((fixed, index) => fixed ? labels[index] : '自由').join(', ');
};

const loadDirectionText = (load: Load) => load.type === 'moment' ? '-' : load.direction ?? '-';

function table(headers: string[], rows: (string | number)[][]) {
  const head = `| ${headers.map(md).join(' | ')} |`;
  const sep = `| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows.map(row => `| ${row.map(md).join(' | ')} |`);
  return [head, sep, ...body].join('\n');
}

function envelopeValue(row: EnvelopeRow) {
  if (row.value === null) return '';
  return row.key === 'deflection-abs' ? fmt(row.value, 4) : fmt(row.value, 2);
}

export function createReportFileName(now = new Date()) {
  const stamp = now.toISOString().slice(0, 19).replace(/[:T]/g, '-');
  return `structlab-report-${stamp}.md`;
}

export function createCalculationReport(input: CalculationReportInput) {
  const generatedAt = input.generatedAt ?? new Date();
  const extrema = getResultExtrema(input.results);

  const nodeRows = input.params.nodes.map(node => [
    node.id,
    fmt(node.x, 3),
    fmt(node.y, 3),
    restraintText(node.restraints),
  ]);

  const elementRows = input.params.elements.map(element => [
    element.id,
    `${element.startNode} -> ${element.endNode}`,
    fmt(element.E, 3),
    fmt(element.A, 3),
    fmt(element.I, 3),
  ]);

  const loadRows = input.analysisLoads.map(load => [
    load.id,
    load.type,
    targetText(load),
    fmt(load.magnitude, 3),
    loadDirectionText(load),
    load.location !== undefined ? fmt(load.location, 3) : '-',
  ]);

  const controlRows = [
    ['最大弯矩', extrema.moment ? `单元 ${extrema.moment.elementId} · x=${fmt(extrema.moment.x, 2)} m` : '无', extrema.moment ? fmt(extrema.moment.value, 2) : '0.00', 'kN·m'],
    ['最大剪力', extrema.shear ? `单元 ${extrema.shear.elementId} · x=${fmt(extrema.shear.x, 2)} m` : '无', extrema.shear ? fmt(extrema.shear.value, 2) : '0.00', 'kN'],
    ['最大轴力', extrema.axial ? `单元 ${extrema.axial.elementId} · x=${fmt(extrema.axial.x, 2)} m` : '无', extrema.axial ? fmt(extrema.axial.value, 2) : '0.00', 'kN'],
    ['最大位移', extrema.deflection ? `节点 ${extrema.deflection.nodeId} · ${extrema.deflection.component}` : '无', extrema.deflection ? fmt(extrema.deflection.value, 4) : '0.0000', 'mm'],
  ];

  const reactionRows = input.results.reactions.map(reaction => [
    reaction.nodeId,
    fmt(reaction.fx, 2),
    fmt(reaction.fy, 2),
    fmt(reaction.m, 2),
  ]);

  const envelopeRows = input.envelopeRows.map(row => [
    row.label,
    row.sourceLabel,
    row.location,
    envelopeValue(row),
    row.unit,
  ]);

  const issueRows = input.validationIssues.length
    ? input.validationIssues.map(issue => [issue.severity, issue.title, issue.detail])
    : [['info', '未发现明显建模问题', '模型可计算。']];

  return [
    '# StructLab 结构计算报告',
    '',
    `生成时间：${generatedAt.toISOString()}`,
    `当前分析：${input.activeAnalysis.label}（${input.activeAnalysis.type === 'combination' ? '荷载组合' : '单一工况'}）`,
    '',
    '## 1. 模型概况',
    '',
    table(['项目', '数值'], [
      ['结构类型', input.params.structureType],
      ['刚度假设', input.params.stiffnessType],
      ['节点数', input.params.nodes.length],
      ['单元数', input.params.elements.length],
      ['当前参与荷载数', input.analysisLoads.length],
      ['E (GPa)', fmt(input.params.elasticModulus, 3)],
      ['A (cm²)', fmt(input.params.crossSectionArea, 3)],
      ['I (10^-6 m^4)', fmt(input.params.momentOfInertia, 3)],
    ]),
    '',
    '## 2. 节点',
    '',
    table(['节点', 'X (m)', 'Y (m)', '约束'], nodeRows),
    '',
    '## 3. 单元',
    '',
    table(['单元', '节点', 'E', 'A', 'I'], elementRows),
    '',
    '## 4. 当前分析荷载',
    '',
    loadRows.length ? table(['ID', '类型', '对象', '大小', '方向', '位置'], loadRows) : '当前分析目标没有参与荷载。',
    '',
    '## 5. 当前分析控制项',
    '',
    table(['控制项', '位置', '数值', '单位'], controlRows),
    '',
    '## 6. 支座反力',
    '',
    reactionRows.length ? table(['节点', 'Fx (kN)', 'Fy (kN)', 'M (kN·m)'], reactionRows) : '无支座反力结果。',
    '',
    '## 7. 包络控制',
    '',
    envelopeRows.length ? table(['包络项', '来源', '位置', '数值', '单位'], envelopeRows) : '暂无包络数据。',
    '',
    '## 8. 模型校验',
    '',
    table(['级别', '标题', '说明'], issueRows),
    '',
  ].join('\n');
}
