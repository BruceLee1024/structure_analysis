import type { Load, ModelIssue, SolverElement, SolverNode, SolverParams } from '../types';

const distance = (a: SolverNode, b: SolverNode) => Math.hypot(a.x - b.x, a.y - b.y);

const elementLength = (element: SolverElement, nodes: SolverNode[]) => {
  const n1 = nodes.find(node => node.id === element.startNode);
  const n2 = nodes.find(node => node.id === element.endNode);
  if (!n1 || !n2) return null;
  return distance(n1, n2);
};

function issue(id: string, severity: ModelIssue['severity'], title: string, detail: string): ModelIssue {
  return { id, severity, title, detail };
}

export function validateModel(params: SolverParams, activeLoads: Load[], solverError?: string): ModelIssue[] {
  const issues: ModelIssue[] = [];
  const nodeIds = new Set<number>();
  const elementIds = new Set<number>();

  if (
    params.deflectionLimitRatio !== undefined &&
    (!Number.isFinite(params.deflectionLimitRatio) || params.deflectionLimitRatio < 50 || params.deflectionLimitRatio > 1000)
  ) {
    issues.push(issue('deflection-limit-ratio', 'warning', '挠度限值范围异常', '挠度限值建议采用 L/50 到 L/1000 之间的正数。'));
  }

  if (params.nodes.length < 2) {
    issues.push(issue('node-count', 'error', '节点数量不足', '至少需要 2 个节点才能形成杆系模型。'));
  }

  if (params.elements.length < 1) {
    issues.push(issue('element-count', 'error', '缺少单元', '当前模型没有可分析的杆件单元。'));
  }

  params.nodes.forEach(node => {
    if (nodeIds.has(node.id)) {
      issues.push(issue(`node-id-${node.id}`, 'error', '节点编号重复', `节点 ${node.id} 出现了多次。`));
    }
    nodeIds.add(node.id);
  });

  for (let i = 0; i < params.nodes.length; i++) {
    for (let j = i + 1; j < params.nodes.length; j++) {
      if (distance(params.nodes[i], params.nodes[j]) < 1e-6) {
        issues.push(issue(`node-dup-${params.nodes[i].id}-${params.nodes[j].id}`, 'warning', '存在重合节点', `节点 ${params.nodes[i].id} 与 ${params.nodes[j].id} 坐标几乎相同。`));
      }
    }
  }

  params.elements.forEach(element => {
    if (elementIds.has(element.id)) {
      issues.push(issue(`element-id-${element.id}`, 'error', '单元编号重复', `单元 ${element.id} 出现了多次。`));
    }
    elementIds.add(element.id);

    if (!nodeIds.has(element.startNode) || !nodeIds.has(element.endNode)) {
      issues.push(issue(`element-ref-${element.id}`, 'error', '单元引用无效节点', `单元 ${element.id} 的端点节点不存在。`));
      return;
    }

    if (element.startNode === element.endNode) {
      issues.push(issue(`element-self-${element.id}`, 'error', '单元两端相同', `单元 ${element.id} 的起点和终点都是节点 ${element.startNode}。`));
      return;
    }

    const length = elementLength(element, params.nodes);
    if (length !== null && length < 1e-6) {
      issues.push(issue(`element-zero-${element.id}`, 'error', '零长度单元', `单元 ${element.id} 的长度接近 0。`));
    }

    if (element.E <= 0 || element.A <= 0 || element.I <= 0) {
      issues.push(issue(`element-props-${element.id}`, 'error', '单元刚度参数异常', `单元 ${element.id} 的 E、A、I 必须为正值。`));
    }
  });

  params.nodes.forEach(node => {
    node.springStiffness?.forEach((stiffness, index) => {
      if (!Number.isFinite(stiffness) || stiffness < 0) {
        const labels = ['水平', '竖向', '转动'];
        issues.push(issue(`spring-${node.id}-${index}`, 'error', '弹性支座刚度异常', `节点 ${node.id} 的${labels[index]}弹簧刚度必须为非负数。`));
      }
    });
  });

  const connectedNodeIds = new Set<number>();
  params.elements.forEach(element => {
    connectedNodeIds.add(element.startNode);
    connectedNodeIds.add(element.endNode);
  });
  params.nodes.forEach(node => {
    if (!connectedNodeIds.has(node.id)) {
      issues.push(issue(`isolated-${node.id}`, 'warning', '孤立节点', `节点 ${node.id} 没有连接任何单元。`));
    }
  });

  const constrainedDofs = params.nodes.reduce((sum, node) => {
    const fixedCount = node.restraints.filter(Boolean).length;
    const springCount = (node.springStiffness ?? []).filter(stiffness => Number.isFinite(stiffness) && stiffness > 0).length;
    return sum + fixedCount + springCount;
  }, 0);
  if (constrainedDofs === 0) {
    issues.push(issue('no-restraints', 'error', '没有支座约束', '结构整体没有任何受约束自由度，会形成刚体运动。'));
  } else if (constrainedDofs < 3) {
    issues.push(issue('few-restraints', 'warning', '支座约束偏少', `当前仅约束 ${constrainedDofs} 个自由度，平面杆系通常至少需要 3 个独立约束。`));
  }

  const allElementLoadIds = new Set(params.elements.map(element => element.id));
  const allNodeLoadIds = new Set(params.nodes.map(node => node.id));
  params.loads.forEach(load => {
    if (load.nodeId !== undefined && !allNodeLoadIds.has(load.nodeId)) {
      issues.push(issue(`load-node-${load.id}`, 'error', '荷载节点不存在', `荷载 ${load.id} 指向了不存在的节点 ${load.nodeId}。`));
    }
    if (load.elementId !== undefined && !allElementLoadIds.has(load.elementId)) {
      issues.push(issue(`load-el-${load.id}`, 'error', '荷载单元不存在', `荷载 ${load.id} 指向了不存在的单元 ${load.elementId}。`));
    }
    if (load.nodeId === undefined && load.elementId === undefined) {
      issues.push(issue(`load-target-${load.id}`, 'error', '荷载缺少作用对象', `荷载 ${load.id} 未绑定节点或单元。`));
    }
    if (!Number.isFinite(load.magnitude)) {
      issues.push(issue(`load-mag-${load.id}`, 'error', '荷载数值异常', `荷载 ${load.id} 的大小不是有效数字。`));
    }
    if (load.type === 'trapezoidal' && !Number.isFinite(load.magnitudeEnd)) {
      issues.push(issue(`load-mag-end-${load.id}`, 'error', '梯形荷载末端值异常', `荷载 ${load.id} 的末端大小不是有效数字。`));
    }
    if (load.location !== undefined && (load.location < 0 || load.location > 1)) {
      issues.push(issue(`load-loc-${load.id}`, 'warning', '荷载位置越界', `荷载 ${load.id} 的单元位置应在 0 到 1 之间。`));
    }
  });

  if (activeLoads.length === 0) {
    issues.push(issue('empty-active-loads', 'info', '当前分析目标无荷载', '当前工况或组合没有参与计算的荷载，结果将只反映零荷载状态。'));
  }

  if (solverError) {
    issues.push(issue('solver-error', 'error', '求解器报告机构风险', solverError));
  }

  return issues;
}

export function summarizeIssues(issues: ModelIssue[]) {
  return {
    errors: issues.filter(item => item.severity === 'error').length,
    warnings: issues.filter(item => item.severity === 'warning').length,
    infos: issues.filter(item => item.severity === 'info').length,
  };
}
