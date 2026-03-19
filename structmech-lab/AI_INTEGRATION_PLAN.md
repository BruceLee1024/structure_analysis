# AI 深度植入计划

## 现状分析

当前 AI 集成方式：**侧边栏聊天面板**（AITutor 组件）
- 10 个子模块各有一个 AITutor 实例
- 被动触发：用户必须主动提问
- 上下文注入方式：将当前参数序列化为字符串传入 system prompt
- 交互形式单一：纯文本对话
- 无感知能力：不知道用户做了什么操作（拖拽、切换、调参等）

**核心问题**：AI 只是一个"贴"在旁边的聊天窗口，与学习体验是割裂的。

---

## 深度植入架构

### 设计原则

1. **AI 是教学过程的一部分**，不是附加品
2. **主动感知** — AI 观察用户操作并适时介入
3. **嵌入式呈现** — AI 输出直接出现在内容区域，而非仅在侧边栏
4. **渐进式引导** — 从观察→提示→解释→测验，逐步深入

### 系统架构变更

```
┌──────────────────────────────────────────────┐
│                 AIContext Provider            │
│  ┌─────────┐  ┌──────────┐  ┌─────────────┐ │
│  │ 参数状态 │  │ 用户操作流 │  │ 学习进度追踪 │ │
│  └────┬────┘  └─────┬────┘  └──────┬──────┘ │
│       └──────┬──────┘              │         │
│         ┌────▼─────┐    ┌─────────▼───────┐ │
│         │ AI 推理层 │    │ 知识图谱/规则库  │ │
│         └────┬─────┘    └─────────────────┘ │
│       ┌──────┴──────────────┐                │
│  ┌────▼────┐  ┌─────▼─────┐  ┌──────▼────┐  │
│  │内联提示  │  │侧边栏对话  │  │互动式测验  │  │
│  └─────────┘  └───────────┘  └───────────┘  │
└──────────────────────────────────────────────┘
```

---

## 五层植入方案

### 第一层：智能上下文感知（优先级：⭐⭐⭐⭐⭐）

**目标**：AI 实时感知用户操作，不需要用户主动描述。

**实现**：
- 新建 `AIContextProvider`（React Context），包装所有模块
- 追踪：参数变化历史、停留时间、切换频率、交互序列
- 将结构化上下文（非纯字符串）传入 AI prompt

**具体改动**：
```typescript
// 新文件：hooks/useAIContext.ts
interface AIContextData {
  module: string;
  subModule: string;
  params: Record<string, number>;        // 当前参数
  paramHistory: ParamChange[];           // 参数变化历史
  results: Record<string, number>;       // 当前计算结果
  userActions: UserAction[];             // 用户操作序列
  dwellTime: number;                     // 当前页面停留时间
  conceptsExplored: string[];            // 已探索的概念
}
```

**效果**：AI 能说"我注意到你把荷载从 20kN 调到了 50kN，你有没有发现弯矩增大了多少倍？"

---

### 第二层：内联 AI 注释（优先级：⭐⭐⭐⭐⭐）

**目标**：AI 解释直接出现在图表和卡片上，而不是只在侧边栏。

**形式**：

#### 2a. 图表悬浮解释
- 在 SVG 图表的关键点添加可点击的 `?` 图标
- 点击后弹出 AI 生成的简短解释 popover
- 例如：弯矩图最大值处 → "这里弯矩最大是因为..."

```
位置：各子模块的 SVG 图表内
新组件：components/ui/AIAnnotation.tsx
```

#### 2b. 结果卡片智能解读
- ResultCard 下方增加一行 AI 生成的一句话解释
- 例如：RA = 15kN → "左支座承担了总荷载的 60%"

```
改动：ResultCard.tsx 新增 aiHint?: string 属性
生成：本地规则引擎（不需要调 API）+ 复杂情况调 API
```

#### 2c. SolutionSteps 智能展开
- 每个求解步骤增加"为什么？"按钮
- 点击后 AI 解释该步骤的物理意义
- 例如：步骤"ΣMA = 0" → "我们对 A 点取矩是因为..."

```
改动：SolutionSteps.tsx 每步增加 AI 展开按钮
```

---

### 第三层：主动式教学引导（优先级：⭐⭐⭐⭐）

**目标**：AI 不等用户提问，在关键时刻主动介入。

#### 3a. 参数变化触发
当用户调整参数时，AI 主动提问：
- 荷载位置移到跨中 → "你发现了什么特殊情况？"
- 矢跨比 f/L 接近 1/8 → "注意！这接近最优矢跨比"
- W 从 0 变为负值 → "结构从静定变成超静定了，你知道这意味着什么吗？"

```
实现：触发规则引擎（本地，不调 API）
新文件：utils/aiTriggers.ts
组件：components/ui/AIBubble.tsx（内容区域内的浮动气泡）
```

#### 3b. 学习里程碑
追踪用户在每个模块的探索进度：
- 首次打开模块 → 显示引导教程
- 调整过所有参数 → "你已经探索了所有参数，试试这个挑战题？"
- 所有模块都访问过 → "你已经掌握了基础，来试试综合题！"

```
存储：localStorage 记录学习进度
新文件：utils/learningProgress.ts
```

#### 3c. 错误检测与纠正
- 识别常见误解，例如：
  - 用户反复在超静定结构上尝试静力法 → 提示"这个结构有多余约束"
  - 用户混淆弯矩图受拉侧 → 提示"注意弯矩图画在受拉一侧"

---

### 第四层：互动式练习系统（优先级：⭐⭐⭐）

**目标**：AI 生成练习题，用户在可视化界面上作答。

#### 4a. 概念测验
每个模块底部增加"测一测"卡片：
- AI 根据当前模块生成判断题/选择题
- 例如："下面哪个结构是静定的？"配图
- 答对/答错后 AI 给出解释

```
新组件：components/ui/AIQuiz.tsx
位置：SolutionSteps 下方
```

#### 4b. 参数预测挑战
- AI 设定一组参数，要求用户预测结果
- "如果把荷载增大到 30kN，弯矩最大值会是多少？"
- 用户输入预测值 → 系统计算真实值 → 对比并解释

```
新组件：components/ui/PredictionChallenge.tsx
```

#### 4c. 反向设计题
- AI 给出目标结果，用户调参数去实现
- "请调整参数使 Mmax < 50 kN·m"
- 实时显示目标达成进度

```
新组件：components/ui/DesignChallenge.tsx
```

---

### 第五层：求解器 AI 协助（优先级：⭐⭐⭐）

**目标**：在 SolverModule 中深度集成 AI。

#### 5a. 结构建模助手
- 用户描述结构 → AI 生成节点和单元
- "帮我建一个三层两跨的框架"
- AI 自动设置合理参数（截面、材料）

#### 5b. 结果解读
- 求解完成后 AI 自动生成分析报告：
  - "最大弯矩出现在第3层梁跨中，建议增大截面"
  - "结构整体位移满足 L/250 限值"
  - 标注关键控制截面

#### 5c. 错误诊断
- 当求解失败或结果异常时：
  - "检测到矩阵奇异，可能是因为节点 3 没有约束"
  - "位移过大，建议检查单位是否正确"

---

## 实施路线图

### Phase 1 — 基础设施（1-2 周）
| 任务 | 文件 | 说明 |
|------|------|------|
| AIContext Provider | `hooks/useAIContext.ts` | 统一上下文管理 |
| 触发规则引擎 | `utils/aiTriggers.ts` | 本地规则，不调 API |
| AI 气泡组件 | `components/ui/AIBubble.tsx` | 内联浮动提示 |
| 学习进度追踪 | `utils/learningProgress.ts` | localStorage 存储 |

### Phase 2 — 内联注释（1-2 周）
| 任务 | 文件 | 说明 |
|------|------|------|
| 图表注释组件 | `components/ui/AIAnnotation.tsx` | SVG 内嵌点击解释 |
| ResultCard AI 提示 | 改动 `ResultCard.tsx` | 一句话智能解读 |
| SolutionSteps 扩展 | 改动 `SolutionSteps.tsx` | 每步"为什么"按钮 |
| 10 个子模块接入 | `StaticModule.tsx` / `InfluenceModule.tsx` | 添加注释数据 |

### Phase 3 — 主动引导（1-2 周）
| 任务 | 文件 | 说明 |
|------|------|------|
| 参数变化触发器 | 各子模块 + `aiTriggers.ts` | 监听参数变化 |
| 里程碑系统 | `learningProgress.ts` + UI | 进度追踪与奖励 |
| 错误检测规则 | `aiTriggers.ts` | 常见误解识别 |

### Phase 4 — 互动练习（2-3 周）
| 任务 | 文件 | 说明 |
|------|------|------|
| 测验组件 | `components/ui/AIQuiz.tsx` | 选择题/判断题 |
| 预测挑战 | `components/ui/PredictionChallenge.tsx` | 参数预测 |
| 反向设计 | `components/ui/DesignChallenge.tsx` | 目标反推 |
| 题库 | `utils/quizBank.ts` | 本地题库 + AI 生成 |

### Phase 5 — 求解器协助（2-3 周）
| 任务 | 文件 | 说明 |
|------|------|------|
| 自然语言建模 | `SolverModule.tsx` + AI | 描述→结构 |
| 自动结果分析 | `components/solver/AIAnalysis.tsx` | 求解后报告 |
| 错误诊断 | `utils/solver.ts` + AI | 异常检测 |

---

## 技术要点

### API 调用策略
- **本地规则优先**：80% 的提示用本地规则引擎生成（零延迟、零成本）
- **API 调用节流**：复杂解释才调 API，带 debounce（500ms）
- **缓存机制**：相同参数组合的 AI 回复缓存到 localStorage
- **离线降级**：API 不可用时回退到本地规则库

### 本地规则引擎示例
```typescript
// utils/aiTriggers.ts
interface AITrigger {
  condition: (ctx: AIContextData) => boolean;
  message: string;
  priority: 'low' | 'medium' | 'high';
  cooldown: number; // 秒，避免重复触发
}

const beamTriggers: AITrigger[] = [
  {
    condition: (ctx) => ctx.params.a === 50 && ctx.params.loadType === 'point',
    message: '💡 荷载在跨中时，简支梁弯矩最大 Mmax = PL/4',
    priority: 'medium',
    cooldown: 60,
  },
  {
    condition: (ctx) => Math.abs(ctx.results.Mmax) > 100,
    message: '⚠️ 弯矩已超过 100 kN·m，实际工程中需要验算截面强度',
    priority: 'high',
    cooldown: 30,
  },
];
```

### 性能保障
- AI 气泡使用 `React.memo` + `useMemo` 避免无效渲染
- 触发规则引擎在 `requestIdleCallback` 中运行
- API 响应使用流式输出（SSE）提升感知速度
- 学习进度写入使用 debounced localStorage

---

## 预期效果

| 维度 | 现状 | 深度植入后 |
|------|------|-----------|
| 交互方式 | 被动聊天 | 主动引导 + 内联提示 + 互动练习 |
| AI 感知 | 纯文本参数 | 结构化上下文 + 操作历史 + 学习进度 |
| 呈现位置 | 仅侧边栏 | 图表内 + 卡片上 + 浮动气泡 + 底部测验 |
| API 成本 | 每次对话调用 | 80% 本地规则 + 20% API |
| 学习体验 | 工具 + 聊天窗 | 完整的交互式教学系统 |
