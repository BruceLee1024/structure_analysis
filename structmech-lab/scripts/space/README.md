# 空间计算复算与性能测量

从 `structmech-lab/` 执行。Node 脚本通过仓库已有 esbuild 打包当前数值源码，不需要新增运行时依赖。

## 已保存的独立参考结果

```bash
npm run verify:space-reference
npm test -- utils/spaceReference.test.ts
```

9 个输入模型、18 条后端路径。参考输入和 Pynite 3.2.0 输出位于 `tests/fixtures/space/`。参考输出是外部求解器运行所得，应用测试不导入 Pynite；CI 不需要 Python。

比较节点平移、转角、反力、杆端力和 5 个杆内位置的局部位移。相对容差为 1e-7；绝对容差为平移 1e-6 mm、转角 1e-9 rad、力/矩 1e-6 kN / kN·m、杆内位移 1e-9 m。误差必须小于“绝对容差 + 相对容差 × 参考值”。比较报告分别保存各组最大绝对误差，并使用无量纲 `normalizedError` 判断是否通过；力与矩不直接互相比较。

## 重新生成参考结果

使用 Python 3.12 的独立虚拟环境，避免改变应用或系统 Python 依赖。例如：

```bash
python3.12 -m venv /tmp/structlab-space-reference
/tmp/structlab-space-reference/bin/python -m pip install -r scripts/space/requirements-reference.txt
/tmp/structlab-space-reference/bin/python scripts/space/reference_pynite.py > /tmp/structlab-pynite-reference.json
```

先检查临时输出和对照误差，再替换保存的参考结果；不要以应用输出生成“外部参考”。脚本输出记录 Pynite、NumPy、SciPy 和 Python 版本。

单位转换：m/kN 统一体系下 E=GPa×1e6、A=cm²×1e-4、Iy/Iz/J=(10⁶ mm⁴)×1e-6。泊松比用于 G=E/[2(1+ν)]。输入 `referenceY` 显式指定每杆目标局部 y，Pynite 适配器在其默认局部轴基础上求 rotation；应用侧使用原有 roll。必须保留轴映射断言，不能假设两者默认轴一致。参考计算为线弹性静力；不启用 P-Δ、剪切变形或规范设计。

依据：[Pynite 构件与局部坐标](https://pynite.readthedocs.io/en/latest/member.html)、[FEModel3D API](https://pynite.readthedocs.io/en/latest/FEModel3D.html)、[安装说明](https://pynite.readthedocs.io/en/latest/installation.html)。

## 性能测量

```bash
npm run benchmark:space -- docs/benchmarks/space-current.json
```

固定小/中/大型参数模型；每组 20 个右端、2 次预热、12 次测量，保存原始样本、median/P95、设备、Node 版本及数值源码 SHA256。`cold-20` 每次重建；`prepared-20` 每批只准备一个结构上下文，测量包含这一次准备和全部后处理。负载按同一比例放大，代表重复荷载求解工作量，不代表 20 种工程荷载分布的覆盖度。

计时不包含浏览器 Worker 通信、GPU 渲染、FPS 或峰值内存。默认 auto、tolerance=1e-8，允许原有小系统 dense 回退；读取 `actualBackend`，不能把 dense 回退后的耗时称为 PCG 提速。

2026-10-09 前后测量保存在 `docs/benchmarks/space-before-context-cache-2026-10-09.json` 和 `space-after-context-cache-2026-10-09.json`。优化前源码指纹已记录，因工作区含其他未提交内容，Git HEAD 不足以代表测量快照；前测结果未包含后加入的准备计数。
