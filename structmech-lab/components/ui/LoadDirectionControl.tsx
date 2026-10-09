import React, { useRef } from 'react';
import { normalizeLoadAngle } from '../../utils/loadDirection';
import './LoadDirectionControl.css';

interface Props {
  x: number; y: number; angle?: number; moment?: boolean; width?: number; height?: number;
  onAngleChange: (angle: number) => void; onReverse: () => void; onClose: () => void;
  onRotateStart?: () => void; onRotateEnd?: () => void;
}
/** Render last in the model SVG so the controls remain above the load hit areas. */
export default function LoadDirectionControl({ x, y, angle = -90, moment, width = 360, height = 220, onAngleChange, onReverse, onClose, onRotateStart, onRotateEnd }: Props) {
  const pointer = useRef<number | null>(null);
  const radius = 28, radians = (angle + 90) * Math.PI / 180;
  const hx = x + radius * Math.cos(radians), hy = y - radius * Math.sin(radians);
  // Place the handle perpendicular to the force, so revealing it never
  // intercepts the second click of a double-click on the arrow itself.
  const bodyX = Math.cos(angle * Math.PI / 180) * (Math.sin(angle * Math.PI / 180) > 0 ? 1 : -1);
  const preferredX = bodyX > .2 ? x - 172 : x + 32;
  const tx = Math.max(8, Math.min(width - 148, preferredX)), ty = Math.max(46, Math.min(height - 64, y - 64));
  const move = (event: React.PointerEvent<SVGGElement>) => {
    event.stopPropagation();
    if (pointer.current !== event.pointerId) return;
    const matrix = event.currentTarget.ownerSVGElement?.getScreenCTM(); if (!matrix) return;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    if (Math.hypot(point.x - x, point.y - y) < 5) return;
    let value = Math.atan2(y - point.y, point.x - x) * 180 / Math.PI - 90;
    if (event.shiftKey) value = Math.round(value / 15) * 15;
    onAngleChange(normalizeLoadAngle(value));
  };
  const finish = (event: React.PointerEvent<SVGGElement>) => { event.stopPropagation(); if (pointer.current !== null) { pointer.current = null; onRotateEnd?.(); } };
  return <g className="load-direction-control" pointerEvents="auto" onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()} onKeyDown={e => { e.stopPropagation(); if (e.key === 'Escape') onClose(); }}>
    {!moment && <><circle cx={x} cy={y} r={radius} fill="none" stroke="#0891b2" strokeOpacity=".45" strokeWidth=".8" strokeDasharray="2 3" pointerEvents="none" />
      <line x1={x} y1={y} x2={hx} y2={hy} stroke="#0891b2" strokeWidth="1" strokeDasharray="2 3" pointerEvents="none" />
      <g role="slider" tabIndex={0} aria-label="旋转荷载方向" aria-valuemin={-180} aria-valuemax={180} aria-valuenow={normalizeLoadAngle(angle)} aria-valuetext={`${angle} 度`} className="load-rotation-handle"
        onPointerDown={e => { if (e.button !== 0) return; e.preventDefault(); e.stopPropagation(); pointer.current = e.pointerId; onRotateStart?.(); e.currentTarget.setPointerCapture?.(e.pointerId); }}
        onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}
        onKeyDown={e => { if (['ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowUp'].includes(e.key)) { e.preventDefault(); onAngleChange(normalizeLoadAngle(angle + (['ArrowRight', 'ArrowUp'].includes(e.key) ? 1 : -1) * (e.shiftKey ? 15 : 5))); } }}>
        <title>拖动调整角度 · Shift 按 15° 对齐</title><circle cx={hx} cy={hy} r="10" fill="transparent" /><circle cx={hx} cy={hy} r="5" fill="#f8fafc" stroke="#0891b2" strokeWidth="1.6" /><circle cx={hx} cy={hy} r="1.5" fill="#0891b2" />
      </g></>}
    <foreignObject x={tx} y={ty} width="140" height="60">
      <div className="load-direction-popover" role="toolbar" aria-label="快速调整荷载方向">
        <div className="load-direction-buttons">
          {!moment && ([['↑', '向上', 90], ['↓', '向下', -90], ['←', '向左', 180], ['→', '向右', 0]] as const).map(([symbol, label, a]) => <button key={label} type="button" aria-label={`荷载${label}`} aria-pressed={normalizeLoadAngle(angle) === a} title={label} onClick={() => onAngleChange(a)}>{symbol}</button>)}
          <button type="button" aria-label="反向荷载" title="反向（也可双击箭头）" onClick={onReverse}>↔</button><button type="button" aria-label="关闭方向工具" title="关闭" onClick={onClose}>×</button>
        </div>
        <span>{moment ? '点击反向切换力矩方向' : `θ ${normalizeLoadAngle(angle)}° · 拖动圆点旋转`}</span>
      </div>
    </foreignObject>
  </g>;
}
