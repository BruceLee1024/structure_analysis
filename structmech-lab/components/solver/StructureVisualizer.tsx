import React, { useState, useRef, useMemo, useCallback } from 'react';
import { SolverParams, AnalysisResult, SolverNode, SolverElement, Load, StructureType } from '../../types';
import { calculateExactValues } from '../../utils/solver';

const VIS_WIDTH = 800;
const VIS_HEIGHT = 400;
const VIS_PADDING = 60;

interface TransformConfig {
    scale: number;
    cx: number;
    cy: number;
    width: number;
    height: number;
}

interface DiagramViewProps {
    mode: 'Editor' | 'M' | 'V' | 'N' | 'D';
    title: string;
    showLoads?: boolean;
    interactive?: boolean;
    nodes: SolverNode[];
    elements: SolverElement[];
    results: AnalysisResult;
    loads: Load[];
    transform: TransformConfig;
    activeLocation: {x: number, y: number} | null;
    setActiveLocation: (loc: {x: number, y: number} | null) => void;
    onAddLoad: (load: Load) => void;
    maxValues: { m: number, v: number, n: number, d: number };
    structureType: StructureType;
}

const formatValue = (val: number) => {
    if (Math.abs(val) < 0.005) return "0.00";
    return val.toFixed(2);
};

const DiagramView = React.memo(({ 
    mode, title, showLoads, interactive, nodes, elements, results, loads, transform,
    activeLocation, setActiveLocation, onAddLoad, maxValues, structureType
}: DiagramViewProps) => {
    const svgRef = useRef<SVGSVGElement>(null);
    const isEditor = mode === 'Editor';
    const isTruss = structureType === StructureType.Truss;

    const toPx = useCallback((x: number, y: number) => {
        const { width, height, scale, cx, cy } = transform;
        return { x: width/2 + (x - cx) * scale, y: height/2 - (y - cy) * scale };
    }, [transform]);

    const toWorld = useCallback((px: number, py: number) => {
        const { width, height, scale, cx, cy } = transform;
        return { x: (px - width/2) / scale + cx, y: cy - (py - height/2) / scale };
    }, [transform]);

    const { mScale, vScale, nScale, dScale } = useMemo(() => {
        const maxVisSize = 50;
        return {
            mScale: maxValues.m > 1e-6 ? maxVisSize / maxValues.m : 0,
            vScale: maxValues.v > 1e-6 ? maxVisSize / maxValues.v : 0,
            nScale: maxValues.n > 1e-6 ? maxVisSize / maxValues.n : 0,
            dScale: maxValues.d > 1e-6 ? maxVisSize / maxValues.d : 0
        };
    }, [maxValues]);

    const structureLayer = useMemo(() => (
        <g>
            {elements.map(el => {
                const n1 = nodes.find(n => n.id === el.startNode);
                const n2 = nodes.find(n => n.id === el.endNode);
                if (!n1 || !n2) return null;
                const p1 = toPx(n1.x, n1.y);
                const p2 = toPx(n2.x, n2.y);
                return (
                    <g key={el.id}>
                        <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} 
                            stroke={isEditor ? "#64748b" : "#334155"} 
                            strokeWidth={isEditor ? 3 : 1.5} 
                            strokeOpacity={isEditor ? 1 : 0.3} />
                        {isEditor && !isTruss && (
                            <>
                            {el.releaseStart && <circle cx={p1.x + (p2.x-p1.x)*0.1} cy={p1.y + (p2.y-p1.y)*0.1} r="3" fill="#0f172a" stroke="#94a3b8" strokeWidth="1.5"/>}
                            {el.releaseEnd && <circle cx={p2.x - (p2.x-p1.x)*0.1} cy={p2.y - (p2.y-p1.y)*0.1} r="3" fill="#0f172a" stroke="#94a3b8" strokeWidth="1.5"/>}
                            </>
                        )}
                    </g>
                )
            })}
            {isEditor && nodes.map(n => {
                const p = toPx(n.x, n.y);
                return (
                    <g key={n.id} transform={`translate(${p.x}, ${p.y})`}>
                        {n.restraints.some(r=>r) && (
                            <g>
                                {n.restraints[2] ? ( 
                                    <g><rect x="-10" y="0" width="20" height="4" fill="#94a3b8"/><line x1="-8" y1="4" x2="-12" y2="10" stroke="#64748b"/><line x1="0" y1="4" x2="-4" y2="10" stroke="#64748b"/><line x1="8" y1="4" x2="4" y2="10" stroke="#64748b"/></g>
                                ) : n.restraints[0] && n.restraints[1] ? ( 
                                    <polygon points="0,0 -8,12 8,12" fill="#94a3b8"/>
                                ) : ( 
                                    <g><circle cx="0" cy="5" r="5" fill="#94a3b8"/><line x1="-8" y1="12" x2="8" y2="12" stroke="#64748b" strokeWidth="2"/></g>
                                )}
                            </g>
                        )}
                        <circle r="4" fill="#cbd5e1" stroke="#0f172a" />
                        <text x="8" y="-8" fill="#64748b" fontSize="10" fontWeight="bold">{n.id}</text>
                    </g>
                )
            })}
        </g>
    ), [elements, nodes, isEditor, toPx, isTruss]);

    const loadsLayer = useMemo(() => {
        if (!showLoads) return null;
        return loads.map((load, i) => {
            const key = load.id || `load-${i}`;
            const isX = load.direction === 'x';
            let p = { x: 0, y: 0 };
            let valid = false;

            if (load.nodeId) {
                const n = nodes.find(node => node.id === load.nodeId);
                if (n) { p = toPx(n.x, n.y); valid = true; }
            } else if (load.elementId) {
                const el = elements.find(e => e.id === load.elementId);
                if (el) {
                    const n1 = nodes.find(n => n.id === el.startNode);
                    const n2 = nodes.find(n => n.id === el.endNode);
                    if (n1 && n2) {
                        const t = load.location !== undefined ? load.location : 0.5;
                        p = toPx(n1.x + (n2.x - n1.x) * t, n1.y + (n2.y - n1.y) * t);
                        valid = true;
                    }
                }
            }
            if (!valid) return null;

            if (load.type === 'point') {
                const isPositive = load.magnitude > 0;
                let rot = isX ? (isPositive ? -90 : 90) : (isPositive ? 180 : 0);
                return (
                    <g key={key} transform={`translate(${p.x}, ${p.y}) rotate(${rot})`}>
                        <line x1="0" y1="-25" x2="0" y2="-2" stroke="#ef4444" strokeWidth="2" markerEnd="url(#arrowhead-load)" />
                        <text x="5" y="-25" fill="#ef4444" fontSize="12" fontWeight="bold" transform={`rotate(${-rot})`}>{Math.abs(load.magnitude)}</text>
                    </g>
                );
            }
            if (load.type === 'moment') {
                const isCCW = load.magnitude > 0;
                return (
                    <g key={key} transform={`translate(${p.x}, ${p.y})`}>
                        <path d={isCCW ? "M 12 0 A 12 12 0 1 0 0 -12" : "M 12 0 A 12 12 0 1 1 0 -12"} fill="none" stroke="#f97316" strokeWidth="2" markerEnd="url(#arrowhead-moment)" />
                        <text x="14" y="-14" fill="#f97316" fontSize="12" fontWeight="bold">{Math.abs(load.magnitude)}</text>
                    </g>
                );
            }
            if (load.type === 'distributed' && load.elementId) {
                const el = elements.find(e => e.id === load.elementId);
                if (!el) return null;
                const n1 = nodes.find(n => n.id === el.startNode);
                const n2 = nodes.find(n => n.id === el.endNode);
                if(!n1||!n2) return null;
                const p1 = toPx(n1.x, n1.y);
                const p2 = toPx(n2.x, n2.y);
                const dx = p2.x - p1.x;
                const dy = p2.y - p1.y;
                const L = Math.sqrt(dx*dx+dy*dy);
                const count = Math.max(2, Math.floor(L/20));
                const isPositive = load.magnitude > 0;
                const arrows = [];
                for(let k=0; k<=count; k++){
                    const t = k/count;
                    const lx = p1.x+t*dx;
                    const ly = p1.y+t*dy;
                    const al = 15;
                    let ax1=lx, ay1=ly, ax2=lx, ay2=ly;
                    if(!isX) { if(isPositive){ay1=ly+al; ay2=ly;} else {ay1=ly-al; ay2=ly;} }
                    else { if(isPositive){ax1=lx-al; ax2=lx;} else {ax1=lx+al; ax2=lx;} }
                    arrows.push(<line key={k} x1={ax1} y1={ay1} x2={ax2} y2={ay2} stroke="#a855f7" strokeWidth="1" markerEnd="url(#arrowhead-load-dist)"/>);
                }
                return <g key={key}>{arrows}</g>;
            }
            return null;
        });
    }, [loads, nodes, elements, showLoads, toPx]);


    const resultsLayer = useMemo(() => {
        if (isEditor) return null;
        return results.elements.map(res => {
            const el = elements.find(e => e.id === res.elementId);
            if (!el) return null;
            const n1 = nodes.find(n => n.id === el.startNode);
            const n2 = nodes.find(n => n.id === el.endNode);
            if (!n1 || !n2) return null;

            const start = toPx(n1.x, n1.y);
            const end = toPx(n2.x, n2.y);
            const dx = end.x - start.x;
            const dy = end.y - start.y;
            const ndy = dy / (Math.sqrt(dx*dx + dy*dy) || 1);
            const ndx = dx / (Math.sqrt(dx*dx + dy*dy) || 1);
            const snx = -ndy; 
            const sny = ndx;

            let path = `M ${start.x} ${start.y}`;
            let color = "#3b82f6";
            let fillOp = 0.4;

            res.stations.forEach((st, i) => {
                let val = 0;
                if(mode === 'M') { val = st.moment * mScale; color = "#3b82f6"; } 
                if(mode === 'V') { val = -st.shear * vScale; color = "#f43f5e"; } 
                if(mode === 'N') { val = st.axial * nScale; color = "#10b981"; }
                if(mode === 'D') { val = -st.deflectionY * dScale; color = "#a855f7"; fillOp = 0; }

                const elLen = Math.sqrt(Math.pow(n2.x - n1.x, 2) + Math.pow(n2.y - n1.y, 2));
                const t = elLen > 0 ? st.x / elLen : 0;
                const px = start.x + dx * t + snx * val;
                const py = start.y + dy * t + sny * val;
                
                if (i === 0) path = `M ${px} ${py}`;
                else path += ` L ${px} ${py}`;
            });

            if (mode !== 'D') path += ` L ${end.x} ${end.y} L ${start.x} ${start.y} Z`;
            return <path key={el.id} d={path} fill={color} fillOpacity={fillOp} stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />;
        });
    }, [isEditor, mode, results, elements, nodes, toPx, mScale, vScale, nScale, dScale]);

    const activeData = useMemo(() => {
        if (!activeLocation) return null;
        let closestDist = Infinity;
        let closestEl: SolverElement | null = null;
        let closestT = 0;

        elements.forEach(el => {
            const n1 = nodes.find(n => n.id === el.startNode);
            const n2 = nodes.find(n => n.id === el.endNode);
            if (!n1 || !n2) return;
            const dx = n2.x - n1.x;
            const dy = n2.y - n1.y;
            const l2 = dx*dx + dy*dy;
            if (l2 === 0) return;
            let t = ((activeLocation.x - n1.x) * dx + (activeLocation.y - n1.y) * dy) / l2;
            t = Math.max(0, Math.min(1, t));
            const projX = n1.x + t * dx;
            const projY = n1.y + t * dy;
            const dist = Math.sqrt(Math.pow(activeLocation.x - projX, 2) + Math.pow(activeLocation.y - projY, 2));
            if (dist < closestDist) { closestDist = dist; closestEl = el; closestT = t; }
        });

        if (closestDist > 2.5 || !closestEl) return null;
        if (closestT < 0.05) closestT = 0;
        if (closestT > 0.95) closestT = 1;

        const resultEl = results.elements.find(r => r.elementId === closestEl!.id);
        if (!resultEl) return null;

        const n1 = nodes.find(n => n.id === closestEl!.startNode)!;
        const n2 = nodes.find(n => n.id === closestEl!.endNode)!;
        const dx = n2.x - n1.x;
        const dy = n2.y - n1.y;
        const length = Math.sqrt(dx*dx + dy*dy);
        const c = dx / length;
        const s = dy / length;
        const targetLocalX = closestT * length;
        const elLoads = loads.filter(l => l.elementId === closestEl!.id);
        const exactValues = calculateExactValues(targetLocalX, length, c, s, resultEl.u_local, resultEl.startForces, elLoads);

        return {
            elementId: closestEl.id, t: closestT,
            globalX: n1.x + closestT * dx, globalY: n1.y + closestT * dy,
            moment: exactValues.moment, shear: exactValues.shear,
            axial: exactValues.axial, deflectionY: exactValues.deflectionY,
            n1, n2, length
        };
    }, [activeLocation, results, nodes, elements, loads]);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (!interactive || !svgRef.current) return;
        const svg = svgRef.current;
        const pt = svg.createSVGPoint();
        pt.x = e.clientX; pt.y = e.clientY;
        const svgP = pt.matrixTransform(svg.getScreenCTM()?.inverse());
        setActiveLocation(toWorld(svgP.x, svgP.y));
    }, [interactive, toWorld, setActiveLocation]);

    const handleMouseLeave = useCallback(() => {
        if (!interactive) return;
        setActiveLocation(null);
    }, [interactive, setActiveLocation]);

    const onDragOver = useCallback((e: React.DragEvent) => {
        if(!interactive) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
    }, [interactive]);

    const onDrop = useCallback((e: React.DragEvent) => {
        if(!interactive || !svgRef.current) return;
        e.preventDefault();
        const type = e.dataTransfer.getData('loadType') as 'point' | 'distributed' | 'moment';
        if (!type) return;

        const svg = svgRef.current;
        const pt = svg.createSVGPoint();
        pt.x = e.clientX; pt.y = e.clientY;
        const svgP = pt.matrixTransform(svg.getScreenCTM()?.inverse());

        let closestNode = null;
        let minNodeDist = 20;
        nodes.forEach(n => {
            const px = toPx(n.x, n.y);
            const dist = Math.sqrt(Math.pow(px.x - svgP.x, 2) + Math.pow(px.y - svgP.y, 2));
            if (dist < minNodeDist) { minNodeDist = dist; closestNode = n; }
        });

        if ((type === 'point' || type === 'moment') && closestNode) {
            onAddLoad({ id: Date.now().toString(), type, nodeId: closestNode.id, magnitude: type === 'point' ? -10 : 10, direction: 'y' });
            return;
        }

        let closestElement = null;
        let minElemDist = 15;
        let hitT = 0.5;
        elements.forEach(el => {
            const n1 = nodes.find(n => n.id === el.startNode);
            const n2 = nodes.find(n => n.id === el.endNode);
            if(!n1 || !n2) return;
            const p1 = toPx(n1.x, n1.y);
            const p2 = toPx(n2.x, n2.y);
            const l2 = Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2);
            if(l2===0) return;
            let t = ((svgP.x - p1.x) * (p2.x - p1.x) + (svgP.y - p1.y) * (p2.y - p1.y)) / l2;
            t = Math.max(0, Math.min(1, t));
            const projX = p1.x + t * (p2.x - p1.x);
            const projY = p1.y + t * (p2.y - p1.y);
            const dist = Math.sqrt(Math.pow(svgP.x - projX, 2) + Math.pow(svgP.y - projY, 2));
            if(dist < minElemDist) { minElemDist = dist; closestElement = el; hitT = t; }
        });

        hitT = Math.round(hitT * 20) / 20;

        if (closestElement) {
            if (type === 'distributed') {
                onAddLoad({ id: Date.now().toString(), type: 'distributed', elementId: closestElement.id, magnitude: -5, direction: 'y' });
            } else {
                onAddLoad({ id: Date.now().toString(), type, elementId: closestElement.id, location: hitT, magnitude: type === 'point' ? -10 : 10, direction: 'y' });
            }
        }
    }, [interactive, toPx, nodes, elements, onAddLoad]);

    return (
        <div className="w-full h-full flex flex-col bg-slate-900 group">
            <div className="px-3 py-2 bg-slate-800 border-b border-slate-700 flex items-center justify-between shrink-0">
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">{title}</span>
            </div>
            <div className="flex-1 relative min-h-0 overflow-hidden">
                <svg ref={svgRef} viewBox={`0 0 ${transform.width} ${transform.height}`}
                    className={`w-full h-full block ${interactive ? 'cursor-crosshair' : ''}`}
                    preserveAspectRatio="xMidYMid meet"
                    onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}
                    onDragOver={onDragOver} onDrop={onDrop}>
                    <defs>
                        <marker id="arrowhead-load" markerWidth="10" markerHeight="10" refX="5" refY="5" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#ef4444" /></marker>
                        <marker id="arrowhead-moment" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 z" fill="#f97316" /></marker>
                        <marker id="arrowhead-load-dist" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 z" fill="#a855f7" /></marker>
                    </defs>
                    <pattern id={`grid-${mode}`} width="40" height="40" patternUnits="userSpaceOnUse">
                        <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1e293b" strokeWidth="1"/>
                    </pattern>
                    <rect width="100%" height="100%" fill={`url(#grid-${mode})`} />
                    {structureLayer}
                    {loadsLayer}
                    {resultsLayer}
                    {activeData && (() => {
                        const px = toPx(activeData.globalX, activeData.globalY);
                        let val = 0;
                        if(mode === 'M') val = activeData.moment * mScale;
                        if(mode === 'V') val = -activeData.shear * vScale;
                        if(mode === 'N') val = activeData.axial * nScale;
                        if(mode === 'D') val = -activeData.deflectionY * dScale;

                        const n1 = activeData.n1;
                        const n2 = activeData.n2;
                        const p1 = toPx(n1.x, n1.y);
                        const p2 = toPx(n2.x, n2.y);
                        const dx = p2.x - p1.x;
                        const dy = p2.y - p1.y;
                        const len = Math.sqrt(dx*dx+dy*dy) || 1;
                        const snx = -dy/len; 
                        const sny = dx/len;
                        const tipX = px.x + snx * val;
                        const tipY = px.y + sny * val;
                        let tx = tipX + 15;
                        let ty = tipY - 40;
                        if (tx + 180 > transform.width) tx = tipX - 190;
                        if (ty < 20) ty = tipY + 20;

                        return (
                            <g>
                                {!isEditor && Math.abs(val) > 1 && <line x1={px.x} y1={px.y} x2={tipX} y2={tipY} stroke="white" strokeDasharray="3 3" strokeOpacity="0.6" />}
                                <circle cx={px.x} cy={px.y} r={isEditor ? "5" : "3"} fill={isEditor ? "#fbbf24" : "white"} fillOpacity={isEditor ? "1" : "0.8"} stroke={isEditor ? "white" : "none"} strokeWidth={isEditor ? "2" : "0"} />
                                {!isEditor && <circle cx={tipX} cy={tipY} r="5" fill="#fbbf24" stroke="white" strokeWidth="2"/>}
                                {isEditor && (
                                    <g transform={`translate(${tx}, ${ty})`}>
                                        <rect x="0" y="0" width="160" height="110" rx="8" fill="#0f172a" stroke="#fbbf24" strokeWidth="1.5" className="shadow-2xl opacity-95" />
                                        <text x="10" y="20" fill="#fbbf24" fontSize="11" fontWeight="bold" letterSpacing="0.5">STRUCTURAL DATA</text>
                                        <line x1="10" y1="28" x2="150" y2="28" stroke="#334155" strokeWidth="1" />
                                        <g transform="translate(10, 45)">
                                            <text fill="#94a3b8" fontSize="11" fontWeight="bold">M:</text>
                                            <text x="140" textAnchor="end" fill="#60a5fa" fontSize="12" fontWeight="bold">{formatValue(activeData.moment)} kNm</text>
                                            <text y="18" fill="#94a3b8" fontSize="11" fontWeight="bold">V:</text>
                                            <text x="140" y="18" textAnchor="end" fill="#f43f5e" fontSize="12" fontWeight="bold">{formatValue(activeData.shear)} kN</text>
                                            <text y="36" fill="#94a3b8" fontSize="11" fontWeight="bold">N:</text>
                                            <text x="140" y="36" textAnchor="end" fill="#10b981" fontSize="12" fontWeight="bold">{formatValue(activeData.axial)} kN</text>
                                            <text y="54" fill="#94a3b8" fontSize="11" fontWeight="bold">δ:</text>
                                            <text x="140" y="54" textAnchor="end" fill="#c084fc" fontSize="12" fontWeight="bold">{formatValue(activeData.deflectionY)} mm</text>
                                        </g>
                                    </g>
                                )}
                            </g>
                        );
                    })()}
                </svg>
            </div>
        </div>
    );
});

interface StructureVisualizerProps {
  params: SolverParams;
  nodes: SolverNode[];
  elements: SolverElement[];
  results: AnalysisResult;
  loads: Load[]; 
  onAddLoad: (load: Load) => void;
}

const StructureVisualizer: React.FC<StructureVisualizerProps> = ({ params, nodes, elements, results, loads, onAddLoad }) => {
  const [activeLocation, setActiveLocation] = useState<{x: number, y: number} | null>(null);

  const transform = useMemo(() => {
      const xVals = nodes.map(n => n.x);
      const yVals = nodes.map(n => n.y);
      const minX = xVals.length ? Math.min(...xVals) : 0;
      const maxX = xVals.length ? Math.max(...xVals) : 10;
      const minY = yVals.length ? Math.min(...yVals) : 0;
      const maxY = yVals.length ? Math.max(...yVals) : 5;
      const structWidth = maxX - minX;
      const structHeight = maxY - minY;
      const safeWidth = Math.max(structWidth, 1.0); 
      const safeHeight = Math.max(structHeight, 1.0);
      const scaleX = (VIS_WIDTH - VIS_PADDING * 2) / safeWidth;
      const scaleY = (VIS_HEIGHT - VIS_PADDING * 2) / safeHeight;
      const scale = Math.min(scaleX, scaleY);
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      return { scale, cx, cy, width: VIS_WIDTH, height: VIS_HEIGHT };
  }, [nodes]);

  const maxValues = useMemo(() => ({
      m: results.elements.reduce((m, e) => Math.max(m, e.maxMoment), 0),
      v: results.elements.reduce((m, e) => Math.max(m, e.maxShear), 0),
      n: results.elements.reduce((m, e) => Math.max(m, e.maxAxial), 0),
      d: results.maxDeflection
  }), [results]);

  const viewProps = { nodes, elements, results, loads, transform, activeLocation, setActiveLocation, onAddLoad, maxValues, structureType: params.structureType };

  return (
      <div className="flex flex-col w-full max-w-6xl mx-auto h-full gap-2">
          <div className="flex-1 min-h-0 rounded-xl border border-slate-700 overflow-hidden shadow-sm relative">
              <DiagramView mode="Editor" title="结构模型 (Structure Model)" showLoads interactive {...viewProps} />
          </div>
          <div className="flex-1 min-h-0 grid grid-cols-2 grid-rows-2 gap-2">
              <div className="rounded-xl border border-slate-700 overflow-hidden shadow-sm relative">
                  <DiagramView mode="M" title="弯矩图 (Moment Diagram)" {...viewProps} />
              </div>
              <div className="rounded-xl border border-slate-700 overflow-hidden shadow-sm relative">
                  <DiagramView mode="V" title="剪力图 (Shear Diagram)" {...viewProps} />
              </div>
              <div className="rounded-xl border border-slate-700 overflow-hidden shadow-sm relative">
                  <DiagramView mode="N" title="轴力图 (Axial Force Diagram)" {...viewProps} />
              </div>
              <div className="rounded-xl border border-slate-700 overflow-hidden shadow-sm relative">
                  <DiagramView mode="D" title="变形图 (Deflection)" {...viewProps} />
              </div>
          </div>
      </div>
  );
};

export default StructureVisualizer;
