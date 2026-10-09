import { afterEach, expect, it, vi } from 'vitest';
import type { SpaceSolverWorkerRequest, SpaceSolverWorkerResponse } from './spaceSolver.worker';
import { createSpaceFramePrototypeModel, SPACE_MATERIAL_PRESETS, SPACE_SECTION_PRESETS, solveSpaceFrameScenario, type SpaceAnalysisTarget } from './spaceModel';

afterEach(() => {vi.unstubAllGlobals();vi.resetModules();});

it('reuses completed Worker context across requests and rebuilds it for stiffness edits', async () => {
  const responses:SpaceSolverWorkerResponse[]=[];
  const scope={onmessage:undefined as undefined|((event:MessageEvent<SpaceSolverWorkerRequest>)=>void),postMessage:(response:SpaceSolverWorkerResponse)=>responses.push(response)};
  vi.stubGlobal('self',scope);
  await import('./spaceSolver.worker');
  const request:SpaceSolverWorkerRequest={id:1,nodes:[{id:1,x:0,y:0,z:0,restraints:[true,true,true,true,true,true]},{id:2,x:4,y:0,z:0,restraints:[false,false,false,false,false,false]}],elements:[{id:1,startNode:1,endNode:2,E:200,A:100,Iy:200,Iz:500,J:100}],loads:[{id:'p',nodeId:2,type:'point',direction:'z',magnitude:-10}]};
  const send=(value:SpaceSolverWorkerRequest)=>scope.onmessage!({data:structuredClone(value)} as MessageEvent<SpaceSolverWorkerRequest>);
  send(request);
  send({...request,id:2,loads:[{id:'p',nodeId:2,type:'point',direction:'z',magnitude:-20}]});
  send({...request,id:3,elements:[{...request.elements[0],Iz:1000}]});
  for(const response of responses) expect(response.ok).toBe(true);
  const results=responses.map(response=>response.ok?response.result:null);
  expect(results[0]?.stats?.preparation?.stiffnessReused).toBe(false);
  expect(results[1]?.stats?.preparation).toMatchObject({stiffnessReused:true,diagnosticsReused:true,denseFactorReused:true,denseFactorizations:1,solves:2});
  expect(results[1]?.displacements[1].dz).toBeCloseTo(2*results[0]!.displacements[1].dz,10);
  expect(results[2]?.stats?.preparation).toMatchObject({stiffnessReused:false,denseFactorizations:1,solves:1});
  expect(results[2]?.displacements[1].dz).toBeCloseTo(results[0]!.displacements[1].dz/2,10);
  expect(responses.map(response=>response.id)).toEqual([1,2,3]);
});

it('solves batches in the persistent session, preserving combinations, self-weight and provenance', async () => {
  const responses: SpaceSolverWorkerResponse[] = [];
  const scope = { onmessage: undefined as undefined | ((event: MessageEvent<SpaceSolverWorkerRequest>) => void), postMessage: (response: SpaceSolverWorkerResponse) => responses.push(response) };
  vi.stubGlobal('self', scope);
  await import('./spaceSolver.worker');
  const model = createSpaceFramePrototypeModel({ width: 4, depth: 4, height: 3, loadMagnitude: -10, loadDirection: 'z', materialId: SPACE_MATERIAL_PRESETS[0].id, sectionId: SPACE_SECTION_PRESETS[0].id, includeRoofBracing: true });
  model.selfWeight = { enabled: true, factor: 1, loadCaseId: 'dead' };
  const targets: SpaceAnalysisTarget[] = [{ type: 'loadCase', id: 'dead', label: '恒载' }, { type: 'combination', id: 'sls', label: '标准组合' }, { type: 'loadCase', id: 'live', label: '活载' }];
  const send = (id: number) => scope.onmessage!({ data: structuredClone({ id, kind: 'batch', model, targets }) } as MessageEvent<SpaceSolverWorkerRequest>);
  send(1); send(2);
  expect(responses.every(response => response.ok)).toBe(true);
  const first = responses[0].ok ? responses[0].batch! : undefined;
  const second = responses[1].ok ? responses[1].batch! : undefined;
  expect(first?.diagnostics).toMatchObject({ targetsSolved: 3, stiffnessAssemblies: 1, denseFactorizations: 1 });
  expect(second?.diagnostics.stiffnessAssemblies).toBe(0);
  targets.forEach((target, index) => {
    const cold = solveSpaceFrameScenario(model, target);
    expect(first?.results[index].result.displacements).toEqual(cold.displacements);
    expect(second?.results[index].result.displacements).toEqual(cold.displacements);
    expect(first?.results[index].result.error).toBe(cold.error);
  });
  expect(first?.envelopeRows.find(row => row.key === 'displacement-abs')).toMatchObject({ sourceType: 'loadCase', sourceId: 'dead' });
  expect(second?.results.at(-1)?.result.stats?.preparation).toMatchObject({ solves: 6, denseFactorizations: 1 });
  // A released, disconnected rotation is harmless until a load case loads it.
  model.nodes = [{ id: 1, x: 0, y: 0, z: 0, restraints: [true, true, true, true, true, true] }, { id: 2, x: 4, y: 0, z: 0, restraints: [false, false, false, false, false, false] }];
  model.members = [{ id: 1, startNode: 1, endNode: 2, materialId: model.materials[0].id, sectionId: model.sections[0].id, releaseEnd: { ry: true, rz: true } }];
  model.selfWeight.enabled = false;
  model.loads = [{ id: 'p', nodeId: 2, type: 'point', direction: 'z', magnitude: -10, loadCaseId: 'dead' }, { id: 'm', nodeId: 2, type: 'moment', direction: 'z', magnitude: 10, loadCaseId: 'live' }];
  send(3);
  const partial = responses[2].ok ? responses[2].batch! : undefined;
  expect(partial?.results.map(item => item.result.status)).toEqual(['ok', 'failed', 'failed']);
  expect(partial?.envelopeRows.filter(row => row.value !== null).every(row => row.sourceId === 'dead')).toBe(true);
});
