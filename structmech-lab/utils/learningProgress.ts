// ========== Learning Progress Tracker ==========
// Persists to localStorage, tracks which modules/concepts a user has explored.

const STORAGE_KEY = 'structlab_learning_progress';

export interface ModuleProgress {
  /** Total seconds spent in this sub-module */
  totalTime: number;
  /** Number of visits */
  visits: number;
  /** Timestamp of last visit */
  lastVisit: number;
  /** Unique parameter keys the user has adjusted */
  paramsExplored: string[];
  /** Named concepts the user has encountered (via triggers, quizzes, etc.) */
  conceptsSeen: string[];
  /** Number of AI questions asked */
  aiQuestionsAsked: number;
}

export interface LearningProgress {
  /** sub-module key → progress */
  modules: Record<string, ModuleProgress>;
  /** Total AI questions asked across all modules */
  totalAIQuestions: number;
  /** First usage timestamp */
  firstUse: number;
}

function getDefaultProgress(): LearningProgress {
  return {
    modules: {},
    totalAIQuestions: 0,
    firstUse: Date.now(),
  };
}

function getDefaultModuleProgress(): ModuleProgress {
  return {
    totalTime: 0,
    visits: 0,
    lastVisit: 0,
    paramsExplored: [],
    conceptsSeen: [],
    aiQuestionsAsked: 0,
  };
}

// ========== Read / Write ==========

export function loadProgress(): LearningProgress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as LearningProgress;
  } catch { /* ignore corrupt data */ }
  return getDefaultProgress();
}

function saveProgress(p: LearningProgress) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch { /* quota exceeded — silently ignore */ }
}

// ========== Public API ==========

/** Record a visit to a sub-module */
export function recordVisit(subModule: string) {
  const p = loadProgress();
  if (!p.modules[subModule]) p.modules[subModule] = getDefaultModuleProgress();
  p.modules[subModule].visits += 1;
  p.modules[subModule].lastVisit = Date.now();
  saveProgress(p);
}

/** Add time spent in a sub-module (call on unmount / module switch) */
export function addTimeSpent(subModule: string, seconds: number) {
  if (seconds <= 0 || seconds > 3600) return; // sanity check
  const p = loadProgress();
  if (!p.modules[subModule]) p.modules[subModule] = getDefaultModuleProgress();
  p.modules[subModule].totalTime += seconds;
  saveProgress(p);
}

/** Record that a parameter was explored */
export function recordParamExplored(subModule: string, paramKey: string) {
  const p = loadProgress();
  if (!p.modules[subModule]) p.modules[subModule] = getDefaultModuleProgress();
  const mod = p.modules[subModule];
  if (!mod.paramsExplored.includes(paramKey)) {
    mod.paramsExplored.push(paramKey);
    saveProgress(p);
  }
}

/** Record that a concept was seen */
export function recordConceptSeen(subModule: string, concept: string) {
  const p = loadProgress();
  if (!p.modules[subModule]) p.modules[subModule] = getDefaultModuleProgress();
  const mod = p.modules[subModule];
  if (!mod.conceptsSeen.includes(concept)) {
    mod.conceptsSeen.push(concept);
    saveProgress(p);
  }
}

/** Record an AI question asked */
export function recordAIQuestion(subModule: string) {
  const p = loadProgress();
  if (!p.modules[subModule]) p.modules[subModule] = getDefaultModuleProgress();
  p.modules[subModule].aiQuestionsAsked += 1;
  p.totalAIQuestions += 1;
  saveProgress(p);
}

// ========== Query helpers ==========

/** Get list of all sub-modules the user has visited */
export function getVisitedModules(): string[] {
  const p = loadProgress();
  return Object.keys(p.modules).filter(k => p.modules[k].visits > 0);
}

/** Check if user is a first-time visitor to a sub-module */
export function isFirstVisit(subModule: string): boolean {
  const p = loadProgress();
  return !p.modules[subModule] || p.modules[subModule].visits <= 1;
}

/** Get overall exploration percentage (how many of 10 sub-modules visited) */
export function getExplorationPercent(): number {
  const allModules = [
    'geometry', 'beam', 'frame', 'truss', 'arch', 'composite',
    'static', 'kinematic', 'envelope', 'application',
  ];
  const visited = getVisitedModules();
  return Math.round((visited.filter(v => allModules.includes(v)).length / allModules.length) * 100);
}

/** Get progress for a specific module */
export function getModuleProgress(subModule: string): ModuleProgress {
  const p = loadProgress();
  return p.modules[subModule] || getDefaultModuleProgress();
}

// ========== Milestone System (Phase 3) ==========

export interface Milestone {
  id: string;
  title: string;
  description: string;
  icon: string;
  check: (progress: LearningProgress) => boolean;
}

const ALL_SUBMODULES = [
  'geometry', 'beam', 'frame', 'truss', 'arch', 'composite',
  'static', 'kinematic', 'envelope', 'application',
];

const STATIC_SUBMODULES = ['geometry', 'beam', 'frame', 'truss', 'arch', 'composite'];
const INFLUENCE_SUBMODULES = ['static', 'kinematic', 'envelope', 'application'];

export const MILESTONES: Milestone[] = [
  {
    id: 'first-module',
    title: '初探者',
    description: '完成第一个模块的学习',
    icon: '🌱',
    check: (p) => Object.values(p.modules).some(m => m.visits > 0),
  },
  {
    id: 'explorer-3',
    title: '求知者',
    description: '探索了 3 个不同的子模块',
    icon: '🔍',
    check: (p) => Object.keys(p.modules).filter(k => p.modules[k].visits > 0).length >= 3,
  },
  {
    id: 'static-complete',
    title: '静力学达人',
    description: '访问了全部 6 个静力学子模块',
    icon: '🏗️',
    check: (p) => STATIC_SUBMODULES.every(k => p.modules[k]?.visits > 0),
  },
  {
    id: 'influence-complete',
    title: '影响线专家',
    description: '访问了全部 4 个影响线子模块',
    icon: '📈',
    check: (p) => INFLUENCE_SUBMODULES.every(k => p.modules[k]?.visits > 0),
  },
  {
    id: 'all-modules',
    title: '全面掌握',
    description: '访问了全部 10 个子模块！',
    icon: '🎓',
    check: (p) => ALL_SUBMODULES.every(k => p.modules[k]?.visits > 0),
  },
  {
    id: 'param-explorer',
    title: '参数探索家',
    description: '在一个模块中调整了所有参数',
    icon: '🎛️',
    check: (p) => {
      const thresholds: Record<string, number> = {
        geometry: 3, beam: 4, frame: 4, truss: 1, arch: 2, composite: 2,
        static: 3, kinematic: 2, envelope: 3, application: 3,
      };
      return Object.entries(p.modules).some(([k, m]) =>
        m.paramsExplored.length >= (thresholds[k] || 3)
      );
    },
  },
  {
    id: 'deep-diver',
    title: '深度学习者',
    description: '在一个模块中停留超过 5 分钟',
    icon: '🤿',
    check: (p) => Object.values(p.modules).some(m => m.totalTime >= 300),
  },
  {
    id: 'ai-friend',
    title: 'AI 好朋友',
    description: '向 AI 提了 10 个问题',
    icon: '🤖',
    check: (p) => p.totalAIQuestions >= 10,
  },
  {
    id: 'revisitor',
    title: '温故知新',
    description: '重新访问一个模块（第 3 次以上）',
    icon: '🔄',
    check: (p) => Object.values(p.modules).some(m => m.visits >= 3),
  },
];

/** Check which milestones are newly achieved (not yet stored as seen) */
export function checkNewMilestones(): Milestone[] {
  const p = loadProgress();
  const seenKey = 'structlab_milestones_seen';
  let seen: string[] = [];
  try {
    const raw = localStorage.getItem(seenKey);
    if (raw) seen = JSON.parse(raw);
  } catch { /* ignore */ }

  const newOnes = MILESTONES.filter(m => !seen.includes(m.id) && m.check(p));

  if (newOnes.length > 0) {
    seen.push(...newOnes.map(m => m.id));
    try {
      localStorage.setItem(seenKey, JSON.stringify(seen));
    } catch { /* ignore */ }
  }

  return newOnes;
}

/** Get all achieved milestones */
export function getAchievedMilestones(): Milestone[] {
  const p = loadProgress();
  return MILESTONES.filter(m => m.check(p));
}

/** Get first-visit guidance message for a sub-module */
export function getFirstVisitGuide(subModule: string): string | null {
  const guides: Record<string, string> = {
    geometry: '👋 欢迎来到几何组成分析！试着切换模型图并调整刚片、铰和支座约束。记住：W 只是预判工具，W<0 也不能脱离模型图直接判超静定。',
    beam: '👋 欢迎来到静定梁分析！试试切换梁的类型和荷载类型，观察弯矩图和剪力图的变化。',
    frame: '👋 欢迎来到静定刚架！刚架与梁的区别在于有水平力。调整 P 值观察弯矩图的变化。',
    truss: '👋 欢迎来到静定桁架！桁架杆件只承受轴力（拉或压），调整荷载 P 观察各杆件的内力。',
    arch: '👋 欢迎来到三铰拱！拱的优势是把弯矩转化为轴压。调整矢高 f 观察推力如何变化。',
    composite: '👋 欢迎来到组合结构！关键是识别基本部分和附属部分，先分析附属部分再分析基本部分。',
    static: '👋 欢迎来到影响线-静力法！移动荷载位置，观察目标量的影响线纵标变化。',
    kinematic: '👋 欢迎来到影响线-机动法！机动法通过去除约束后的位移图直接画出影响线。',
    envelope: '👋 欢迎来到内力包络图！包络图帮助确定移动荷载下的最不利位置和最大内力。',
    application: '👋 欢迎来到影响线应用！学会用影响线计算实际荷载（集中力、均布荷载）下的内力。',
  };
  return isFirstVisit(subModule) ? (guides[subModule] || null) : null;
}
