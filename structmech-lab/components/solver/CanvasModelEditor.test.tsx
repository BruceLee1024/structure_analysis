import React, { useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import CanvasModelEditor from './CanvasModelEditor';
import { StructureType, type SolverParams } from '../../types';
import { solveStructure } from '../../utils/solver';
import { fromCanvas, type CanvasViewport } from '../../utils/canvasModel';

const empty = (): SolverParams => ({ structureType: StructureType.Custom, stiffnessType: 'Elastic', width: 10, height: 5, roofHeight: 2, numSpans: 1, numStories: 1, numBays: 1, overhangLeft: 0, overhangRight: 0, elasticModulus: 200, crossSectionArea: 100, momentOfInertia: 200, nodes: [], elements: [], loads: [] });
let latest: SolverParams;
let latestViewport: CanvasViewport;
let latestPreviewNodes: SolverParams['nodes'] | undefined;
let nextFrameId = 0;
let frameQueue = new Map<number, FrameRequestCallback>();
function Harness() {
  const [params, setParams] = useState(empty); latest = params;
  return <><CanvasModelEditor params={params} onChange={setParams} renderCanvas={interaction => { latestViewport = interaction.viewport; latestPreviewNodes = interaction.previewNodes; return <svg {...interaction.svgProps} viewBox={`0 0 ${interaction.viewport.width} ${interaction.viewport.height}`}>{interaction.background}{interaction.overlay}</svg>; }} /><button onClick={() => setParams(prev => ({ ...prev, activeLoadCaseId: 'live' }))}>外部修改工况</button></>;
}
beforeEach(() => {
  nextFrameId = 0; frameQueue = new Map();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { const id=++nextFrameId; frameQueue.set(id, callback); return id; });
  vi.stubGlobal('cancelAnimationFrame', (id:number) => frameQueue.delete(id));
  // jsdom 不实现 PointerEvent，保留 clientX/clientY/button 以测试真实坐标流程。
  vi.stubGlobal('PointerEvent', MouseEvent);
  vi.spyOn(SVGElement.prototype, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, top: 0, left: 0, right: 800, bottom: 400, width: 800, height: 400, toJSON: () => ({}) });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const flushMotion = () => act(() => { const queue=[...frameQueue.values()]; frameQueue.clear(); queue.forEach(callback=>callback(0)); });
const pointerMove = (target: Element, properties: Record<string, unknown>) => { fireEvent.pointerMove(target, properties); flushMotion(); };
const canvas = () => screen.getByRole('application', { name: '结构绘图画布' });
// 空白模型的 (0,0) 在 (150,250)，每 m 50 px。
const click = (x: number, y: number) => { fireEvent.pointerDown(canvas(), { clientX: x, clientY: y, button: 0 }); fireEvent.pointerUp(canvas(), { clientX: x, clientY: y, button: 0 }); };
const drag = (x1: number, y1: number, x2: number, y2: number) => { fireEvent.pointerDown(canvas(), { clientX: x1, clientY: y1, button: 0 }); pointerMove(canvas(), { clientX: x2, clientY: y2 }); fireEvent.pointerUp(canvas(), { clientX: x2, clientY: y2, button: 0 }); };
function drawBeam() {
  fireEvent.click(screen.getByRole('button', { name: '画杆件' }));
  click(150, 250); click(350, 250);
  fireEvent.keyDown(canvas(), { key: 'Escape' });
}

it('纯画布操作复现截图：4m 梁、固定端、前2m均布荷载和端点集中力', () => {
  render(<Harness />); drawBeam();
  expect(latest.nodes.map(n => [n.x, n.y])).toEqual([[0, 0], [4, 0]]);
  fireEvent.change(screen.getByLabelText('选择支座工具'), { target: { value: 'fixed' } }); click(150, 250);
  fireEvent.change(screen.getByLabelText('选择荷载工具'), { target: { value: 'distributed' } }); drag(150, 250, 250, 250);
  expect(latest.loads[0]).toMatchObject({ type: 'distributed', magnitude: -3, startLocation: 0, endLocation: 0.5 });
  fireEvent.change(screen.getByLabelText('选择荷载工具'), { target: { value: 'point' } }); click(350, 250);
  expect(latest.loads[1]).toMatchObject({ type: 'point', magnitude: -2, nodeId: 2 });
  const result = solveStructure(latest.nodes, latest.elements, latest.loads);
  expect(result.error).toBeUndefined(); expect(result.reactions[0].fy).toBeCloseTo(8, 5); expect(result.reactions[0].m).toBeCloseTo(14, 5);
});
it('支持拖动绘制、连续绘制、精确长度、Esc 取消，以及撤销重做', () => {
  render(<Harness />);
  fireEvent.click(screen.getByRole('button', { name: '画杆件' }));
  drag(150, 250, 250, 250); click(250, 150);
  expect(latest.elements).toHaveLength(2); expect(latest.nodes).toHaveLength(3);
  fireEvent.keyDown(canvas(), { key: 'Escape' });
  click(350, 250);
  fireEvent.change(screen.getByLabelText('绘制杆件长度 (m)'), { target: { value: '3.25' } });
  fireEvent.change(screen.getByLabelText('绘制杆件方向'), { target: { value: 'horizontal' } });
  fireEvent.click(screen.getByRole('button', { name: '完成杆件' }));
  expect(latest.nodes.some(n => n.x === 7.25 && n.y === 0)).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: '撤销画布操作' })); expect(latest.elements).toHaveLength(2);
  fireEvent.click(screen.getByRole('button', { name: '重做画布操作' })); expect(latest.elements).toHaveLength(3);
});
it('节点拖动、选中属性修改和删除都可撤销；外部编辑后不恢复过期快照', () => {
  render(<Harness />); drawBeam();
  fireEvent.click(screen.getByRole('button', { name: '选择 / 移动' })); drag(350, 250, 400, 250);
  expect(latest.nodes[1].x).toBe(5);
  fireEvent.change(screen.getByLabelText('选中对象X (m)'), { target: { value: '6' } });
  fireEvent.click(screen.getByRole('button', { name: '应用修改' })); expect(latest.nodes[1].x).toBe(6);
  fireEvent.keyDown(canvas(), { key: 'Delete' }); expect(latest.elements).toHaveLength(0);
  fireEvent.keyDown(canvas(), { key: 'z', ctrlKey: true }); expect(latest.elements).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: '外部修改工况' })); expect(screen.getByRole('button', { name: '撤销画布操作' })).toBeDisabled();
});
it('反向拖动梯形载映射起终大小，错误范围阻止应用，空白模型操作可撤销', () => {
  render(<Harness />); drawBeam();
  fireEvent.change(screen.getByLabelText('选择荷载工具'), { target: { value: 'trapezoidal' } }); drag(350, 250, 250, 250);
  expect(latest.loads[0]).toMatchObject({ startLocation: 0.5, endLocation: 1, magnitude: -6, magnitudeEnd: -3 });
  fireEvent.change(screen.getByLabelText('选中对象起点 (m)'), { target: { value: '4' } });
  fireEvent.click(screen.getByRole('button', { name: '应用修改' })); expect(screen.getByRole('alert')).toHaveTextContent('起点 < 终点');
  expect(latest.loads[0].startLocation).toBe(0.5);
  fireEvent.click(screen.getByRole('button', { name: '新建空白模型' })); expect(latest.nodes).toHaveLength(0); expect(latest.loads).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: '撤销画布操作' })); expect(latest.loads).toHaveLength(1); expect(latest.elements).toHaveLength(1);
});
it('平移和缩放不修改模型，放置支座和荷载时必须命中已有对象', () => {
  render(<Harness />); drawBeam();
  const before = JSON.stringify(latest);
  fireEvent.click(screen.getByRole('button', { name: '平移画布' })); drag(150, 250, 200, 300);
  fireEvent.click(screen.getByRole('button', { name: '放大画布' })); fireEvent.click(screen.getByRole('button', { name: '适应模型' }));
  expect(JSON.stringify(latest)).toBe(before);
  fireEvent.change(screen.getByLabelText('选择荷载工具'), { target: { value: 'point' } }); click(10, 10);
  expect(screen.getByRole('status')).toHaveTextContent('请点击节点或杆件'); expect(latest.loads).toHaveLength(0);
});


it('画布随可用尺寸变化，纵向画布中绘制的长度仍是正确的世界坐标', () => {
  let measure: ResizeObserverCallback;
  vi.stubGlobal('ResizeObserver', class { constructor(callback: ResizeObserverCallback) { measure = callback; } observe() {} disconnect() {} });
  render(<Harness />);
  act(() => measure!([{ contentRect: { width: 400, height: 600 } } as ResizeObserverEntry], {} as ResizeObserver));
  vi.mocked(SVGElement.prototype.getBoundingClientRect).mockReturnValue({ x: 0, y: 0, top: 0, left: 0, right: 400, bottom: 600, width: 400, height: 600, toJSON: () => ({}) });
  expect(canvas()).toHaveAttribute('viewBox', '0 0 400 600');
  click(75, 375); click(275, 375);
  expect(latest.nodes.map(n => [n.x, n.y])).toEqual([[0, 0], [4, 0]]);
  const beforeResize = { ...latestViewport };
  act(() => measure!([{ contentRect: { width: 500, height: 600 } } as ResizeObserverEntry], {} as ResizeObserver));
  expect(latestViewport).toMatchObject({ width: 500, height: 600, cx: beforeResize.cx, cy: beforeResize.cy, scale: beforeResize.scale });
});

it('滚轮围绕鼠标缩放、中键平移和快捷键不修改模型，输入框保留字符输入', () => {
  render(<Harness />); drawBeam();
  const before = JSON.stringify(latest);
  const pixel = { x: 250, y: 250 }, anchor = fromCanvas(pixel, latestViewport), initialScale = latestViewport.scale;
  fireEvent.wheel(canvas(), { clientX: pixel.x, clientY: pixel.y, deltaY: -100 });
  expect(latestViewport.scale).toBeGreaterThan(initialScale);
  const zoomAnchor = fromCanvas(pixel, latestViewport);
  expect(zoomAnchor.x).toBeCloseTo(anchor.x); expect(zoomAnchor.y).toBeCloseTo(anchor.y);
  const initialCenter = { x: latestViewport.cx, y: latestViewport.cy };
  fireEvent.pointerDown(canvas(), { clientX: 250, clientY: 250, button: 1 });
  pointerMove(canvas(), { clientX: 300, clientY: 300 });
  fireEvent.pointerUp(canvas(), { clientX: 300, clientY: 300, button: 1 });
  expect(latestViewport.cx).not.toBe(initialCenter.x); expect(latestViewport.cy).not.toBe(initialCenter.y);
  expect(JSON.stringify(latest)).toBe(before);
  fireEvent.keyDown(canvas(), { key: 'v' });
  expect(screen.getByRole('button', { name: '选择 / 移动' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.keyDown(canvas(), { key: 'l' });
  expect(screen.getByRole('button', { name: '画杆件' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.keyDown(screen.getByLabelText('绘制杆件长度 (m)'), { key: 'v' });
  expect(screen.getByRole('button', { name: '画杆件' })).toHaveAttribute('aria-pressed', 'true');
});

it('画布荷载可快速转向、双击反向和旋转，旋转一次撤销恢复整个手势', () => {
  render(<Harness />); drawBeam();
  fireEvent.change(screen.getByLabelText('选择荷载工具'), { target: { value: 'point' } }); click(350, 250);
  fireEvent.click(screen.getByRole('button', { name: '选择 / 移动' })); click(350, 232);
  const original = { ...latest.loads[0] };
  fireEvent.click(screen.getByRole('button', { name: '荷载向右' }));
  expect(latest.loads[0]).toMatchObject({ direction: 'x', magnitude: 2, nodeId: original.nodeId });
  fireEvent.doubleClick(canvas(), { clientX: 333, clientY: 250 });
  expect(latest.loads[0]).toMatchObject({ direction: 'x', magnitude: -2 });
  fireEvent.click(screen.getByRole('button', { name: '荷载向下' }));
  const before = JSON.stringify(latest);
  Object.defineProperty(canvas(), 'getScreenCTM', { configurable: true, value: () => ({ inverse: () => ({}) }) });
  vi.stubGlobal('DOMPoint', class { x: number; y: number; constructor(x: number, y: number) { this.x = x; this.y = y; } matrixTransform() { return this; } });
  const handle = screen.getByRole('slider', { name: '旋转荷载方向' });
  fireEvent.pointerDown(handle, { clientX: 378, clientY: 250, button: 0 });
  pointerMove(handle, { clientX: 330, clientY: 220 });
  pointerMove(handle, { clientX: 320, clientY: 220 });
  fireEvent.pointerUp(handle, { clientX: 320, clientY: 220 });
  expect(latest.loads[0]).toMatchObject({ direction: 'angle', angle: 45, magnitude: 2, nodeId: original.nodeId });
  expect(screen.getByLabelText('选中对象角度 (°)')).toHaveValue(45);
  fireEvent.click(screen.getByRole('button', { name: '撤销画布操作' }));
  expect(JSON.stringify(latest)).toBe(before);
});


it('首次双击打开属性面板导致布局变化时，仍对最初命中的荷载反向', () => {
  render(<Harness />); drawBeam();
  fireEvent.change(screen.getByLabelText('选择荷载工具'), { target: { value: 'point' } }); click(350, 250);
  fireEvent.click(screen.getByRole('button', { name: '选择 / 移动' }));
  fireEvent.click(screen.getByRole('button', { name: '关闭方向工具' }));
  click(350, 232);
  // Second click can now land in the inspector rather than the resized SVG.
  fireEvent.doubleClick(screen.getByRole('complementary', { name: '画布对象属性' }), { clientX: 350, clientY: 232 });
  expect(latest.loads[0]).toMatchObject({ direction: 'y', magnitude: 2 });
});

it('Alt 临时取消网格吸附，绘制和节点拖动保持实际位置', () => {
  render(<Harness />);
  click(150, 250);
  fireEvent.pointerDown(canvas(), { clientX: 263, clientY: 250, button: 0, altKey: true });
  fireEvent.pointerUp(canvas(), { clientX: 263, clientY: 250, button: 0, altKey: true });
  expect(latest.nodes[1].x).toBeCloseTo(2.26);
  fireEvent.keyDown(canvas(), { key: 'Escape' });
  fireEvent.click(screen.getByRole('button', { name: '选择 / 移动' }));
  const view = { ...latestViewport };
  fireEvent.pointerDown(canvas(), { clientX: 263, clientY: 250, button: 0 });
  pointerMove(canvas(), { clientX: 283, clientY: 237, altKey: true });
  fireEvent.pointerUp(canvas(), { clientX: 283, clientY: 237, button: 0, altKey: true });
  expect(latest.nodes[1]).toMatchObject({ x: 2.66, y: 0.26 });
  expect(latestViewport).toEqual(view);
});

it('右键拖动临时平移，保留绘制工具和起点，不添加对象或撤销记录', () => {
  render(<Harness />);
  click(150, 250);
  const before = JSON.stringify(latest), scale = latestViewport.scale;
  fireEvent.pointerDown(canvas(), { clientX: 100, clientY: 100, button: 2 });
  pointerMove(canvas(), { clientX: 160, clientY: 130, buttons: 2 });
  fireEvent.pointerUp(canvas(), { clientX: 160, clientY: 130, button: 2 });
  expect(latestViewport.scale).toBe(scale);
  expect(JSON.stringify(latest)).toBe(before);
  expect(screen.getByRole('button', { name: '撤销画布操作' })).toBeDisabled();
  expect(screen.getByRole('button', { name: '画杆件' })).toHaveAttribute('aria-pressed', 'true');
  const contextMenu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 });
  fireEvent(canvas(), contextMenu);
  expect(contextMenu.defaultPrevented).toBe(true);
  click(410, 280);
  expect(latest.nodes.map(n => [n.x, n.y])).toEqual([[0, 0], [4, 0]]);
});

it('点击支座图形可切换类型并立即应用，支持撤销且节点位置保持不变', () => {
  render(<Harness />); drawBeam();
  fireEvent.change(screen.getByLabelText('选择支座工具'), { target: { value: 'pinned' } }); click(150, 250);
  fireEvent.click(screen.getByRole('button', { name: '选择 / 移动' }));
  click(150, 270);
  expect(screen.getByLabelText('选中节点支座类型')).toHaveValue('pinned');
  fireEvent.change(screen.getByLabelText('选中节点支座类型'), { target: { value: 'rollerX' } });
  expect(latest.nodes[0]).toMatchObject({ x: 0, y: 0, restraints: [true, false, false] });
  fireEvent.click(screen.getByRole('button', { name: '撤销画布操作' }));
  expect(latest.nodes[0].restraints).toEqual([true, true, false]);
  click(150, 270);
  fireEvent.change(screen.getByLabelText('选中节点支座类型'), { target: { value: 'fixed' } });
  expect(latest.nodes[0].restraints).toEqual([true, true, true]);
  click(147, 260);
  fireEvent.change(screen.getByLabelText('选中节点支座类型'), { target: { value: 'free' } });
  expect(latest.nodes[0].restraints).toEqual([false, false, false]);
  expect(latest.elements).toHaveLength(1);
});

it('拖动均布荷载实时改变范围，松开只产生一次撤销，Esc 恢复位置', () => {
  render(<Harness />); drawBeam();
  fireEvent.change(screen.getByLabelText('选择荷载工具'), { target: { value: 'distributed' } }); drag(200,250,300,250);
  fireEvent.click(screen.getByRole('button', { name:'选择 / 移动' }));
  fireEvent.pointerDown(canvas(),{clientX:250,clientY:225,button:0});
  pointerMove(canvas(),{clientX:275,clientY:225});
  expect(latest.loads[0]).toMatchObject({startLocation:.375,endLocation:.875,magnitude:-3});
  fireEvent.pointerUp(canvas(),{clientX:275,clientY:225,button:0});
  fireEvent.click(screen.getByRole('button',{name:'撤销画布操作'}));
  expect(latest.loads[0]).toMatchObject({startLocation:.25,endLocation:.75});
  fireEvent.pointerDown(canvas(),{clientX:250,clientY:225,button:0});
  pointerMove(canvas(),{clientX:275,clientY:225});
  fireEvent.keyDown(canvas(),{key:'Escape'});
  expect(latest.loads[0]).toMatchObject({startLocation:.25,endLocation:.75});
});
it('选中均布荷载后可拖动范围端点，保持大小和方向', () => {
  render(<Harness />); drawBeam();
  fireEvent.change(screen.getByLabelText('选择荷载工具'), {target:{value:'distributed'}}); drag(200,250,300,250);
  fireEvent.click(screen.getByRole('button',{name:'选择 / 移动'}));
  const handle=screen.getByRole('button',{name:'拖动荷载起点'});
  fireEvent.pointerDown(handle,{clientX:200,clientY:250,button:0});
  pointerMove(canvas(),{clientX:175,clientY:250});
  fireEvent.pointerUp(canvas(),{clientX:175,clientY:250,button:0});
  expect(latest.loads[0]).toMatchObject({startLocation:.125,endLocation:.75,magnitude:-3,direction:'y'});
});

it('空白处框选多个对象，高亮并可一次删除和撤销；右键不改变选中对象', () => {
 render(<Harness />); drawBeam();
 fireEvent.click(screen.getByRole('button',{name:'选择 / 移动'}));
 fireEvent.pointerDown(canvas(),{clientX:125,clientY:225,button:0});
 pointerMove(canvas(),{clientX:375,clientY:275});
 expect(document.querySelector('[data-selection-box="contains"]')).not.toBeNull();
 fireEvent.pointerUp(canvas(),{clientX:375,clientY:275,button:0});
 expect(screen.getByRole('complementary',{name:'框选对象属性'})).toHaveTextContent('已选中 3 个对象');
 fireEvent.pointerDown(canvas(),{clientX:400,clientY:300,button:2});
 pointerMove(canvas(),{clientX:425,clientY:325});
 fireEvent.pointerUp(canvas(),{clientX:425,clientY:325,button:2});
 expect(screen.getByRole('complementary',{name:'框选对象属性'})).toHaveTextContent('已选中 3 个对象');
 fireEvent.keyDown(canvas(),{key:'Delete'});
 expect(latest.nodes).toHaveLength(0); expect(latest.elements).toHaveLength(0);
 fireEvent.click(screen.getByRole('button',{name:'撤销画布操作'}));
 expect(latest.nodes).toHaveLength(2); expect(latest.elements).toHaveLength(1);
});
it('Shift 框选追加对象，取消框选不修改模型', () => {
 render(<Harness />); drawBeam();
 fireEvent.click(screen.getByRole('button',{name:'选择 / 移动'}));
 drag(125,225,175,275);
 expect(screen.getByLabelText('选中对象X (m)')).toHaveValue(0);
 fireEvent.pointerDown(canvas(),{clientX:325,clientY:225,button:0,shiftKey:true});
 pointerMove(canvas(),{clientX:375,clientY:275});
 fireEvent.pointerUp(canvas(),{clientX:375,clientY:275,button:0});
 expect(screen.getByRole('complementary',{name:'框选对象属性'})).toHaveTextContent('已选中 2 个对象');
 const before=JSON.stringify(latest);
 fireEvent.click(screen.getByRole('button',{name:'取消框选'}));
 expect(JSON.stringify(latest)).toBe(before);
});

it('高频移动每帧仅使用最新位置，节点与杆件预览连续移动，松开才吸附并写入模型', () => {
 render(<Harness />); drawBeam();
 fireEvent.click(screen.getByRole('button',{name:'选择 / 移动'}));
 fireEvent.pointerDown(canvas(),{clientX:350,clientY:250,button:0});
 fireEvent.pointerMove(canvas(),{clientX:371,clientY:242});
 fireEvent.pointerMove(canvas(),{clientX:377,clientY:239});
 expect(latest.nodes[1]).toMatchObject({x:4,y:0});
 flushMotion();
 expect(latestPreviewNodes?.[1].x).toBeCloseTo(4.54);
 expect(latestPreviewNodes?.[1].y).toBeCloseTo(.22);
 fireEvent.pointerUp(canvas(),{clientX:377,clientY:239,button:0});
 expect(latest.nodes[1]).toMatchObject({x:4.5,y:0});
 expect(latestPreviewNodes).toBeUndefined();
});
it('松开前未绘制的最后一帧仍会准确提交；取消拖动不会迟到更新', () => {
 render(<Harness />); drawBeam();
 fireEvent.click(screen.getByRole('button',{name:'选择 / 移动'}));
 fireEvent.pointerDown(canvas(),{clientX:350,clientY:250,button:0});
 fireEvent.pointerMove(canvas(),{clientX:400,clientY:250});
 fireEvent.pointerUp(canvas(),{clientX:400,clientY:250,button:0});
 expect(latest.nodes[1].x).toBe(5);
 flushMotion(); expect(latest.nodes[1].x).toBe(5);
 fireEvent.pointerDown(canvas(),{clientX:400,clientY:250,button:0});
 fireEvent.pointerMove(canvas(),{clientX:450,clientY:250});
 fireEvent.keyDown(canvas(),{key:'Escape'});
 flushMotion(); expect(latest.nodes[1].x).toBe(5);
});

it('均布荷载箭头中部可以拖动，连续预览后松手吸附，Alt 保留自由定位', () => {
 render(<Harness />); drawBeam();
 fireEvent.change(screen.getByLabelText('选择荷载工具'),{target:{value:'distributed'}}); drag(200,250,300,250);
 fireEvent.click(screen.getByRole('button',{name:'选择 / 移动'}));
 fireEvent.pointerDown(canvas(),{clientX:230,clientY:243,button:0});
 pointerMove(canvas(),{clientX:247,clientY:243});
 expect(latest.loads[0].startLocation).toBeCloseTo(.335);
 fireEvent.pointerUp(canvas(),{clientX:247,clientY:243,button:0});
 expect(latest.loads[0].startLocation).toBeCloseTo(.375);
 expect(latest.loads[0].endLocation).toBeCloseTo(.875);
 fireEvent.click(screen.getByRole('button',{name:'撤销画布操作'}));
 fireEvent.pointerDown(canvas(),{clientX:230,clientY:243,button:0});
 pointerMove(canvas(),{clientX:247,clientY:243,altKey:true});
 fireEvent.pointerUp(canvas(),{clientX:247,clientY:243,button:0,altKey:true});
 expect(latest.loads[0].startLocation).toBeCloseTo(.335);
});
it('均布荷载拖远又回到起点不遗留上一次位置和撤销记录', () => {
 render(<Harness />); drawBeam();
 fireEvent.change(screen.getByLabelText('选择荷载工具'),{target:{value:'distributed'}}); drag(200,250,300,250);
 fireEvent.click(screen.getByRole('button',{name:'选择 / 移动'}));
 const before=JSON.stringify(latest);
 fireEvent.pointerDown(canvas(),{clientX:230,clientY:243,button:0});
 pointerMove(canvas(),{clientX:270,clientY:243});
 pointerMove(canvas(),{clientX:230,clientY:243});
 expect(JSON.stringify(latest)).toBe(before);
 fireEvent.pointerUp(canvas(),{clientX:230,clientY:243,button:0});
 expect(JSON.stringify(latest)).toBe(before);
 fireEvent.click(screen.getByRole('button',{name:'撤销画布操作'}));
 expect(latest.loads).toHaveLength(0);
});
