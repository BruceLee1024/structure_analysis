/** Counting is a necessary-condition screen, never a geometry/stability solver. */
export function geometryCountStatus(w: number) {
  if (w > 0) return { label: '几何可变体系', reason: '自由度还没被约束完：必要约束数量不足，不能作为一般荷载下的稳定结构。' };
  if (w === 0) return { label: '数量条件满足，待检查构造', reason: 'W = 0 是无多余约束几何不变体系的必要条件；常变、瞬变与多余约束并存的情况仍需排查。' };
  return { label: '约束数量有余，待检查构造', reason: `W = ${w} 不能单独证明几何不变。仅在确认几何不变后，才可判为 ${-w} 次超静定；若存在机构，多余约束数还会更多。` };
}
