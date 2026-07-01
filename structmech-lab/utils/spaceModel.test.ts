import { describe, expect, it } from 'vitest';
import {
  SPACE_MATERIAL_PRESETS,
  SPACE_SECTION_PRESETS,
  SPACE_SECTION_UNITS,
  buildSpaceResultSummary,
  buildSpaceResultEnvelopeRows,
  createSpaceFramePrototypeModel,
  createSpaceBatchNodeLoads,
  getActiveSpaceLoads,
  getSpaceAnalysisLoads,
  isSpaceBatchLoad,
  resolveSpaceElements,
  solveSpaceFrameScenarios,
  solveSpaceFrameScenario,
  validateSpaceModel,
  type SpaceLoadCombination,
  type SpaceAnalysisTarget,
} from './spaceModel';
import { isSpaceElementLoad, isSpaceNodalLoad, solveSpaceFrame, type SpaceVector6 } from './spaceSolver';

describe('space model helpers', () => {
  it('resolves structured material and section references into solver elements', () => {
    const model = createSpaceFramePrototypeModel({
      width: 6,
      depth: 4,
      height: 4,
      loadMagnitude: 20,
      loadDirection: 'y',
      materialId: SPACE_MATERIAL_PRESETS[0].id,
      sectionId: SPACE_SECTION_PRESETS[0].id,
      includeRoofBracing: true,
    });

    const elements = resolveSpaceElements(model);

    expect(model.coordinateSystem).toBe('Z-up');
    expect(elements).toHaveLength(model.members.length);
    expect(elements[0].E).toBe(SPACE_MATERIAL_PRESETS[0].E);
    expect(elements[0].A).toBe(SPACE_SECTION_PRESETS[0].A);
    expect(getActiveSpaceLoads(model)).toHaveLength(4);
    expect(validateSpaceModel(model).filter(issue => issue.severity === 'error')).toHaveLength(0);
  });

  it('generates multi-bay multi-story parametric frames with roof bracing and roof loads', () => {
    const model = createSpaceFramePrototypeModel({
      width: 12,
      depth: 5,
      height: 8,
      xBayCount: 2,
      yBayCount: 1,
      storyCount: 2,
      loadMagnitude: -15,
      loadDirection: 'z',
      materialId: SPACE_MATERIAL_PRESETS[0].id,
      sectionId: SPACE_SECTION_PRESETS[0].id,
      includeRoofBracing: true,
      includeFloorBracing: false,
    });

    const roofNodes = model.nodes.filter(node => node.z === 8);

    expect(model.nodes).toHaveLength(18);
    expect(model.members).toHaveLength(30);
    expect(roofNodes).toHaveLength(6);
    expect(model.loads).toHaveLength(6);
    expect(model.loads.every(load => isSpaceNodalLoad(load) && roofNodes.some(node => node.id === load.nodeId))).toBe(true);
    expect(validateSpaceModel(model).filter(issue => issue.severity === 'error')).toHaveLength(0);
  });

  it('generates richer roof and bracing layouts from advanced parametric options', () => {
    const simpleModel = createSpaceFramePrototypeModel({
      width: 12,
      depth: 6,
      height: 8,
      xBayCount: 2,
      yBayCount: 2,
      storyCount: 2,
      loadMagnitude: -12,
      loadDirection: 'z',
      materialId: SPACE_MATERIAL_PRESETS[0].id,
      sectionId: SPACE_SECTION_PRESETS[0].id,
      includeRoofBracing: true,
      includeFloorBracing: false,
    });
    const richModel = createSpaceFramePrototypeModel({
      width: 12,
      depth: 6,
      height: 8,
      xBayCount: 2,
      yBayCount: 2,
      storyCount: 2,
      loadMagnitude: -12,
      loadDirection: 'z',
      materialId: SPACE_MATERIAL_PRESETS[0].id,
      sectionId: SPACE_SECTION_PRESETS[0].id,
      includeRoofBracing: true,
      includeFloorBracing: true,
      roofProfile: 'gable-x',
      roofRise: 1.5,
      includeSecondaryBeams: true,
      secondaryBeamCount: 2,
      verticalBracingMode: 'end-bays',
      includeCoreBracing: true,
    });

    const richRoofNodeIds = new Set(richModel.generation?.roofNodeIds ?? []);
    const richRoofLoads = createSpaceBatchNodeLoads(richModel, { pattern: 'roof', direction: 'z', magnitude: -12 });
    const ridgeNode = richModel.nodes.find(node => Math.abs(node.x - 6) < 1e-9 && Math.abs(node.z - 9.5) < 1e-9);
    const eaveNode = richModel.nodes.find(node => Math.abs(node.x) < 1e-9 && Math.abs(node.z - 8) < 1e-9);

    expect(richModel.nodes.length).toBeGreaterThan(simpleModel.nodes.length);
    expect(richModel.members.length).toBeGreaterThan(simpleModel.members.length);
    expect(ridgeNode).toBeTruthy();
    expect(eaveNode).toBeTruthy();
    expect(richRoofLoads).toHaveLength(richRoofNodeIds.size);
    expect(richRoofLoads.every(load => isSpaceNodalLoad(load) && richRoofNodeIds.has(load.nodeId))).toBe(true);
    expect(validateSpaceModel(richModel).filter(issue => issue.severity === 'error')).toHaveLength(0);
  });

  it('creates identifiable batch loads for roof and windward face targets', () => {
    const model = createSpaceFramePrototypeModel({
      width: 12,
      depth: 6,
      height: 8,
      xBayCount: 2,
      yBayCount: 1,
      storyCount: 2,
      loadMagnitude: -15,
      loadDirection: 'z',
      materialId: SPACE_MATERIAL_PRESETS[0].id,
      sectionId: SPACE_SECTION_PRESETS[0].id,
      includeRoofBracing: true,
      includeFloorBracing: false,
    });

    const roofLoads = createSpaceBatchNodeLoads(model, { pattern: 'roof', direction: 'z', magnitude: -20 });
    const windLoads = createSpaceBatchNodeLoads(model, { pattern: 'wind-x-positive', direction: 'x', magnitude: 8 });
    const roofNodeIds = new Set(model.nodes.filter(node => node.z === 8).map(node => node.id));
    const windNodeIds = new Set(model.nodes.filter(node => node.x === 12 && node.z > 0).map(node => node.id));

    expect(roofLoads).toHaveLength(6);
    expect(roofLoads.every(load => isSpaceNodalLoad(load) && roofNodeIds.has(load.nodeId))).toBe(true);
    expect(windLoads).toHaveLength(4);
    expect(windLoads.every(load => isSpaceNodalLoad(load) && windNodeIds.has(load.nodeId))).toBe(true);
    expect([...roofLoads, ...windLoads].every(isSpaceBatchLoad)).toBe(true);
  });

  it('reports invalid member references before solve', () => {
    const model = createSpaceFramePrototypeModel({
      width: 6,
      depth: 4,
      height: 4,
      loadMagnitude: 20,
      loadDirection: 'y',
      materialId: SPACE_MATERIAL_PRESETS[0].id,
      sectionId: SPACE_SECTION_PRESETS[0].id,
      includeRoofBracing: false,
    });

    const brokenModel = {
      ...model,
      members: [{ ...model.members[0], startNode: 999 }],
    };

    expect(validateSpaceModel(brokenModel).some(issue => issue.id === 'member-ref-1')).toBe(true);
  });

  it('validates element loads against member references and finite magnitudes', () => {
    const model = createSpaceFramePrototypeModel({
      width: 6,
      depth: 4,
      height: 4,
      loadMagnitude: 20,
      loadDirection: 'y',
      materialId: SPACE_MATERIAL_PRESETS[0].id,
      sectionId: SPACE_SECTION_PRESETS[0].id,
      includeRoofBracing: false,
    });

    const brokenModel = {
      ...model,
      loads: [{
        id: 'bad-member-load',
        elementId: 999,
        type: 'distributed' as const,
        direction: 'z' as const,
        coordinateSystem: 'global' as const,
        startMagnitude: Number.NaN,
        endMagnitude: -5,
      }],
    };
    const issues = validateSpaceModel(brokenModel);

    expect(issues.some(item => item.id === 'load-member-bad-member-load')).toBe(true);
    expect(issues.some(item => item.id === 'load-value-bad-member-load')).toBe(true);
  });

  it('documents the space section unit contract used by the solver', () => {
    expect(SPACE_SECTION_UNITS).toEqual({
      A: 'cm²',
      Iy: '10^6 mm^4',
      Iz: '10^6 mm^4',
      J: '10^6 mm^4',
    });
  });

  it('rejects invalid space material, section, and spring properties before solve', () => {
    const model = createSpaceFramePrototypeModel({
      width: 6,
      depth: 4,
      height: 4,
      loadMagnitude: -10,
      loadDirection: 'z',
      materialId: SPACE_MATERIAL_PRESETS[0].id,
      sectionId: SPACE_SECTION_PRESETS[0].id,
      includeRoofBracing: false,
    });
    const brokenModel = {
      ...model,
      nodes: model.nodes.map((node, index) => index === 0 ? { ...node, springStiffness: [0, -1, 0, 0, 0, 0] as SpaceVector6 } : node),
      materials: model.materials.map(material => material.id === SPACE_MATERIAL_PRESETS[0].id ? { ...material, E: 0, nu: 0.51 } : material),
      sections: model.sections.map(section => section.id === SPACE_SECTION_PRESETS[0].id ? { ...section, A: 0, Iy: -1, Iz: Number.NaN, J: 0 } : section),
    };

    const issues = validateSpaceModel(brokenModel);

    expect(issues.some(issue => issue.id === `material-E-${SPACE_MATERIAL_PRESETS[0].id}`)).toBe(true);
    expect(issues.some(issue => issue.id === `material-nu-${SPACE_MATERIAL_PRESETS[0].id}`)).toBe(true);
    expect(issues.some(issue => issue.id === `section-A-${SPACE_SECTION_PRESETS[0].id}`)).toBe(true);
    expect(issues.some(issue => issue.id === `section-Iy-${SPACE_SECTION_PRESETS[0].id}`)).toBe(true);
    expect(issues.some(issue => issue.id === `section-Iz-${SPACE_SECTION_PRESETS[0].id}`)).toBe(true);
    expect(issues.some(issue => issue.id === `section-J-${SPACE_SECTION_PRESETS[0].id}`)).toBe(true);
    expect(issues.some(issue => issue.id === `spring-${model.nodes[0].id}-1`)).toBe(true);
  });

  it('scales nodal and member loads for space load combinations without mutating the model', () => {
    const model = createSpaceFramePrototypeModel({
      width: 6,
      depth: 4,
      height: 4,
      loadMagnitude: -10,
      loadDirection: 'z',
      materialId: SPACE_MATERIAL_PRESETS[0].id,
      sectionId: SPACE_SECTION_PRESETS[0].id,
      includeRoofBracing: false,
    });
    const loads = [
      { id: 'dead-node', nodeId: 3, loadCaseId: 'dead', type: 'point' as const, direction: 'z' as const, magnitude: -10 },
      { id: 'wind-member', elementId: 1, loadCaseId: 'wind-y', type: 'trapezoidal' as const, direction: 'y' as const, coordinateSystem: 'global' as const, startMagnitude: 2, endMagnitude: 6 },
    ];
    const combo: SpaceLoadCombination = { id: 'combo', name: '1.2D+0.6W', factors: { dead: 1.2, 'wind-y': 0.6 } };
    const target: SpaceAnalysisTarget = { type: 'combination', id: combo.id, label: combo.name };

    const analysisLoads = getSpaceAnalysisLoads({ ...model, loads }, target, [combo]);
    const scaledNode = analysisLoads.find(load => load.id === 'combo-dead-node');
    const scaledMember = analysisLoads.find(load => load.id === 'combo-wind-member');

    expect(isSpaceNodalLoad(scaledNode!)).toBe(true);
    expect(isSpaceNodalLoad(scaledNode!) ? scaledNode.magnitude : 0).toBeCloseTo(-12);
    expect(isSpaceElementLoad(scaledMember!)).toBe(true);
    expect(isSpaceElementLoad(scaledMember!) ? scaledMember.startMagnitude : 0).toBeCloseTo(1.2);
    expect(isSpaceElementLoad(scaledMember!) ? scaledMember.endMagnitude : 0).toBeCloseTo(3.6);
    expect(loads[0].magnitude).toBe(-10);
  });

  it('adds self weight as generated member loads in scenario solves', () => {
    const model = {
      ...createSpaceFramePrototypeModel({
        width: 4,
        depth: 1,
        height: 1,
        xBayCount: 1,
        yBayCount: 1,
        storyCount: 1,
        loadMagnitude: 0,
        loadDirection: 'z' as const,
        materialId: SPACE_MATERIAL_PRESETS[0].id,
        sectionId: SPACE_SECTION_PRESETS[0].id,
        includeRoofBracing: false,
      }),
      loads: [],
      selfWeight: { enabled: true, factor: 1 },
    };
    const target: SpaceAnalysisTarget = { type: 'loadCase', id: 'dead', label: '恒载 D' };
    const result = solveSpaceFrameScenario(model, target, undefined, { backend: 'dense-reference' });

    expect(result.equilibrium?.totalLoads.fz).toBeLessThan(0);
    expect(result.equilibrium?.residual.fz ?? 1).toBeCloseTo(0, 5);
    expect(result.stats?.warnings.some(warning => warning.includes('自重'))).toBe(false);
  });

  it('builds signed space result envelopes across scenarios', () => {
    const model = createSpaceFramePrototypeModel({
      width: 6,
      depth: 4,
      height: 4,
      loadMagnitude: -10,
      loadDirection: 'z',
      materialId: SPACE_MATERIAL_PRESETS[0].id,
      sectionId: SPACE_SECTION_PRESETS[0].id,
      includeRoofBracing: false,
    });
    const elements = resolveSpaceElements(model);
    const downward = solveSpaceFrame(model.nodes, elements, [{ id: 'down', nodeId: 3, type: 'point', direction: 'z', magnitude: -20 }]);
    const lateral = solveSpaceFrame(model.nodes, elements, [{ id: 'side', nodeId: 3, type: 'point', direction: 'x', magnitude: 15 }]);

    const rows = buildSpaceResultEnvelopeRows([
      { target: { type: 'loadCase', id: 'dead', label: '恒载 D' }, result: downward },
      { target: { type: 'loadCase', id: 'wind-y', label: '风载 WY' }, result: lateral },
    ]);

    expect(rows.find(row => row.key === 'mz-max')?.sourceLabel).toBeTruthy();
    expect(rows.find(row => row.key === 'fz-abs')?.value).toBeGreaterThan(0);
    expect(rows.find(row => row.key === 'displacement-abs')?.location).toContain('节点');
  });

  it('solves multiple space scenarios and builds a shared envelope result', () => {
    const model = createSpaceFramePrototypeModel({
      width: 6,
      depth: 4,
      height: 4,
      loadMagnitude: -10,
      loadDirection: 'z',
      materialId: SPACE_MATERIAL_PRESETS[0].id,
      sectionId: SPACE_SECTION_PRESETS[0].id,
      includeRoofBracing: false,
    });
    const originalLoadIds = model.loads.map(load => load.id);
    const targets: SpaceAnalysisTarget[] = [
      { type: 'loadCase', id: 'dead', label: '恒载 D' },
      { type: 'combination', id: 'sls', label: '标准组合 D+L' },
    ];

    const batch = solveSpaceFrameScenarios(model, targets, { backend: 'dense-reference' });
    const singleDead = solveSpaceFrameScenario(model, targets[0], undefined, { backend: 'dense-reference' });

    expect(batch.results).toHaveLength(2);
    expect(batch.results[0].result.maxDisplacement).toBeCloseTo(singleDead.maxDisplacement, 8);
    expect(batch.results[0].result.reactions[0]?.fz ?? 0).toBeCloseTo(singleDead.reactions[0]?.fz ?? 0, 8);
    expect(batch.envelopeRows.find(row => row.key === 'displacement-abs')?.value).toBeGreaterThan(0);
    expect(batch.diagnostics.targetsSolved).toBe(2);
    expect(batch.diagnostics.loadCasesSolved).toBe(1);
    expect(batch.diagnostics.combinationsSolved).toBe(1);
    expect(batch.diagnostics.stiffnessAssemblies).toBe(1);
    expect(batch.diagnostics.loadVectorsBuilt).toBe(2);
    expect(model.loads.map(load => load.id)).toEqual(originalLoadIds);
  });

  it('diagnoses released members that may create mechanisms and self-weight without density', () => {
    const model = createSpaceFramePrototypeModel({
      width: 6,
      depth: 4,
      height: 4,
      loadMagnitude: 0,
      loadDirection: 'z',
      materialId: SPACE_MATERIAL_PRESETS[0].id,
      sectionId: SPACE_SECTION_PRESETS[0].id,
      includeRoofBracing: false,
    });
    const releasedModel = {
      ...model,
      selfWeight: { enabled: true, factor: 1 },
      materials: model.materials.map(material => material.id === SPACE_MATERIAL_PRESETS[0].id ? { ...material, density: undefined } : material),
      members: [{ ...model.members[0], releaseStart: { ry: true, rz: true }, releaseEnd: { ry: true, rz: true } }, ...model.members.slice(1)],
    };

    const issues = validateSpaceModel(releasedModel);

    expect(issues.some(issue => issue.id.includes('member-release') && issue.severity === 'error')).toBe(true);
    expect(issues.some(issue => issue.id.includes('self-weight-density'))).toBe(true);
  });

  it('summarizes space solver results for the workspace control strip', () => {
    const model = createSpaceFramePrototypeModel({
      width: 6,
      depth: 4,
      height: 4,
      loadMagnitude: 20,
      loadDirection: 'y',
      materialId: SPACE_MATERIAL_PRESETS[0].id,
      sectionId: SPACE_SECTION_PRESETS[0].id,
      includeRoofBracing: true,
    });
    const result = solveSpaceFrame(model.nodes, resolveSpaceElements(model), getActiveSpaceLoads(model));
    const summary = buildSpaceResultSummary(result);

    expect(summary.maxDisplacement).toBeGreaterThan(0);
    expect(summary.maxBending).toBeGreaterThan(0);
    expect(['My', 'Mz']).toContain(summary.controllingBendingAxis);
  });
});
