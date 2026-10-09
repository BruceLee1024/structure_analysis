export interface DiagramPoint { x: number; y: number }
export interface LabelBox extends DiagramPoint { width: number; height: number }
export interface DiagramObstacle { points: DiagramPoint[]; filled?: boolean }
export interface ResultLabelRequest { point: DiagramPoint; width: number; height: number }

const intersects = (a: LabelBox, b: LabelBox) =>
    a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y;
const padded = (box: LabelBox, margin: number): LabelBox => ({
    x: box.x - margin, y: box.y - margin, width: box.width + margin * 2, height: box.height + margin * 2,
});
const bounds = (points: DiagramPoint[]): LabelBox => {
    const xs = points.map(p => p.x), ys = points.map(p => p.y);
    const x = Math.min(...xs), y = Math.min(...ys);
    return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
};
const inside = (p: DiagramPoint, polygon: DiagramPoint[]) => {
    let result = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const a = polygon[i], b = polygon[j];
        if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) result = !result;
    }
    return result;
};
const segmentHitsBox = (a: DiagramPoint, b: DiagramPoint, box: LabelBox) => {
    let enter = 0, leave = 1;
    const dx = b.x - a.x, dy = b.y - a.y;
    const edges = [[-dx, a.x - box.x], [dx, box.x + box.width - a.x],
        [-dy, a.y - box.y], [dy, box.y + box.height - a.y]];
    for (const [p, q] of edges) {
        if (p === 0) { if (q < 0) return false; }
        else if (p < 0) enter = Math.max(enter, q / p);
        else leave = Math.min(leave, q / p);
        if (enter > leave) return false;
    }
    return true;
};

/** Labels protect member lines, result curves and the interiors of filled diagrams. */
export function placeResultLabels(requests: ResultLabelRequest[], obstacles: DiagramObstacle[], viewport: { width: number; height: number }): LabelBox[] {
    const geometry = obstacles.filter(o => o.points.length > 0).map(o => ({ ...o, bounds: bounds(o.points) }));
    const allPoints = geometry.flatMap(o => o.points);
    const overall = allPoints.length ? bounds(allPoints) : null;
    const placed: LabelBox[] = [];
    for (const { point, width, height } of requests) {
        const maxX = Math.max(6, viewport.width - width - 6), maxY = Math.max(6, viewport.height - height - 6);
        const candidates: LabelBox[] = [];
        const add = (x: number, y: number) => candidates.push({ x: Math.max(6, Math.min(maxX, x)), y: Math.max(6, Math.min(maxY, y)), width, height });
        // Begin at nearby clearances, then search the entire plot for dense frames.
        for (const gap of [12, 24, 40, 64]) {
            add(point.x - width / 2, point.y - height - gap);
            add(point.x - width / 2, point.y + gap);
            add(point.x - width - gap, point.y - height / 2);
            add(point.x + gap, point.y - height / 2);
        }
        if (overall) {
            add(point.x - width / 2, overall.y - height - 12);
            add(point.x - width / 2, overall.y + overall.height + 12);
            add(overall.x - width - 12, point.y - height / 2);
            add(overall.x + overall.width + 12, point.y - height / 2);
        }
        for (let y = 6; y <= maxY; y += height + 8) {
            for (let x = 6; x <= maxX; x += 16) add(x, y);
            add(maxX, y);
        }
        const score = (box: LabelBox, bestScore: number) => {
            const distance = Math.hypot(box.x + width / 2 - point.x, box.y + height / 2 - point.y);
            const interior = overall && intersects(padded(box, 7), overall) ? 48 : 0;
            if (distance + interior >= bestScore) return Infinity;
            const safeBox = padded(box, 7);
            const labelHits = placed.filter(other => intersects(padded(box, 4), other)).length;
            const shapeHits = geometry.filter(o => {
                if (!intersects(safeBox, o.bounds)) return false;
                for (let i = 1; i < o.points.length; i++) {
                    if (segmentHitsBox(o.points[i - 1], o.points[i], safeBox)) return true;
                }
                if (!o.filled) return false;
                if (segmentHitsBox(o.points[o.points.length - 1], o.points[0], safeBox)) return true;
                return inside({ x: safeBox.x, y: safeBox.y }, o.points);
            }).length;
            // Prefer the perimeter without forcing distant labels when an interior gap is much closer.
            return (labelHits + shapeHits) * 100000 + distance + interior;
        };
        let best = candidates[0], bestScore = Infinity;
        for (const candidate of candidates) {
            const candidateScore = score(candidate, bestScore);
            if (candidateScore < bestScore) { best = candidate; bestScore = candidateScore; }
        }
        placed.push(best);
    }
    return placed;
}
