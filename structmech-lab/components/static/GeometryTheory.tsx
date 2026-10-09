import React, { useState } from 'react';
import './GeometryTheory.css';

export default function GeometryTheory() {
  const [collinear, setCollinear] = useState(false);
  const y = collinear ? 126 : 50;
  return <section className="geometry-theory" aria-label="几何组成理论与构造对照">
    <header><div><span>构造检查 / 从数量走向几何</span><h3>同样 W = 0，为什么性质不同？</h3></div><span className="geometry-theory-badge">独立教学示例</span></header>
    <div className="geometry-theory-demo">
      <div>
        <div className="geometry-example-tabs" role="group" aria-label="二杆体系布置"><button aria-pressed={!collinear} onClick={() => setCollinear(false)}>两杆不共线</button><button aria-pressed={collinear} onClick={() => setCollinear(true)}>两杆共线</button></div>
        <svg viewBox="0 0 360 205" role="img" aria-label={collinear ? 'A、C、B 共线的二杆瞬变体系' : 'A、C、B 不共线的二杆稳定体系'}>
          <path d={`M65 126 L180 ${y} L295 126`} fill="none" stroke={collinear ? '#e6b567' : '#78cbd5'} strokeWidth="3" />
          {[65,295].map(x=><g key={x}><path d={`M${x} 126 l-10 15 h20 Z M${x-15} 144 h30 m-27 0 l-5 6 m13 -6 l-5 6 m13 -6 l-5 6 m13 -6 l-5 6`} fill="none" stroke="#99abc1"/><circle cx={x} cy="126" r="4" fill="#101d30" stroke="#c3d4e7"/></g>)}
          <circle cx="180" cy={y} r="5" fill="#101d30" stroke="#d4e9f6" />
          <g fill="#b7cadc" fontSize="12"><text x="51" y="120">A</text><text x="302" y="120">B</text><text x="174" y={y-12}>C</text><text x="180" y="180" textAnchor="middle">A、B 固定铰支座 · C 自由铰结点</text></g>
          {collinear && <g stroke="#e6b567" fill="none"><path d="M180 151 v-58 m-4 6 l4 -6 l4 6" strokeDasharray="4 3"/><text x="197" y="95" fill="#e6b567" stroke="none" fontSize="10">一阶竖向运动</text></g>}
        </svg>
        <p className="geometry-example-count">j = 3 · b = 2 · r = 4 → W = 2×3 − 2 − 4 = 0</p>
      </div>
      <div className="geometry-example-reading" aria-live="polite">
        <span className="geometry-theory-kicker">{collinear ? '约束相关' : '约束独立'}</span>
        <h4>{collinear ? '瞬变体系，不能据 W = 0 判静定' : '几何不变，且无多余约束'}</h4>
        <p>{collinear ? '两杆对 C 的一阶约束都沿同一直线，竖向微小位移未被一阶约束限制。此时 d = 1、s = 1，仍有 W = d − s = 0。' : '两杆沿不同方向约束 C 的两个平动自由度，A、B 又与地基铰接；约束独立，d = 0、s = 0。'}</p>
        <p>{collinear ? '箭头仅表示一阶运动方向，不是保持杆长的有限运动轨迹。有限竖向位移会引起二阶杆长变化，这是瞬变与常变的重要区别。' : '这里的结论来自已知支座与杆件布置，不是只由计数公式得出。左侧修改数量不会改变本示例。'}</p>
      </div>
    </div>
    <details className="geometry-theory-detail" open><summary>计算自由度、运动自由度与多余约束</summary><div className="geometry-theory-body"><strong>W = d − s</strong><p>在线性化约束计数中，d 是一阶运动自由度数，s 是相关约束（自应力模态）数。W 可以为负，d 与 s 均不小于零；因此不能把 W 当作实际可运动的方向数。</p><p>不考虑杆件变形，常变体系存在有限机构运动；瞬变体系存在一阶微小运动但不能直接延拓为保持杆长的有限运动。确认几何不变后，d = 0：s = 0 为静定，s &gt; 0 为超静定。机构与多余约束也可能同时存在。</p></div></details>
    <details className="geometry-theory-detail"><summary>三个基本组成规则：条件必须同时满足</summary><div className="geometry-rules">
      <article><b>01 / 二元体规则</b><p>一个新结点用两根不共线链杆连接到原体系。增加或拆除这种二元体，不改变原体系的几何组成性质；两杆共线时不能套用。</p></article>
      <article><b>02 / 两刚片规则</b><p>两刚片用一铰和一根轴线不通过该铰的链杆连接，或用三根轴线不全平行、也不共点的链杆连接，构成无多余约束的几何不变体系。</p></article>
      <article><b>03 / 三刚片规则</b><p>三个刚片用三个不共线的铰两两相联，构成无多余约束的几何不变体系。两链杆延长线交点可作为虚铰；无穷远虚铰及特殊重合情况须单独检查。</p></article>
    </div></details>
    <details className="geometry-theory-detail"><summary>计数边界与完整分析步骤</summary><div className="geometry-theory-body"><p>刚片公式中的 m 不包含地基，h 是等效单铰数。连接 k 个刚片的复铰应计 k−1 个单铰。r 是外部标量约束数，不是支座个数：固定铰 2、滚动支座 1、固定端 3。内外约束不能重复扣除。</p><p>桁架公式按平面铰接直杆体系计数：j 为结点数、b 为杆数。两杆交叉但未连接时，不新增结点；是否有结点会改变杆件划分。几何组成判定本身不依赖荷载大小。</p><ol><li>选取确实几何不变的部分作为刚片，识别支座、实铰和虚铰。</li><li>计算 W，先检查数量是否足够。</li><li>通过二元体、两刚片或三刚片规则，分别检查内部连接和与地基的连接。</li><li>明确写出常变、瞬变，或几何不变且有／无多余约束；后者再判静定性。</li></ol></div></details>
    <footer>参考：<a href="https://lsxn.ytu.edu.cn/info/1013/1039.htm" target="_blank" rel="noreferrer">烟台大学 · 几何组成实验</a><a href="https://lsxn.ytu.edu.cn/info/1013/1037.htm" target="_blank" rel="noreferrer">瞬变体系实验</a><a href="https://www.tup.tsinghua.edu.cn/bookscenter/bookcatalog?id=05734001" target="_blank" rel="noreferrer">结构力学 · 几何构造章节</a></footer>
  </section>;
}
