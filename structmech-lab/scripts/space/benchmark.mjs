import { writeFile } from 'node:fs/promises';
import os from 'node:os';
import { performance } from 'node:perf_hooks';
import { loadSpaceRuntime, sourceFingerprint } from './runtime.mjs';

const runtime = await loadSpaceRuntime();
const repeats = 12;
const cases = 20;
const percentile = (values, ratio) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * ratio) - 1];
const rows = [];
for (const [name, bays, stories] of [['small', 1, 1], ['medium', 3, 3], ['large', 5, 5]]) {
  const model = runtime.createSpaceFramePrototypeModel({width:bays*4,depth:bays*4,height:stories*3,xBayCount:bays,yBayCount:bays,storyCount:stories,loadMagnitude:-10,loadDirection:'z',materialId:runtime.SPACE_MATERIAL_PRESETS[0].id,sectionId:runtime.SPACE_SECTION_PRESETS[0].id,includeRoofBracing:true});
  const elements = runtime.resolveSpaceElements(model);
  const loadCases = Array.from({length:cases}, (_, index) => model.loads.map(load => ({...load, magnitude:load.magnitude * (1 + index/20)})));
  const options = {backend:'auto',tolerance:1e-8};
  const modes = [
    ['cold-20', () => loadCases.map(loads => runtime.solveSpaceFrame(model.nodes,elements,loads,options))],
    ['prepared-20', () => {const context=runtime.prepareSpaceFrameAnalysis(model.nodes,elements); return loadCases.map(loads=>runtime.solvePreparedSpaceFrame(context,loads,options));}],
  ];
  for (const [mode, run] of modes) {
    const timings = [];
    let outputs;
    for (let repeat = -2; repeat < repeats; repeat++) {
      const start = performance.now();
      outputs = run();
      const elapsed = performance.now() - start;
      if (outputs.some(result=>result.status === 'failed')) throw new Error(`${name}/${mode} 分析失败`);
      if (repeat >= 0) timings.push(elapsed);
    }
    rows.push({name,mode,nodes:model.nodes.length,elements:elements.length,freeDof:outputs[0].stats.freeDof,nnz:outputs[0].stats.nnz,actualBackend:outputs[0].stats.backend,cases,repeats,medianMs:percentile(timings,0.5),p95Ms:percentile(timings,0.95),maxTrueResidual:Math.max(...outputs.map(result=>result.stats.relativeResidual)),lastPreparation:outputs.at(-1).stats.preparation ?? null,timingsMs:timings});
    console.log(`${name}/${mode}: median ${rows.at(-1).medianMs.toFixed(2)} ms`);
  }
}
const report={generatedAt:new Date().toISOString(),node:process.version,platform:process.platform,arch:process.arch,cpu:os.cpus()[0]?.model,sourceSha256:await sourceFingerprint(),note:'Node 中的求解与后处理；每次测量包含 20 工况和初次准备，2 次预热，12 次样本；不包含浏览器 Worker 传输、GPU、FPS 或峰值内存。',rows};
const path=process.argv[2] ?? 'docs/benchmarks/space-current.json';
await writeFile(path,JSON.stringify(report,null,2)+'\n');
console.log(path);
