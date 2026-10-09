import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { loadSpaceRuntime, sourceFingerprint } from './runtime.mjs';
const runtime=await loadSpaceRuntime();
const fixtures=JSON.parse(await readFile('tests/fixtures/space/reference-models.json','utf8'));
const referenceText=await readFile('tests/fixtures/space/pynite-3.2.0-reference.json','utf8');
const reference=JSON.parse(referenceText);
const rows=[];
for(const fixture of fixtures.models) for(const backend of ['dense-reference','js-csr-pcg']) {
  const context=runtime.prepareSpaceFrameAnalysis(fixture.nodes,fixture.elements);
  runtime.solvePreparedSpaceFrame(context,fixture.loads,{backend,tolerance:1e-10,fallback:'none'});
  const actual=runtime.solvePreparedSpaceFrame(context,fixture.loads,{backend,tolerance:1e-10,fallback:'none'});
  const expected=reference.models.find(model=>model.name===fixture.name);
  const maxima={translationMm:0,rotationRad:0,reactionForceKn:0,reactionMomentKnM:0,endForceKn:0,endMomentKnM:0,curveM:0,normalizedError:0};
  const compare=(group,value,ref,absolute)=>{
    if(!Number.isFinite(value)) throw new Error(`${fixture.name}: non-finite ${group}`);
    const error=Math.abs(value-ref); maxima[group]=Math.max(maxima[group],error);
    maxima.normalizedError=Math.max(maxima.normalizedError,error/(absolute+1e-7*Math.abs(ref)));
  };
  for(const node of expected.nodes) {
    const d=actual.displacements.find(item=>item.nodeId===node.nodeId);
    [d.dx,d.dy,d.dz,d.rx,d.ry,d.rz].forEach((value,index)=>compare(index<3?'translationMm':'rotationRad',value,node.displacement[index]*(index<3?1000:1),index<3?1e-6:1e-9));
    const r=actual.reactions.find(item=>item.nodeId===node.nodeId);
    [r?.fx??0,r?.fy??0,r?.fz??0,r?.mx??0,r?.my??0,r?.mz??0].forEach((value,index)=>compare(index<3?'reactionForceKn':'reactionMomentKnM',value,node.reaction[index],1e-6));
  }
  for(const member of expected.members) {
    const result=actual.elements.find(item=>item.elementId===member.elementId);
    result.localEndForces.forEach((value,index)=>compare(index%6<3?'endForceKn':'endMomentKnM',value,member.localEndForces[index],1e-6));
    for(const station of member.curve) [result.displacementCurve.x,result.displacementCurve.y,result.displacementCurve.z].forEach((p,index)=>compare('curveM',p.reduceRight((sum,value)=>sum*station.r+value,0),station.local[index],1e-9));
  }
  rows.push({name:fixture.name,backend,status:actual.status,passed:actual.status!=='failed'&&maxima.normalizedError<=1,...maxima,preparation:actual.stats.preparation});
}
const report={generatedAt:new Date().toISOString(),reference:reference.reference,referenceVersion:reference.version,numpy:reference.numpy,scipy:reference.scipy,referenceSha256:createHash('sha256').update(referenceText).digest('hex'),sourceSha256:await sourceFingerprint(),relativeTolerance:1e-7,absoluteTolerances:{translationMm:1e-6,rotationRad:1e-9,reactionForceKn:1e-6,reactionMomentKnM:1e-6,endForceKn:1e-6,endMomentKnM:1e-6,curveM:1e-9},passed:rows.every(row=>row.passed),rows};
const output=process.argv[2]??'docs/benchmarks/space-reference-comparison-2026-10-09.json';
await writeFile(output,JSON.stringify(report,null,2)+'\n');
console.log(`${rows.filter(row=>row.passed).length}/${rows.length} 独立算例路径通过；${output}`);
if(!report.passed) process.exitCode=1;
