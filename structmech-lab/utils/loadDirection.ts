import type { Load } from '../types';
import type { LoadDirection } from '../components/ui/LoadInput';

export const normalizeLoadAngle = (angle: number) => {
  const value = ((angle + 180) % 360 + 360) % 360 - 180;
  return Math.round((value === -180 ? 180 : value) * 10) / 10;
};
export function directionForAngle(angle: number): LoadDirection {
  const a = normalizeLoadAngle(angle);
  return a === 0 ? 'right' : a === 90 ? 'up' : a === -90 ? 'down' : a === 180 ? 'left' : 'custom';
}
/** Global components retain signed start/end intensities, including sign-changing line loads. */
export function globalLoadComponents(load: Pick<Load, 'direction' | 'angle' | 'magnitude'>) {
  if (load.direction === 'angle') {
    const a = (load.angle ?? 0) * Math.PI / 180;
    const x = Math.cos(a), y = Math.sin(a);
    return { x: load.magnitude * (Math.abs(x) < 1e-12 ? 0 : x), y: load.magnitude * (Math.abs(y) < 1e-12 ? 0 : y) };
  }
  return { x: load.direction === 'x' ? load.magnitude : 0, y: load.direction === 'x' ? 0 : load.magnitude };
}
export function solverLoadAngle(load: Load) {
  const sign = Math.sign(load.magnitude || load.magnitudeEnd || 1);
  return normalizeLoadAngle((load.direction === 'angle' ? load.angle ?? 0 : load.direction === 'x' ? 0 : 90) + (sign < 0 ? 180 : 0));
}
export function rotateSolverLoad(load: Load, angle: number): Load {
  if (load.type === 'moment') return { ...load, magnitude: -load.magnitude };
  const sign = Math.sign(load.magnitude || load.magnitudeEnd || 1), a = normalizeLoadAngle(angle);
  const axis = a === 0 || a === 180 ? 'x' : a === 90 || a === -90 ? 'y' : 'angle';
  const multiplier = sign * (axis !== 'angle' && (a === 180 || a === -90) ? -1 : 1);
  return { ...load, direction: axis, angle: axis === 'angle' ? a : undefined,
    magnitude: load.magnitude * multiplier,
    magnitudeEnd: load.magnitudeEnd === undefined ? undefined : load.magnitudeEnd * multiplier };
}
