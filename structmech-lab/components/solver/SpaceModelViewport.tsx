import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  buildSpaceFrameTransformation,
  isSpaceElementLoad,
  isSpaceNodalLoad,
  type SpaceAnalysisResult,
  type SpaceElement,
  type SpaceLoad,
  type SpaceNode,
} from '../../utils/spaceSolver';
import type { SpaceModel } from '../../utils/spaceModel';

interface SpaceModelViewportProps {
  model: SpaceModel;
  elements: SpaceElement[];
  loads: SpaceLoad[];
  result: SpaceAnalysisResult;
  deformationScale: number;
  forceMode: SpaceForceMode;
  selectedEntity?: SpaceSelection | null;
  onSelectionChange?: (selection: SpaceSelection | null) => void;
}

type CameraView = 'iso' | 'top' | 'front' | 'right';
export type SpaceForceMode = 'none' | 'axial' | 'shear' | 'moment';
export type SpaceSelection = { type: 'node'; id: number } | { type: 'member'; id: number };
type HoveredElement = {
  elementId: number;
  x: number;
  y: number;
  length: number;
  result?: SpaceAnalysisResult['elements'][number];
};

type ElementHitUserData = {
  kind: 'space-element-hit';
  elementId: number;
  startPoint: THREE.Vector3;
  endPoint: THREE.Vector3;
  length: number;
  result?: SpaceAnalysisResult['elements'][number];
};

type NodeHitUserData = {
  kind: 'space-node-hit';
  nodeId: number;
};

type SpaceHitUserData = ElementHitUserData | NodeHitUserData;

const loadColor = 0xfb7185;
const baseColor = 0x64748b;
const deformedColor = 0x22d3ee;
const hotForceColor = 0xf43f5e;
const warmForceColor = 0xf59e0b;
const coolForceColor = 0x22d3ee;
const positiveDiagramColor = 0x38bdf8;
const negativeDiagramColor = 0xfb7185;
const forceModeUnit: Record<Exclude<SpaceForceMode, 'none'>, string> = {
  axial: 'kN',
  shear: 'kN',
  moment: 'kN·m',
};

const forceModeLabel: Record<Exclude<SpaceForceMode, 'none'>, string> = {
  axial: '轴力 N',
  shear: '剪力 V',
  moment: '弯矩 M',
};

const defaultCameraDistanceScale = 2.75;
const viewCameraDistanceScale = 2.7;

const getBounds = (nodes: SpaceNode[]) => {
  if (nodes.length === 0) {
    return { center: new THREE.Vector3(0, 0, 0), radius: 8 };
  }

  const box = new THREE.Box3();
  nodes.forEach(node => box.expandByPoint(new THREE.Vector3(node.x, node.z, -node.y)));
  const center = new THREE.Vector3();
  box.getCenter(center);
  const size = new THREE.Vector3();
  box.getSize(size);
  return { center, radius: Math.max(size.length() * 0.7, 6) };
};

const lineObject = (points: THREE.Vector3[], color: number, opacity = 1, linewidth = 1) => {
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity, linewidth });
  return new THREE.Line(geometry, material);
};

const forceHeatColor = (ratio: number) => {
  const clamped = Math.min(Math.max(ratio, 0), 1);
  const color = new THREE.Color(coolForceColor);
  if (clamped < 0.55) {
    return color.lerp(new THREE.Color(warmForceColor), clamped / 0.55).getHex();
  }
  return new THREE.Color(warmForceColor).lerp(new THREE.Color(hotForceColor), (clamped - 0.55) / 0.45).getHex();
};

const forceValueForMode = (result: SpaceAnalysisResult['elements'][number], mode: Exclude<SpaceForceMode, 'none'>) => {
  if (mode === 'axial') return result.maxAbsAxial;
  if (mode === 'shear') return Math.max(result.maxAbsShearY, result.maxAbsShearZ);
  return Math.max(result.maxAbsMomentY, result.maxAbsMomentZ);
};

const signedStationValueForMode = (
  station: SpaceAnalysisResult['elements'][number]['stations'][number],
  mode: Exclude<SpaceForceMode, 'none'>,
) => {
  if (mode === 'axial') return station.axial;
  if (mode === 'shear') return Math.abs(station.shearY) >= Math.abs(station.shearZ) ? station.shearY : station.shearZ;
  return Math.abs(station.momentY) >= Math.abs(station.momentZ) ? station.momentY : station.momentZ;
};

const signedPeakForMode = (result: SpaceAnalysisResult['elements'][number], mode: Exclude<SpaceForceMode, 'none'>) => (
  result.stations.reduce((peak, station) => {
    const value = signedStationValueForMode(station, mode);
    return Math.abs(value) > Math.abs(peak) ? value : peak;
  }, 0)
);

const formatSignedForceValue = (value: number) => {
  const abs = Math.abs(value);
  const prefix = value > 0 ? '+' : value < 0 ? '-' : '';
  return `${prefix}${abs.toFixed(abs >= 10 ? 1 : 2)}`;
};

const supportMarkerAt = (point: THREE.Vector3, restrained: boolean) => {
  const group = new THREE.Group();
  if (!restrained) return group;

  const base = point.clone().add(new THREE.Vector3(0, -0.18, 0));
  const left = base.clone().add(new THREE.Vector3(-0.18, 0, 0.12));
  const right = base.clone().add(new THREE.Vector3(0.18, 0, 0.12));
  const back = base.clone().add(new THREE.Vector3(0, 0, -0.2));
  const material = new THREE.LineBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.72 });
  const geometry = new THREE.BufferGeometry().setFromPoints([
    point, left,
    point, right,
    point, back,
    left, right,
    right, back,
    back, left,
  ]);
  group.add(new THREE.LineSegments(geometry, material));

  return group;
};

const nodeConnectorAt = (point: THREE.Vector3, selected: boolean) => {
  const group = new THREE.Group();
  if (!selected) return group;

  const size = 0.18;
  const material = new THREE.LineBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.95 });
  const geometry = new THREE.BufferGeometry().setFromPoints([
    point.clone().add(new THREE.Vector3(-size, 0, 0)),
    point.clone().add(new THREE.Vector3(size, 0, 0)),
    point.clone().add(new THREE.Vector3(0, -size, 0)),
    point.clone().add(new THREE.Vector3(0, size, 0)),
    point.clone().add(new THREE.Vector3(0, 0, -size)),
    point.clone().add(new THREE.Vector3(0, 0, size)),
  ]);
  group.add(new THREE.LineSegments(geometry, material));

  return group;
};

const nodeDotAt = (point: THREE.Vector3, restrained: boolean, selected: boolean) => {
  const geometry = new THREE.SphereGeometry(selected ? 0.115 : 0.075, 16, 16);
  const material = new THREE.MeshBasicMaterial({
    color: selected ? 0xfbbf24 : restrained ? 0x38bdf8 : 0x94a3b8,
    transparent: true,
    opacity: selected ? 1 : 0.88,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(point);
  return mesh;
};

const hitTubeBetween = (start: THREE.Vector3, end: THREE.Vector3, radius: number, userData: ElementHitUserData) => {
  const direction = end.clone().sub(start);
  const length = direction.length();
  const geometry = new THREE.CylinderGeometry(radius, radius, Math.max(length, 0.001), 8, 1);
  const material = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(start.clone().add(end).multiplyScalar(0.5));
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  mesh.userData = userData;
  return mesh;
};

const hitSphereAt = (point: THREE.Vector3, radius: number, userData: NodeHitUserData) => {
  const geometry = new THREE.SphereGeometry(radius, 12, 12);
  const material = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(point);
  mesh.userData = userData;
  return mesh;
};

const forceDiagramNormal = (start: THREE.Vector3, end: THREE.Vector3) => {
  const axis = end.clone().sub(start).normalize();
  let normal = new THREE.Vector3(0, 1, 0).cross(axis);
  if (normal.length() < 1e-6) normal = new THREE.Vector3(1, 0, 0).cross(axis);
  return normal.normalize();
};

const forceDiagramBetween = (
  start: THREE.Vector3,
  end: THREE.Vector3,
  result: SpaceAnalysisResult['elements'][number],
  mode: Exclude<SpaceForceMode, 'none'>,
  maxAbsValue: number,
) => {
  const group = new THREE.Group();
  const span = end.clone().sub(start);
  const length = span.length();
  if (length < 1e-9 || maxAbsValue <= 0 || result.stations.length < 2) return group;

  const tangent = span.clone().normalize();
  const normal = forceDiagramNormal(start, end);
  const amplitude = Math.min(Math.max(length * 0.12, 0.18), 0.75);
  const rows = result.stations.map(station => {
    const ratio = result.length > 0 ? station.x / result.length : 0;
    const baseline = start.clone().add(tangent.clone().multiplyScalar(length * ratio));
    const signedValue = signedStationValueForMode(station, mode);
    const offset = normal.clone().multiplyScalar((signedValue / maxAbsValue) * amplitude);
    return { baseline, diagram: baseline.clone().add(offset), signedValue };
  });

  rows.forEach((row, index) => {
    if (index % 2 === 0 || index === rows.length - 1) {
      group.add(lineObject([row.baseline, row.diagram], row.signedValue >= 0 ? positiveDiagramColor : negativeDiagramColor, 0.34));
    }
  });

  for (let index = 0; index < rows.length - 1; index++) {
    const current = rows[index];
    const next = rows[index + 1];
    const color = (current.signedValue + next.signedValue) / 2 >= 0 ? positiveDiagramColor : negativeDiagramColor;
    group.add(lineObject([current.diagram, next.diagram], color, 0.92));
  }

  return group;
};

const formatHoverValue = (value: number, unit: string) => `${value.toFixed(value >= 10 ? 1 : 2)} ${unit}`;

const toScenePoint = (x: number, y: number, z: number) => new THREE.Vector3(x, z, -y);

const globalDirectionToScene = (direction: SpaceLoad['direction'], sign: number) => new THREE.Vector3(
  direction === 'x' ? sign : 0,
  direction === 'z' ? sign : 0,
  direction === 'y' ? -sign : 0,
);

const localDirectionToScene = (start: SpaceNode, end: SpaceNode, direction: SpaceLoad['direction'], sign: number) => {
  const T = buildSpaceFrameTransformation(start, end);
  const axis = direction === 'x' ? 0 : direction === 'y' ? 1 : 2;
  return new THREE.Vector3(
    T[axis][0] * sign,
    T[axis][2] * sign,
    -T[axis][1] * sign,
  );
};

const disposeObject = (object: THREE.Object3D) => {
  object.traverse(child => {
    const mesh = child as THREE.Mesh;
    const line = child as THREE.Line;
    const anyChild = child as unknown as { geometry?: THREE.BufferGeometry; material?: THREE.Material | THREE.Material[] };
    anyChild.geometry?.dispose();
    if (Array.isArray(anyChild.material)) anyChild.material.forEach(material => material.dispose());
    else anyChild.material?.dispose();
    void mesh;
    void line;
  });
};

const SpaceModelViewport: React.FC<SpaceModelViewportProps> = ({
  model,
  elements,
  loads,
  result,
  deformationScale,
  forceMode,
  selectedEntity,
  onSelectionChange,
}) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const modelGroupRef = useRef<THREE.Group | null>(null);
  const hitTargetsRef = useRef<THREE.Object3D[]>([]);
  const hoverHighlightRef = useRef<THREE.Object3D | null>(null);
  const framedModelKeyRef = useRef('');
  const frameRef = useRef<number | null>(null);
  const [hoveredElement, setHoveredElement] = useState<HoveredElement | null>(null);
  const modelFrameKey = useMemo(() => (
    [
      model.nodes.map(node => `${node.id}:${node.x}:${node.y}:${node.z}`).join('|'),
      model.members.map(member => `${member.id}:${member.startNode}:${member.endNode}`).join('|'),
    ].join('::')
  ), [model.members, model.nodes]);
  const forceRows = useMemo(() => {
    if (forceMode === 'none') return [];
    return result.elements
      .map(elementResult => {
        const signedValue = signedPeakForMode(elementResult, forceMode);
        return {
          elementId: elementResult.elementId,
          signedValue,
          value: Math.abs(signedValue),
        };
      })
      .filter(row => row.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [forceMode, result.elements]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x030712);
    scene.fog = new THREE.Fog(0x030712, 70, 160);
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 5000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.screenSpacePanning = true;
    controls.minDistance = 2;
    controls.maxDistance = 250;

    const ambient = new THREE.AmbientLight(0xffffff, 0.82);
    scene.add(ambient);
    const light = new THREE.DirectionalLight(0xffffff, 0.42);
    light.position.set(10, 16, 12);
    scene.add(light);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(90, 90),
      new THREE.MeshBasicMaterial({
        color: 0x08111f,
        transparent: true,
        opacity: 0.62,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.01;
    scene.add(ground);

    const grid = new THREE.GridHelper(90, 90, 0x155e75, 0x111827);
    grid.position.y = 0.002;
    scene.add(grid);

    const axesGroup = new THREE.Group();
    axesGroup.add(lineObject([new THREE.Vector3(0, 0.02, 0), new THREE.Vector3(3.2, 0.02, 0)], 0xf97316, 0.8));
    axesGroup.add(lineObject([new THREE.Vector3(0, 0.02, 0), new THREE.Vector3(0, 3.2, 0)], 0x22c55e, 0.8));
    axesGroup.add(lineObject([new THREE.Vector3(0, 0.02, 0), new THREE.Vector3(0, 0.02, -3.2)], 0x38bdf8, 0.8));
    scene.add(axesGroup);

    const modelGroup = new THREE.Group();
    scene.add(modelGroup);

    rendererRef.current = renderer;
    sceneRef.current = scene;
    cameraRef.current = camera;
    controlsRef.current = controls;
    modelGroupRef.current = modelGroup;

    const resize = () => {
      const width = Math.max(host.clientWidth, 1);
      const height = Math.max(host.clientHeight, 1);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    resize();

    const animate = () => {
      controls.update();
      renderer.render(scene, camera);
      frameRef.current = requestAnimationFrame(animate);
    };
    animate();

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const clearHover = () => {
      setHoveredElement(null);
      if (hoverHighlightRef.current) {
        modelGroup.remove(hoverHighlightRef.current);
        disposeObject(hoverHighlightRef.current);
        hoverHighlightRef.current = null;
      }
    };
    const handlePointerMove = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(hitTargetsRef.current, false)[0];
      if (!hit) {
        clearHover();
        return;
      }

      const data = hit.object.userData as Partial<SpaceHitUserData>;
      if (data.kind !== 'space-element-hit' || !data.startPoint || !data.endPoint || data.elementId === undefined) {
        clearHover();
        return;
      }

      const existingId = hoverHighlightRef.current?.userData.elementId;
      if (existingId !== data.elementId) {
        if (hoverHighlightRef.current) {
          modelGroup.remove(hoverHighlightRef.current);
          disposeObject(hoverHighlightRef.current);
        }
        const highlight = lineObject([data.startPoint, data.endPoint], 0xfbbf24, 0.95);
        highlight.userData = { elementId: data.elementId };
        hoverHighlightRef.current = highlight;
        modelGroup.add(highlight);
      }

      const nextX = Math.min(Math.max(event.clientX - rect.left + 14, 12), Math.max(rect.width - 240, 12));
      const nextY = Math.min(Math.max(event.clientY - rect.top + 14, 48), Math.max(rect.height - 180, 48));
      setHoveredElement({
        elementId: data.elementId,
        x: nextX,
        y: nextY,
        length: data.length ?? 0,
        result: data.result,
      });
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || !onSelectionChange) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(hitTargetsRef.current, false)[0];
      if (!hit) {
        onSelectionChange(null);
        return;
      }
      const data = hit.object.userData as Partial<SpaceHitUserData>;
      if (data.kind === 'space-node-hit' && data.nodeId !== undefined) {
        onSelectionChange({ type: 'node', id: data.nodeId });
        return;
      }
      if (data.kind === 'space-element-hit' && data.elementId !== undefined) {
        onSelectionChange({ type: 'member', id: data.elementId });
      }
    };

    renderer.domElement.addEventListener('pointermove', handlePointerMove);
    renderer.domElement.addEventListener('pointerdown', handlePointerDown);
    renderer.domElement.addEventListener('pointerleave', clearHover);

    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      renderer.domElement.removeEventListener('pointermove', handlePointerMove);
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      renderer.domElement.removeEventListener('pointerleave', clearHover);
      resizeObserver.disconnect();
      controls.dispose();
      disposeObject(scene);
      renderer.dispose();
      renderer.domElement.remove();
      rendererRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      controlsRef.current = null;
      modelGroupRef.current = null;
    };
  }, [onSelectionChange]);

  useEffect(() => {
    const group = modelGroupRef.current;
    if (!group) return;

    while (group.children.length > 0) {
      const child = group.children[0];
      group.remove(child);
      disposeObject(child);
    }
    hitTargetsRef.current = [];
    hoverHighlightRef.current = null;
    setHoveredElement(null);

    const nodeMap = new Map<number, SpaceNode>(model.nodes.map(node => [node.id, node]));
    const displacementMap = new Map<number, SpaceAnalysisResult['displacements'][number]>(
      result.displacements.map(displacement => [displacement.nodeId, displacement]),
    );
    const elementResultMap = new Map<number, SpaceAnalysisResult['elements'][number]>(
      result.elements.map(elementResult => [elementResult.elementId, elementResult]),
    );
    const activeForceMode = forceMode === 'none' ? null : forceMode;
    const maxForceValue = activeForceMode
      ? result.elements.reduce((max, elementResult) => Math.max(max, forceValueForMode(elementResult, activeForceMode)), 0)
      : 0;
    const deformedNode = (node: SpaceNode) => {
      const displacement = displacementMap.get(node.id);
      if (!displacement) return node;
      return {
        ...node,
        x: node.x + (displacement.dx / 1000) * deformationScale,
        y: node.y + (displacement.dy / 1000) * deformationScale,
        z: node.z + (displacement.dz / 1000) * deformationScale,
      };
    };

    elements.forEach(element => {
      const start = nodeMap.get(element.startNode);
      const end = nodeMap.get(element.endNode);
      if (!start || !end) return;
      group.add(lineObject([
        new THREE.Vector3(start.x, start.z, -start.y),
        new THREE.Vector3(end.x, end.z, -end.y),
      ], baseColor, 0.28));

      const startDef = deformedNode(start);
      const endDef = deformedNode(end);
      const startPoint = new THREE.Vector3(startDef.x, startDef.z, -startDef.y);
      const endPoint = new THREE.Vector3(endDef.x, endDef.z, -endDef.y);

      const elementResult = elementResultMap.get(element.id);
      const forceValue = activeForceMode && elementResult ? forceValueForMode(elementResult, activeForceMode) : 0;
      const forceRatio = activeForceMode && maxForceValue > 0 ? Math.min(forceValue / maxForceValue, 1) : 0;
      const memberColor = activeForceMode && forceValue > 0 ? forceHeatColor(forceRatio) : deformedColor;
      group.add(lineObject([startPoint, endPoint], memberColor, activeForceMode ? 0.9 : 0.82));
      if (activeForceMode && elementResult && maxForceValue > 0) {
        group.add(forceDiagramBetween(startPoint, endPoint, elementResult, activeForceMode, maxForceValue));
      }

      if (selectedEntity?.type === 'member' && selectedEntity.id === element.id) {
        group.add(lineObject([startPoint, endPoint], 0xfbbf24, 1));
      }
      const hitTarget = hitTubeBetween(startPoint, endPoint, 0.18, {
        kind: 'space-element-hit',
        elementId: element.id,
        startPoint,
        endPoint,
        length: startPoint.distanceTo(endPoint),
        result: elementResult,
      });
      hitTargetsRef.current.push(hitTarget);
      group.add(hitTarget);

    });

    model.nodes.forEach(node => {
      const restrained = node.restraints.some(Boolean);
      const nodeDef = deformedNode(node);
      const nodePoint = new THREE.Vector3(nodeDef.x, nodeDef.z, -nodeDef.y);
      const selected = selectedEntity?.type === 'node' && selectedEntity.id === node.id;
      group.add(nodeDotAt(nodePoint, restrained, selected));
      group.add(nodeConnectorAt(nodePoint, selected));
      group.add(supportMarkerAt(nodePoint, restrained));
      const hitTarget = hitSphereAt(nodePoint, 0.22, { kind: 'space-node-hit', nodeId: node.id });
      hitTargetsRef.current.push(hitTarget);
      group.add(hitTarget);
    });

    loads.forEach(load => {
      if (isSpaceNodalLoad(load)) {
        const node = nodeMap.get(load.nodeId);
        if (!node) return;
        const displayNode = deformedNode(node);
        const sign = load.magnitude >= 0 ? 1 : -1;
        const direction = globalDirectionToScene(load.direction, sign);
        const length = 0.9;
        const origin = toScenePoint(displayNode.x, displayNode.y, displayNode.z).sub(direction.clone().multiplyScalar(length));
        const arrow = new THREE.ArrowHelper(direction.normalize(), origin, length * 0.86, loadColor, 0.22, 0.12);
        group.add(arrow);
        return;
      }

      if (isSpaceElementLoad(load)) {
        const element = elements.find(item => item.id === load.elementId);
        if (!element) return;
        const start = nodeMap.get(element.startNode);
        const end = nodeMap.get(element.endNode);
        if (!start || !end) return;

        const startDisplay = deformedNode(start);
        const endDisplay = deformedNode(end);
        const startPoint = toScenePoint(startDisplay.x, startDisplay.y, startDisplay.z);
        const endPoint = toScenePoint(endDisplay.x, endDisplay.y, endDisplay.z);
        const memberVector = endPoint.clone().sub(startPoint);
        const arrowCount = 5;
        for (let index = 0; index < arrowCount; index++) {
          const ratio = (index + 0.5) / arrowCount;
          const magnitude = load.startMagnitude + (load.endMagnitude - load.startMagnitude) * ratio;
          if (Math.abs(magnitude) < 1e-9) continue;
          const sign = magnitude >= 0 ? 1 : -1;
          const direction = (load.coordinateSystem ?? 'global') === 'local'
            ? localDirectionToScene(start, end, load.direction, sign)
            : globalDirectionToScene(load.direction, sign);
          if (direction.length() < 1e-9) continue;
          const length = 0.58;
          const point = startPoint.clone().add(memberVector.clone().multiplyScalar(ratio));
          const origin = point.sub(direction.clone().normalize().multiplyScalar(length));
          const arrow = new THREE.ArrowHelper(direction.normalize(), origin, length * 0.82, loadColor, 0.16, 0.08);
          group.add(arrow);
        }
      }
    });

    const { center, radius } = getBounds(model.nodes);
    const controls = controlsRef.current;
    const camera = cameraRef.current;
    if (controls && camera) {
      controls.target.copy(center);
      const shouldFrameModel = framedModelKeyRef.current !== modelFrameKey
        || camera.position.length() < 1
        || Number.isNaN(camera.position.length());
      if (shouldFrameModel) {
        const distance = radius * defaultCameraDistanceScale;
        camera.position.copy(center.clone().add(new THREE.Vector3(distance, distance * 0.78, distance)));
        framedModelKeyRef.current = modelFrameKey;
      }
      camera.near = Math.max(radius / 100, 0.01);
      camera.far = Math.max(radius * 100, 100);
      camera.updateProjectionMatrix();
      controls.update();
    }
  }, [model, elements, loads, result, deformationScale, forceMode, selectedEntity, modelFrameKey]);

  const setView = (view: CameraView) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    const { center, radius } = getBounds(model.nodes);
    const distance = radius * viewCameraDistanceScale;
    const offsets: Record<CameraView, THREE.Vector3> = {
      iso: new THREE.Vector3(distance, distance * 0.8, distance),
      top: new THREE.Vector3(0, distance * 1.6, 0.001),
      front: new THREE.Vector3(0, 0.05 * distance, distance * 1.5),
      right: new THREE.Vector3(distance * 1.5, 0.05 * distance, 0),
    };
    camera.position.copy(center.clone().add(offsets[view]));
    camera.lookAt(center);
    controls.target.copy(center);
    controls.update();
  };

  return (
    <div className="relative h-full min-h-[28rem] w-full overflow-hidden bg-slate-950">
      <div ref={hostRef} className="absolute inset-0" />
      <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
        {[
          ['iso', '等轴测'],
          ['top', '俯视'],
          ['front', '正视'],
          ['right', '侧视'],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setView(key as CameraView)}
            className="rounded border border-slate-700 bg-slate-950/80 px-2.5 py-1 text-[10px] font-semibold text-slate-300 backdrop-blur transition-colors hover:border-cyan-500/60 hover:text-cyan-100"
          >
            {label}
          </button>
        ))}
      </div>
      {hoveredElement ? (
        <div
          className="pointer-events-none absolute z-10 w-56 rounded border border-amber-400/40 bg-slate-950/90 p-2 text-[10px] text-slate-300 shadow-lg shadow-slate-950/40 backdrop-blur"
          style={{ left: hoveredElement.x, top: hoveredElement.y }}
        >
          <div className="mb-1.5 flex items-center justify-between gap-2 border-b border-slate-800 pb-1.5">
            <span className="font-mono text-xs font-black text-amber-200">E{hoveredElement.elementId}</span>
            <span className="font-mono text-slate-500">
              L {(hoveredElement.result?.length ?? hoveredElement.length).toFixed(2)} m
            </span>
          </div>
          {hoveredElement.result ? (
            <div className="grid grid-cols-2 gap-1">
              {[
                ['N', formatHoverValue(hoveredElement.result.maxAbsAxial, 'kN'), 'text-emerald-200'],
                ['Vy', formatHoverValue(hoveredElement.result.maxAbsShearY, 'kN'), 'text-rose-200'],
                ['Vz', formatHoverValue(hoveredElement.result.maxAbsShearZ, 'kN'), 'text-rose-200'],
                ['T', formatHoverValue(hoveredElement.result.maxAbsTorsion, 'kN·m'), 'text-amber-200'],
                ['My', formatHoverValue(hoveredElement.result.maxAbsMomentY, 'kN·m'), 'text-blue-200'],
                ['Mz', formatHoverValue(hoveredElement.result.maxAbsMomentZ, 'kN·m'), 'text-blue-200'],
              ].map(([label, value, color]) => (
                <div key={label} className="rounded border border-slate-800 bg-slate-900/70 px-2 py-1">
                  <span className="text-slate-500">{label}</span>
                  <span className={`float-right font-mono font-semibold ${color}`}>{value}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded border border-slate-800 bg-slate-900/70 px-2 py-1.5 text-slate-500">
              计算后显示该杆件内力
            </div>
          )}
        </div>
      ) : null}
      <div className="absolute bottom-3 left-3 rounded border border-slate-700 bg-slate-950/80 px-2.5 py-1.5 text-[10px] text-slate-400 backdrop-blur">
        拖拽旋转 · 滚轮缩放 · 右键平移
      </div>
      {forceMode !== 'none' ? (
        <div className="absolute bottom-3 right-3 w-56 rounded border border-slate-700 bg-slate-950/85 p-2 text-[10px] text-slate-300 backdrop-blur">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="font-semibold text-slate-400">控制内力</span>
            <span className="font-bold text-slate-100">{forceModeLabel[forceMode]}</span>
          </div>
          <div className="mb-2">
            <div className="h-1.5 rounded-full bg-[linear-gradient(to_right,#22d3ee,#f59e0b,#f43f5e)]" />
            <div className="mt-1 flex justify-between font-mono text-[8px] text-slate-500">
              <span>LOW</span>
              <span>HIGH</span>
            </div>
            <div className="mt-1 flex justify-between text-[8px] font-semibold">
              <span className="text-cyan-300">青色正值</span>
              <span className="text-rose-300">红色负值</span>
            </div>
          </div>
          {forceRows.length === 0 ? (
            <div className="rounded border border-slate-800 bg-slate-900/70 px-2 py-1.5 text-slate-500">暂无可显示的杆件内力</div>
          ) : (
            <div className="space-y-1">
              {forceRows.map((row, index) => (
                <div key={row.elementId} className="grid grid-cols-[2.5rem_1fr_auto] items-center gap-2 rounded border border-slate-800 bg-slate-900/70 px-2 py-1">
                  <span className="font-mono font-bold text-slate-500">#{index + 1}</span>
                  <span className="font-mono font-bold text-cyan-100">E{row.elementId}</span>
                  <span className="font-mono font-semibold text-slate-100">
                    {formatSignedForceValue(row.signedValue)} {forceModeUnit[forceMode]}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
};

export default SpaceModelViewport;
