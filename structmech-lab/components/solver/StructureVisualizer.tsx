import { EngineeringSupport } from '../ui/EngineeringFigure';
import { solverSectionRight } from '../../utils/sectionEquilibrium';
import { getActiveAnalysis } from '../../utils/loadCases';
import { SectionEquilibrium } from '../ui/EquilibriumInspector';
import { scaleLoads } from '../../hooks/useQuasiStatic';
import { solverLoadAngle, globalLoadComponents } from '../../utils/loadDirection';
import { getLineLoadRange, isValidLineLoadRange } from '../../utils/lineLoads';
import React, { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import CanvasModelEditor, { type CanvasInteraction } from './CanvasModelEditor';
import { getActiveLoadCaseId, getLoadsForCase } from '../../utils/loadCases';
import { SolverParams, AnalysisResult, SolverNode, SolverElement, Load, StructureType, DiagramLayerSettings, type ResultSelection, type StiffnessType } from '../../types';
import { calculateExactValues, getDeflectionCorrectionRigidity } from '../../utils/solver';
import { ForceFlowControls, ForceFlowLayer, ForceFlowScope } from '../ui/ForceFlow';
import { solverFlowModel } from '../../utils/forceFlowModels';

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
    stiffnessType: StiffnessType;
    layers: DiagramLayerSettings;
    selectedResult?: ResultSelection | null;
    canvas?: CanvasInteraction;
    flowLoads?: Load[];
}

const formatValue = (val: number) => {
    if (Math.abs(val) < 0.005) return "0.00";
    return val.toFixed(2);
};

const DiagramView = React.memo(({ 
    mode, title, showLoads, interactive, nodes, elements, results, loads, transform,
    activeLocation, setActiveLocation, onAddLoad, maxValues, structureType, stiffnessType, layers, selectedResult, canvas, flowLoads
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
        const maxVisSize = 50 * layers.diagramScale;
        return {
            mScale: maxValues.m > 1e-6 ? maxVisSize / maxValues.m : 0,
            vScale: maxValues.v > 1e-6 ? maxVisSize / maxValues.v : 0,
            nScale: maxValues.n > 1e-6 ? maxVisSize / maxValues.n : 0,
            dScale: maxValues.d > 1e-6 ? maxVisSize / maxValues.d : 0
        };
    }, [maxValues, layers.diagramScale]);

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
                            stroke={isEditor ? "#9bb4ce" : "#334155"}
                            strokeWidth={isEditor ? 1.8 : 1.5} strokeLinecap="round"
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
                        {n.restraints.some(Boolean) && (() => {
                            const [rx,ry,rz]=n.restraints;
                            const kind=rx&&ry&&rz?'fixed':rx&&ry?'pinned':rz&&(rx||ry)?'guided':rz?'rotation':'roller';
                            const attached=elements.find(e=>e.startNode===n.id||e.endNode===n.id);
                            const other=nodes.find(v=>v.id===(attached?.startNode===n.id?attached.endNode:attached?.startNode));
                            const horizontal=other && Math.abs(other.x-n.x)>Math.abs(other.y-n.y);
                            const rotation=kind==='fixed'&&horizontal?(other.x>n.x?90:-90):!ry&&rx?-90:0;
                            return <EngineeringSupport x={0} y={0} kind={kind} rotation={rotation} ink="#9bb4ce" paper="#0f172a"/>;
                        })()}
                        <circle r={isTruss ? 3.2 : 2.8} fill={isTruss ? "#0f172a" : "#c6d6e7"} stroke="#9bb4ce" strokeWidth="1.1" />
                        <text x="8" y="-8" fill="#a9bbce" fontSize="10" fontWeight="500" stroke="#0f172a" strokeWidth="3" paintOrder="stroke">{n.id}</text>
                    </g>
                )
            })}
        </g>
    ), [elements, nodes, isEditor, toPx, isTruss]);

    const loadsLayer = useMemo(() => {
        if (!showLoads) return null;
        return loads.map((load, i) => {
            const key = load.id || `load-${i}`;
            const vector = globalLoadComponents({ ...load, magnitude: 1 });
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
            if ((load.type === 'point' || load.type === 'moment') && Math.abs(load.magnitude) < 1e-8) return <g key={key}><circle cx={p.x} cy={p.y} r="2" fill="#94a3b8"/><text x={p.x+5} y={p.y-8} fill="#94a3b8" fontSize="10">0</text></g>;

            if (load.type === 'point') {
                const rot = -solverLoadAngle(load) - 90;
                return (
                    <g key={key} transform={`translate(${p.x}, ${p.y}) rotate(${rot})`}>
                        <line x1="0" y1="-25" x2="0" y2="-2" stroke="#ef4444" strokeWidth="2" markerEnd="url(#arrowhead-load)" />
                        <text x="5" y="-25" fill="#ef4444" fontSize="12" fontWeight="bold" transform={`rotate(${-rot})`}>{Number(Math.abs(load.magnitude).toFixed(3))}</text>
                    </g>
                );
            }
            if (load.type === 'moment') {
                const isCCW = load.magnitude > 0;
                return (
                    <g key={key} transform={`translate(${p.x}, ${p.y})`}>
                        <path d={isCCW ? "M 12 0 A 12 12 0 1 0 0 -12" : "M 12 0 A 12 12 0 1 1 0 -12"} fill="none" stroke="#f97316" strokeWidth="2" markerEnd="url(#arrowhead-moment)" />
                        <text x="14" y="-14" fill="#f97316" fontSize="12" fontWeight="bold">{Number(Math.abs(load.magnitude).toFixed(3))}</text>
                    </g>
                );
            }
            if ((load.type === 'distributed' || load.type === 'trapezoidal') && load.elementId) {
                const el = elements.find(e => e.id === load.elementId);
                if (!el) return null;
                const n1 = nodes.find(n => n.id === el.startNode);
                const n2 = nodes.find(n => n.id === el.endNode);
                if(!n1||!n2) return null;
                if (!isValidLineLoadRange(load)) return null;
                const range = getLineLoadRange(load);
                const p1 = toPx(n1.x + (n2.x - n1.x) * range.start, n1.y + (n2.y - n1.y) * range.start);
                const p2 = toPx(n1.x + (n2.x - n1.x) * range.end, n1.y + (n2.y - n1.y) * range.end);
                const dx = p2.x - p1.x;
                const dy = p2.y - p1.y;
                const L = Math.sqrt(dx*dx+dy*dy);
                const count = Math.max(2, Math.floor(L/20));
                const endMagnitude = load.type === 'trapezoidal' ? load.magnitudeEnd ?? load.magnitude : load.magnitude;
                const arrows = [];
                for(let k=0; k<=count; k++){
                    const t = k/count;
                    const lx = p1.x+t*dx;
                    const ly = p1.y+t*dy;
                    const magnitudeAt = load.magnitude + (endMagnitude - load.magnitude) * t;
                    const sign = Math.sign(magnitudeAt);
                    const maxMagnitude = Math.max(Math.abs(load.magnitude), Math.abs(endMagnitude), 1);
                    const al = 6 + 14 * Math.abs(magnitudeAt) / maxMagnitude;
                    const ax1 = lx - vector.x * sign * al, ay1 = ly + vector.y * sign * al, ax2 = lx, ay2 = ly;
                    if (!sign) continue;
                    arrows.push(<line key={k} x1={ax1} y1={ay1} x2={ax2} y2={ay2} stroke={load.type === 'trapezoidal' ? '#d946ef' : '#a855f7'} strokeWidth="1" markerEnd="url(#arrowhead-load-dist)"/>);
                }
                const color = load.type === 'trapezoidal' ? '#d946ef' : '#a855f7';
                const offset = (magnitude: number) => (magnitude > 0 ? 1 : -1) * (6 + 14 * Math.abs(magnitude) / Math.max(Math.abs(load.magnitude), Math.abs(endMagnitude), 1));
                return <g key={key} data-load-id={load.id}>
                    {arrows}
                    <line x1={p1.x - vector.x * offset(load.magnitude)} y1={p1.y + vector.y * offset(load.magnitude)}
                        x2={p2.x - vector.x * offset(endMagnitude)} y2={p2.y + vector.y * offset(endMagnitude)} stroke={color} strokeWidth="1" />
                    <text x={(p1.x + p2.x) / 2 - vector.x * 26} y={(p1.y + p2.y) / 2 + vector.y * 26 - 5} fill={color} fontSize="10" textAnchor="middle">
                        {load.type === 'trapezoidal' ? `${Number(Math.abs(load.magnitude).toFixed(3))}～${Math.abs(endMagnitude)}` : Math.abs(load.magnitude)} kN/m
                    </text>
                </g>;
            }
            return null;
        });
    }, [loads, nodes, elements, showLoads, toPx]);


    const reactionsLayer = useMemo(() => {
        if (!isEditor || !layers.reactions) return null;
        return results.reactions.map(r => {
            const n = nodes.find(nd => nd.id === r.nodeId);
            if (!n) return null;
            const p = toPx(n.x, n.y);
            const arrowLen = 30;
            const items: React.ReactNode[] = [];
            if (Math.abs(r.fx) > 0.01) {
                const dir = r.fx > 0 ? 1 : -1;
                items.push(
                    <g key={`rx-${r.nodeId}`}>
                        <line x1={p.x - dir * arrowLen} y1={p.y} x2={p.x - dir * 4} y2={p.y} stroke="#22d3ee" strokeWidth="2" markerEnd="url(#arrowhead-reaction)" />
                        <text x={p.x - dir * arrowLen - dir * 5} y={p.y - 5} fill="#22d3ee" fontSize="9" fontWeight="bold" textAnchor={dir > 0 ? 'end' : 'start'}>{Math.abs(r.fx).toFixed(1)}</text>
                    </g>
                );
            }
            if (Math.abs(r.fy) > 0.01) {
                const dir = r.fy > 0 ? -1 : 1;
                items.push(
                    <g key={`ry-${r.nodeId}`}>
                        <line x1={p.x} y1={p.y + dir * arrowLen} x2={p.x} y2={p.y + dir * 4} stroke="#22d3ee" strokeWidth="2" markerEnd="url(#arrowhead-reaction)" />
                        <text x={p.x + 8} y={p.y + dir * arrowLen + dir * 5} fill="#22d3ee" fontSize="9" fontWeight="bold" textAnchor="start">{Math.abs(r.fy).toFixed(1)}</text>
                    </g>
                );
            }
            if (Math.abs(r.m) > 0.01) {
                const isCCW = r.m > 0;
                items.push(
                    <g key={`rm-${r.nodeId}`}>
                        <path d={isCCW ? `M ${p.x+14} ${p.y} A 14 14 0 1 0 ${p.x} ${p.y-14}` : `M ${p.x+14} ${p.y} A 14 14 0 1 1 ${p.x} ${p.y-14}`} fill="none" stroke="#22d3ee" strokeWidth="1.5" markerEnd="url(#arrowhead-reaction)" />
                        <text x={p.x + 18} y={p.y - 16} fill="#22d3ee" fontSize="9" fontWeight="bold">{Math.abs(r.m).toFixed(1)}</text>
                    </g>
                );
            }
            return items.length > 0 ? <g key={`react-${r.nodeId}`}>{items}</g> : null;
        });
    }, [isEditor, layers.reactions, results.reactions, nodes, toPx]);

    const selectionLayer = useMemo(() => {
        if (!selectedResult) return null;

        const markers: React.ReactNode[] = [];
        let labelPoint: { x: number; y: number } | null = null;

        if (selectedResult.elementId !== undefined) {
            const el = elements.find(item => item.id === selectedResult.elementId);
            const n1 = el ? nodes.find(node => node.id === el.startNode) : null;
            const n2 = el ? nodes.find(node => node.id === el.endNode) : null;
            if (el && n1 && n2) {
                const p1 = toPx(n1.x, n1.y);
                const p2 = toPx(n2.x, n2.y);
                markers.push(
                    <line
                        key="selected-element"
                        x1={p1.x}
                        y1={p1.y}
                        x2={p2.x}
                        y2={p2.y}
                        stroke="#22d3ee"
                        strokeWidth="6"
                        strokeOpacity="0.75"
                        strokeLinecap="round"
                        vectorEffect="non-scaling-stroke"
                    />,
                );
                labelPoint = selectedResult.globalX !== undefined && selectedResult.globalY !== undefined
                    ? toPx(selectedResult.globalX, selectedResult.globalY)
                    : { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
                markers.push(
                    <g key="selected-station">
                        <line x1={labelPoint.x - 8} y1={labelPoint.y} x2={labelPoint.x + 8} y2={labelPoint.y} stroke="#e0f2fe" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                        <line x1={labelPoint.x} y1={labelPoint.y - 8} x2={labelPoint.x} y2={labelPoint.y + 8} stroke="#e0f2fe" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                        <circle cx={labelPoint.x} cy={labelPoint.y} r="6" fill="#0891b2" stroke="#e0f2fe" strokeWidth="2" />
                    </g>,
                );
            }
        } else if (selectedResult.nodeId !== undefined) {
            const node = nodes.find(item => item.id === selectedResult.nodeId);
            if (node) {
                labelPoint = toPx(node.x, node.y);
                markers.push(
                    <g key="selected-node">
                        <circle cx={labelPoint.x} cy={labelPoint.y} r="11" fill="#0891b2" fillOpacity="0.35" stroke="#e0f2fe" strokeWidth="2.5" />
                        <circle cx={labelPoint.x} cy={labelPoint.y} r="4" fill="#e0f2fe" />
                    </g>,
                );
            }
        }

        if (!labelPoint || markers.length === 0) return null;

        const labelX = Math.min(transform.width - 120, Math.max(8, labelPoint.x + 10));
        const labelY = Math.max(18, labelPoint.y - 12);

        return (
            <g pointerEvents="none">
                {markers}
                <text
                    x={labelX}
                    y={labelY}
                    fill="#cffafe"
                    fontSize="10"
                    fontWeight="bold"
                    stroke="#0f172a"
                    strokeWidth="3"
                    paintOrder="stroke"
                >
                    {selectedResult.label}
                </text>
            </g>
        );
    }, [selectedResult, elements, nodes, toPx, transform.width]);

    const resultsLayer = useMemo(() => {
        if (isEditor) return null;
        const paths: React.ReactNode[] = [];
        const labels: React.ReactNode[] = [];
        let deflectionPeak: {
            value: number;
            point: { x: number; y: number };
        } | null = null;

        results.elements.forEach(res => {
            const el = elements.find(e => e.id === res.elementId);
            if (!el) return;
            const n1 = nodes.find(n => n.id === el.startNode);
            const n2 = nodes.find(n => n.id === el.endNode);
            if (!n1 || !n2) return;

            const start = toPx(n1.x, n1.y);
            const end = toPx(n2.x, n2.y);
            const dx = end.x - start.x;
            const dy = end.y - start.y;
            const ndy = dy / (Math.sqrt(dx*dx + dy*dy) || 1);
            const ndx = dx / (Math.sqrt(dx*dx + dy*dy) || 1);
            const snx = -ndy; 
            const sny = ndx;
            const worldDx = n2.x - n1.x;
            const worldDy = n2.y - n1.y;
            const elLen = Math.sqrt(worldDx * worldDx + worldDy * worldDy);
            const c = elLen > 0 ? worldDx / elLen : 1;
            const s = elLen > 0 ? worldDy / elLen : 0;
            const deflectionMagnifier = maxValues.d > 1e-6
                ? (50 * layers.diagramScale) / ((maxValues.d / 1000) * transform.scale)
                : 0;

            const deformedPoint = (x: number, deflectionY: number) => {
                const xi = elLen > 1e-9 ? x / elLen : 0;
                const uAxial = (1 - xi) * res.u_local[0] + xi * res.u_local[3];
                const vLocal = deflectionY / 1000;
                const dispX = c * uAxial - s * vLocal;
                const dispY = s * uAxial + c * vLocal;
                return toPx(
                    n1.x + c * x + dispX * deflectionMagnifier,
                    n1.y + s * x + dispY * deflectionMagnifier,
                );
            };

            let path = `M ${start.x} ${start.y}`;
            let color = "#3b82f6";
            let fillOp = 0.4;

            let peakVal = 0;
            let peakPx = { x: 0, y: 0 };
            let peakTipPx = { x: 0, y: 0 };

            res.stations.forEach((st, i) => {
                let val = 0;
                if(mode === 'M') { val = st.moment * mScale; color = "#3b82f6"; } 
                if(mode === 'V') { val = -st.shear * vScale; color = "#f43f5e"; } 
                if(mode === 'N') { val = st.axial * nScale; color = "#10b981"; }
                if(mode === 'D') { val = -st.deflectionY * dScale; color = "#a855f7"; fillOp = 0; }

                const t = elLen > 0 ? st.x / elLen : 0;
                const defPoint = mode === 'D' ? deformedPoint(st.x, st.deflectionY) : null;
                const px = defPoint ? defPoint.x : start.x + dx * t + snx * val;
                const py = defPoint ? defPoint.y : start.y + dy * t + sny * val;
                
                if (i === 0) path = `M ${px} ${py}`;
                else path += ` L ${px} ${py}`;

                let rawVal = 0;
                if(mode === 'M') rawVal = st.moment;
                if(mode === 'V') rawVal = st.shear;
                if(mode === 'N') rawVal = st.axial;
                if(mode === 'D') rawVal = st.deflectionY;
                if (Math.abs(rawVal) > Math.abs(peakVal)) {
                    peakVal = rawVal;
                    peakPx = { x: start.x + dx * t, y: start.y + dy * t };
                    peakTipPx = { x: px, y: py };
                }
                if (mode === 'D' && Math.abs(rawVal) > Math.abs(deflectionPeak?.value ?? 0)) {
                    deflectionPeak = { value: rawVal, point: { x: px, y: py } };
                }
            });

            if (mode !== 'D') path += ` L ${end.x} ${end.y} L ${start.x} ${start.y} Z`;
            paths.push(<path key={`p-${el.id}`} d={path} fill={color} fillOpacity={fillOp} stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />);

            if (layers.labels && mode !== 'D' && Math.abs(peakVal) > 0.01) {
                const unit = mode === 'M' ? 'kNm' : 'kN';
                const labelOffX = peakTipPx.x < 100 ? 6 : peakTipPx.x > VIS_WIDTH - 100 ? -6 : snx > 0 ? 6 : -6;
                const labelOffY = sny > 0 ? -4 : 12;
                const anchor = peakTipPx.x < 100 ? 'start' : peakTipPx.x > VIS_WIDTH - 100 ? 'end' : snx > 0 ? 'start' : 'end';
                labels.push(
                    <g key={`lbl-${el.id}`}>
                        <circle cx={peakTipPx.x} cy={peakTipPx.y} r="2.5" fill={color} />
                        <text x={peakTipPx.x + labelOffX} y={peakTipPx.y + labelOffY} fill={color} fontSize="9" fontWeight="bold" textAnchor={anchor} stroke="#0f172a" strokeWidth="3" paintOrder="stroke">{peakVal.toFixed(2)} {unit}</text>
                    </g>
                );
            }
        });

        if (layers.labels && mode === 'D' && deflectionPeak && Math.abs(deflectionPeak.value) > 0.005) {
            labels.push(
                <g key="deflection-global-label">
                    <circle cx={deflectionPeak.point.x} cy={deflectionPeak.point.y} r="3" fill="#a855f7" stroke="white" strokeWidth="1.5" />
                    <text
                        x={deflectionPeak.point.x + (deflectionPeak.point.x > VIS_WIDTH - 120 ? -8 : 8)}
                        textAnchor={deflectionPeak.point.x > VIS_WIDTH - 120 ? 'end' : 'start'}
                        y={deflectionPeak.point.y - 8}
                        fill="#c084fc"
                        fontSize="10"
                        fontWeight="bold"
                        stroke="#0f172a"
                        strokeWidth="3"
                        paintOrder="stroke"
                    >
                        δmax {deflectionPeak.value.toFixed(2)} mm
                    </text>
                </g>
            );
        }

        return <>{paths}{labels}</>;
    }, [isEditor, mode, results, elements, nodes, toPx, mScale, vScale, nScale, dScale, layers.labels, layers.diagramScale, maxValues.d, transform.scale]);

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
        const flexuralRigidity = getDeflectionCorrectionRigidity(closestEl, stiffnessType);
        const exactValues = calculateExactValues(targetLocalX, length, c, s, resultEl.u_local, resultEl.startForces, elLoads, flexuralRigidity);

        return {
            elementId: closestEl.id, t: closestT,
            globalX: n1.x + closestT * dx, globalY: n1.y + closestT * dy,
            moment: exactValues.moment, shear: exactValues.shear,
            axial: exactValues.axial, deflectionY: exactValues.deflectionY,
            n1, n2, length
        };
    }, [activeLocation, results, nodes, elements, loads, stiffnessType]);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        // Dragging already updates the canvas per frame; suspend linked hover probes.
        if (!svgRef.current || (canvas && e.buttons !== 0)) return;
        const rect = svgRef.current.getBoundingClientRect();
        const ratio = Math.min(rect.width / transform.width, rect.height / transform.height);
        if (!ratio) return;
        setActiveLocation(toWorld(
            (e.clientX - rect.left - (rect.width - transform.width * ratio) / 2) / ratio,
            (e.clientY - rect.top - (rect.height - transform.height * ratio) / 2) / ratio,
        ));
    }, [transform, toWorld, setActiveLocation, canvas]);

    const handleMouseLeave = useCallback(() => {
        setActiveLocation(null);
    }, [setActiveLocation]);

    const onDragOver = useCallback((e: React.DragEvent) => {
        if(!interactive) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
    }, [interactive]);

    const onDrop = useCallback((e: React.DragEvent) => {
        if(!interactive || !svgRef.current) return;
        e.preventDefault();
        const type = e.dataTransfer.getData('loadType') as Load['type'];
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
            } else if (type === 'trapezoidal') {
                onAddLoad({ id: Date.now().toString(), type: 'trapezoidal', elementId: closestElement.id, magnitude: 0, magnitudeEnd: -8, direction: 'y' });
            } else {
                onAddLoad({ id: Date.now().toString(), type, elementId: closestElement.id, location: hitT, magnitude: type === 'point' ? -10 : 10, direction: 'y' });
            }
        }
    }, [interactive, toPx, nodes, elements, onAddLoad]);

    return (
        <div className="w-full h-full flex flex-col bg-slate-900 group">
            {!canvas && <div className="px-3 py-2 bg-slate-800 border-b border-slate-700 flex items-center justify-between shrink-0">
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">{title}</span>
            </div>}
            <div className="flex-1 relative min-h-0 overflow-hidden">
                <svg ref={svgRef} aria-label={isEditor ? undefined : title} viewBox={`0 0 ${transform.width} ${transform.height}`}
                    className={`w-full h-full block ${interactive ? 'cursor-crosshair' : ''}`}
                    preserveAspectRatio="xMidYMid meet"
                    onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}
                    onDragOver={onDragOver} onDrop={onDrop} {...canvas?.svgProps}>
                    <defs>
                        <marker id="arrowhead-load" markerWidth="10" markerHeight="10" refX="5" refY="5" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#ef4444" /></marker>
                        <marker id="arrowhead-moment" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 z" fill="#f97316" /></marker>
                        <marker id="arrowhead-load-dist" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 z" fill="#a855f7" /></marker>
                        <marker id="arrowhead-reaction" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#22d3ee" /></marker>
                    </defs>
                    {!canvas && layers.grid && (
                        <>
                            <pattern id={`grid-${mode}`} width="40" height="40" patternUnits="userSpaceOnUse">
                                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1e293b" strokeWidth="1"/>
                            </pattern>
                            <rect width="100%" height="100%" fill={`url(#grid-${mode})`} />
                        </>
                    )}
                    {canvas?.background}
                    {structureLayer}
                    {isEditor && !canvas?.previewNodes && <ForceFlowLayer model={solverFlowModel(nodes, elements, flowLoads ?? loads, results, toPx)} />}
                    {!canvas?.previewNodes && reactionsLayer}
                    {loadsLayer}
                    {resultsLayer}
                    {selectionLayer}
                    {canvas?.overlay}
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
                            <g data-linked-section={activeData.elementId} pointerEvents={canvas ? "none" : undefined}>
                                {!isEditor && Math.abs(val) > 1 && <line x1={px.x} y1={px.y} x2={tipX} y2={tipY} stroke="white" strokeDasharray="3 3" strokeOpacity="0.6" />}
                                <circle cx={px.x} cy={px.y} r={isEditor ? "5" : "3"} fill={isEditor ? "#fbbf24" : "white"} fillOpacity={isEditor ? "1" : "0.8"} stroke={isEditor ? "white" : "none"} strokeWidth={isEditor ? "2" : "0"} />
                                {!isEditor && <circle cx={tipX} cy={tipY} r="5" fill="#fbbf24" stroke="white" strokeWidth="2"/>}
                                {isEditor && !canvas && (
                                    <g transform={`translate(${tx}, ${ty})`}>
                                        <rect x="0" y="0" width="160" height="110" rx="8" fill="#0f172a" stroke="#fbbf24" strokeWidth="1.5" className="shadow-2xl opacity-95" />
                                        <text x="10" y="20" fill="#fbbf24" fontSize="11" fontWeight="bold" letterSpacing="0.5">截面内力</text>
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
  loadFactor?: number;
  referenceResult?: AnalysisResult | null;
  view?: 'analysis' | 'hidden';
  params: SolverParams;
  setParams: React.Dispatch<React.SetStateAction<SolverParams>>;
  nodes: SolverNode[];
  elements: SolverElement[];
  results: AnalysisResult;
  loads: Load[]; 
  onAddLoad: (load: Load) => void;
  layers: DiagramLayerSettings;
  selectedResult?: ResultSelection | null;
}

const StructureVisualizer: React.FC<StructureVisualizerProps> = ({ referenceResult, loadFactor = 1, view = 'analysis', params, setParams, nodes, elements, results, loads, onAddLoad, layers, selectedResult }) => {
  const [activeLocation, setActiveLocation] = useState<{x: number, y: number} | null>(null);
  const [focusedDiagram, setFocusedDiagram] = useState<'all' | 'M' | 'V' | 'N' | 'D'>('all');
  useEffect(() => { if (selectedResult) setFocusedDiagram('all'); }, [selectedResult]);

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

  const referenceMaxValues = useMemo(() => referenceResult ? { m: Math.max(0,...referenceResult.elements.map(e=>e.maxMoment)), v:Math.max(0,...referenceResult.elements.map(e=>e.maxShear)), n:Math.max(0,...referenceResult.elements.map(e=>e.maxAxial)), d:referenceResult.maxDeflection } : maxValues,[referenceResult,maxValues]);
  const viewProps = useMemo(() => ({
    nodes, elements, results, loads, flowLoads: loads, transform, activeLocation, setActiveLocation, onAddLoad, maxValues: referenceMaxValues, structureType: params.structureType, stiffnessType: params.stiffnessType, layers, selectedResult
  }), [nodes, elements, results, loads, transform, activeLocation, setActiveLocation, onAddLoad, referenceMaxValues, params.structureType, params.stiffnessType, layers, selectedResult]);

  const resultViews = [
    layers.moment ? { mode: 'M' as const, title: `弯矩 M · ${maxValues.m.toFixed(2)} kN·m` } : null,
    layers.shear ? { mode: 'V' as const, title: `剪力 V · ${maxValues.v.toFixed(2)} kN` } : null,
    layers.axial ? { mode: 'N' as const, title: `轴力 N · ${maxValues.n.toFixed(2)} kN` } : null,
    layers.deflection ? { mode: 'D' as const, title: `变形 δ · ${maxValues.d.toFixed(4)} mm` } : null,
  ].filter(Boolean) as { mode: 'M' | 'V' | 'N' | 'D'; title: string }[];

  // A single params/results pair drives the editor and every result figure.
  const visibleViews = focusedDiagram === 'all' ? resultViews : resultViews.filter(item => item.mode === focusedDiagram);

  return (
      <div id="workspace-analysis" hidden={view === 'hidden'} role="tabpanel" aria-labelledby="workspace-tab-analysis" className={view === 'hidden' ? 'hidden' : 'solver-linked-workspace'}>
          <section aria-label="结构建模" className="solver-model-column">
            <div className="solver-column-heading"><h2>结构模型</h2><details className="solver-display-popover"><summary>光效与加载</summary><div className="solver-display-popover-body"><ForceFlowControls compact /></div></details></div>
            <div className="solver-model-content">
              {getActiveAnalysis(params).type === 'combination' ? <div className="flex min-h-0 flex-1 flex-col"><p className="px-3 py-2 text-xs text-slate-400">组合工况预览 · 切回单工况编辑荷载</p><DiagramView mode="Editor" title="组合荷载 · 当前加载比例" showLoads={layers.loads} {...viewProps}/></div> : <CanvasModelEditor params={params} onChange={setParams} showLoads={layers.loads} showGrid={layers.grid} renderCanvas={canvas => (
                  <DiagramView mode="Editor" title="结构模型 · 点击与拖动绘制" showLoads={layers.loads} interactive {...viewProps}
                      nodes={canvas.previewNodes ?? nodes} loads={scaleLoads(getLoadsForCase(params.loads, getActiveLoadCaseId(params)),loadFactor)} transform={canvas.viewport} canvas={canvas} />
              )} />}
            </div>
          </section>
          <section aria-label="内力与变形图" className="solver-result-column">
            <div className="solver-column-heading solver-results-heading"><h2>内力与变形</h2><span className={results.error ? 'text-amber-300' : 'text-cyan-300'}>{elements.length === 0 ? '等待建模' : results.error ? '检查模型约束' : '与模型联动'}</span>
            <div className="solver-diagram-filter" role="group" aria-label="显示结果图">
              {([{ mode: 'all', label: '全部' }, { mode: 'M', label: '弯矩 M' }, { mode: 'V', label: '剪力 V' }, { mode: 'N', label: '轴力 N' }, { mode: 'D', label: '变形 δ' }] as const).map(item => (
                <button key={item.mode} type="button" aria-pressed={focusedDiagram === item.mode} disabled={elements.length === 0} onClick={() => setFocusedDiagram(item.mode)}>{item.label}</button>
              ))}
            </div>
            </div>
            <div className={`solver-linked-diagrams ${visibleViews.length <= 1 || elements.length === 0 ? 'is-single' : ''}`}>
              {elements.length === 0 ? (
                <div className="solver-diagram-empty solver-diagram-waiting"><strong>建立模型后显示计算结果</strong><span>画杆件 → 放支座 → 加荷载</span><p>内力与变形图会随模型自动更新。</p></div>
              ) : visibleViews.length === 0 ? (
                <div className="solver-diagram-empty">{focusedDiagram === 'all' ? '已隐藏全部结果图层' : '此结果图层已隐藏，请在模型配置中开启。'}</div>
              ) : visibleViews.map(item => (
                <div key={item.mode} className="solver-linked-diagram" data-diagram-mode={item.mode}>
                  <DiagramView mode={item.mode} title={item.title} {...viewProps} />
                </div>
              ))}
            </div>
            {!results.error && results.elements.length > 0 && <div className="solver-equilibrium-panel"><SectionEquilibrium defaultOpen={false} members={results.elements.flatMap(solved => {
              const el=elements.find(e=>e.id===solved.elementId), a=nodes.find(n=>n.id===el?.startNode), b=nodes.find(n=>n.id===el?.endNode);
              if(!el||!a||!b)return [];
              return [{ id:String(el.id),label:`杆件 E${el.id}`,length:Math.hypot(b.x-a.x,b.y-a.y),at:(t:number)=>solverSectionRight(el,a,b,solved,loads,t) }];
            })} /></div>}
          </section>
      </div>
  );
};

export default StructureVisualizer;
