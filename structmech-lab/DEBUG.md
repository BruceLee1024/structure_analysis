## Observations

- 用户截图中，Agent 已成功解析：`识别为将最近施加的跨中荷载（第二跨跨中 4kN）调整为 10kN。`
- 但执行阶段返回：`未执行任何 Agent 动作`，并警告：`未找到荷载 load-2，本次未完成修改。`
- `utils/agent/executor.ts` 中，`add_load` 如果没有显式 `payload.loadId`，会生成默认 ID：`agent-${draft.loads.length + 1}`。
- 同一文件中，`update_load` / `remove_load` 通过 `resolveTargetLoad()` 按精确 `loadId` 或 `loadOrdinal` 查找目标荷载。
- `utils/agent/session.ts` 中，session 的 `lastLoadId` 完全来自已执行动作的 `payload.loadId`。
- `utils/agent/parser.ts` 中，`normalizeActions()` 只有在 `update_load.payload.loadId` 不是字符串时，才会用 `session.lastLoadId` 回填；如果 LLM 已返回任意字符串形式的 `loadId`，当前逻辑会直接信任它。
- `utils/agent/modelSummary.ts` 提供给 LLM 的模型摘要只包含荷载的人类可读描述，不包含真实 `load.id`。
- `utils/agent/llmParser.ts` 的 few-shot 示例中使用了 `load-1` 这种 ID 风格，容易诱导 LLM 生成 `load-2` 这类“看起来合理但未必真实存在”的 ID。
- 截图中的报错 ID 是 `load-2`，而不是 executor 默认生成的 `agent-2`。这说明失败时使用的很可能不是 executor 自动生成的真实 ID，而是 LLM 产出的推测 ID。

## Hypotheses

### H1: LLM 为跟进式改荷载编造了 `load-2`，parser 直接信任，executor 精确查找失败（ROOT HYPOTHESIS）
- Supports:
  - 报错 ID 为 `load-2`，与 few-shot 风格一致。
  - executor 默认新增荷载 ID 风格为 `agent-n`，与报错不一致。
  - `normalizeActions()` 不会覆盖 LLM 已给出的字符串 `loadId`。
  - `resolveTargetLoad()` 只做精确匹配，因此假 ID 会直接失败。
- Conflicts:
  - 如果先前新增荷载本身就带了 `load-2`，那么这次更新本应能命中，不会报错。
- Test:
  - 构造一个场景：真实 session `lastLoadId = 'agent-2'`，但 LLM 返回 `update_load.payload.loadId = 'load-2'`，验证 parser 会保留 `load-2`，executor 会报 `未找到荷载 load-2`。

### H2: session 在上一轮 `add_load` 后记住的就是错误的 `loadId`
- Supports:
  - session 只信任 `execution.appliedActions` 中的 `loadId`。
  - 如果初次加荷时动作里已有错误 `loadId`，session 会继续把错误记下去。
- Conflicts:
  - executor 对 `add_load` 默认会生成 `agent-n`，除非输入动作本身就带了假的 `loadId`。
- Test:
  - 复查首次加荷对应的 `execution.appliedActions`，看是否已经出现 `load-2`。

### H3: 荷载对象存在，但由于几何重建/过滤后被删掉，session 仍指向旧 ID
- Supports:
  - `SolverModule.tsx` 中会在节点/单元变化后过滤无效荷载。
- Conflicts:
  - 截图顶部仍显示 `2 个荷载`，说明当前模型里确实还有两条荷载。
  - 若只是荷载被删，报错更像 stale state；但 `load-2` 风格仍更像伪造 ID。
- Test:
  - 在复现场景中检查当前 `params.loads` 的真实 ID 列表。

## Experiments

### E1: 静态链路比对（已完成）
- Change:
  - 未改生产代码；直接比对 parser、session、executor 三段逻辑与截图中的失败 ID。
- Expected if H1 is correct:
  - 若 LLM 产出 `load-2` 这类伪造 ID，parser 会放行，executor 会精确查找失败，并得到与截图一致的警告。
- Result:
  - 与现有代码完全一致：`normalizeActions()` 保留字符串 `loadId`，`resolveTargetLoad()` 精确匹配，`executor` 会报 `未找到荷载 load-2`。
- Conclusion:
  - H1 目前是最强解释。

### E2: 伪造 LLM `loadId` 的 parser 回归测试（已完成）
- Change:
  - 新增测试：当前模型真实荷载 ID 为 `agent-1/agent-2`，session `lastLoadId = 'agent-2'`，但 LLM 返回 `update_load.payload.loadId = 'load-2'`。
- Expected if H1 is correct:
  - 修复前，parser 会保留 `load-2`；修复后，应把无效 `loadId` 回退到真实的 `session.lastLoadId`。
- Result:
  - 修复前测试失败，实际收到的 `payload.loadId` 为 `load-2`；按“仅纠正无效 `loadId`，保留 ordinal/session 语义”的规则修复后，测试通过，`payload.loadId` 变为 `agent-2`。
- Conclusion:
  - H1 已确认，是本次问题的直接根因。

## Root Cause

已确认的根因是：**LLM 在跟进式荷载修改时生成了一个看似合理但并不存在的 `loadId`（如 `load-2`），而 parser 会原样信任这个字符串 `loadId`；随后 executor 按精确 ID 查找，最终报出“未找到荷载 load-2”。**

## Fix

- 已实施修复：
  - 在 `parser.ts` 的 `normalizeActions()` 中，对 `update_load` / `remove_load` 的字符串 `loadId` 增加真实荷载校验。
  - 若 `loadId` 在当前 `params.loads` 中不存在，且没有 ordinal 目标，则优先回退到 `session.lastLoadId`。
  - 若存在 `loadOrdinal`，则保留 ordinal 语义，不强制改写为 `loadId`。
  - 新增回归测试覆盖：LLM 返回伪造 `load-2`、session 持有真实 `agent-2` 时，应自动命中真实荷载。
  - 验证结果：`parser.test.ts`、`executor.test.ts`、`session.test.ts`、`AgentPanel.test.tsx` 全部通过，`npx tsc --noEmit` 通过。
