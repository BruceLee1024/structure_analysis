import { describe, expect, it } from 'vitest';
import { createSpaceAnalysisSession, getSpaceStructureKey } from './spaceAnalysisSession';
import { prepareSpaceFrameAnalysis, solvePreparedSpaceFrame, solveSpaceFrame, type SpaceNode, type SpaceElement, type SpaceLoad } from './spaceSolver';
import { createSpaceFramePrototypeModel, resolveSpaceElements, SPACE_MATERIAL_PRESETS, SPACE_SECTION_PRESETS } from './spaceModel';

const nodes: SpaceNode[] = [
  {id:1,x:0,y:0,z:0,restraints:[true,true,true,true,true,true]},
  {id:2,x:4,y:0,z:0,restraints:[false,false,false,false,false,false]},
];
const elements: SpaceElement[] = [{id:1,startNode:1,endNode:2,E:200,A:100,Iy:200,Iz:500,J:100}];
const loads: SpaceLoad[] = [{id:'q',elementId:1,type:'trapezoidal',coordinateSystem:'global',direction:'z',startMagnitude:-1,endMagnitude:-3}];

describe('prepared space analysis reuse', () => {
  it('converges for the 1080-free-DOF benchmark with PCG and fallback disabled', () => {
    const model = createSpaceFramePrototypeModel({ width: 20, depth: 20, height: 15, xBayCount: 5, yBayCount: 5, storyCount: 5, loadMagnitude: -10, loadDirection: 'z', materialId: SPACE_MATERIAL_PRESETS[0].id, sectionId: SPACE_SECTION_PRESETS[0].id, includeRoofBracing: true });
    const members = resolveSpaceElements(model);
    const pcg = solveSpaceFrame(model.nodes, members, model.loads, { backend: 'js-csr-pcg', fallback: 'none', tolerance: 1e-8 });
    const dense = solveSpaceFrame(model.nodes, members, model.loads, { backend: 'dense-reference' });
    expect(pcg.stats?.freeDof).toBe(1080);
    expect(pcg.status).not.toBe('failed');
    expect(pcg.stats?.backend).toBe('js-csr-pcg');
    expect(pcg.stats?.solverDiagnostics?.fallbackUsed).toBe(false);
    expect(pcg.stats?.relativeResidual).toBeLessThanOrEqual(1e-8);
    expect(pcg.equilibrium?.passed).toBe(true);
    pcg.displacements.forEach((value, index) => {
      for (const axis of ['dx', 'dy', 'dz'] as const) expect(Math.abs(value[axis] - dense.displacements[index][axis])).toBeLessThan(1e-5);
    });
  });
  for (const backend of ['dense-reference','js-csr-pcg'] as const) {
    it(`reuses preparation across 20 right-hand sides / ${backend}`, () => {
      const session = createSpaceAnalysisSession();
      for(let index=0;index<20;index++) {
        const activeLoads=loads.map(load=>({...load,startMagnitude:-(index+1),endMagnitude:-(index+3)})) as SpaceLoad[];
        const warm = session.solve(structuredClone(nodes),structuredClone(elements),activeLoads,{backend});
        const cold = solveSpaceFrame(nodes,elements,activeLoads,{backend});
        expect(warm.status).toBe('ok');
        expect(warm.displacements).toEqual(cold.displacements);
        expect(warm.reactions).toEqual(cold.reactions);
        expect(warm.elements).toEqual(cold.elements);
        expect(warm.stats?.preparation).toMatchObject({stiffnessReused:index>0,diagnosticsReused:index>0,stiffnessAssemblies:1,matrixDiagnosticsBuilds:1,solves:index+1,denseFactorizations:backend==='dense-reference'?1:0,preconditionerBuilds:backend==='js-csr-pcg'?1:0});
      }
    });
  }

  it('a prepared context remains consistent after caller-owned data are mutated', () => {
    const draftNodes=structuredClone(nodes); const draftElements=structuredClone(elements);
    const context=prepareSpaceFrameAnalysis(draftNodes,draftElements);
    const original=solvePreparedSpaceFrame(context,loads);
    draftNodes[1].x=8; draftNodes[0].restraints[5]=false; draftElements[0].E=20;
    expect(solvePreparedSpaceFrame(context,loads).displacements).toEqual(original.displacements);
    expect(context.nodes[1].x).toBe(4);
    expect(context.elements[0].E).toBe(200);
  });

  it('invalidates the session when each stiffness field changes, including in-place changes', () => {
    const changes: Array<(nodes:SpaceNode[],elements:SpaceElement[])=>void> = [
      n=>{n[1].x=5;},n=>{n[1].restraints[1]=true;},n=>{n[1].springStiffness=[0,0,100,0,0,0];},
      (_n,e)=>{e[0].E=210;},(_n,e)=>{e[0].A=120;},(_n,e)=>{e[0].Iy=300;},(_n,e)=>{e[0].Iz=600;},(_n,e)=>{e[0].J=150;},(_n,e)=>{e[0].nu=.25;},(_n,e)=>{e[0].roll=37;},(_n,e)=>{e[0].releaseEnd={rz:true};},(_n,e)=>{e[0].startNode=2;e[0].endNode=1;},
    ];
    for(const change of changes) {
      const session=createSpaceAnalysisSession(); const n=structuredClone(nodes); const e=structuredClone(elements);
      const firstKey=getSpaceStructureKey(n,e); session.solve(n,e,loads); change(n,e);
      expect(getSpaceStructureKey(n,e)).not.toBe(firstKey);
      const actual=session.solve(n,e,loads);
      expect(actual.stats?.preparation?.stiffnessReused).toBe(false);
      expect(actual.displacements).toEqual(solveSpaceFrame(n,e,loads).displacements);
    }
  });

  it('keeps tolerance and diagnostic changes separate from structural invalidation', () => {
    const session=createSpaceAnalysisSession();
    session.solve(nodes,elements,loads,{backend:'js-csr-pcg'});
    const extended=session.solve(nodes,elements,loads,{backend:'js-csr-pcg',tolerance:1e-12,diagnostics:'extended'});
    expect(extended.stats?.preparation).toMatchObject({stiffnessReused:true,preconditionerReused:true,matrixDiagnosticsBuilds:2,preconditionerBuilds:1});
    expect(extended.stats?.solverDiagnostics?.residualHistory).toBeDefined();
    session.clear();
    expect(session.solve(nodes,elements,loads).stats?.preparation?.stiffnessReused).toBe(false);
  });

  it('does not reuse a reduced dense factor when an inactive released rotation becomes loaded', () => {
    const session=createSpaceAnalysisSession();
    const released=[{...elements[0],releaseEnd:{ry:true,rz:true}}];
    const initial=session.solve(nodes,released,loads);
    expect(initial.status).toBe('ok');
    const failed=session.solve(nodes,released,[...loads,{id:'moment',nodeId:2,type:'moment',direction:'y',magnitude:2}]);
    expect(failed.status).toBe('failed');
    expect(failed.stats?.preparation?.denseFactorReused).toBe(false);
    expect(failed.stats?.preparation?.denseFactorizations).toBe(2);
    expect(session.solve(nodes,released,loads).status).toBe('ok');
  });
});
