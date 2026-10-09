/** Sampled section-force distribution. No routing or propagation model. */
export type FlowField = 'N' | 'V' | 'M';
export interface FlowPoint { x: number; y: number }
export interface FlowSegment { id: string; memberId?: string; a: FlowPoint; b: FlowPoint; values: Record<FlowField, number>; label?: string }
export interface FlowMarker extends FlowPoint { id: string; magnitude: number; kind?: 'point' | 'distributed' | 'moment' }
export interface FlowModel { segments: FlowSegment[]; sources: FlowMarker[]; supports: FlowMarker[] }
const finitePoint = (p: FlowPoint) => Number.isFinite(p.x) && Number.isFinite(p.y);
/** A scalar section-force distribution has no propagation direction. */
export function prepareForceDistribution(model: FlowModel, field: FlowField, referencePeak: number) {
  if (!Number.isFinite(referencePeak) || referencePeak <= 1e-8) return [];
  return model.segments.filter(s => finitePoint(s.a) && finitePoint(s.b) && Number.isFinite(s.values[field]) && Math.abs(s.values[field]) > 1e-8)
    .map(s => ({ ...s, value: s.values[field], ratio: Math.min(1, Math.abs(s.values[field]) / referencePeak) }));
}

/** SVG coordinates have y down. V/M describe the cut on the retained start side:
 * (N, -V, M), where physical positive M is counterclockwise.
 * N glyphs illustrate external axial tractions on a small retained member segment.
 */
export function sectionPhotonPaths(s: FlowSegment, field: FlowField) {
  const value=s.values[field], dx=s.b.x-s.a.x, dy=s.b.y-s.a.y, length=Math.hypot(dx,dy);
  if(!Number.isFinite(value)||Math.abs(value)<1e-8||length<1e-8)return [];
  const tx=dx/length,ty=dy/length,sign=Math.sign(value),cx=(s.a.x+s.b.x)/2,cy=(s.a.y+s.b.y)/2;
  const point=(x:number,y:number)=>({x:cx+tx*x+ty*y,y:cy+ty*x-tx*y});
  if(field==='N')return [-1,1].map(side=>{
    const points=[point(side*4,0),point(side*23,0)];
    return value>0?points:points.reverse();
  });
  if(field==='V')return [[point(0,sign*13),point(0,-sign*13)]];
  return [Array.from({length:25},(_,i)=>{
    const angle=(-Math.PI/4)+sign*i/24*Math.PI*1.5;
    return point(13*Math.cos(angle),13*Math.sin(angle));
  })];
}
/** One glyph per continuous member/sign run. Never join distinct physical members. */
export function photonStations(segments: ReturnType<typeof prepareForceDistribution>) {
  const runs: typeof segments[]=[];
  for(const s of segments){
    const last=runs.at(-1),prev=last?.at(-1);
    if(prev && (prev.memberId??prev.id)===(s.memberId??s.id) && Math.sign(prev.value)===Math.sign(s.value) && Math.hypot(prev.b.x-s.a.x,prev.b.y-s.a.y)<1e-6)last!.push(s);
    else runs.push([s]);
  }
  return runs.map(run=>run[Math.floor(run.length/2)]);
}
