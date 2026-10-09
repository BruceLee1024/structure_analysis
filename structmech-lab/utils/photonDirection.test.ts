import { expect, it } from 'vitest';
import { sectionPhotonPaths, photonStations, prepareForceDistribution, type FlowSegment } from './forceFlow';
const segment=(n=10,v=10,m=10):FlowSegment=>({id:'a',memberId:'a',a:{x:0,y:0},b:{x:100,y:0},values:{N:n,V:v,M:m}});
it('轴拉向杆段外、轴压向内；交换节点顺序不改变拉压语义',()=>{
 for(const reverse of [false,true])for(const n of [10,-10]){
  const s=segment(n);if(reverse)[s.a,s.b]=[s.b,s.a];
  for(const p of sectionPhotonPaths(s,'N')) expect(Math.sign(Math.abs(p[1].x-50)-Math.abs(p[0].x-50))).toBe(Math.sign(n));
 }
});
it('正剪力在起点侧截面沿局部负 y；旋转构件后同步旋转',()=>{
 const p=sectionPhotonPaths(segment(),'V')[0];expect(p[1].y).toBeGreaterThan(p[0].y);
 const s={...segment(),a:{x:0,y:100},b:{x:0,y:0}};
 const q=sectionPhotonPaths(s,'V')[0];expect(q[1].x).toBeGreaterThan(q[0].x);
 const neg=sectionPhotonPaths(segment(10,-10),'V')[0];expect(neg[1].y).toBeLessThan(neg[0].y);
});
it('正弯矩逆时针、负弯矩顺时针，零值没有方向图元',()=>{
 for(const m of [10,-10]){
  const p=sectionPhotonPaths(segment(0,0,m),'M')[0],a={x:p[0].x-50,y:p[0].y},b={x:p[1].x-50,y:p[1].y};
  expect(Math.sign(a.x*b.y-a.y*b.x)).toBe(-Math.sign(m));
 }
 for(const f of ['N','V','M'] as const)expect(sectionPhotonPaths(segment(0,0,0),f)).toEqual([]);
});
it('采样点只在同一构件同号连续区间合并，跨荷载变号仍保留两侧方向',()=>{
 const segments=[0,1,2,3].map(i=>({...segment(1,i<2?10:-10),id:`s${i}`,a:{x:i*10,y:0},b:{x:(i+1)*10,y:0}}));
 const points=photonStations(prepareForceDistribution({segments,sources:[],supports:[]},'V',10));
 expect(points.map(p=>p.value)).toEqual([10,-10]);
});
