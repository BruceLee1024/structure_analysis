# 教材几何图 SCG 复现方案

## 现状结论

我检查了最新版 Markdown：

- 文件：`/Users/luckyzaizai/Downloads/朱慈勉结构力学上册（第三版）.pdf_by_PaddleOCR-VL-1.5.md`
- 第 2 章相关图号：图 2-3、2-4、2-5、2-6、2-8、2-9、2-10、2-11、2-12、2-13、2-14、2-15、2-16
- 这些 `<img>` 链接当前返回 `403 Forbidden`
- 链接中的授权截止时间仍是 `2026-04-16`，而当前日期已是 `2026-04-24`

所以当前不能直接依赖 Markdown 内的远程图片做“像素级照抄”，只能先按教材正文描述和图号关系做“语义级复现”。

## 仓库里现有的基础

当前最接近 SCG 底座的是：

- [components/ui/StructuralSvg.tsx](/Volumes/Bruce/AI%20Dev/Projects_2026/Structure_Analysis%20/Structure%20Analysis/structmech-lab/components/ui/StructuralSvg.tsx:1)
- [components/StaticModule.tsx](/Volumes/Bruce/AI%20Dev/Projects_2026/Structure_Analysis%20/Structure%20Analysis/structmech-lab/components/StaticModule.tsx:141)

已经有的图元：

- `PinSupport`
- `RollerSupport`
- `FixedSupport`
- `PointLoadV`
- `PointLoadH`
- `DistributedLoadV`
- `StructuralNode`
- `StructuralDefs`

这些足够支持“梁、刚架、荷载、支座”类图，但还不够支持教材第 2 章的“几何组成分析图”。

## 我对 SCG 的工作假设

仓库里没有直接出现 `SCG` 命名，因此这里先按“结构图 Scene Graph / Structural Composable Graphics”理解：

- 用一组可组合的 React + SVG 图元描述结构图
- 图元既能画教材示意图，也能画交互模块里的教学图
- 同一套图元可服务“静力模块、几何组成分析、后续例题讲解”

如果你这边对 `SCG` 有特定定义，可以在这份方案基础上对接口再收口。

## 第 2 章最值得优先复现的图

### P0：先做基础约束图元

这些图是整个几何组成分析的“字母表”，最适合先做：

- 图 2-3：链杆联结
- 图 2-4：单铰 / 复铰
- 图 2-5：刚结点 / 复刚结
- 图 2-6：多余约束

原因：

- 它们直接定义了“1 约束 / 2 约束 / 3 约束”
- 一旦这几类图元稳定，后面的组合图都能复用

### P1：再做两刚片组成规则

- 图 2-8：`W<0` 但仍可变的反例
- 图 2-9：两刚片 + 三链杆 / 虚铰
- 图 2-10：三链杆共点，常变/瞬变
- 图 2-11：三链杆平行，常变/瞬变

原因：

- 正好对应当前静力模块里最容易误判的地方
- 这些图可以直接服务“为什么 `W<0` 不能直接判超静定”的教学

### P2：最后做三刚片规则与应用技巧

- 图 2-12：三刚片规则
- 图 2-13：三铰共线
- 图 2-14：平行链杆的特殊情况
- 图 2-15：一元体 / 二元体
- 图 2-16：封闭刚结框架的内部多余约束

原因：

- 图元复用率高，但表达层次更复杂
- 适合在基础图元稳定后统一收

## 现有图元之外，SCG 还缺什么

### 1. 刚片图元

需要新增：

- `RigidBodyRect`
- `RigidBodyTriangle`
- `RigidBodyPolygon`
- `RigidBodyPlateLabel`

用途：

- 画“刚片 I / II / III”
- 画封闭刚结框架等效刚片

### 2. 约束与连接图元

需要新增：

- `ChainLink`
- `SimpleHinge`
- `ComplexHinge`
- `RigidJointMark`
- `ComplexRigidJointMark`
- `SupportLink`

用途：

- 图 2-3 到图 2-6
- 图 2-9、图 2-12、图 2-15 的核心连接关系

### 3. 几何分析辅助图元

需要新增：

- `DashedExtensionLine`
- `VirtualHingeMark`
- `InstantCenterMark`
- `InfinitePointMark`
- `ParallelMark`
- `CollinearGuide`
- `MotionArrow`
- `GhostPosition`

用途：

- 虚铰、瞬心、无穷远点、平行关系、位移虚线
- 图 2-8、2-9、2-10、2-11、2-13、2-14 是关键

### 4. 教材标注图元

需要新增：

- `FigureSubLabel`
- `NodeLabel`
- `BodyLabel`
- `ConstraintCountBadge`
- `CaptionText`

用途：

- `(a) (b) (c)`
- `A / B / C / O`
- `I / II / III`
- “1 约束 / 2 约束 / 3 约束”的可视化提示

## 推荐的 SCG 节点模型

建议不要一开始就写死成某几个组件，而是先有一层轻量场景协议：

```ts
type ScgNode =
  | { type: 'rigid-body'; shape: 'rect' | 'triangle' | 'polygon'; points: number[]; label?: string }
  | { type: 'chain-link'; x1: number; y1: number; x2: number; y2: number; dashed?: boolean }
  | { type: 'hinge'; x: number; y: number; kind: 'simple' | 'complex' | 'virtual'; count?: number }
  | { type: 'rigid-joint'; x: number; y: number; count?: number }
  | { type: 'support'; kind: 'pin' | 'roller' | 'fixed' | 'guided'; x: number; y: number; orientation?: 'left' | 'right' | 'bottom' }
  | { type: 'guide-line'; x1: number; y1: number; x2: number; y2: number; style?: 'dashed' | 'solid' }
  | { type: 'motion-arrow'; x1: number; y1: number; x2: number; y2: number; mode?: 'finite' | 'infinitesimal' }
  | { type: 'label'; x: number; y: number; text: string; tone?: 'default' | 'muted' | 'accent' };

interface ScgScene {
  width: number;
  height: number;
  nodes: ScgNode[];
}
```

这样后面：

- 教材图可用 JSON/对象描述
- React 组件只负责渲染
- 以后做“图 2-9a / 2-9b / 2-9c”切换时，只用替换 scene 数据

## 图号到 SCG 的映射建议

### 图 2-3 链杆联结

最小图元组合：

- 两个动点或两个刚片
- 一根 `ChainLink`
- 自由度方向箭头
- 点/体标签

### 图 2-4 单铰 / 复铰

最小图元组合：

- 两个或三个刚片
- 一个 `SimpleHinge` 或 `ComplexHinge(count=2)`
- 旋转自由度提示箭头

### 图 2-5 刚结点 / 复刚结

最小图元组合：

- 两个或多个刚片
- `RigidJointMark`
- 接缝加粗或夹角固定标识

### 图 2-6 多余约束

最小图元组合：

- 一个动点 A
- 三根 `ChainLink`
- 其中一根高亮为“多余约束”

### 图 2-9 两刚片组成规则

最小图元组合：

- 两个刚片
- 三根链杆
- 前两根延长线交点 `O`
- `VirtualHingeMark`

### 图 2-10 / 2-11

最小图元组合：

- 两个刚片
- 三根共点或平行链杆
- `MotionArrow`
- `GhostPosition`

### 图 2-12 / 2-13 / 2-14

最小图元组合：

- 三个刚片
- 三个铰或平行链杆
- 共线辅助线 / 平行标记 / 无穷远点标记

### 图 2-15 / 2-16

最小图元组合：

- 桁架或封闭框架轮廓
- 阴影刚片区域
- 一元体 / 二元体着色
- 内部多余约束提示

## 最适合先实现的 5 个 SCG 组件

如果马上开工，我建议先做这 5 个：

1. `ChainLink`
2. `SimpleHinge` / `VirtualHingeMark`
3. `RigidBodyPolygon`
4. `MotionArrow` + `GhostPosition`
5. `FigureLabelGroup`

做完这 5 个，就可以先覆盖：

- 图 2-3
- 图 2-4
- 图 2-6
- 图 2-9
- 图 2-10
- 图 2-11

## 与当前模块的结合方式

推荐新增一个独立层，而不是把图硬写在 [StaticModule.tsx](/Volumes/Bruce/AI%20Dev/Projects_2026/Structure_Analysis%20/Structure%20Analysis/structmech-lab/components/StaticModule.tsx:141) 里：

- `components/ui/GeometryScg.tsx`
- `utils/geometryScenes.ts`

职责分工：

- `GeometryScg.tsx`：渲染 `ScgScene`
- `geometryScenes.ts`：保存图 2-3、2-4、2-6、2-9 等 scene 数据
- `StaticModule.tsx`：只负责切换 scene、配文案和交互

这样能避免几何组成分析页继续膨胀成一大坨 JSX。

## 推荐落地顺序

### 第 1 步

先补 SCG 底座：

- `ChainLink`
- `SimpleHinge`
- `VirtualHingeMark`
- `RigidBodyPolygon`
- `MotionArrow`

### 第 2 步

先复现 4 张最关键的图：

- 图 2-3
- 图 2-6
- 图 2-9
- 图 2-10

### 第 3 步

把当前“几何组成分析”页里的预设卡片换成教材图驱动：

- “链杆=1 约束”
- “单铰=2 约束”
- “刚结点=3 约束”
- “W<0 仍可变反例”

### 第 4 步

再扩展到三刚片规则和一元体/二元体。

## 当前最重要的判断

即使现在拿不到远程图片，本章教材图仍然非常适合用 SCG 复现，因为它们本质上不是“写实插图”，而是“几何关系图”：

- 结构元素少
- 拓扑清楚
- 图元复用高
- 交互价值强

所以这件事是可做的，而且很适合做成一个小型结构图 Scene Graph，而不是继续在页面里手写 SVG。

## 下一步建议

下一步最合适的是直接开始第一阶段实现：

- 新建 `GeometryScg.tsx`
- 新建 `geometryScenes.ts`
- 先把图 2-3、2-6、2-9、2-10 做出来

这样即使没有原图，也能先把“教材语义一致”的版本搭起来；后面一旦拿到原 PDF 或本地图缓存图，再补版式微调即可。
