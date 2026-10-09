import { useEffect, useState } from 'react';
export interface QuasiStaticPlayback { factor: number; playing: boolean; speed: number; setFactor: (v: number) => void; toggle: () => void; setSpeed: (v: number) => void; }
/** Each frame is a static equilibrium state. Model edits restore the full-load state. */
export function useQuasiStatic(modelKey: string): QuasiStaticPlayback {
  const [state, setState] = useState({ key: modelKey, factor: 1, playing: false, speed: 1 });
  const current = state.key === modelKey ? state : { key: modelKey, factor: 1, playing: false, speed: state.speed };
  useEffect(() => {
    if (!current.playing) return;
    const timer = window.setInterval(() => setState(s => {
      if (s.key !== modelKey || !s.playing) return s;
      const factor = Math.min(1, s.factor + .02 * s.speed);
      return { ...s, factor, playing: factor < 1 };
    }), 120);
    return () => window.clearInterval(timer);
  }, [modelKey, current.playing, current.speed]);
  return { ...current, setFactor: v => setState({ ...current, factor: Math.max(0, Math.min(1, v)), playing: false }),
    toggle: () => setState({ ...current, factor: current.factor >= 1 ? 0 : current.factor, playing: !current.playing }),
    setSpeed: speed => setState({ ...current, speed }) };
}
export function scaleLoads<T extends { magnitude: number; endMagnitude?: number; magnitudeEnd?: number }>(loads: T[], factor: number): T[] {
  return loads.map(l => ({ ...l, magnitude: l.magnitude * factor,
    ...('endMagnitude' in l ? { endMagnitude: (l.endMagnitude ?? l.magnitude) * factor } : {}),
    ...('magnitudeEnd' in l ? { magnitudeEnd: (l.magnitudeEnd ?? l.magnitude) * factor } : {}) }));
}
