import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Box,
  Calculator,
  ChevronDown,
  CheckCircle2,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import {
  isSpaceElementLoad,
  isSpaceNodalLoad,
  type SpaceAnalysisResult,
  type SpaceDirection,
  type SpaceElement,
  type SpaceElementLoad,
  type SpaceLoad,
  type SpaceNodalLoad,
  type SpaceNode,
} from '../../utils/spaceSolver';
import {
  buildSpaceServiceabilityRows,
  getWorstSpaceServiceabilityRow,
  type SpaceServiceabilityRow,
} from '../../utils/serviceabilityChecks';
import {
  SPACE_MATERIAL_PRESETS,
  SPACE_SECTION_PRESETS,
  SPACE_SECTION_UNITS,
  batchLoadPrefix,
  buildSpaceResultEnvelopeRows,
  buildSpaceResultSummary,
  createSpaceBatchNodeLoads,
  createSpaceFramePrototypeModel,
  getSpaceLoadCombinations,
  getSpaceScenarioLoads,
  isSpaceBatchLoad,
  resolveSpaceElements,
  selectBatchLoadNodes,
  validateSpaceModel,
  type SpaceAnalysisTarget,
  type SpaceBatchLoadPattern,
  type SpaceLoadCombination,
  type SpaceMember,
  type SpaceModel,
  type SpaceEnvelopeRow,
  type SpaceRoofProfile,
  type SpaceVerticalBracingMode,
} from '../../utils/spaceModel';
import { useSpaceSolverWorker } from '../../hooks/useSpaceSolverWorker';
import SpaceModelViewport, { type SpaceForceMode, type SpaceSelection } from './SpaceModelViewport';

interface SpaceSolverPrototypeProps {
  onSwitchToPlane: () => void;
}

const forceModeOptions: Array<{ id: SpaceForceMode; label: string; buttonLabel: string }> = [
  { id: 'none', label: '关闭', buttonLabel: '关闭内力显示' },
  { id: 'axial', label: '轴力', buttonLabel: '显示轴力' },
  { id: 'shear', label: '剪力', buttonLabel: '显示剪力' },
  { id: 'moment', label: '弯矩', buttonLabel: '显示弯矩' },
];

type SpaceWorkspace = 'modeling' | 'loads' | 'results' | 'diagnostics';
type SpaceLoadTargetMode = 'selection' | SpaceBatchLoadPattern | 'manual';
type SpaceLoadDraftKind = 'nodal' | 'member';
type SpaceDraftMemberLoadType = SpaceElementLoad['type'];
type SpaceDraftCoordinateSystem = NonNullable<SpaceElementLoad['coordinateSystem']>;

const workspaceOptions: Array<{ id: SpaceWorkspace; label: string; meta: string }> = [
  { id: 'modeling', label: '建模', meta: '几何/材料' },
  { id: 'loads', label: '荷载', meta: '批量/自定义' },
  { id: 'results', label: '结果', meta: '摘要/表格' },
  { id: 'diagnostics', label: '诊断', meta: '校验/求解' },
];

const format = (value: number, digits = 2) => {
  if (Math.abs(value) < 10 ** -(digits + 1)) return (0).toFixed(digits);
  return value.toFixed(digits);
};

const resultStatusLabel = {
  ok: 'OK',
  warning: 'CHECK',
  failed: 'FAILED',
} as const;

const resultStatusClass = {
  ok: 'text-emerald-200',
  warning: 'text-amber-200',
  failed: 'text-red-200',
} as const;

const emptySpaceAnalysisResult: SpaceAnalysisResult = {
  status: 'warning',
  elements: [],
  displacements: [],
  reactions: [],
  maxDisplacement: 0,
};

interface SpaceAnalysisSnapshot {
  runId: number;
  key: string;
  target: SpaceAnalysisTarget;
  nodes: SpaceNode[];
  elements: SpaceElement[];
  loads: SpaceLoad[];
}

const buildAnalysisKey = (
  target: SpaceAnalysisTarget,
  nodes: SpaceNode[],
  elements: SpaceElement[],
  loads: SpaceLoad[],
) => JSON.stringify({
  target: { type: target.type, id: target.id },
  nodes,
  elements,
  loads,
});

const directionLabel: Record<SpaceDirection, string> = {
  x: 'Fx',
  y: 'Fy',
  z: 'Fz',
};

const memberDirectionLabel: Record<SpaceDirection, string> = {
  x: 'x',
  y: 'y',
  z: 'z',
};

const batchLoadPatternOptions: Array<{ id: SpaceBatchLoadPattern; label: string }> = [
  { id: 'roof', label: '屋面节点' },
  { id: 'all-free', label: '全部自由节点' },
  { id: 'wind-x-positive', label: 'X+ 迎风面' },
  { id: 'wind-y-positive', label: 'Y+ 迎风面' },
];

const loadTargetOptions: Array<{ id: SpaceLoadTargetMode; label: string; meta: string }> = [
  { id: 'selection', label: '当前选择', meta: '节点或杆件' },
  { id: 'roof', label: '屋面节点', meta: '最高层节点' },
  { id: 'all-free', label: '自由节点', meta: '全部非支座' },
  { id: 'wind-x-positive', label: 'X+ 面', meta: '迎风侧节点' },
  { id: 'wind-y-positive', label: 'Y+ 面', meta: '迎风侧节点' },
  { id: 'manual', label: '编号输入', meta: '如 1,3,8-12' },
];

const roofProfileOptions: Array<{ id: SpaceRoofProfile; label: string; meta: string }> = [
  { id: 'flat', label: '平屋面', meta: '规则楼盖' },
  { id: 'gable-x', label: '双坡', meta: 'X 向屋脊' },
  { id: 'shed-y', label: '单坡', meta: 'Y 向找坡' },
];

const verticalBracingOptions: Array<{ id: SpaceVerticalBracingMode; label: string; meta: string }> = [
  { id: 'none', label: '无', meta: '仅梁柱' },
  { id: 'end-bays', label: '端跨', meta: '外围稳定' },
  { id: 'all-bays', label: '全跨', meta: '高刚度' },
];

const loadTemplates: Array<{
  id: string;
  label: string;
  description: string;
  pattern: SpaceBatchLoadPattern;
  direction: SpaceDirection;
  magnitude: number;
}> = [
  { id: 'roof-dead', label: '屋面恒载', description: '屋面节点向下', pattern: 'roof', direction: 'z', magnitude: -20 },
  { id: 'roof-live', label: '屋面活载', description: '屋面节点向下', pattern: 'roof', direction: 'z', magnitude: -10 },
  { id: 'wind-x', label: 'X 向风载', description: 'X+ 迎风面水平力', pattern: 'wind-x-positive', direction: 'x', magnitude: 15 },
  { id: 'wind-y', label: 'Y 向风载', description: 'Y+ 迎风面水平力', pattern: 'wind-y-positive', direction: 'y', magnitude: 15 },
];

const SUPPORT_PRESETS = [
  { id: 'fixed', label: '固定', restraints: [true, true, true, true, true, true] as SpaceNode['restraints'] },
  { id: 'pin', label: '铰支', restraints: [true, true, true, false, false, false] as SpaceNode['restraints'] },
  { id: 'vertical', label: '竖向', restraints: [false, false, true, false, false, false] as SpaceNode['restraints'] },
  { id: 'free', label: '自由', restraints: [false, false, false, false, false, false] as SpaceNode['restraints'] },
];

const supportPresetFor = (restraints: SpaceNode['restraints']) => (
  SUPPORT_PRESETS.find(preset => preset.restraints.every((value, index) => value === restraints[index]))?.id ?? 'custom'
);

const fieldClass = 'rounded border border-slate-700 bg-slate-950 px-1.5 py-1 text-[10px] text-slate-100 outline-none focus:border-cyan-500';
const iconButtonClass = 'inline-flex h-7 w-7 items-center justify-center rounded border border-slate-700 bg-slate-900 text-slate-400 transition-colors hover:border-slate-500 hover:text-slate-100';

const compactNumber = (value: number, onChange: (value: number) => void, label: string, step = 0.1) => (
  <input
    aria-label={label}
    type="number"
    value={Number.isFinite(value) ? value : 0}
    step={step}
    onChange={(event) => onChange(Number(event.target.value))}
    className={`${fieldClass} w-full font-mono`}
  />
);

const NumberSlider: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  accentClass?: string;
  onChange: (value: number) => void;
}> = ({ label, value, min, max, step, unit, accentClass = 'accent-cyan-500', onChange }) => (
  <label className="block py-1.5 text-[10px] font-semibold text-slate-400">
    <span className="flex items-center justify-between gap-2">
      <span>{label}</span>
      <span className="font-mono text-slate-200">{value}{unit ? ` ${unit}` : ''}</span>
    </span>
    <input
      aria-label={label}
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
      className={`mt-2 w-full ${accentClass}`}
    />
  </label>
);

const OptionButtons = <T extends string,>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ id: T; label: string; meta?: string }>;
  value: T;
  onChange: (value: T) => void;
}) => (
  <div>
    <div className="mb-1.5 text-[10px] font-semibold text-slate-400">{label}</div>
    <div className="grid grid-cols-3 gap-1">
      {options.map(option => (
        <button
          key={option.id}
          type="button"
          onClick={() => onChange(option.id)}
          className={`min-w-0 rounded border px-2 py-1.5 text-left transition-colors ${
            value === option.id
              ? 'border-cyan-400/60 bg-cyan-500/15 text-cyan-100'
              : 'border-slate-800 bg-slate-950/45 text-slate-400 hover:border-slate-700 hover:text-slate-100'
          }`}
        >
          <span className="block truncate text-[10px] font-bold">{option.label}</span>
          {option.meta ? <span className="mt-0.5 block truncate text-[8px] opacity-70">{option.meta}</span> : null}
        </button>
      ))}
    </div>
  </div>
);

const CompactToggle: React.FC<{
  label: string;
  description?: string;
  checked: boolean;
  accentClass?: string;
  onChange: (checked: boolean) => void;
}> = ({ label, description, checked, accentClass = 'accent-cyan-500', onChange }) => (
  <label className="flex items-center justify-between gap-3 rounded border border-slate-800 bg-slate-950/45 px-2 py-2 text-[10px] text-slate-300">
    <span className="min-w-0">
      <span className="block truncate font-semibold">{label}</span>
      {description ? <span className="mt-0.5 block truncate text-[9px] text-slate-500">{description}</span> : null}
    </span>
    <input
      aria-label={label}
      type="checkbox"
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
      className={`h-4 w-4 ${accentClass}`}
    />
  </label>
);

const SectionShell: React.FC<{ title: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode }> = ({
  title,
  subtitle,
  action,
  children,
}) => (
  <section className="rounded-lg border border-slate-800 bg-slate-900/55">
    <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-3 py-2.5">
      <div className="min-w-0">
        <h3 className="truncate text-xs font-bold text-slate-100">{title}</h3>
        {subtitle ? <p className="mt-0.5 truncate text-[10px] text-slate-500">{subtitle}</p> : null}
      </div>
      {action}
    </div>
    <div className="p-3">{children}</div>
  </section>
);

const WorkflowSection: React.FC<{
  title: string;
  subtitle?: string;
  accentClass?: string;
  defaultOpen?: boolean;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, subtitle, accentClass = 'text-cyan-300', defaultOpen = false, headerRight, children }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <section className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/55">
      <button
        type="button"
        onClick={() => setIsOpen(prev => !prev)}
        className={`flex w-full items-center justify-between px-3 py-2.5 text-left transition-colors hover:bg-slate-900 ${
          isOpen ? 'border-b border-slate-800/80' : ''
        }`}
      >
        <div className="min-w-0">
          <h3 className={`truncate text-xs font-semibold uppercase tracking-wider ${accentClass}`}>{title}</h3>
          {subtitle ? <p className="mt-0.5 truncate text-[10px] text-slate-500">{subtitle}</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {headerRight}
          <ChevronDown className={`h-3.5 w-3.5 text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </button>
      {isOpen ? <div className="space-y-3 px-3 pb-3 pt-2">{children}</div> : null}
    </section>
  );
};

const SidebarMetric: React.FC<{ label: string; value: React.ReactNode; colorClass?: string }> = ({
  label,
  value,
  colorClass = 'text-cyan-300',
}) => (
  <div className="rounded-md border border-slate-800 bg-slate-950 px-2 py-1 text-center">
    <div className="text-[8px] font-bold uppercase tracking-wider text-slate-600">{label}</div>
    <div className={`truncate font-mono text-[11px] font-bold ${colorClass}`}>{value}</div>
  </div>
);

const ModelStatCard: React.FC<{ label: string; value: React.ReactNode; tone?: string }> = ({
  label,
  value,
  tone = 'text-slate-100',
}) => (
  <div className="min-w-0 rounded-md border border-slate-800 bg-slate-950/60 px-2.5 py-2">
    <div className="text-[8px] font-bold uppercase tracking-wider text-slate-600">{label}</div>
    <div className={`mt-1 truncate font-mono text-[12px] font-black ${tone}`}>{value}</div>
  </div>
);

const parseNodeIdList = (input: string, availableIds: Set<number>) => {
  const ids = new Set<number>();
  input
    .split(/[\s,，;；]+/)
    .map(part => part.trim())
    .filter(Boolean)
    .forEach(part => {
      const range = part.match(/^(\d+)-(\d+)$/);
      if (range) {
        const start = Number(range[1]);
        const end = Number(range[2]);
        const low = Math.min(start, end);
        const high = Math.max(start, end);
        for (let id = low; id <= high; id++) {
          if (availableIds.has(id)) ids.add(id);
        }
        return;
      }
      const id = Number(part);
      if (Number.isInteger(id) && availableIds.has(id)) ids.add(id);
    });

  return Array.from(ids).sort((a, b) => a - b);
};

const parseOrderedNodePath = (input: string, availableIds: Set<number>) => {
  const ids: number[] = [];
  input
    .split(/[\s,，;；]+/)
    .map(part => part.trim())
    .filter(Boolean)
    .forEach(part => {
      const range = part.match(/^(\d+)-(\d+)$/);
      if (range) {
        const start = Number(range[1]);
        const end = Number(range[2]);
        const step = start <= end ? 1 : -1;
        for (let id = start; step > 0 ? id <= end : id >= end; id += step) {
          if (availableIds.has(id)) ids.push(id);
        }
        return;
      }
      const id = Number(part);
      if (Number.isInteger(id) && availableIds.has(id)) ids.push(id);
    });

  return ids;
};

const memberConnectionKey = (startNode: number, endNode: number) => (
  startNode < endNode ? `${startNode}:${endNode}` : `${endNode}:${startNode}`
);

const countNewMemberConnections = (nodeIds: number[], members: SpaceMember[], closePath: boolean) => {
  const path = closePath && nodeIds.length > 2 ? [...nodeIds, nodeIds[0]] : nodeIds;
  const existingKeys = new Set(members.map(member => memberConnectionKey(member.startNode, member.endNode)));
  const pendingKeys = new Set<string>();

  for (let index = 0; index < path.length - 1; index++) {
    const startNode = path[index];
    const endNode = path[index + 1];
    if (startNode === endNode) continue;
    const key = memberConnectionKey(startNode, endNode);
    if (!existingKeys.has(key)) pendingKeys.add(key);
  }

  return pendingKeys.size;
};

const SpaceSolverPrototype: React.FC<SpaceSolverPrototypeProps> = ({ onSwitchToPlane }) => {
  const [activeWorkspace, setActiveWorkspace] = useState<SpaceWorkspace>('modeling');
  const [manualNodeInput, setManualNodeInput] = useState('');
  const [isLoadTableOpen, setLoadTableOpen] = useState(false);
  const [width, setWidth] = useState(6);
  const [depth, setDepth] = useState(4);
  const [height, setHeight] = useState(4);
  const [xBayCount, setXBayCount] = useState(2);
  const [yBayCount, setYBayCount] = useState(1);
  const [storyCount, setStoryCount] = useState(2);
  const [roofLoad, setRoofLoad] = useState(-20);
  const [batchLoadPattern, setBatchLoadPattern] = useState<SpaceBatchLoadPattern>('roof');
  const [loadDirection, setLoadDirection] = useState<SpaceDirection>('z');
  const [loadTargetMode, setLoadTargetMode] = useState<SpaceLoadTargetMode>('roof');
  const [loadDraftKind, setLoadDraftKind] = useState<SpaceLoadDraftKind>('nodal');
  const [loadDraftNodalType, setLoadDraftNodalType] = useState<SpaceNodalLoad['type']>('point');
  const [loadDraftMemberType, setLoadDraftMemberType] = useState<SpaceDraftMemberLoadType>('distributed');
  const [loadDraftCoordinateSystem, setLoadDraftCoordinateSystem] = useState<SpaceDraftCoordinateSystem>('global');
  const [loadDraftEndMagnitude, setLoadDraftEndMagnitude] = useState(-20);
  const [memberPathInput, setMemberPathInput] = useState('1-3');
  const [closeMemberPath, setCloseMemberPath] = useState(false);
  const [materialId, setMaterialId] = useState(SPACE_MATERIAL_PRESETS[0].id);
  const [sectionId, setSectionId] = useState(SPACE_SECTION_PRESETS[0].id);
  const [roofProfile, setRoofProfile] = useState<SpaceRoofProfile>('flat');
  const [roofRise, setRoofRise] = useState(1.2);
  const [includeSecondaryBeams, setIncludeSecondaryBeams] = useState(false);
  const [secondaryBeamCount, setSecondaryBeamCount] = useState(1);
  const [includeRoofBracing, setIncludeRoofBracing] = useState(true);
  const [includeFloorBracing, setIncludeFloorBracing] = useState(false);
  const [verticalBracingMode, setVerticalBracingMode] = useState<SpaceVerticalBracingMode>('none');
  const [includeCoreBracing, setIncludeCoreBracing] = useState(false);
  const [deformationScale, setDeformationScale] = useState(80);
  const [showDeformedShape, setShowDeformedShape] = useState(true);
  const [forceMode, setForceMode] = useState<SpaceForceMode>('none');
  const [selectedEntity, setSelectedEntity] = useState<SpaceSelection | null>(null);
  const [analysisSnapshot, setAnalysisSnapshot] = useState<SpaceAnalysisSnapshot | null>(null);
  const [activeAnalysisValue, setActiveAnalysisValue] = useState('loadCase:dead');
  const [model, setModel] = useState<SpaceModel>(() => createSpaceFramePrototypeModel({
    width: 6,
    depth: 4,
    height: 4,
    xBayCount: 2,
    yBayCount: 1,
    storyCount: 2,
    loadMagnitude: -20,
    loadDirection: 'z',
    materialId: SPACE_MATERIAL_PRESETS[0].id,
    sectionId: SPACE_SECTION_PRESETS[0].id,
    roofProfile: 'flat',
    roofRise: 1.2,
    includeSecondaryBeams: false,
    secondaryBeamCount: 1,
    includeRoofBracing: true,
    includeFloorBracing: false,
    verticalBracingMode: 'none',
    includeCoreBracing: false,
  }));

  const rebuildParametricModel = () => {
    setModel(createSpaceFramePrototypeModel({
      width,
      depth,
      height,
      xBayCount,
      yBayCount,
      storyCount,
      loadMagnitude: roofLoad,
      loadDirection,
      materialId,
      sectionId,
      roofProfile,
      roofRise,
      includeSecondaryBeams,
      secondaryBeamCount,
      includeRoofBracing,
      includeFloorBracing,
      verticalBracingMode,
      includeCoreBracing,
    }));
    setSelectedEntity(null);
    setActiveWorkspace('modeling');
  };

  const handleViewportSelection = useCallback((selection: SpaceSelection | null) => {
    setSelectedEntity(selection);
    if (selection) setActiveWorkspace('loads');
  }, []);

  const applyBatchLoadPattern = () => {
    setModel(prev => {
      const batchLoads = createSpaceBatchNodeLoads(prev, {
        pattern: batchLoadPattern,
        direction: loadDirection,
        magnitude: roofLoad,
      });
      const prefix = batchLoadPrefix(batchLoadPattern);
      return {
        ...prev,
        loads: [
          ...prev.loads.filter(load => !(load.id.startsWith(prefix) || (batchLoadPattern === 'roof' && load.id.startsWith('roof-')))),
          ...batchLoads,
        ],
      };
    });
  };

  const applyLoadTemplate = (template: typeof loadTemplates[number]) => {
    setBatchLoadPattern(template.pattern);
    setLoadDirection(template.direction);
    setRoofLoad(template.magnitude);
    setModel(prev => {
      const batchLoads = createSpaceBatchNodeLoads(prev, {
        pattern: template.pattern,
        direction: template.direction,
        magnitude: template.magnitude,
      });
      const prefix = batchLoadPrefix(template.pattern);
      return {
        ...prev,
        loads: [
          ...prev.loads.filter(load => !(load.id.startsWith(prefix) || (template.pattern === 'roof' && load.id.startsWith('roof-')))),
          ...batchLoads,
        ],
      };
    });
  };

  const clearBatchLoads = () => {
    setModel(prev => ({ ...prev, loads: prev.loads.filter(load => !isSpaceBatchLoad(load)) }));
  };

  const applyMaterialSectionToAllMembers = () => {
    setModel(prev => ({
      ...prev,
      members: prev.members.map(member => ({ ...member, materialId, sectionId })),
    }));
  };

  const updateNode = (id: number, patch: Partial<SpaceNode>) => {
    setModel(prev => ({
      ...prev,
      nodes: prev.nodes.map(node => node.id === id ? { ...node, ...patch } : node),
    }));
  };

  const addNode = () => {
    setModel(prev => {
      const nextId = Math.max(0, ...prev.nodes.map(node => node.id)) + 1;
      const maxZ = Math.max(0, ...prev.nodes.map(node => node.z));
      return {
        ...prev,
        nodes: [...prev.nodes, { id: nextId, x: width / 2, y: depth / 2, z: maxZ, restraints: [false, false, false, false, false, false] }],
      };
    });
  };

  const deleteNode = (id: number) => {
    setModel(prev => ({
      ...prev,
      nodes: prev.nodes.filter(node => node.id !== id),
      members: prev.members.filter(member => member.startNode !== id && member.endNode !== id),
      loads: prev.loads.filter(load => !isSpaceNodalLoad(load) || load.nodeId !== id),
    }));
    setSelectedEntity(prev => {
      if (!prev) return prev;
      if (prev.type === 'node' && prev.id === id) return null;
      if (prev.type === 'member' && !model.members.some(member => member.id === prev.id && member.startNode !== id && member.endNode !== id)) return null;
      return prev;
    });
  };

  const updateMember = (id: number, patch: Partial<SpaceMember>) => {
    setModel(prev => ({
      ...prev,
      members: prev.members.map(member => member.id === id ? { ...member, ...patch } : member),
    }));
  };

  const updateSelectedMemberRelease = (end: 'releaseStart' | 'releaseEnd', axis: 'rx' | 'ry' | 'rz', enabled: boolean) => {
    if (!selectedMember) return;
    updateMember(selectedMember.id, {
      [end]: {
        ...(selectedMember[end] ?? {}),
        [axis]: enabled,
      },
    });
  };

  const updateLoadCombinationFactor = (comboId: string, loadCaseId: string, factor: number) => {
    setModel(prev => ({
      ...prev,
      loadCombinations: getSpaceLoadCombinations(prev).map(combo => (
        combo.id === comboId
          ? { ...combo, factors: { ...combo.factors, [loadCaseId]: factor } }
          : combo
      )),
    }));
  };

  const setActiveLoadCaseId = (loadCaseId: string) => {
    setModel(prev => ({ ...prev, activeLoadCaseId: loadCaseId }));
    setActiveAnalysisValue(`loadCase:${loadCaseId}`);
  };

  const addMember = () => {
    setModel(prev => {
      if (prev.nodes.length < 2) return prev;
      const nextId = Math.max(0, ...prev.members.map(member => member.id)) + 1;
      const startNode = prev.nodes[0]?.id ?? 1;
      const endNode = prev.nodes.find(node => node.id !== startNode)?.id ?? startNode;
      return {
        ...prev,
        members: [...prev.members, { id: nextId, startNode, endNode, materialId, sectionId }],
      };
    });
  };

  const addMembersFromPath = () => {
    setModel(prev => {
      const nodeIds = parseOrderedNodePath(memberPathInput, new Set(prev.nodes.map(node => node.id)));
      const path = closeMemberPath && nodeIds.length > 2 ? [...nodeIds, nodeIds[0]] : nodeIds;
      if (path.length < 2) return prev;

      const existingKeys = new Set(prev.members.map(member => memberConnectionKey(member.startNode, member.endNode)));
      let nextId = Math.max(0, ...prev.members.map(member => member.id)) + 1;
      const membersToAdd: SpaceMember[] = [];

      for (let index = 0; index < path.length - 1; index++) {
        const startNode = path[index];
        const endNode = path[index + 1];
        if (startNode === endNode) continue;

        const key = memberConnectionKey(startNode, endNode);
        if (existingKeys.has(key)) continue;
        existingKeys.add(key);
        membersToAdd.push({
          id: nextId++,
          startNode,
          endNode,
          materialId,
          sectionId,
        });
      }

      if (membersToAdd.length === 0) return prev;
      return {
        ...prev,
        members: [...prev.members, ...membersToAdd],
      };
    });
  };

  const deleteMember = (id: number) => {
    setModel(prev => ({
      ...prev,
      members: prev.members.filter(member => member.id !== id),
      loads: prev.loads.filter(load => !isSpaceElementLoad(load) || load.elementId !== id),
    }));
    setSelectedEntity(prev => prev?.type === 'member' && prev.id === id ? null : prev);
  };

  const updateLoad = (id: string, patch: Partial<SpaceLoad>) => {
    setModel(prev => ({
      ...prev,
      loads: prev.loads.map(load => load.id === id ? { ...load, ...patch } : load),
    }));
  };

  const updateNodalLoad = (id: string, patch: Partial<SpaceNodalLoad>) => {
    setModel(prev => ({
      ...prev,
      loads: prev.loads.map(load => load.id === id && isSpaceNodalLoad(load) ? { ...load, ...patch } : load),
    }));
  };

  const updateElementLoad = (id: string, patch: Partial<SpaceElementLoad>) => {
    setModel(prev => ({
      ...prev,
      loads: prev.loads.map(load => load.id === id && isSpaceElementLoad(load) ? { ...load, ...patch } : load),
    }));
  };

  const addLoad = (nodeId?: number) => {
    setModel(prev => {
      if (prev.nodes.length === 0) return prev;
      const nextId = `load-${Date.now()}`;
      const preferredNodeId = nodeId ?? (selectedEntity?.type === 'node' ? selectedEntity.id : undefined);
      const targetNodeId = prev.nodes.some(node => node.id === preferredNodeId)
        ? preferredNodeId as number
        : prev.nodes[0]?.id ?? 1;
      return {
        ...prev,
        loads: [...prev.loads, {
          id: nextId,
          nodeId: targetNodeId,
          loadCaseId: prev.activeLoadCaseId,
          type: 'point',
          direction: loadDirection,
          magnitude: roofLoad,
        }],
      };
    });
  };

  const addManualNodeLoads = () => {
    setModel(prev => {
      const nodeIds = parseNodeIdList(manualNodeInput, new Set(prev.nodes.map(node => node.id)));
      if (nodeIds.length === 0) return prev;
      const time = Date.now();
      return {
        ...prev,
        loads: [
          ...prev.loads,
          ...nodeIds.map((nodeId, index) => ({
            id: `load-${time}-${index}`,
            nodeId,
            loadCaseId: prev.activeLoadCaseId,
            type: 'point' as const,
            direction: loadDirection,
            magnitude: roofLoad,
          })),
        ],
      };
    });
    if (manualNodeIds.length > 0) setLoadTableOpen(true);
  };

  const addElementLoad = (elementId: number) => {
    setModel(prev => {
      if (!prev.members.some(member => member.id === elementId)) return prev;
      const nextId = `member-load-${Date.now()}`;
      return {
        ...prev,
        loads: [...prev.loads, {
          id: nextId,
          elementId,
          loadCaseId: prev.activeLoadCaseId,
          type: 'distributed',
          direction: 'z',
          coordinateSystem: 'global',
          startMagnitude: -5,
          endMagnitude: -5,
        }],
      };
    });
    setLoadTableOpen(true);
  };

  const deleteLoad = (id: string) => {
    setModel(prev => ({ ...prev, loads: prev.loads.filter(load => load.id !== id) }));
  };

  const selectNodeForLoadEditing = (nodeId: number) => {
    setSelectedEntity({ type: 'node', id: nodeId });
    setActiveWorkspace('loads');
  };

  const spaceElements = useMemo(() => resolveSpaceElements(model), [model]);
  const loadCombinations = useMemo(() => getSpaceLoadCombinations(model), [model]);
  const activeAnalysisTarget = useMemo<SpaceAnalysisTarget>(() => {
    const [type, id] = activeAnalysisValue.split(':') as [SpaceAnalysisTarget['type'], string];
    if (type === 'combination') {
      const combo = loadCombinations.find(item => item.id === id) ?? loadCombinations[0];
      return { type: 'combination', id: combo?.id ?? 'sls', label: combo?.name ?? '组合' };
    }
    const loadCase = model.loadCases.find(item => item.id === id) ?? model.loadCases[0];
    return { type: 'loadCase', id: loadCase?.id ?? model.activeLoadCaseId, label: loadCase?.name ?? '当前工况' };
  }, [activeAnalysisValue, loadCombinations, model.activeLoadCaseId, model.loadCases]);
  const scenarioLoads = useMemo(() => getSpaceScenarioLoads(model, activeAnalysisTarget, loadCombinations), [model, activeAnalysisTarget, loadCombinations]);
  const currentAnalysisKey = useMemo(
    () => buildAnalysisKey(activeAnalysisTarget, model.nodes, spaceElements, scenarioLoads),
    [activeAnalysisTarget, model.nodes, scenarioLoads, spaceElements],
  );
  const batchTargetCount = useMemo(() => selectBatchLoadNodes(model, batchLoadPattern).length, [model, batchLoadPattern]);
  const manualNodeIds = useMemo(() => parseNodeIdList(manualNodeInput, new Set(model.nodes.map(node => node.id))), [manualNodeInput, model.nodes]);
  const memberPathNodeIds = useMemo(() => parseOrderedNodePath(memberPathInput, new Set(model.nodes.map(node => node.id))), [memberPathInput, model.nodes]);
  const memberPathNewCount = useMemo(() => (
    countNewMemberConnections(memberPathNodeIds, model.members, closeMemberPath)
  ), [closeMemberPath, memberPathNodeIds, model.members]);
  const selectedNode = selectedEntity?.type === 'node' ? model.nodes.find(node => node.id === selectedEntity.id) ?? null : null;
  const selectedMember = selectedEntity?.type === 'member' ? model.members.find(member => member.id === selectedEntity.id) ?? null : null;
  const selectedMemberStartNode = selectedMember ? model.nodes.find(node => node.id === selectedMember.startNode) ?? null : null;
  const selectedMemberEndNode = selectedMember ? model.nodes.find(node => node.id === selectedMember.endNode) ?? null : null;
  const selectedNodeLoads = selectedNode ? model.loads.filter(load => isSpaceNodalLoad(load) && load.nodeId === selectedNode.id) : [];
  const selectedMemberLoads = selectedMember ? model.loads.filter(load => isSpaceElementLoad(load) && load.elementId === selectedMember.id) : [];
  const draftTargetNodeIds = useMemo(() => {
    if (loadTargetMode === 'manual') return manualNodeIds;
    if (loadTargetMode === 'selection') {
      if (selectedNode) return [selectedNode.id];
      if (selectedMember) return Array.from(new Set([selectedMember.startNode, selectedMember.endNode]));
      return [];
    }
    return selectBatchLoadNodes(model, loadTargetMode).map(node => node.id);
  }, [loadTargetMode, manualNodeIds, model, selectedMember, selectedNode]);
  const draftTargetMemberIds = useMemo(() => {
    if (loadTargetMode === 'selection' && selectedMember) return [selectedMember.id];
    return [];
  }, [loadTargetMode, selectedMember]);
  const loadDraftPreviewLoads = useMemo<SpaceLoad[]>(() => {
    if (loadDraftKind === 'nodal') {
      return draftTargetNodeIds.map((nodeId, index) => ({
        id: `draft-node-${nodeId}-${index}`,
        nodeId,
        loadCaseId: model.activeLoadCaseId,
        type: loadDraftNodalType,
        direction: loadDirection,
        magnitude: roofLoad,
      }));
    }

    return draftTargetMemberIds.map((elementId, index) => ({
      id: `draft-member-${elementId}-${index}`,
      elementId,
      loadCaseId: model.activeLoadCaseId,
      type: loadDraftMemberType,
      direction: loadDirection,
      coordinateSystem: loadDraftCoordinateSystem,
      startMagnitude: roofLoad,
      endMagnitude: loadDraftMemberType === 'distributed' ? roofLoad : loadDraftEndMagnitude,
    }));
  }, [
    draftTargetMemberIds,
    draftTargetNodeIds,
    loadDirection,
    loadDraftCoordinateSystem,
    loadDraftEndMagnitude,
    loadDraftKind,
    loadDraftMemberType,
    loadDraftNodalType,
    model.activeLoadCaseId,
    roofLoad,
  ]);
  const viewportLoads = useMemo(() => [...scenarioLoads, ...loadDraftPreviewLoads], [scenarioLoads, loadDraftPreviewLoads]);
  const loadDraftTargetCount = loadDraftKind === 'nodal' ? draftTargetNodeIds.length : draftTargetMemberIds.length;
  const activeLoadCaseLoadCount = model.loads.filter(load => load.loadCaseId === model.activeLoadCaseId).length;
  const applyLoadDraft = () => {
    if (loadDraftPreviewLoads.length === 0) return;
    const time = Date.now();
    setModel(prev => ({
      ...prev,
      loads: [
        ...prev.loads,
        ...loadDraftPreviewLoads.map((load, index) => ({
          ...load,
          id: `${isSpaceNodalLoad(load) ? 'load' : 'member-load'}-${time}-${index}`,
          loadCaseId: prev.activeLoadCaseId,
        })),
      ],
    }));
    setLoadTableOpen(true);
  };
  const issues = useMemo(() => validateSpaceModel(model), [model]);
  const hasBlockingModelErrors = issues.some(issue => issue.severity === 'error');
  const runAnalysis = useCallback(() => {
    if (hasBlockingModelErrors) return;
    setAnalysisSnapshot(prev => ({
      runId: (prev?.runId ?? 0) + 1,
      key: currentAnalysisKey,
      target: activeAnalysisTarget,
      nodes: model.nodes,
      elements: spaceElements,
      loads: scenarioLoads,
    }));
  }, [activeAnalysisTarget, currentAnalysisKey, hasBlockingModelErrors, model.nodes, scenarioLoads, spaceElements]);

  useEffect(() => {
    if (analysisSnapshot || hasBlockingModelErrors) return;
    setAnalysisSnapshot({
      runId: 0,
      key: currentAnalysisKey,
      target: activeAnalysisTarget,
      nodes: model.nodes,
      elements: spaceElements,
      loads: scenarioLoads,
    });
  }, [activeAnalysisTarget, analysisSnapshot, currentAnalysisKey, hasBlockingModelErrors, model.nodes, scenarioLoads, spaceElements]);

  const isAnalysisStale = !analysisSnapshot || analysisSnapshot.key !== currentAnalysisKey;
  const solverState = useSpaceSolverWorker(
    analysisSnapshot?.nodes ?? [],
    analysisSnapshot?.elements ?? [],
    analysisSnapshot?.loads ?? [],
    undefined,
    analysisSnapshot?.runId ?? 0,
    Boolean(analysisSnapshot),
  );
  const result = solverState.result;
  const resultTarget = analysisSnapshot?.target ?? activeAnalysisTarget;
  const resultNodes = analysisSnapshot?.nodes ?? model.nodes;
  const resultElements = analysisSnapshot?.elements ?? spaceElements;
  const viewportResult = isAnalysisStale ? emptySpaceAnalysisResult : result;
  const envelopeRows = useMemo(() => buildSpaceResultEnvelopeRows([{ target: resultTarget, result }]), [resultTarget, result]);
  const summary = useMemo(() => buildSpaceResultSummary(result), [result]);
  const viewportSummary = useMemo(() => buildSpaceResultSummary(viewportResult), [viewportResult]);
  const serviceabilityRows = useMemo(() => (
    buildSpaceServiceabilityRows(result, resultElements, resultNodes)
  ), [result, resultElements, resultNodes]);
  const worstServiceabilityRow = useMemo(() => (
    getWorstSpaceServiceabilityRow(serviceabilityRows)
  ), [serviceabilityRows]);
  const selectedMaterial = model.materials.find(item => item.id === materialId);
  const selectedSection = model.sections.find(item => item.id === sectionId);
  const issueCounts = {
    errors: issues.filter(issue => issue.severity === 'error').length,
    warnings: issues.filter(issue => issue.severity === 'warning').length + (viewportResult.error || solverState.error || isAnalysisStale ? 1 : 0),
    infos: issues.filter(issue => issue.severity === 'info').length,
  };
  const diagnosticItems = [
    ...issues,
    ...(isAnalysisStale ? [{ id: 'analysis-stale', severity: 'warning' as const, title: '模型已修改', detail: '当前模型与最近一次计算快照不一致，请重新计算后再解读变形和内力。' }] : []),
    ...(viewportResult.error ? [{ id: 'solver-singular', severity: 'warning' as const, title: '求解器提示', detail: viewportResult.error }] : []),
    ...(solverState.error ? [{ id: 'solver-worker-fallback', severity: 'info' as const, title: 'Worker 降级', detail: solverState.error }] : []),
  ];
  const solverSourceLabel = solverState.isSolving ? '计算中' : isAnalysisStale ? '待重算' : solverState.source === 'worker' ? 'Worker' : solverState.source === 'sync-fallback' ? 'Fallback' : '待计算';
  const solverStats = isAnalysisStale ? undefined : result.stats;
  const solverStatRows = solverStats ? [
    ['来源', solverSourceLabel],
    ['后端', solverStats.backend],
    ['请求', solverStats.solverDiagnostics?.requestedBackend ?? '-'],
    ['预条件', solverStats.solverDiagnostics?.preconditioner ?? '-'],
    ['降级', solverStats.solverDiagnostics?.fallbackUsed ? 'Yes' : 'No'],
    ['自由度', `${solverStats.freeDof}/${solverStats.totalDof}`],
    ['非零元', `${solverStats.nnz}`],
    ['SPD', solverStats.matrixDiagnostics?.spdLikely ? 'Likely' : 'Check'],
    ['零行', `${solverStats.matrixDiagnostics?.nearZeroRowCount ?? 0}`],
    ['病态比', solverStats.matrixDiagnostics?.diagonalRatio === undefined ? '-' : solverStats.matrixDiagnostics.diagonalRatio.toExponential(1)],
    ['装配', `${format(solverStats.assemblyMs, 2)} ms`],
    ['求解', `${format(solverStats.solveMs, 2)} ms`],
    ['后处理', `${format(solverStats.postprocessMs, 2)} ms`],
    ['迭代', solverStats.iterations === undefined ? '-' : `${solverStats.iterations}`],
    ['残差', solverStats.relativeResidual === undefined ? '-' : solverStats.relativeResidual.toExponential(2)],
  ] : [];
  const modelHealth = hasBlockingModelErrors
    ? { label: '需修复', className: 'border-red-500/30 bg-red-500/10 text-red-200' }
    : isAnalysisStale
      ? { label: '待重算', className: 'border-amber-500/30 bg-amber-500/10 text-amber-200' }
    : issueCounts.warnings > 0
      ? { label: '可检查', className: 'border-amber-500/30 bg-amber-500/10 text-amber-200' }
      : { label: '可计算', className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' };
  const selectedEntityLabel = selectedNode
    ? `节点 N${selectedNode.id}`
    : selectedMember
      ? `杆件 E${selectedMember.id}`
      : '未选择';
  const selectedEntityShortLabel = selectedNode
    ? `N${selectedNode.id}`
    : selectedMember
      ? `E${selectedMember.id}`
      : 'None';
  const selectedEntityDetail = selectedNode
    ? `(${format(selectedNode.x, 2)}, ${format(selectedNode.y, 2)}, ${format(selectedNode.z, 2)})`
    : selectedMember
      ? `N${selectedMember.startNode} → N${selectedMember.endNode}`
      : '节点 / 杆件';
  const viewportDeformationScale = showDeformedShape && !isAnalysisStale ? deformationScale : 0;
  const viewportPanel = (
    <>
      <SpaceModelViewport
        model={model}
        elements={spaceElements}
        loads={viewportLoads}
        result={viewportResult}
        deformationScale={viewportDeformationScale}
        forceMode={forceMode}
        selectedEntity={selectedEntity}
        onSelectionChange={handleViewportSelection}
      />
      <div className="pointer-events-none absolute right-4 top-4 w-72 overflow-hidden rounded-lg border border-slate-700/80 bg-slate-950/82 text-[10px] text-slate-300 shadow-xl shadow-slate-950/40 backdrop-blur">
        <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-3 py-2">
          <div className="min-w-0">
            <div className="font-bold uppercase tracking-wider text-slate-500">当前选择</div>
            <div className="mt-0.5 truncate font-mono text-xs font-black text-amber-200">{selectedEntityShortLabel}</div>
          </div>
          <span className={`shrink-0 rounded-md border px-2 py-1 font-bold ${modelHealth.className}`}>{modelHealth.label}</span>
        </div>
        <div className="grid grid-cols-3 gap-1.5 p-2">
          <div className="rounded border border-slate-800 bg-slate-900/80 px-2 py-1.5">
            <div className="text-slate-600">对象</div>
            <div className="mt-0.5 truncate font-mono font-bold text-slate-100">{selectedEntityDetail}</div>
          </div>
          <div className="rounded border border-slate-800 bg-slate-900/80 px-2 py-1.5">
            <div className="text-slate-600">结果</div>
            <div className={`mt-0.5 font-mono font-bold ${isAnalysisStale ? 'text-amber-200' : resultStatusClass[viewportResult.status]}`}>
              {isAnalysisStale ? 'STALE' : resultStatusLabel[viewportResult.status]}
            </div>
          </div>
          <div className="rounded border border-slate-800 bg-slate-900/80 px-2 py-1.5">
            <div className="text-slate-600">图层</div>
            <div className="mt-0.5 truncate font-mono font-bold text-blue-200">{forceMode === 'none' ? 'Base' : forceMode}</div>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-slate-950 text-slate-200">
      <header className="shrink-0 border-b border-slate-800 bg-slate-950 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-cyan-500/30 bg-cyan-500/15 text-cyan-200">
              <Box className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-black text-white">空间结构求解器</h2>
              <p className="truncate text-[10px] text-slate-500">Z-up · 自由旋转 3D 模型 · 结构化建模与结果诊断</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onSwitchToPlane}
            className="inline-flex h-8 items-center gap-2 rounded-md border border-slate-700 bg-slate-900 px-3 text-[11px] font-semibold text-slate-300 transition-colors hover:border-indigo-500/60 hover:text-indigo-100"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            返回平面求解器
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside className="flex w-[22rem] shrink-0 flex-col overflow-hidden border-r border-slate-800 bg-slate-950 xl:w-[23rem] 2xl:w-[24rem]">
          <div className="shrink-0 border-b border-slate-800 bg-slate-950/95 px-3 py-3">
            <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/70 px-2 py-1.5">
              <div className="min-w-0">
                <div className="truncate text-[10px] text-slate-500">当前模型</div>
                <div className="truncate text-[11px] font-semibold text-slate-200">
                  {xBayCount}x{yBayCount} 跨 · {storyCount} 层
                </div>
              </div>
              <div className={`rounded-md border px-2 py-1 text-[10px] font-semibold ${
                solverState.isSolving
                  ? 'border-amber-500/25 bg-amber-500/10 text-amber-200'
                  : solverState.source === 'worker'
                    ? 'border-cyan-500/25 bg-cyan-500/10 text-cyan-200'
                    : 'border-slate-700 bg-slate-900 text-slate-300'
              }`}>
                {solverSourceLabel}
              </div>
              <SidebarMetric label="Nodes" value={model.nodes.length} />
              <SidebarMetric label="Elems" value={model.members.length} />
            </div>

            <div className="mt-2 grid grid-cols-4 gap-1.5">
              <SidebarMetric label="Loads" value={scenarioLoads.length} colorClass="text-rose-300" />
              <SidebarMetric label="Max δ" value={format(viewportSummary.maxDisplacement, 3)} colorClass="text-purple-300" />
              <SidebarMetric label="Max M" value={format(viewportSummary.maxBending)} colorClass="text-blue-300" />
              <SidebarMetric
                label="Checks"
                value={`${issueCounts.errors}/${issueCounts.warnings}`}
                colorClass={issueCounts.errors > 0 ? 'text-red-300' : issueCounts.warnings > 0 ? 'text-amber-300' : 'text-emerald-300'}
              />
            </div>

            <div className="mt-3 rounded-lg border border-slate-800 bg-slate-900/65 p-1">
              <div className="mb-1 px-1 text-[9px] font-semibold uppercase tracking-wider text-slate-600">工作区</div>
              <div className="grid grid-cols-4 gap-1">
                {workspaceOptions.map(option => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setActiveWorkspace(option.id)}
                    className={`min-w-0 rounded-md px-1.5 py-1.5 text-center transition-colors ${
                      activeWorkspace === option.id
                        ? 'bg-cyan-500/20 text-cyan-100'
                        : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
                    }`}
                  >
                    <span className="block truncate text-[10px] font-bold">{option.label}</span>
                    <span className="mt-0.5 block truncate text-[8px] font-medium opacity-70">{option.meta}</span>
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={runAnalysis}
              disabled={solverState.isSolving || hasBlockingModelErrors}
              className="mt-3 inline-flex h-8 w-full items-center justify-center gap-2 rounded-md border border-cyan-500/35 bg-cyan-500/15 text-[11px] font-bold text-cyan-100 transition-colors hover:bg-cyan-500/25 disabled:cursor-wait disabled:border-slate-700 disabled:bg-slate-900 disabled:text-slate-500"
            >
              <Calculator className="h-3.5 w-3.5" />
              {hasBlockingModelErrors ? '修复错误后计算' : solverState.isSolving ? '计算中' : isAnalysisStale ? '重新计算结构' : '计算结构'}
            </button>
            {isAnalysisStale ? (
              <div className="mt-2 rounded-md border border-amber-500/25 bg-amber-500/10 px-2 py-1.5 text-[10px] font-semibold text-amber-200">
                模型已修改
              </div>
            ) : null}
            <div className="mt-2 rounded-lg border border-slate-800 bg-slate-900/65 p-1">
              <div className="mb-1 px-1 text-[9px] font-semibold uppercase tracking-wider text-slate-600">内力云图</div>
              <div className="grid grid-cols-4 gap-1">
                {forceModeOptions.map(option => (
                  <button
                    key={option.id}
                    type="button"
                    aria-label={option.buttonLabel}
                    onClick={() => setForceMode(option.id)}
                    className={`rounded-md px-2 py-1.5 text-[10px] font-semibold transition-colors ${
                      forceMode === option.id
                        ? 'bg-blue-500/20 text-blue-100'
                        : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-2 rounded-lg border border-slate-800 bg-slate-900/65 p-2">
              <CompactToggle
                label="显示变形形状"
                description={isAnalysisStale ? '重新计算后显示' : '叠加位移放大图'}
                checked={showDeformedShape}
                onChange={setShowDeformedShape}
              />
              <div className={showDeformedShape ? 'mt-2' : 'mt-2 opacity-50'}>
                <NumberSlider
                  label="变形放大"
                  value={deformationScale}
                  min={0}
                  max={200}
                  step={10}
                  accentClass="accent-purple-500"
                  onChange={setDeformationScale}
                />
              </div>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
            {activeWorkspace === 'modeling' ? (
              <div className="space-y-3">
                <div className="overflow-hidden rounded-lg border border-cyan-500/20 bg-slate-900/70">
                  <div className="flex items-center justify-between gap-3 border-b border-slate-800/80 px-3 py-2">
                    <div className="min-w-0">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-cyan-300">模型工作台</div>
                      <div className="mt-0.5 truncate text-[10px] text-slate-500">{width}m × {depth}m × {height}m · {xBayCount}x{yBayCount} 跨 · {storyCount} 层</div>
                    </div>
                    <span className={`shrink-0 rounded-md border px-2 py-1 text-[10px] font-bold ${modelHealth.className}`}>{modelHealth.label}</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5 p-2">
                    <ModelStatCard label="Nodes" value={model.nodes.length} tone="text-cyan-200" />
                    <ModelStatCard label="Elems" value={model.members.length} tone="text-emerald-200" />
                    <ModelStatCard label="Loads" value={scenarioLoads.length} tone="text-rose-200" />
                    <ModelStatCard label="Select" value={selectedEntityLabel} tone={selectedEntity ? 'text-amber-200' : 'text-slate-400'} />
                  </div>
                </div>
                <WorkflowSection
              title="模型设置"
              subtitle="参数化生成、跨数与整体尺寸"
              accentClass="text-indigo-300"
              defaultOpen
              headerRight={<span className="rounded-md border border-indigo-500/25 bg-indigo-500/10 px-2 py-1 text-[10px] font-semibold text-indigo-200">{xBayCount}x{yBayCount} · {storyCount}F</span>}
            >
              <div className="grid grid-cols-2 gap-2">
                <ModelStatCard label="柱网" value={`${xBayCount} × ${yBayCount}`} tone="text-indigo-200" />
                <ModelStatCard label="楼层" value={`${storyCount}F`} tone="text-cyan-200" />
                <ModelStatCard label="屋面" value={roofProfile === 'flat' ? 'Flat' : roofProfile === 'gable-x' ? 'Gable' : 'Shed'} tone="text-amber-200" />
                <ModelStatCard label="求解" value={solverSourceLabel} tone="text-slate-100" />
              </div>
              <div className="border-t border-slate-800/70 pt-3">
                <div className="mb-2">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-cyan-300">参数化生成器</div>
                  <div className="mt-0.5 text-[9px] text-slate-500">点击重建才会覆盖当前手工模型</div>
                </div>
                <div className="space-y-3">
                  <div className="rounded-lg border border-slate-800 bg-slate-950/35 p-2">
                    <div className="mb-2 text-[10px] font-semibold text-slate-300">柱网与层高</div>
                    <NumberSlider label="X 总跨度" value={width} min={3} max={24} step={0.5} unit="m" onChange={setWidth} />
                    <NumberSlider label="Y 总进深" value={depth} min={3} max={18} step={0.5} unit="m" onChange={setDepth} />
                    <NumberSlider label="檐口高度" value={height} min={2.5} max={14} step={0.5} unit="m" onChange={setHeight} />
                    <div className="grid grid-cols-3 gap-2">
                      <NumberSlider label="X 跨数" value={xBayCount} min={1} max={8} step={1} onChange={setXBayCount} />
                      <NumberSlider label="Y 跨数" value={yBayCount} min={1} max={6} step={1} onChange={setYBayCount} />
                      <NumberSlider label="层数" value={storyCount} min={1} max={8} step={1} onChange={setStoryCount} />
                    </div>
                  </div>

                  <div className="rounded-lg border border-slate-800 bg-slate-950/35 p-2">
                    <div className="mb-2 text-[10px] font-semibold text-slate-300">屋面与次构件</div>
                    <OptionButtons
                      label="屋面形式"
                      options={roofProfileOptions}
                      value={roofProfile}
                      onChange={setRoofProfile}
                    />
                    {roofProfile !== 'flat' ? (
                      <NumberSlider label="屋面起坡" value={roofRise} min={0.2} max={5} step={0.1} unit="m" accentClass="accent-indigo-500" onChange={setRoofRise} />
                    ) : null}
                    <div className="mt-2 grid grid-cols-[1fr_7rem] gap-2">
                      <CompactToggle
                        label="屋面次梁/檩条"
                        description="在每跨内插节点"
                        checked={includeSecondaryBeams}
                        accentClass="accent-indigo-500"
                        onChange={setIncludeSecondaryBeams}
                      />
                      <NumberSlider label="每跨道数" value={secondaryBeamCount} min={1} max={4} step={1} onChange={setSecondaryBeamCount} />
                    </div>
                  </div>

                  <div className="rounded-lg border border-slate-800 bg-slate-950/35 p-2">
                    <div className="mb-2 text-[10px] font-semibold text-slate-300">支撑体系</div>
                    <div className="grid grid-cols-2 gap-2">
                      <CompactToggle
                        label="屋面水平支撑"
                        description="屋面每格 X 撑"
                        checked={includeRoofBracing}
                        onChange={setIncludeRoofBracing}
                      />
                      <CompactToggle
                        label="各层水平支撑"
                        description="楼层平面 X 撑"
                        checked={includeFloorBracing}
                        accentClass="accent-emerald-500"
                        onChange={setIncludeFloorBracing}
                      />
                    </div>
                    <div className="mt-2">
                      <OptionButtons
                        label="立面交叉支撑"
                        options={verticalBracingOptions}
                        value={verticalBracingMode}
                        onChange={setVerticalBracingMode}
                      />
                    </div>
                    <div className="mt-2">
                      <CompactToggle
                        label="中心核心支撑"
                        description="中间开间形成稳定核心"
                        checked={includeCoreBracing}
                        accentClass="accent-amber-500"
                        onChange={setIncludeCoreBracing}
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={rebuildParametricModel}
                    className="inline-flex h-8 w-full items-center justify-center gap-2 rounded-md border border-cyan-500/30 bg-cyan-500/10 text-[10px] font-semibold text-cyan-100 transition-colors hover:bg-cyan-500/20"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    按参数重建模型
                  </button>
                </div>
              </div>
                </WorkflowSection>

                <WorkflowSection
              title="几何编辑"
              subtitle="节点坐标、支座与杆件连接"
              accentClass="text-cyan-300"
              headerRight={<span className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-[10px] font-semibold text-slate-300">N{model.nodes.length} / E{model.members.length}</span>}
            >
              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-cyan-300">节点与支座</div>
                    <div className="mt-0.5 text-[9px] text-slate-500">坐标单位 m，支座作用于 6 个自由度</div>
                  </div>
                  <button type="button" onClick={addNode} className={iconButtonClass} aria-label="新增空间节点" title="新增空间节点"><Plus className="h-3.5 w-3.5" /></button>
                </div>
                  <div className="mb-1 grid grid-cols-[2.5rem_repeat(3,minmax(4rem,1fr))_6rem_2rem] items-center gap-1.5 px-2 text-[8px] font-bold uppercase tracking-wider text-slate-600">
                    <span>ID</span>
                    <span>X</span>
                    <span>Y</span>
                    <span>Z</span>
                    <span>支座</span>
                    <span />
                  </div>
                  <div className="max-h-[28rem] space-y-1.5 overflow-auto pr-1">
                    {model.nodes.length === 0 ? (
                      <div className="rounded border border-slate-800 bg-slate-950/45 px-2 py-3 text-center text-[10px] text-slate-500">暂无节点</div>
                    ) : model.nodes.map(node => (
                      <div
                        key={node.id}
                        className={`grid grid-cols-[2.5rem_repeat(3,minmax(4rem,1fr))_6rem_2rem] items-center gap-1.5 rounded-md border px-2 py-1.5 transition-colors ${
                          selectedEntity?.type === 'node' && selectedEntity.id === node.id
                            ? 'border-amber-400/50 bg-amber-500/10'
                            : 'border-slate-800 bg-slate-950/45 hover:border-slate-700'
                        }`}
                      >
                        <div className="font-mono text-[10px] font-bold text-cyan-200">N{node.id}</div>
                        {compactNumber(node.x, value => updateNode(node.id, { x: value }), `节点 ${node.id} X 坐标`)}
                        {compactNumber(node.y, value => updateNode(node.id, { y: value }), `节点 ${node.id} Y 坐标`)}
                        {compactNumber(node.z, value => updateNode(node.id, { z: value }), `节点 ${node.id} Z 坐标`)}
                        <select
                          aria-label={`节点 ${node.id} 支座类型`}
                          value={supportPresetFor(node.restraints)}
                          onChange={(event) => {
                            const preset = SUPPORT_PRESETS.find(item => item.id === event.target.value);
                            if (preset) updateNode(node.id, { restraints: preset.restraints });
                          }}
                          className={fieldClass}
                        >
                          <option value="custom" disabled>自定义</option>
                          {SUPPORT_PRESETS.map(preset => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
                        </select>
                        <button type="button" onClick={() => deleteNode(node.id)} className={iconButtonClass} aria-label={`删除节点 ${node.id}`} title="删除节点">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
              </div>

              <div className="border-t border-slate-800/70 pt-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-300">成员连接</div>
                    <div className="mt-0.5 text-[9px] text-slate-500">新增成员默认采用当前材料和截面</div>
                  </div>
                  <button type="button" onClick={addMember} className={iconButtonClass} aria-label="新增空间成员" title="新增空间成员"><Plus className="h-3.5 w-3.5" /></button>
                </div>
                  <div className="mb-2 overflow-hidden rounded-md border border-emerald-500/20 bg-emerald-500/5">
                    <div className="flex items-center justify-between gap-2 border-b border-slate-800/80 px-2.5 py-2">
                      <div className="min-w-0">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-300">路径连杆</div>
                        <div className="mt-0.5 truncate text-[9px] text-slate-500">按输入顺序生成连续成员</div>
                      </div>
                      <span className="rounded border border-slate-700 bg-slate-950 px-2 py-1 font-mono text-[10px] font-semibold text-emerald-200">+{memberPathNewCount}</span>
                    </div>
                    <div className="grid gap-2 p-2 lg:grid-cols-[minmax(9rem,1fr)_6.5rem_8.5rem]">
                      <label className="block text-[10px] font-semibold text-slate-400">
                        <span className="mb-1 block">节点路径</span>
                        <input
                          aria-label="杆件路径节点编号"
                          value={memberPathInput}
                          onChange={(event) => setMemberPathInput(event.target.value)}
                          placeholder="1-4,8,12"
                          className={`${fieldClass} w-full font-mono`}
                        />
                      </label>
                      <label className="flex items-end justify-between gap-2 rounded border border-slate-800 bg-slate-900/70 px-2 py-1.5 text-[10px] font-semibold text-slate-300">
                        <span>闭合</span>
                        <input
                          aria-label="闭合路径连杆"
                          type="checkbox"
                          checked={closeMemberPath}
                          onChange={(event) => setCloseMemberPath(event.target.checked)}
                          className="h-4 w-4 accent-emerald-500"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={addMembersFromPath}
                        disabled={memberPathNewCount === 0}
                        className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 text-[10px] font-semibold text-emerald-100 transition-colors hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:border-slate-800 disabled:bg-slate-900 disabled:text-slate-600"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        生成 {memberPathNewCount} 根杆件
                      </button>
                    </div>
                  </div>
                  <div className="mb-1 grid grid-cols-[2.5rem_minmax(5rem,1fr)_minmax(5rem,1fr)_2rem] items-center gap-1.5 px-2 text-[8px] font-bold uppercase tracking-wider text-slate-600">
                    <span>ID</span>
                    <span>起点</span>
                    <span>终点</span>
                    <span />
                  </div>
                  <div className="max-h-[24rem] space-y-1.5 overflow-auto pr-1">
                    {model.members.length === 0 ? (
                      <div className="rounded border border-slate-800 bg-slate-950/45 px-2 py-3 text-center text-[10px] text-slate-500">暂无成员</div>
                    ) : model.members.map(member => (
                      <div
                        key={member.id}
                        className={`grid grid-cols-[2.5rem_minmax(5rem,1fr)_minmax(5rem,1fr)_2rem] items-center gap-1.5 rounded-md border px-2 py-1.5 transition-colors ${
                          selectedEntity?.type === 'member' && selectedEntity.id === member.id
                            ? 'border-amber-400/50 bg-amber-500/10'
                            : 'border-slate-800 bg-slate-950/45 hover:border-slate-700'
                        }`}
                      >
                        <div className="font-mono text-[10px] font-bold text-emerald-200">E{member.id}</div>
                        <select aria-label={`成员 ${member.id} 起点节点`} value={member.startNode} onChange={(event) => updateMember(member.id, { startNode: Number(event.target.value) })} className={fieldClass}>
                          {model.nodes.map(node => <option key={node.id} value={node.id}>N{node.id}</option>)}
                        </select>
                        <select aria-label={`成员 ${member.id} 终点节点`} value={member.endNode} onChange={(event) => updateMember(member.id, { endNode: Number(event.target.value) })} className={fieldClass}>
                          {model.nodes.map(node => <option key={node.id} value={node.id}>N{node.id}</option>)}
                        </select>
                        <button type="button" onClick={() => deleteMember(member.id)} className={iconButtonClass} aria-label={`删除成员 ${member.id}`} title="删除成员">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                  {selectedMember ? (
                    <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/45 p-2">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <div>
                          <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-300">端部释放</div>
                          <div className="mt-0.5 text-[9px] text-slate-500">当前杆件 E{selectedMember.id} · 局部转角</div>
                        </div>
                      </div>
                      <div className="grid grid-cols-[3.25rem_repeat(3,1fr)] gap-1.5 text-[10px]">
                        <div />
                        {(['rx', 'ry', 'rz'] as const).map(axis => (
                          <div key={axis} className="text-center font-semibold text-slate-500">{axis}</div>
                        ))}
                        {([
                          ['起点', 'releaseStart'] as const,
                          ['终点', 'releaseEnd'] as const,
                        ]).map(([label, end]) => (
                          <React.Fragment key={end}>
                            <div className="flex items-center text-slate-400">{label}</div>
                            {(['rx', 'ry', 'rz'] as const).map(axis => (
                              <label key={`${end}-${axis}`} className="flex items-center justify-center rounded border border-slate-800 bg-slate-900/70 py-1.5">
                                <span className="sr-only">{`${label} ${axis}`}</span>
                                <input
                                  aria-label={`${label} ${axis}`}
                                  type="checkbox"
                                  checked={Boolean(selectedMember[end]?.[axis])}
                                  onChange={(event) => updateSelectedMemberRelease(end, axis, event.target.checked)}
                                  className="h-3.5 w-3.5 accent-amber-500"
                                />
                              </label>
                            ))}
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
                  ) : null}
              </div>
                </WorkflowSection>

                <WorkflowSection
              title="材料截面"
              subtitle="材料库、截面库与全局应用"
              accentClass="text-emerald-300"
              headerRight={<span className="rounded-md border border-emerald-500/25 bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold text-emerald-200">{model.members.length} 杆</span>}
            >
                <div className="space-y-3">
                  <label className="block text-[10px] font-semibold text-slate-400">
                    材料
                    <select value={materialId} onChange={(event) => setMaterialId(event.target.value)} className="mt-1 w-full rounded border border-slate-700 bg-slate-800 p-1.5 text-[10px] text-slate-200 outline-none focus:border-emerald-500">
                      {model.materials.map(material => <option key={material.id} value={material.id}>{material.name}</option>)}
                    </select>
                  </label>
                  <label className="block text-[10px] font-semibold text-slate-400">
                    截面
                    <select value={sectionId} onChange={(event) => setSectionId(event.target.value)} className="mt-1 w-full rounded border border-slate-700 bg-slate-800 p-1.5 text-[10px] text-slate-200 outline-none focus:border-emerald-500">
                      {model.sections.map(section => <option key={section.id} value={section.id}>{section.name}</option>)}
                    </select>
                  </label>
                  <button type="button" onClick={applyMaterialSectionToAllMembers} className="inline-flex h-8 w-full items-center justify-center rounded-md border border-emerald-500/30 bg-emerald-500/10 text-[10px] font-semibold text-emerald-100 transition-colors hover:bg-emerald-500/20">
                    应用到全部成员
                  </button>
                </div>

              <div className="border-t border-slate-800/70 pt-3">
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-emerald-300">截面参数</div>
                <div className="grid grid-cols-2 gap-2 text-[10px]">
                  {[
                    ['材料 E', `${selectedMaterial?.E ?? 0} GPa`],
                    ['泊松比 ν', `${selectedMaterial?.nu ?? 0}`],
                    ['截面 A', `${selectedSection?.A ?? 0} ${SPACE_SECTION_UNITS.A}`],
                    ['Iy / Iz', `${selectedSection?.Iy ?? 0} / ${selectedSection?.Iz ?? 0} ${SPACE_SECTION_UNITS.Iy}`],
                    ['J', `${selectedSection?.J ?? 0} ${SPACE_SECTION_UNITS.J}`],
                    ['当前成员', `${model.members.length}`],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded border border-slate-800 bg-slate-950/50 px-2 py-2">
                      <div className="text-slate-500">{label}</div>
                      <div className="mt-1 font-mono font-semibold text-emerald-200">{value}</div>
                    </div>
                  ))}
                </div>
              </div>
                </WorkflowSection>
              </div>
            ) : null}

            {activeWorkspace === 'loads' ? (
              <div className="space-y-3">
                <WorkflowSection
                  title="工况"
                  subtitle="决定新荷载写入位置与当前分析来源"
                  accentClass="text-rose-300"
                  defaultOpen
                  headerRight={<span className="rounded-md border border-rose-500/25 bg-rose-500/10 px-2 py-1 text-[10px] font-semibold text-rose-200">{activeLoadCaseLoadCount} 条</span>}
                >
                  <div className="grid gap-2 text-[10px]">
                    <label className="block font-semibold text-slate-400">
                      编辑工况
                      <select
                        value={model.activeLoadCaseId}
                        onChange={(event) => setActiveLoadCaseId(event.target.value)}
                        className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-[10px] text-slate-100 outline-none focus:border-rose-500"
                      >
                        {model.loadCases.map(loadCase => <option key={loadCase.id} value={loadCase.id}>{loadCase.name}</option>)}
                      </select>
                    </label>
                    <label className="block font-semibold text-slate-400">
                      分析目标
                      <select
                        value={activeAnalysisValue}
                        onChange={(event) => setActiveAnalysisValue(event.target.value)}
                        className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-[10px] text-slate-100 outline-none focus:border-rose-500"
                      >
                        <optgroup label="单一工况">
                          {model.loadCases.map(loadCase => <option key={loadCase.id} value={`loadCase:${loadCase.id}`}>{loadCase.name}</option>)}
                        </optgroup>
                        <optgroup label="组合">
                          {loadCombinations.map(combo => <option key={combo.id} value={`combination:${combo.id}`}>{combo.name}</option>)}
                        </optgroup>
                      </select>
                    </label>
                    <label className="flex items-center justify-between gap-2 rounded border border-slate-800 bg-slate-950/55 px-2 py-2 font-semibold text-slate-300">
                      <span>计入结构自重</span>
                      <input
                        type="checkbox"
                        checked={Boolean(model.selfWeight?.enabled)}
                        onChange={(event) => setModel(prev => ({ ...prev, selfWeight: { ...(prev.selfWeight ?? { factor: 1, loadCaseId: 'dead' }), enabled: event.target.checked } }))}
                        className="h-3.5 w-3.5 accent-rose-500"
                      />
                    </label>
                    {model.selfWeight?.enabled ? (
                      <div>{compactNumber(model.selfWeight.factor ?? 1, value => setModel(prev => ({ ...prev, selfWeight: { ...(prev.selfWeight ?? { enabled: true, loadCaseId: 'dead' }), enabled: true, factor: value } })), '自重系数', 0.1)}</div>
                    ) : null}
                    {activeAnalysisTarget.type === 'combination' ? (
                      <div className="space-y-1.5 rounded border border-slate-800 bg-slate-950/45 p-2">
                        {model.loadCases.map(loadCase => {
                          const combo = loadCombinations.find(item => item.id === activeAnalysisTarget.id) as SpaceLoadCombination | undefined;
                          return (
                            <div key={loadCase.id} className="grid grid-cols-[1fr_4.5rem] items-center gap-2">
                              <span className="truncate text-slate-400">{loadCase.name}</span>
                              {compactNumber(combo?.factors[loadCase.id] ?? 0, value => updateLoadCombinationFactor(activeAnalysisTarget.id, loadCase.id, value), `${loadCase.name} 组合系数`, 0.1)}
                            </div>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                </WorkflowSection>

                <WorkflowSection
                  title="添加荷载"
                  subtitle="选择对象、预览箭头、确认应用"
                  accentClass="text-rose-300"
                  defaultOpen
                  headerRight={<span className="rounded-md border border-rose-500/25 bg-rose-500/10 px-2 py-1 text-[10px] font-semibold text-rose-200">预览 {loadDraftTargetCount}</span>}
                >
                  <div className="space-y-3">
                    <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">当前选择</div>
                          <div className="mt-0.5 truncate text-[10px] font-semibold text-slate-200">
                            {selectedNode ? `节点 N${selectedNode.id}` : selectedMember ? `杆件 E${selectedMember.id}` : '未选择对象'}
                          </div>
                        </div>
                        {selectedEntity ? (
                          <button type="button" onClick={() => setSelectedEntity(null)} className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[10px] font-semibold text-slate-400 transition-colors hover:text-slate-100">
                            清除
                          </button>
                        ) : null}
                      </div>
                      {selectedMember ? (
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          {[selectedMemberStartNode, selectedMemberEndNode].map((node, index) => (
                            <button
                              key={`${selectedMember.id}-${index}`}
                              type="button"
                              disabled={!node}
                              onClick={() => node && selectNodeForLoadEditing(node.id)}
                              className="rounded border border-slate-800 bg-slate-900/70 px-2 py-1.5 text-left transition-colors hover:border-rose-500/50 disabled:cursor-not-allowed disabled:text-slate-600"
                            >
                              <span className="block text-[9px] text-slate-500">{index === 0 ? '起点' : '终点'}</span>
                              <span className="font-mono text-[10px] font-bold text-slate-100">{node ? `N${node.id}` : '-'}</span>
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      {([
                        { id: 'nodal' as const, label: '节点荷载', meta: '力 / 力矩' },
                        { id: 'member' as const, label: '杆件荷载', meta: '均布 / 梯形' },
                      ]).map(option => (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => {
                            setLoadDraftKind(option.id);
                            if (option.id === 'member') setLoadTargetMode('selection');
                          }}
                          className={`rounded-lg border px-2.5 py-2 text-left transition-colors ${
                            loadDraftKind === option.id
                              ? 'border-rose-400/60 bg-rose-500/15 text-rose-100'
                              : 'border-slate-800 bg-slate-950/45 text-slate-400 hover:border-slate-700 hover:text-slate-100'
                          }`}
                        >
                          <span className="block text-[10px] font-bold">{option.label}</span>
                          <span className="mt-0.5 block text-[9px] opacity-70">{option.meta}</span>
                        </button>
                      ))}
                    </div>

                    {loadDraftKind === 'nodal' ? (
                      <div className="grid grid-cols-2 gap-2">
                        {([
                          { id: 'point' as const, label: '节点力' },
                          { id: 'moment' as const, label: '节点力矩' },
                        ]).map(option => (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => setLoadDraftNodalType(option.id)}
                            className={`rounded border px-2 py-1.5 text-[10px] font-semibold transition-colors ${
                              loadDraftNodalType === option.id
                                ? 'border-rose-400/70 bg-rose-500/20 text-rose-100'
                                : 'border-slate-800 bg-slate-950/45 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                            }`}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        {([
                          { id: 'distributed' as const, label: '均布' },
                          { id: 'trapezoidal' as const, label: '梯形' },
                        ]).map(option => (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => setLoadDraftMemberType(option.id)}
                            className={`rounded border px-2 py-1.5 text-[10px] font-semibold transition-colors ${
                              loadDraftMemberType === option.id
                                ? 'border-rose-400/70 bg-rose-500/20 text-rose-100'
                                : 'border-slate-800 bg-slate-950/45 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                            }`}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    )}

                    <div>
                      <div className="mb-1.5 text-[10px] font-semibold text-slate-400">作用对象</div>
                      <div className="grid grid-cols-2 gap-1.5">
                        {loadTargetOptions.map(option => {
                          const disabled = loadDraftKind === 'member' && option.id !== 'selection';
                          return (
                            <button
                              key={option.id}
                              type="button"
                              disabled={disabled}
                              onClick={() => {
                                setLoadTargetMode(option.id);
                                if (option.id !== 'manual' && option.id !== 'selection') setBatchLoadPattern(option.id);
                              }}
                              className={`rounded border px-2 py-1.5 text-left transition-colors ${
                                loadTargetMode === option.id
                                  ? 'border-rose-400/60 bg-rose-500/15 text-rose-100'
                                  : 'border-slate-800 bg-slate-950/45 text-slate-400 hover:border-slate-700 hover:text-slate-100'
                              } ${disabled ? 'cursor-not-allowed opacity-40' : ''}`}
                            >
                              <span className="block truncate text-[10px] font-bold">{option.label}</span>
                              <span className="mt-0.5 block truncate text-[8px] opacity-70">{option.meta}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {loadTargetMode === 'manual' ? (
                      <label className="block text-[10px] font-semibold text-slate-400">
                        节点编号
                        <input
                          aria-label="荷载目标节点编号"
                          value={manualNodeInput}
                          onChange={(event) => setManualNodeInput(event.target.value)}
                          placeholder="如 5, 8-12"
                          className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 font-mono text-[10px] text-slate-100 outline-none focus:border-rose-500"
                        />
                      </label>
                    ) : null}

                    <div className="grid grid-cols-3 gap-1.5">
                      {(['x', 'y', 'z'] as SpaceDirection[]).map(direction => (
                        <button
                          key={direction}
                          type="button"
                          onClick={() => setLoadDirection(direction)}
                          className={`rounded border px-2 py-1.5 text-[10px] font-semibold transition-colors ${
                            loadDirection === direction
                              ? 'border-rose-400/70 bg-rose-500/20 text-rose-100'
                              : 'border-slate-800 bg-slate-950/45 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                          }`}
                        >
                          {loadDraftKind === 'member' ? memberDirectionLabel[direction] : directionLabel[direction]}
                        </button>
                      ))}
                    </div>

                    {loadDraftKind === 'member' ? (
                      <div className="grid grid-cols-2 gap-2">
                        {(['global', 'local'] as SpaceDraftCoordinateSystem[]).map(system => (
                          <button
                            key={system}
                            type="button"
                            onClick={() => setLoadDraftCoordinateSystem(system)}
                            className={`rounded border px-2 py-1.5 text-[10px] font-semibold transition-colors ${
                              loadDraftCoordinateSystem === system
                                ? 'border-rose-400/70 bg-rose-500/20 text-rose-100'
                                : 'border-slate-800 bg-slate-950/45 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                            }`}
                          >
                            {system === 'global' ? '全局坐标' : '局部坐标'}
                          </button>
                        ))}
                      </div>
                    ) : null}

                    <NumberSlider
                      label={loadDraftKind === 'member' ? '起点/均布值' : `${loadDraftNodalType === 'moment' ? '节点力矩' : '节点力'} ${directionLabel[loadDirection]}`}
                      value={roofLoad}
                      min={-80}
                      max={40}
                      step={5}
                      unit={loadDraftKind === 'member' ? 'kN/m' : loadDraftNodalType === 'moment' ? 'kN·m' : 'kN'}
                      accentClass="accent-rose-500"
                      onChange={setRoofLoad}
                    />
                    {loadDraftKind === 'member' && loadDraftMemberType === 'trapezoidal' ? (
                      <NumberSlider label="终点值" value={loadDraftEndMagnitude} min={-80} max={40} step={5} unit="kN/m" accentClass="accent-rose-500" onChange={setLoadDraftEndMagnitude} />
                    ) : null}

                    <div className="grid grid-cols-3 gap-2 text-[10px]">
                      <div className="rounded border border-slate-800 bg-slate-950/50 px-2 py-2">
                        <div className="text-slate-500">目标</div>
                        <div className="mt-1 font-mono font-bold text-rose-200">{loadDraftTargetCount}</div>
                      </div>
                      <div className="rounded border border-slate-800 bg-slate-950/50 px-2 py-2">
                        <div className="text-slate-500">单值</div>
                        <div className="mt-1 font-mono font-bold text-slate-100">{roofLoad}</div>
                      </div>
                      <div className="rounded border border-slate-800 bg-slate-950/50 px-2 py-2">
                        <div className="text-slate-500">方向</div>
                        <div className="mt-1 font-mono font-bold text-cyan-200">{loadDirection.toUpperCase()}</div>
                      </div>
                    </div>

                    {loadDraftKind === 'member' && !selectedMember ? (
                      <div className="rounded border border-amber-500/25 bg-amber-500/10 px-2 py-2 text-[10px] text-amber-100">杆件荷载需要先在右侧模型中选中一根杆件。</div>
                    ) : null}

                    <button
                      type="button"
                      onClick={applyLoadDraft}
                      disabled={loadDraftPreviewLoads.length === 0}
                      className="inline-flex h-8 w-full items-center justify-center gap-2 rounded-md border border-rose-500/35 bg-rose-500/15 text-[10px] font-semibold text-rose-100 transition-colors hover:bg-rose-500/25 disabled:cursor-not-allowed disabled:border-slate-800 disabled:bg-slate-900 disabled:text-slate-600"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      应用 {loadDraftPreviewLoads.length} 条荷载到当前工况
                    </button>

                    <div className="border-t border-slate-800/70 pt-3">
                      <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-rose-300">快捷模板</div>
                      <div className="grid grid-cols-2 gap-2">
                        {loadTemplates.map(template => {
                          const targetCount = selectBatchLoadNodes(model, template.pattern).length;
                          return (
                            <button
                              key={template.id}
                              type="button"
                              onClick={() => applyLoadTemplate(template)}
                              className="rounded-lg border border-slate-800 bg-slate-950/45 px-2.5 py-2 text-left transition-colors hover:border-rose-500/40 hover:bg-rose-500/10"
                            >
                              <span className="flex items-center justify-between gap-2">
                                <span className="truncate text-[10px] font-bold text-slate-100">{template.label}</span>
                                <span className="font-mono text-[10px] font-semibold text-rose-200">{template.magnitude > 0 ? '+' : ''}{template.magnitude}</span>
                              </span>
                              <span className="mt-1 block truncate text-[9px] text-slate-500">{targetCount} 节点 · {directionLabel[template.direction]}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </WorkflowSection>

                <WorkflowSection
                  title="荷载清单"
                  subtitle="已应用荷载的增删改"
                  accentClass="text-rose-300"
                  defaultOpen={false}
                  headerRight={<span className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 font-mono text-[10px] text-slate-300">{model.loads.length}</span>}
                >
                  <div className="mb-2 flex items-center gap-2">
                    <button type="button" onClick={() => setLoadTableOpen(prev => !prev)} className="inline-flex h-8 flex-1 items-center justify-center gap-2 rounded-md border border-slate-700 bg-slate-900 text-[10px] font-semibold text-slate-300 transition-colors hover:border-slate-500 hover:text-slate-100">
                      <SlidersHorizontal className="h-3.5 w-3.5" />
                      {isLoadTableOpen ? '收起清单' : '展开清单'}
                    </button>
                    <button type="button" onClick={clearBatchLoads} className="inline-flex h-8 items-center justify-center rounded-md border border-slate-700 bg-slate-900 px-3 text-[10px] font-semibold text-slate-300 transition-colors hover:border-red-500/50 hover:text-red-200">
                      清除批量
                    </button>
                  </div>
                  {isLoadTableOpen ? (
                    <div className="max-h-[32rem] space-y-1.5 overflow-auto">
                      {model.loads.length === 0 ? (
                        <div className="rounded border border-slate-800 bg-slate-950/45 px-2 py-3 text-center text-[10px] text-slate-500">暂无荷载</div>
                      ) : model.loads.map(load => (
                        isSpaceNodalLoad(load) ? (
                          <div key={load.id} className="grid grid-cols-[3.5rem_3.25rem_3.25rem_3.25rem_minmax(4.5rem,1fr)_2rem] items-center gap-1.5 rounded border border-slate-800 bg-slate-950/45 px-2 py-1.5">
                            <span className={`rounded px-1.5 py-1 text-center text-[9px] font-semibold ${isSpaceBatchLoad(load) ? 'bg-rose-500/15 text-rose-200' : 'bg-cyan-500/15 text-cyan-200'}`}>
                              {isSpaceBatchLoad(load) ? '批量' : '节点'}
                            </span>
                            <select aria-label={`${load.id} 节点`} value={load.nodeId} onChange={(event) => updateNodalLoad(load.id, { nodeId: Number(event.target.value) })} className={fieldClass}>
                              {model.nodes.map(node => <option key={node.id} value={node.id}>N{node.id}</option>)}
                            </select>
                            <select aria-label={`${load.id} 类型`} value={load.type} onChange={(event) => updateNodalLoad(load.id, { type: event.target.value as SpaceNodalLoad['type'] })} className={fieldClass}>
                              <option value="point">力</option>
                              <option value="moment">矩</option>
                            </select>
                            <select aria-label={`${load.id} 方向`} value={load.direction} onChange={(event) => updateNodalLoad(load.id, { direction: event.target.value as SpaceDirection })} className={fieldClass}>
                              <option value="x">X</option>
                              <option value="y">Y</option>
                              <option value="z">Z</option>
                            </select>
                            {compactNumber(load.magnitude, value => updateNodalLoad(load.id, { magnitude: value }), `${load.id} 大小`, 1)}
                            <button type="button" onClick={() => deleteLoad(load.id)} className={iconButtonClass} aria-label={`删除荷载 ${load.id}`} title="删除荷载">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div key={load.id} className="grid grid-cols-[3.5rem_3.25rem_3.25rem_3.25rem_3.25rem_minmax(4rem,1fr)_minmax(4rem,1fr)_2rem] items-center gap-1.5 rounded border border-slate-800 bg-slate-950/45 px-2 py-1.5">
                            <span className="rounded bg-amber-500/15 px-1.5 py-1 text-center text-[9px] font-semibold text-amber-200">杆件</span>
                            <select aria-label={`${load.id} 杆件`} value={load.elementId} onChange={(event) => updateElementLoad(load.id, { elementId: Number(event.target.value) })} className={fieldClass}>
                              {model.members.map(member => <option key={member.id} value={member.id}>E{member.id}</option>)}
                            </select>
                            <select
                              aria-label={`${load.id} 类型`}
                              value={load.type}
                              onChange={(event) => {
                                const type = event.target.value as SpaceElementLoad['type'];
                                updateElementLoad(load.id, {
                                  type,
                                  endMagnitude: type === 'distributed' ? load.startMagnitude : load.endMagnitude,
                                });
                              }}
                              className={fieldClass}
                            >
                              <option value="distributed">均布</option>
                              <option value="trapezoidal">梯形</option>
                            </select>
                            <select aria-label={`${load.id} 坐标`} value={load.coordinateSystem ?? 'global'} onChange={(event) => updateElementLoad(load.id, { coordinateSystem: event.target.value as SpaceElementLoad['coordinateSystem'] })} className={fieldClass}>
                              <option value="global">全局</option>
                              <option value="local">局部</option>
                            </select>
                            <select aria-label={`${load.id} 方向`} value={load.direction} onChange={(event) => updateElementLoad(load.id, { direction: event.target.value as SpaceDirection })} className={fieldClass}>
                              <option value="x">X/x</option>
                              <option value="y">Y/y</option>
                              <option value="z">Z/z</option>
                            </select>
                            {compactNumber(load.startMagnitude, value => updateElementLoad(load.id, {
                              startMagnitude: value,
                              endMagnitude: load.type === 'distributed' ? value : load.endMagnitude,
                            }), `${load.id} 起点大小`, 0.5)}
                            {compactNumber(load.type === 'distributed' ? load.startMagnitude : load.endMagnitude, value => updateElementLoad(load.id, {
                              endMagnitude: value,
                              startMagnitude: load.type === 'distributed' ? value : load.startMagnitude,
                            }), `${load.id} 终点大小`, 0.5)}
                            <button type="button" onClick={() => deleteLoad(load.id)} className={iconButtonClass} aria-label={`删除荷载 ${load.id}`} title="删除荷载">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )
                      ))}
                    </div>
                  ) : null}
                </WorkflowSection>
              </div>
            ) : null}


            {activeWorkspace === 'results' ? (
              <div className="space-y-3">
                <WorkflowSection
              title="结果显示"
              subtitle="摘要、内力图层与独立结果页"
              accentClass="text-blue-300"
              defaultOpen
              headerRight={<span className="rounded-md border border-blue-500/25 bg-blue-500/10 px-2 py-1 text-[10px] font-semibold text-blue-200">δ {format(summary.maxDisplacement, 3)}</span>}
            >
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                {[
                  ['最大位移', `${format(summary.maxDisplacement, 4)} mm`, 'text-purple-200'],
                  ['最大轴力', `${format(summary.maxAxial)} kN`, 'text-emerald-200'],
                  ['最大剪力', `${format(summary.maxShear)} kN`, 'text-rose-200'],
                  ['最大扭矩', `${format(summary.maxTorsion)} kN·m`, 'text-amber-200'],
                  ['最大弯矩', `${format(summary.maxBending)} kN·m`, 'text-blue-200'],
                ].map(([label, value, color]) => (
                  <div key={label} className="rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2">
                    <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
                    <div className={`mt-1 font-mono text-sm font-bold ${color}`}>{value}</div>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setActiveWorkspace('results')}
                className="inline-flex h-8 w-full items-center justify-center gap-2 rounded-md border border-blue-500/30 bg-blue-500/10 text-[10px] font-semibold text-blue-100 transition-colors hover:bg-blue-500/20"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                结果表已在右侧独立页
              </button>
                </WorkflowSection>
              </div>
            ) : null}

            {activeWorkspace === 'diagnostics' ? (
              <div className="space-y-3">
                <WorkflowSection
              title="诊断"
              subtitle="结构引用、约束、荷载和求解器状态"
              accentClass={issueCounts.errors > 0 ? 'text-red-300' : issueCounts.warnings > 0 ? 'text-amber-300' : 'text-emerald-300'}
              defaultOpen
              headerRight={issueCounts.errors > 0 || issueCounts.warnings > 0 ? <AlertTriangle className="h-4 w-4 text-amber-300" /> : <CheckCircle2 className="h-4 w-4 text-emerald-300" />}
            >
              {solverStats ? (
                <div className="mb-3 rounded border border-cyan-500/25 bg-cyan-500/10 px-3 py-2">
                  <div className="mb-2 text-[10px] font-bold text-cyan-100">求解统计</div>
                  <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                    {solverStatRows.map(([label, value]) => (
                      <div key={label} className="min-w-0 rounded border border-slate-800 bg-slate-950/55 px-2 py-1.5">
                        <div className="text-slate-500">{label}</div>
                        <div className="mt-0.5 truncate font-mono font-semibold text-slate-100">{value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="grid gap-2 text-[10px]">
                {diagnosticItems.length === 0 ? (
                  <div className="rounded border border-emerald-500/25 bg-emerald-500/10 px-2 py-2 text-emerald-100">未发现模型引用、约束或荷载错误。</div>
                ) : diagnosticItems.map(item => (
                  <div key={item.id} className={`rounded border px-2 py-2 ${
                    item.severity === 'error'
                      ? 'border-red-500/30 bg-red-500/10 text-red-100'
                      : item.severity === 'warning'
                        ? 'border-amber-500/30 bg-amber-500/10 text-amber-100'
                        : 'border-slate-700 bg-slate-950/45 text-slate-300'
                  }`}>
                    <div className="font-bold">{item.title}</div>
                    <div className="mt-1 leading-relaxed opacity-80">{item.detail}</div>
                  </div>
                ))}
              </div>
                </WorkflowSection>
              </div>
            ) : null}
          </div>
        </aside>
        <main className="relative min-h-0 flex-1 overflow-hidden">
          {activeWorkspace === 'results' ? (
            <div className="grid h-full min-h-0 grid-cols-[minmax(22rem,0.88fr)_minmax(30rem,1.12fr)]">
              <section className="relative min-h-0 overflow-hidden border-r border-slate-800">
                {viewportPanel}
              </section>
              <SpaceResultsView
                result={result}
                summary={summary}
                activeTarget={resultTarget}
                envelopeRows={envelopeRows}
                serviceabilityRows={serviceabilityRows}
                worstServiceabilityRow={worstServiceabilityRow}
                onBackToModel={() => setActiveWorkspace('modeling')}
              />
            </div>
          ) : (
            viewportPanel
          )}
        </main>
      </div>
    </div>
  );
};

const SpaceResultsView: React.FC<{
  result: SpaceAnalysisResult;
  summary: ReturnType<typeof buildSpaceResultSummary>;
  activeTarget: SpaceAnalysisTarget;
  envelopeRows: SpaceEnvelopeRow[];
  serviceabilityRows: SpaceServiceabilityRow[];
  worstServiceabilityRow: SpaceServiceabilityRow | null;
  onBackToModel: () => void;
}> = ({ result, summary, activeTarget, envelopeRows, serviceabilityRows, worstServiceabilityRow, onBackToModel }) => {
  const [activeResultTab, setActiveResultTab] = useState<'displacements' | 'reactions' | 'members' | 'envelope' | 'serviceability' | 'equilibrium'>('displacements');
  const resultTabs = [
    { id: 'displacements' as const, label: '节点位移', count: result.displacements.length },
    { id: 'reactions' as const, label: '支座反力', count: result.reactions.length },
    { id: 'members' as const, label: '单元内力', count: result.elements.length },
    { id: 'envelope' as const, label: '包络', count: envelopeRows.filter(row => row.value !== null).length },
    { id: 'serviceability' as const, label: '服务性', count: serviceabilityRows.length },
    { id: 'equilibrium' as const, label: '平衡', count: result.equilibrium?.passed ? 1 : 0 },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-950">
      <div className="shrink-0 border-b border-slate-800 bg-slate-950/95 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-black text-slate-100">结果表</h3>
            <p className="mt-0.5 text-[10px] text-slate-500">{activeTarget.label} · 按结果类型切换查看</p>
          </div>
          <button
            type="button"
            onClick={onBackToModel}
            className="inline-flex h-8 items-center gap-2 rounded-md border border-slate-700 bg-slate-900 px-3 text-[11px] font-semibold text-slate-300 transition-colors hover:border-cyan-500/60 hover:text-cyan-100"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            返回模型
          </button>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-7">
          {[
            ['结果状态', resultStatusLabel[result.status], resultStatusClass[result.status]],
            ['最大位移', `${format(summary.maxDisplacement, 4)} mm`, 'text-purple-200'],
            ['最大轴力', `${format(summary.maxAxial)} kN`, 'text-emerald-200'],
            ['最大剪力', `${format(summary.maxShear)} kN`, 'text-rose-200'],
            ['最大扭矩', `${format(summary.maxTorsion)} kN·m`, 'text-amber-200'],
            ['最大弯矩', `${format(summary.maxBending)} kN·m`, 'text-blue-200'],
            ['服务性', worstServiceabilityRow ? `${format(worstServiceabilityRow.utilization * 100, 0)}%` : '-', worstServiceabilityRow && !worstServiceabilityRow.passed ? 'text-red-200' : 'text-emerald-200'],
          ].map(([label, value, color]) => (
            <div key={label} className="rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2">
              <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
              <div className={`mt-1 font-mono text-sm font-bold ${color}`}>{value}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="shrink-0 border-b border-slate-800 bg-slate-950 px-4 py-2">
        <div role="tablist" aria-label="结果类型" className="flex flex-wrap gap-1 rounded-lg border border-slate-800 bg-slate-900/65 p-1">
          {resultTabs.map(tab => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeResultTab === tab.id}
              onClick={() => setActiveResultTab(tab.id)}
              className={`inline-flex h-8 min-w-[7rem] items-center justify-center gap-2 rounded-md px-3 text-[11px] font-semibold transition-colors ${
                activeResultTab === tab.id
                  ? 'bg-blue-500/20 text-blue-100'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
              }`}
            >
              <span>{tab.label}</span>
              <span className="rounded border border-slate-700 bg-slate-950 px-1.5 py-0.5 font-mono text-[9px] text-slate-300">{tab.count}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 p-4">
        {activeResultTab === 'displacements' ? (
          <ResultsTable title="节点位移" headers={['节点', 'dx mm', 'dy mm', 'dz mm', 'rx', 'ry', 'rz']}>
            {result.displacements.map(displacement => (
              <tr key={displacement.nodeId} className="font-mono text-slate-300">
                <td className="px-3 py-1.5 font-bold text-slate-100">{displacement.nodeId}</td>
                <td className="px-3 py-1.5">{format(displacement.dx, 4)}</td>
                <td className="px-3 py-1.5">{format(displacement.dy, 4)}</td>
                <td className="px-3 py-1.5">{format(displacement.dz, 4)}</td>
                <td className="px-3 py-1.5">{format(displacement.rx, 5)}</td>
                <td className="px-3 py-1.5">{format(displacement.ry, 5)}</td>
                <td className="px-3 py-1.5">{format(displacement.rz, 5)}</td>
              </tr>
            ))}
          </ResultsTable>
        ) : null}

        {activeResultTab === 'reactions' ? (
          <ResultsTable title="支座反力" headers={['节点', 'Fx', 'Fy', 'Fz', 'Mx', 'My', 'Mz']}>
            {result.reactions.map(reaction => (
              <tr key={reaction.nodeId} className="font-mono text-slate-300">
                <td className="px-3 py-1.5 font-bold text-slate-100">{reaction.nodeId}</td>
                <td className="px-3 py-1.5">{format(reaction.fx)}</td>
                <td className="px-3 py-1.5">{format(reaction.fy)}</td>
                <td className="px-3 py-1.5">{format(reaction.fz)}</td>
                <td className="px-3 py-1.5">{format(reaction.mx)}</td>
                <td className="px-3 py-1.5">{format(reaction.my)}</td>
                <td className="px-3 py-1.5">{format(reaction.mz)}</td>
              </tr>
            ))}
          </ResultsTable>
        ) : null}

        {activeResultTab === 'members' ? (
          <ResultsTable title="单元控制内力" headers={['单元', 'L m', '|N| kN', '|Vy| kN', '|Vz| kN', '|T| kN·m', '|My| kN·m', '|Mz| kN·m']}>
            {result.elements.map(elementResult => (
              <tr key={elementResult.elementId} className="font-mono text-slate-300">
                <td className="px-3 py-1.5 font-bold text-slate-100">{elementResult.elementId}</td>
                <td className="px-3 py-1.5">{format(elementResult.length)}</td>
                <td className="px-3 py-1.5 text-emerald-200">{format(elementResult.maxAbsAxial)}</td>
                <td className="px-3 py-1.5">{format(elementResult.maxAbsShearY)}</td>
                <td className="px-3 py-1.5">{format(elementResult.maxAbsShearZ)}</td>
                <td className="px-3 py-1.5">{format(elementResult.maxAbsTorsion)}</td>
                <td className="px-3 py-1.5 text-blue-200">{format(elementResult.maxAbsMomentY)}</td>
                <td className="px-3 py-1.5 text-blue-200">{format(elementResult.maxAbsMomentZ)}</td>
              </tr>
            ))}
          </ResultsTable>
        ) : null}

        {activeResultTab === 'envelope' ? (
          <ResultsTable title="空间结果包络" headers={['项目', '来源', '位置', '数值', '单位']}>
            {envelopeRows.map(row => (
              <tr key={row.key} className="font-mono text-slate-300">
                <td className="px-3 py-1.5 font-sans font-bold text-slate-100">{row.label}</td>
                <td className="px-3 py-1.5">{row.sourceLabel}</td>
                <td className="px-3 py-1.5">{row.location}</td>
                <td className="px-3 py-1.5 text-cyan-200">{row.value === null ? '-' : format(row.value, 4)}</td>
                <td className="px-3 py-1.5 text-slate-500">{row.unit}</td>
              </tr>
            ))}
          </ResultsTable>
        ) : null}

        {activeResultTab === 'serviceability' ? (
          <ResultsTable title="三维服务性检查" headers={['单元', 'L m', '限值 L/n', '限值 mm', '控制位移 mm', '利用率', '控制节点', '状态']}>
            {serviceabilityRows.map(row => (
              <tr key={row.elementId} className="font-mono text-slate-300">
                <td className="px-3 py-1.5 font-bold text-slate-100">{row.elementId}</td>
                <td className="px-3 py-1.5">{format(row.lengthM)}</td>
                <td className="px-3 py-1.5">L/{row.limitRatio}</td>
                <td className="px-3 py-1.5">{format(row.limitMm, 3)}</td>
                <td className="px-3 py-1.5 text-purple-200">{format(row.displacementMm, 3)}</td>
                <td className={`px-3 py-1.5 ${row.passed ? 'text-emerald-200' : 'text-red-200'}`}>{format(row.utilization * 100, 0)}%</td>
                <td className="px-3 py-1.5">{row.controllingNodeId}</td>
                <td className={`px-3 py-1.5 font-bold ${row.passed ? 'text-emerald-200' : 'text-red-200'}`}>{row.passed ? 'PASS' : 'CHECK'}</td>
              </tr>
            ))}
          </ResultsTable>
        ) : null}

        {activeResultTab === 'equilibrium' ? (
          <ResultsTable title="整体平衡校核" headers={['分量', '总荷载', '总反力', '残差']}>
            {(['fx', 'fy', 'fz', 'mx', 'my', 'mz'] as const).map(component => (
              <tr key={component} className="font-mono text-slate-300">
                <td className="px-3 py-1.5 font-bold uppercase text-slate-100">{component}</td>
                <td className="px-3 py-1.5">{format(result.equilibrium?.totalLoads[component] ?? 0, 4)}</td>
                <td className="px-3 py-1.5">{format(result.equilibrium?.totalReactions[component] ?? 0, 4)}</td>
                <td className="px-3 py-1.5 text-emerald-200">{format(result.equilibrium?.residual[component] ?? 0, 6)}</td>
              </tr>
            ))}
            <tr className="font-mono text-slate-300">
              <td className="px-3 py-1.5 font-bold text-slate-100">max</td>
              <td className="px-3 py-1.5" />
              <td className="px-3 py-1.5">{result.equilibrium?.passed ? 'PASS' : 'CHECK'}</td>
              <td className="px-3 py-1.5 text-amber-200">{format(result.equilibrium?.residual.maxAbs ?? 0, 6)}</td>
            </tr>
          </ResultsTable>
        ) : null}
      </div>
    </div>
  );
};

const ResultsTable: React.FC<{ title: string; headers: string[]; children: React.ReactNode }> = ({ title, headers, children }) => (
  <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-slate-800 bg-slate-900/50">
    <div className="flex shrink-0 items-center gap-2 border-b border-slate-800 px-3 py-2">
      <SlidersHorizontal className="h-4 w-4 text-blue-300" />
      <div className="text-xs font-bold text-slate-100">{title}</div>
    </div>
    <div className="min-h-0 flex-1 overflow-auto">
      <table className="w-full min-w-[34rem] text-left text-[10px]">
        <thead className="sticky top-0 bg-slate-900 text-slate-500">
          <tr>{headers.map(header => <th key={header} className="px-3 py-2">{header}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-800">{children}</tbody>
      </table>
    </div>
  </section>
);

export default SpaceSolverPrototype;
