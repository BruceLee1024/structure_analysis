import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { solveSpaceFrame, type SpaceNode, type SpaceElement, type SpaceLoad } from './spaceSolver';
import { evaluateSpacePolynomial } from './spaceResponse';

const fixtures = JSON.parse(readFileSync('tests/fixtures/space/reference-models.json', 'utf8')) as {
  models: Array<{name:string;nodes:SpaceNode[];elements:SpaceElement[];loads:SpaceLoad[]}>;
};
const reference = JSON.parse(readFileSync('tests/fixtures/space/pynite-3.2.0-reference.json', 'utf8')) as {
  version:string;
  models:Array<{name:string;nodes:Array<{nodeId:number;displacement:number[];reaction:number[]}>;members:Array<{elementId:number;localEndForces:number[];curve:Array<{r:number;local:number[]}>}>}>;
};

const compare = (actual:number, expected:number, absolute:number) => {
  expect(Number.isFinite(actual)).toBe(true);
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(absolute + 1e-7 * Math.abs(expected));
};

describe('independent Pynite 3.2.0 reference models', () => {
  for (const fixture of fixtures.models) {
    for (const backend of ['dense-reference', 'js-csr-pcg'] as const) {
      it(`${fixture.name} / ${backend}`, () => {
        expect(reference.version).toBe('3.2.0');
        const expected = reference.models.find(model=>model.name===fixture.name)!;
        const actual = solveSpaceFrame(fixture.nodes,fixture.elements,fixture.loads,{backend,tolerance:1e-10,fallback:'none'});
        expect(actual.status).not.toBe('failed');
        for (const node of expected.nodes) {
          const displacement = actual.displacements.find(item=>item.nodeId===node.nodeId)!;
          [displacement.dx,displacement.dy,displacement.dz,displacement.rx,displacement.ry,displacement.rz].forEach((value,index)=>compare(value,node.displacement[index]*(index<3?1000:1),index<3?1e-6:1e-9));
          const reaction = actual.reactions.find(item=>item.nodeId===node.nodeId);
          [reaction?.fx??0,reaction?.fy??0,reaction?.fz??0,reaction?.mx??0,reaction?.my??0,reaction?.mz??0].forEach((value,index)=>compare(value,node.reaction[index],1e-6));
        }
        for (const member of expected.members) {
          const result = actual.elements.find(item=>item.elementId===member.elementId)!;
          result.localEndForces.forEach((value,index)=>compare(value,member.localEndForces[index],1e-6));
          for (const station of member.curve) {
            [result.displacementCurve!.x,result.displacementCurve!.y,result.displacementCurve!.z].forEach((polynomial,index)=>compare(evaluateSpacePolynomial(polynomial,station.r),station.local[index],1e-9));
          }
        }
      });
    }
  }
});
