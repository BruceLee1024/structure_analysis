import React, { useEffect, useMemo, useState } from 'react';

type SceneTone = 'slate' | 'blue' | 'emerald' | 'amber' | 'rose' | 'violet';
type SceneTextTone = 'default' | 'muted' | 'accent' | 'danger' | 'success';
type TextAnchor = 'start' | 'middle' | 'end';

interface BaseNode {
  id?: string;
}

export interface GeometryScgLabelNode extends BaseNode {
  type: 'label';
  x: number;
  y: number;
  text: string;
  tone?: SceneTextTone;
  anchor?: TextAnchor;
  size?: number;
  weight?: 400 | 500 | 600 | 700;
  italic?: boolean;
  background?: boolean;
}

export interface GeometryScgRigidBodyNode extends BaseNode {
  type: 'rigid-body';
  shape: 'rect' | 'polygon';
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  points?: Array<[number, number]>;
  tone?: SceneTone;
  label?: string;
  labelX?: number;
  labelY?: number;
  opacity?: number;
  dashed?: boolean;
}

export interface GeometryScgChainLinkNode extends BaseNode {
  type: 'chain-link';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  tone?: SceneTone;
  dashed?: boolean;
  thickness?: number;
  showEndPins?: boolean;
}

export interface GeometryScgGuideLineNode extends BaseNode {
  type: 'guide-line';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  tone?: SceneTone;
  dashed?: boolean;
  arrowEnd?: boolean;
}

export interface GeometryScgHingeNode extends BaseNode {
  type: 'hinge';
  x: number;
  y: number;
  kind?: 'simple' | 'virtual' | 'complex';
  tone?: SceneTone;
  label?: string;
  badge?: string;
}

export interface GeometryScgRigidJointNode extends BaseNode {
  type: 'rigid-joint';
  x: number;
  y: number;
  tone?: SceneTone;
  label?: string;
  badge?: string;
}

export interface GeometryScgMotionArrowNode extends BaseNode {
  type: 'motion-arrow';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  tone?: SceneTone;
  dashed?: boolean;
  label?: string;
}

export interface GeometryScgGhostNode extends BaseNode {
  type: 'ghost';
  shape: 'rect' | 'polygon';
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  points?: Array<[number, number]>;
  tone?: SceneTone;
}

export interface GeometryScgBadgeNode extends BaseNode {
  type: 'badge';
  x: number;
  y: number;
  text: string;
  tone?: SceneTone;
}

export type GeometryScgNode =
  | GeometryScgLabelNode
  | GeometryScgRigidBodyNode
  | GeometryScgChainLinkNode
  | GeometryScgGuideLineNode
  | GeometryScgHingeNode
  | GeometryScgRigidJointNode
  | GeometryScgMotionArrowNode
  | GeometryScgGhostNode
  | GeometryScgBadgeNode;

export interface GeometryScgPanel {
  id: string;
  label?: string;
  title?: string;
  note?: string;
  width: number;
  height: number;
  nodes: GeometryScgNode[];
}

export interface GeometryScgFigure {
  id: string;
  title: string;
  summary: string;
  learningPoint: string;
  sourceFigureIds: string[];
  sourceCropPaths: string[];
  panels: GeometryScgPanel[];
}

interface GeometryScgCompactViewerProps {
  figures: GeometryScgFigure[];
  selectedFigureId?: string;
  onSelectFigure?: (figureId: string) => void;
}

const toneStyles: Record<SceneTone, { fill: string; stroke: string; badgeFill: string; soft: string }> = {
  slate: { fill: '#edf2f7', stroke: '#425466', badgeFill: '#334155', soft: '#f8fafc' },
  blue: { fill: '#eaf1ff', stroke: '#3657c9', badgeFill: '#3657c9', soft: '#f7f9ff' },
  emerald: { fill: '#e8f5ef', stroke: '#18795c', badgeFill: '#18795c', soft: '#f6fbf8' },
  amber: { fill: '#fff3db', stroke: '#b86c1f', badgeFill: '#b86c1f', soft: '#fffaf0' },
  rose: { fill: '#fee8eb', stroke: '#c25164', badgeFill: '#c25164', soft: '#fff8f8' },
  violet: { fill: '#f0ebff', stroke: '#7451d1', badgeFill: '#7451d1', soft: '#faf8ff' },
};

const textToneStyles: Record<SceneTextTone, string> = {
  default: '#0f172a',
  muted: '#64748b',
  accent: '#1d4ed8',
  danger: '#be123c',
  success: '#047857',
};

function getTone(tone: SceneTone = 'slate') {
  return toneStyles[tone];
}

function pointsToString(points: Array<[number, number]>) {
  return points.map(([x, y]) => `${x},${y}`).join(' ');
}

function renderLabel(node: GeometryScgLabelNode, key: string) {
  const color = textToneStyles[node.tone ?? 'default'];
  const fontSize = node.size ?? 10;
  const anchor = node.anchor ?? 'middle';

  if (!node.background) {
    return (
      <text
        key={key}
        x={node.x}
        y={node.y}
        fill={color}
        textAnchor={anchor}
        fontSize={fontSize}
        fontWeight={node.weight ?? 500}
        fontStyle={node.italic ? 'italic' : undefined}
      >
        {node.text}
      </text>
    );
  }

  const textWidth = Math.max(18, node.text.length * fontSize * 0.62);
  const x = anchor === 'middle' ? node.x - textWidth / 2 : anchor === 'end' ? node.x - textWidth : node.x;

  return (
    <g key={key}>
      <rect x={x - 4} y={node.y - fontSize + 2} width={textWidth + 8} height={fontSize + 6} rx="5" fill="#fffdf7" fillOpacity="0.95" stroke="#d8dee9" strokeWidth="0.8" />
      <text
        x={node.x}
        y={node.y}
        fill={color}
        textAnchor={anchor}
        fontSize={fontSize}
        fontWeight={node.weight ?? 600}
        fontStyle={node.italic ? 'italic' : undefined}
      >
        {node.text}
      </text>
    </g>
  );
}

function renderRigidBody(node: GeometryScgRigidBodyNode, key: string) {
  const tone = getTone(node.tone);
  const labelX = node.labelX ?? (node.shape === 'rect' ? (node.x ?? 0) + (node.width ?? 0) / 2 : undefined);
  const labelY = node.labelY ?? (node.shape === 'rect' ? (node.y ?? 0) + (node.height ?? 0) / 2 + 4 : undefined);

  return (
    <g key={key} opacity={node.opacity ?? 1}>
      {node.shape === 'rect' && node.x !== undefined && node.y !== undefined && node.width !== undefined && node.height !== undefined ? (
        <rect
          x={node.x}
          y={node.y}
          width={node.width}
          height={node.height}
          rx="6"
          fill={tone.fill}
          fillOpacity="0.78"
          stroke={tone.stroke}
          strokeWidth="1.8"
          strokeDasharray={node.dashed ? '5 4' : undefined}
        />
      ) : null}
      {node.shape === 'polygon' && node.points ? (
        <polygon
          points={pointsToString(node.points)}
          fill={tone.fill}
          fillOpacity="0.78"
          stroke={tone.stroke}
          strokeWidth="1.8"
          strokeLinejoin="round"
          strokeDasharray={node.dashed ? '5 4' : undefined}
        />
      ) : null}
      {node.label && labelX !== undefined && labelY !== undefined ? (
        <text x={labelX} y={labelY} fill={tone.stroke} textAnchor="middle" fontSize="11" fontWeight="700">
          {node.label}
        </text>
      ) : null}
    </g>
  );
}

function renderGhost(node: GeometryScgGhostNode, key: string) {
  const tone = getTone(node.tone ?? 'slate');

  return (
    <g key={key} opacity="0.35">
      {node.shape === 'rect' && node.x !== undefined && node.y !== undefined && node.width !== undefined && node.height !== undefined ? (
        <rect x={node.x} y={node.y} width={node.width} height={node.height} rx="6" fill={tone.fill} stroke={tone.stroke} strokeWidth="1.2" strokeDasharray="5 4" />
      ) : null}
      {node.shape === 'polygon' && node.points ? (
        <polygon points={pointsToString(node.points)} fill={tone.fill} stroke={tone.stroke} strokeWidth="1.2" strokeLinejoin="round" strokeDasharray="5 4" />
      ) : null}
    </g>
  );
}

function renderChainLink(node: GeometryScgChainLinkNode, key: string) {
  const tone = getTone(node.tone);
  const width = node.thickness ?? 2.05;
  const endRadius = Math.max(1.9, width * 0.8);

  return (
    <g key={key}>
      <line
        x1={node.x1}
        y1={node.y1}
        x2={node.x2}
        y2={node.y2}
        stroke={tone.stroke}
        strokeWidth={width}
        strokeLinecap="round"
        strokeDasharray={node.dashed ? '5 4' : undefined}
      />
      {node.showEndPins !== false ? (
        <>
          <circle cx={node.x1} cy={node.y1} r={endRadius} fill="#fffef9" stroke={tone.stroke} strokeWidth="1.1" />
          <circle cx={node.x2} cy={node.y2} r={endRadius} fill="#fffef9" stroke={tone.stroke} strokeWidth="1.1" />
        </>
      ) : null}
    </g>
  );
}

function renderGuideLine(node: GeometryScgGuideLineNode, key: string, defsId: string) {
  const tone = getTone(node.tone ?? 'slate');

  return (
    <line
      key={key}
      x1={node.x1}
      y1={node.y1}
      x2={node.x2}
      y2={node.y2}
      stroke={tone.stroke}
      strokeWidth="1.05"
      strokeLinecap="round"
      strokeDasharray={node.dashed === false ? undefined : '5 4'}
      markerEnd={node.arrowEnd ? `url(#${defsId}-arrow-${node.tone ?? 'slate'})` : undefined}
      opacity="0.58"
    />
  );
}

function renderHinge(node: GeometryScgHingeNode, key: string) {
  const tone = getTone(node.tone ?? 'slate');
  const dashed = node.kind === 'virtual';

  return (
    <g key={key}>
      <circle cx={node.x} cy={node.y} r="6" fill="#fffef9" stroke={tone.stroke} strokeWidth="1.55" strokeDasharray={dashed ? '4 3' : undefined} />
      <circle cx={node.x} cy={node.y} r="1.9" fill={tone.stroke} />
      {node.label ? <text x={node.x + 9} y={node.y - 8} fill={tone.stroke} fontSize="9" fontWeight="600">{node.label}</text> : null}
      {node.badge ? (
        <g>
          <rect x={node.x + 8} y={node.y + 3} width="14" height="12" rx="6" fill={tone.badgeFill} />
          <text x={node.x + 15} y={node.y + 12} fill="white" fontSize="8" fontWeight="700" textAnchor="middle">{node.badge}</text>
        </g>
      ) : null}
    </g>
  );
}

function renderRigidJoint(node: GeometryScgRigidJointNode, key: string) {
  const tone = getTone(node.tone ?? 'slate');

  return (
    <g key={key}>
      <rect x={node.x - 5} y={node.y - 5} width="10" height="10" rx="1.5" fill={tone.stroke} />
      {node.label ? <text x={node.x + 9} y={node.y - 8} fill={tone.stroke} fontSize="9" fontWeight="600">{node.label}</text> : null}
      {node.badge ? (
        <g>
          <rect x={node.x + 8} y={node.y + 3} width="14" height="12" rx="6" fill={tone.badgeFill} />
          <text x={node.x + 15} y={node.y + 12} fill="white" fontSize="8" fontWeight="700" textAnchor="middle">{node.badge}</text>
        </g>
      ) : null}
    </g>
  );
}

function renderMotionArrow(node: GeometryScgMotionArrowNode, key: string, defsId: string) {
  const toneName = node.tone ?? 'blue';
  const tone = getTone(toneName);

  return (
    <g key={key}>
      <line
        x1={node.x1}
        y1={node.y1}
        x2={node.x2}
        y2={node.y2}
        stroke={tone.stroke}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeDasharray={node.dashed ? '5 4' : undefined}
        markerEnd={`url(#${defsId}-arrow-${toneName})`}
      />
      {node.label ? (
        <text x={(node.x1 + node.x2) / 2} y={(node.y1 + node.y2) / 2 - 7} fill={tone.stroke} fontSize="9" fontWeight="600" textAnchor="middle">
          {node.label}
        </text>
      ) : null}
    </g>
  );
}

function renderBadge(node: GeometryScgBadgeNode, key: string) {
  const tone = getTone(node.tone ?? 'violet');
  const width = Math.max(24, node.text.length * 6.2 + 12);

  return (
    <g key={key}>
      <rect x={node.x - width / 2} y={node.y - 8} width={width} height="16" rx="8" fill={tone.soft} stroke={tone.stroke} strokeWidth="1" />
      <text x={node.x} y={node.y + 3.5} fill={tone.stroke} fontSize="8.5" fontWeight="700" textAnchor="middle">
        {node.text}
      </text>
    </g>
  );
}

function renderNode(node: GeometryScgNode, index: number, defsId: string) {
  const key = node.id ?? `${node.type}-${index}`;

  switch (node.type) {
    case 'label':
      return renderLabel(node, key);
    case 'rigid-body':
      return renderRigidBody(node, key);
    case 'ghost':
      return renderGhost(node, key);
    case 'chain-link':
      return renderChainLink(node, key);
    case 'guide-line':
      return renderGuideLine(node, key, defsId);
    case 'hinge':
      return renderHinge(node, key);
    case 'rigid-joint':
      return renderRigidJoint(node, key);
    case 'motion-arrow':
      return renderMotionArrow(node, key, defsId);
    case 'badge':
      return renderBadge(node, key);
    default:
      return null;
  }
}

const GeometryScgDefs: React.FC<{ id: string }> = ({ id }) => (
  <defs>
    <pattern id={`${id}-dot-grid`} width="16" height="16" patternUnits="userSpaceOnUse">
      <circle cx="1.2" cy="1.2" r="0.8" fill="#d7dee9" />
    </pattern>
    {(['slate', 'blue', 'emerald', 'amber', 'rose', 'violet'] as const).map((tone) => (
      <marker
        key={tone}
        id={`${id}-arrow-${tone}`}
        viewBox="0 0 10 10"
        refX="8"
        refY="5"
        markerWidth="6"
        markerHeight="6"
        orient="auto-start-reverse"
      >
        <path d="M 0 0 L 10 5 L 0 10 z" fill={toneStyles[tone].stroke} />
      </marker>
    ))}
  </defs>
);

const GeometryScgPanelView: React.FC<{ panel: GeometryScgPanel; defsId: string }> = ({ panel, defsId }) => (
  <div className="rounded-2xl border border-slate-200/80 bg-[#fcfbf7] p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
    <div className="mb-2.5 flex items-center justify-between gap-3 border-b border-slate-200/70 pb-2">
      <div className="flex items-center gap-2">
        {panel.label ? (
          <span className="inline-flex h-5.5 w-5.5 items-center justify-center rounded-full bg-slate-800 text-[10px] font-bold text-white">
            {panel.label}
          </span>
        ) : null}
        <div className="text-[13px] font-semibold text-slate-700">{panel.title ?? panel.id}</div>
      </div>
    </div>
    <svg
      width="100%"
      viewBox={`0 0 ${panel.width} ${panel.height}`}
      className="rounded-xl bg-[#fffefb]"
      preserveAspectRatio="xMidYMid meet"
    >
      <GeometryScgDefs id={defsId} />
      <rect x="0" y="0" width={panel.width} height={panel.height} rx="12" fill="#fffefb" />
      <rect x="8" y="8" width={panel.width - 16} height={panel.height - 16} rx="12" fill="url(#${defsId}-dot-grid)" opacity="0.28" />
      <rect x="8" y="8" width={panel.width - 16} height={panel.height - 16} rx="12" fill="none" stroke="#dfe4ea" strokeWidth="1" />
      <g>
        {panel.nodes.map((node, index) => renderNode(node, index, defsId))}
      </g>
    </svg>
    {panel.note ? <div className="mt-2.5 text-[11px] leading-relaxed text-slate-600">{panel.note}</div> : null}
  </div>
);

export const GeometryScgCompactViewer: React.FC<GeometryScgCompactViewerProps> = ({
  figures,
  selectedFigureId,
  onSelectFigure,
}) => {
  const [internalFigureId, setInternalFigureId] = useState(selectedFigureId ?? figures[0]?.id ?? '');
  const activeFigureId = selectedFigureId ?? internalFigureId;
  const activeFigure = useMemo(
    () => figures.find((figure) => figure.id === activeFigureId) ?? figures[0],
    [figures, activeFigureId],
  );
  const [activePanelId, setActivePanelId] = useState(activeFigure?.panels[0]?.id ?? '');

  useEffect(() => {
    if (selectedFigureId) {
      setInternalFigureId(selectedFigureId);
    }
  }, [selectedFigureId]);

  useEffect(() => {
    if (activeFigure?.panels.length) {
      setActivePanelId(activeFigure.panels[0].id);
    }
  }, [activeFigure?.id]);

  if (!activeFigure) return null;

  const activePanel = activeFigure.panels.find((panel) => panel.id === activePanelId) ?? activeFigure.panels[0];

  const handleFigureSelect = (figureId: string) => {
    if (onSelectFigure) {
      onSelectFigure(figureId);
      return;
    }
    setInternalFigureId(figureId);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {figures.map((figure) => (
          <button
            key={figure.id}
            onClick={() => handleFigureSelect(figure.id)}
            className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-all ${
              figure.id === activeFigure.id
                ? 'bg-violet-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            图 {figure.id}
          </button>
        ))}
      </div>

    <div className="rounded-2xl border border-slate-200 bg-[#fbfaf7] px-3.5 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-bold text-violet-700">
          概念图 {activeFigure.id}
        </span>
        <span className="text-sm font-semibold text-slate-800">{activeFigure.title}</span>
      </div>
      <div className="mt-1.5 text-xs leading-relaxed text-slate-600">{activeFigure.summary}</div>
    </div>

      {activeFigure.panels.length > 1 ? (
        <div className="flex flex-wrap gap-1.5">
          {activeFigure.panels.map((panel) => (
            <button
              key={panel.id}
              onClick={() => setActivePanelId(panel.id)}
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-all ${
                panel.id === activePanel.id
                  ? 'bg-slate-800 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {panel.label ? `(${panel.label}) ${panel.title ?? panel.id}` : panel.title ?? panel.id}
            </button>
          ))}
        </div>
      ) : null}

      <GeometryScgPanelView panel={activePanel} defsId={`gscg-compact-${activeFigure.id}-${activePanel.id}`} />

      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">读图重点</div>
        <div className="mt-1 text-xs leading-relaxed text-slate-700">{activeFigure.learningPoint}</div>
      </div>
    </div>
  );
};

const GeometryScgFigureView: React.FC<{ figure: GeometryScgFigure }> = ({ figure }) => (
  <div className="space-y-3">
    <div className="rounded-2xl border border-violet-200 bg-gradient-to-r from-violet-50 via-white to-blue-50 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center rounded-full bg-violet-600 px-2.5 py-1 text-[11px] font-bold text-white">
          概念图 {figure.id}
        </span>
        <span className="text-sm font-semibold text-slate-800">{figure.title}</span>
      </div>
      <div className="mt-1 text-sm leading-relaxed text-slate-600">{figure.summary}</div>
      <div className="mt-2 text-[11px] leading-relaxed text-slate-500">
        SCG 复现说明：当前是根据规则描述与结构关系做的语义复现，用来固化图元体系，不是像素级摹图。
      </div>
    </div>

    <div className={`grid gap-3 ${figure.panels.length === 1 ? 'grid-cols-1' : figure.panels.length === 2 ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1 xl:grid-cols-3'}`}>
      {figure.panels.map((panel) => (
        <GeometryScgPanelView key={panel.id} panel={panel} defsId={`gscg-${figure.id}-${panel.id}`} />
      ))}
    </div>

    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">教学重点</div>
      <div className="mt-1 text-sm leading-relaxed text-slate-700">{figure.learningPoint}</div>
      <div className="mt-2 text-[11px] leading-relaxed text-slate-500">
        对应图示编号：{figure.sourceFigureIds.join('、')}。
      </div>
    </div>
  </div>
);

export default GeometryScgFigureView;
