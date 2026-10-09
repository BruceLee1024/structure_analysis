import { globalLoadComponents } from './loadDirection';
import { getLineLoadRange, integrateInterval, isValidLineLoadRange } from './lineLoads';
import type { AnalysisResult, Load, ModelIssue, SolverElement, SolverNode } from '../types';
import type { ResultExtrema } from './resultExtrema';
import { summarizeIssues } from './modelValidation';

export interface EquilibriumResidual {
  extFx: number;
  extFy: number;
  extM: number;
  reactFx: number;
  reactFy: number;
  reactM: number;
  sumFx: number;
  sumFy: number;
  sumM: number;
  fxOk: boolean;
  fyOk: boolean;
  mOk: boolean;
  allOk: boolean;
  maxResidual: number; // Dimensionless maximum normalized residual.
  forceTolerance: number;
  momentTolerance: number;
}

export interface SolverDiagnosticSummary {
  modelStatus: 'error' | 'warning' | 'ok';
  modelText: string;
  demandText: string;
  deflectionText: string;
  equilibriumText: string;
  deflectionRatio: number | null;
  equilibrium: EquilibriumResidual;
}

const cleanValue = (value: number) => (Math.abs(value) < 1e-9 ? 0 : value);

export function computeEquilibriumResidual(
  results: AnalysisResult,
  nodes: SolverNode[],
  loads: Load[],
  elements: SolverElement[],
  tolerance = 1e-3,
): EquilibriumResidual {
  let extFx = 0;
  let extFy = 0;
  let extM = 0;
  const refX = 0;
  const refY = 0;

  loads.forEach(load => {
    if (load.nodeId !== undefined) {
      const node = nodes.find(item => item.id === load.nodeId);
      if (!node) return;

      if (load.type === 'moment') {
        extM += load.magnitude;
        return;
      }

      const force = globalLoadComponents(load);
      extFx += force.x; extFy += force.y;
      extM += force.y * (node.x - refX) - force.x * (node.y - refY);
      return;
    }

    if (load.elementId === undefined) return;

    const element = elements.find(item => item.id === load.elementId);
    if (!element) return;
    const start = nodes.find(item => item.id === element.startNode);
    const end = nodes.find(item => item.id === element.endNode);
    if (!start || !end) return;

    if (load.type === 'moment') {
      extM += load.magnitude;
      return;
    }

    const unit = globalLoadComponents({ ...load, magnitude: 1 });
    if (load.type === 'distributed' || load.type === 'trapezoidal') {
      if (!isValidLineLoadRange(load)) return;
      const length = Math.hypot(end.x - start.x, end.y - start.y);
      const w1 = load.magnitude;
      const w2 = load.type === 'trapezoidal' ? load.magnitudeEnd ?? load.magnitude : load.magnitude;
      const range = getLineLoadRange(load);
      const loadedLength = (range.end - range.start) * length;
      const totalForce = (w1 + w2) * loadedLength / 2;
      // Integrate the first moment directly so opposite-sign intensities with
      // zero resultant still retain their external couple.
      const firstMoment = integrateInterval(range.start, range.end, t => {
        const w = w1 + (w2 - w1) * (t - range.start) / (range.end - range.start);
        return w * length * (unit.y * (start.x + t * (end.x - start.x) - refX) - unit.x * (start.y + t * (end.y - start.y) - refY));
      });
      extFx += totalForce * unit.x;
      extFy += totalForce * unit.y;
      extM += firstMoment;
      return;
    }

    const location = load.location ?? 0.5;
    const x = start.x + location * (end.x - start.x);
    const y = start.y + location * (end.y - start.y);

    extFx += load.magnitude * unit.x;
    extFy += load.magnitude * unit.y;
    extM += load.magnitude * (unit.y * (x - refX) - unit.x * (y - refY));
  });

  let reactFx = 0;
  let reactFy = 0;
  let reactM = 0;
  results.reactions.forEach(reaction => {
    reactFx += reaction.fx;
    reactFy += reaction.fy;
    reactM += reaction.m;
    const node = nodes.find(item => item.id === reaction.nodeId);
    if (node) {
      reactM += -reaction.fx * (node.y - refY) + reaction.fy * (node.x - refX);
    }
  });

  const sumFx = cleanValue(extFx + reactFx);
  const sumFy = cleanValue(extFy + reactFy);
  const sumM = cleanValue(extM + reactM);
  const radius = Math.max(1,...nodes.map(n=>Math.hypot(n.x-refX,n.y-refY)));
  const loadScale = loads.reduce((sum,l)=>{
    if(l.type==='moment')return sum;
    const el=elements.find(e=>e.id===l.elementId),a=nodes.find(n=>n.id===el?.startNode),b=nodes.find(n=>n.id===el?.endNode);
    const L=a&&b?Math.hypot(b.x-a.x,b.y-a.y):1;
    return sum + Math.max(Math.abs(l.magnitude),Math.abs(l.magnitudeEnd??l.magnitude))*(l.type==='distributed'||l.type==='trapezoidal'?L:1);
  },0);
  const forceScale=Math.max(1,loadScale,results.reactions.reduce((sum,r)=>sum+Math.abs(r.fx)+Math.abs(r.fy),0));
  const momentScale=forceScale*radius+loads.filter(l=>l.type==='moment').reduce((sum,l)=>sum+Math.abs(l.magnitude),0);
  // Separate force and moment units. Absolute floors account for rounded solver output.
  const forceTolerance=tolerance+1e-7*forceScale, momentTolerance=tolerance*radius+1e-7*momentScale;
  const maxResidual=Math.max(Math.abs(sumFx)/forceTolerance,Math.abs(sumFy)/forceTolerance,Math.abs(sumM)/momentTolerance);

  return {
    extFx: cleanValue(extFx),
    extFy: cleanValue(extFy),
    extM: cleanValue(extM),
    reactFx: cleanValue(reactFx),
    reactFy: cleanValue(reactFy),
    reactM: cleanValue(reactM),
    sumFx,
    sumFy,
    sumM,
    fxOk: Math.abs(sumFx) <= forceTolerance,
    fyOk: Math.abs(sumFy) <= forceTolerance,
    mOk: Math.abs(sumM) <= momentTolerance,
    allOk: maxResidual <= 1,
    maxResidual, forceTolerance, momentTolerance,
  };
}

function getRepresentativeSpan(nodes: SolverNode[], elements: SolverElement[]) {
  return elements.reduce((maxLength, element) => {
    const start = nodes.find(node => node.id === element.startNode);
    const end = nodes.find(node => node.id === element.endNode);
    if (!start || !end) return maxLength;
    return Math.max(maxLength, Math.hypot(end.x - start.x, end.y - start.y));
  }, 0);
}

export function buildSolverDiagnosticSummary(input: {
  results: AnalysisResult;
  nodes: SolverNode[];
  elements: SolverElement[];
  loads: Load[];
  extrema: ResultExtrema;
  issues: ModelIssue[];
}): SolverDiagnosticSummary {
  const { results, nodes, elements, loads, extrema, issues } = input;
  const issueSummary = summarizeIssues(issues);
  const modelStatus = issueSummary.errors > 0 ? 'error' : issueSummary.warnings > 0 ? 'warning' : 'ok';
  const modelText = modelStatus === 'error'
    ? `${issueSummary.errors} 个错误需要修正`
    : modelStatus === 'warning'
      ? `${issueSummary.warnings} 个警告，建议复核`
      : '模型检查通过';

  const demandText = extrema.moment
    ? `弯矩控制：E${extrema.moment.elementId}，x=${extrema.moment.x.toFixed(2)} m，${extrema.moment.value.toFixed(2)} kN·m`
    : '暂无内力控制项';

  const representativeSpan = getRepresentativeSpan(nodes, elements);
  const deflectionLimit = representativeSpan > 0 ? representativeSpan * 1000 / 250 : null;
  const deflectionValue = Math.abs(extrema.deflection?.value ?? results.maxDeflection ?? 0);
  const deflectionRatio = deflectionLimit ? deflectionValue / deflectionLimit : null;
  const deflectionText = extrema.deflection
    ? extrema.deflection.elementId !== undefined && extrema.deflection.x !== undefined
      ? `位移控制：E${extrema.deflection.elementId}，x=${extrema.deflection.x.toFixed(2)} m，${extrema.deflection.value.toFixed(4)} mm`
      : `位移控制：N${extrema.deflection.nodeId} ${extrema.deflection.component} = ${extrema.deflection.value.toFixed(4)} mm`
    : '暂无位移控制项';

  const equilibrium = computeEquilibriumResidual(results, nodes, loads, elements);
  const equilibriumText = equilibrium.allOk
    ? `归一化平衡残差 ${equilibrium.maxResidual.toFixed(3)}，通过`
    : `归一化平衡残差 ${equilibrium.maxResidual.toFixed(3)}，需复核`;

  return {
    modelStatus,
    modelText,
    demandText,
    deflectionText,
    deflectionRatio,
    equilibriumText,
    equilibrium,
  };
}
