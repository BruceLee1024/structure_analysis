# 三维计算优化：首批实施与验证记录

日期：2026-10-09（北京时间）\
范围：空间杆系线弹性静力计算的正确性与结果展示\
状态：首批完成；原计划阶段 A 尚未全部验收

## 已实施

| 部分 | 改动及行为 | 主要文件 |
|---|---|---|
| 真实收敛 | PCG 和最终求解输出均复核原始系统 b−Ax；诊断历史开关不再改变算法退出行为；加入结构化收敛原因 | `utils/sparseMatrix.ts`、`utils/spaceSolver.ts` |
| 机构与分解 | 传递 Gaussian 奇异计数；dense 分解前对称对角缩放；只剔除无荷载且连接杆件的无刚度转角；按连通分量检查六个刚体运动的约束秩 | `utils/spaceSolver.ts`、`utils/spaceStability.ts` |
| 降级与精度 | 成功 PCG→dense 降级为 warning，记录实际后端；WASM 不可用时仍明确记录请求及回退；结果存储保留原始精度，由界面负责格式化 | `utils/spaceSolver.ts` |
| 矩阵诊断 | 原“条件数估计”改为“缩放矩阵谱半径估计”；界面对角量级比更名“对角比”，不将其等同条件数 | `utils/sparseMatrix.ts`、`components/solver/SpaceSolverPrototype.tsx` |
| 平衡 | 力与力矩分别用自身荷载尺度设置容差，表中显示 kN / kN·m、科学计数残差及容差 | `utils/spaceSolver.ts`、`components/solver/SpaceSolverPrototype.tsx` |
| 杆内响应 | 恢复包含均布/线性变化荷载特解的位移多项式，使用已恢复的释放转角；求横向合量挠度的内部极值与位置；内力站点追加解析驻点 | `utils/spaceResponse.ts`、`utils/spaceSolver.ts` |
| 内力符号 | 修正局部 z 分布荷载的 My 积分符号；轴力 N 采用拉正，扭矩采用局部 x 正向约定 | `utils/spaceResponse.ts` |
| 服务性参考 | 从“两端绝对平移”改为“杆内横向挠度”；显示控制位置及端点连线/固端基准；失败结果和缺少恢复数据的旧结果不生成通过行 | `utils/serviceabilityChecks.ts`、`components/solver/SpaceSolverPrototype.tsx` |
| 视图 | 局部荷载箭头使用求解器相同的 roll；按杆内曲线绘制变形、选中与拾取线；显示放大不改变计算结果 | `utils/spaceViewportGeometry.ts`、`components/solver/SpaceModelViewport.tsx` |
| 失败结果 | 失败分析不显示变形/内力叠加，不参与包络；结果页停止展示数值表，明确显示失败原因及返回模型操作 | `utils/spaceModel.ts`、`components/solver/SpaceSolverPrototype.tsx` |

## 数值验证

新增或扩展测试覆盖以下关键场景：

- 缩放系统达到门槛、原始系统真实残差仍未达到门槛的情况必须失败。
- 开启诊断历史与关闭时，迭代数和数值结果一致。
- PCG 未收敛、小系统成功 dense 回退时，状态及实际后端正确。
- 浮动框架在零荷载时也失败；孤立节点、非零行线性相关的矩阵不再被误当作有效结果。
- 简支梁均布荷载：两端平移均为零，杆内跨中挠度仍与 5qL⁴/(384EI) 一致。
- 悬臂均布荷载的端点位移及内部曲率与解析式一致。
- 相对端点连线的挠度剔除刚体平移与线性转动。
- 三角形荷载下加入 x=L/√3 的非固定采样点弯矩极值。
- 局部 z 均布荷载在悬臂自由端的弯矩恢复为零；正向轴向力得到拉正轴力。
- 微小非零位移不因六位小数清理而丢失。
- roll=90° 的荷载方向与变形终点转换一致；变形放大为零时回到原几何。
- 失败结果不生成服务性通过行，并关闭结果数值表。

最终执行结果：

```text
npm run typecheck     通过
npm test              55 个测试文件、314 项测试通过
npm run build         通过
git diff --check      本批已跟踪文件通过
```

构建存在大包体积提示，以及 Browserslist / baseline-browser-mapping 数据过期和 Node deprecation 提示；本批未调整相关依赖。测试通过仅证明受测场景，尚不等同独立工程算例认证。

## 浏览器检查

使用独立 Playwright 浏览器会话检查本地 Vite 页面 `http://127.0.0.1:3000/structure_analysis/`，桌面视口 1600×1100。检查的是开发环境，未进行线上发布或生产性能测量。

1. 默认空间框架通过 Worker 计算，服务性表显示横向挠度、控制位置及基准。
2. 平衡表分别显示力/力矩单位及对应容差。
3. 专门挂载实际 `SpaceModelViewport` 的简支梁夹具：L=4m、E=200GPa、Iz=200×10⁶mm⁴、局部 y 均布荷载 −2kN/m。计算节点最大平移为零、跨中挠度 0.166667mm、位置 2m，断言通过；视图出现曲线。夹具通过页面正常模块 API 调用求解器与视图，不属于产品中的新增导入功能。
4. 在实际建模界面新增孤立自由节点、重新计算、打开结果页：显示 FAILED 和“求解失败，结果不可用”，节点位移标签页不存在。

截图与可复现渲染夹具保存在仓库根目录 `output/playwright/`：

- `space-phase-a-serviceability.png`
- `space-phase-a-equilibrium.png`
- `space-phase-a-curved-beam.png`
- `space-phase-a-failed-model.png`
- `space-phase-a-curved-qa.js`（Playwright `run-code --filename`，需先打开本地 Vite 页面）

浏览器记录中唯一资源错误为 `/favicon.ico` 404，未出现应用或 WebGL 未捕获错误。专用浏览器会话的临时本地测试激活状态已清理。

## 验收边界与下一步

- 原计划 A1 的 OpenSees/Pynite 独立复算、设备/规模/工况性能基线尚未完成，不能据此宣布检查点 A 全部通过或量化提速。
- 刚体约束秩检查能识别浮动分量，不能证明所有释放引起的内部机构都已排除；dense 分解补充小模型判定，大型 sparse 模型仍需更多退化算例。
- 当前恢复适用于等截面 Euler–Bernoulli 梁、节点荷载与整杆均布/梯形荷载；尚未支持分段杆内荷载、杆内集中力、Timoshenko、P-Δ 或非线性。
- 服务性是单根单元的横向挠度参考，端点连线/单端固结基准按当前单元约束选取；多个单元组成的物理构件仍需统一构件与基准，不能直接当作完整悬臂验算。L/n 尚非规范设计检查，也未实现层间位移角。
- 全局平衡力矩仍以全局原点为基准，超大坐标平移的不变性与容差稳定性需继续专项验证。
- 六内力分量独立显示、局部轴图平面、结果导出、Worker 上下文缓存、分解/预条件器复用、真实多工况包络、增量图层和按需绘制尚未实施。

下一批先补独立算例和性能基线，再依据测量推进同结构多工况复用。工作区原有大量其他改动已保留；本批未提交、推送或部署。
