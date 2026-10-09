import { describe, expect, it } from 'vitest';
import { placeResultLabels, type LabelBox, type DiagramObstacle } from './resultLabelLayout';

const overlaps = (a: LabelBox, b: LabelBox) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

describe('result labels preserve visible geometry', () => {
    it('keeps portal peak badges outside both beam and filled moment diagram', () => {
        const obstacles: DiagramObstacle[] = [
            { points: [{ x: 64, y: 250 }, { x: 64, y: 140 }, { x: 230, y: 140 }, { x: 230, y: 250 }] },
            { points: [{ x: 64, y: 140 }, { x: 147, y: 176 }, { x: 230, y: 140 }], filled: true },
        ];
        const [box] = placeResultLabels([{ point: { x: 147, y: 176 }, width: 46, height: 24 }], obstacles, { width: 294, height: 360 });
        expect(box.y + box.height).toBeLessThan(133);
        expect(box.width).toBe(46);
    });

    it('does not put labels inside a filled axial-force region even without crossing its edges', () => {
        const region = { x: 80, y: 100, width: 130, height: 180 };
        const [box] = placeResultLabels([{ point: { x: 145, y: 180 }, width: 60, height: 24 }], [{
            points: [{ x: 80, y: 100 }, { x: 210, y: 100 }, { x: 210, y: 280 }, { x: 80, y: 280 }], filled: true,
        }], { width: 294, height: 360 });
        expect(overlaps(box, region)).toBe(false);
    });

    it('separates repeated joint values without clipping in a narrow card', () => {
        const viewport = { width: 220, height: 260 };
        const boxes = placeResultLabels(Array.from({ length: 9 }, () => ({ point: { x: 110, y: 130 }, width: 62, height: 24 })), [{
            points: [{ x: 60, y: 130 }, { x: 160, y: 130 }],
        }], viewport);
        boxes.forEach((box, index) => {
            expect(box.x).toBeGreaterThanOrEqual(6);
            expect(box.y).toBeGreaterThanOrEqual(6);
            expect(box.x + box.width).toBeLessThanOrEqual(viewport.width - 6);
            expect(box.y + box.height).toBeLessThanOrEqual(viewport.height - 6);
            boxes.slice(index + 1).forEach(other => expect(overlaps(box, other)).toBe(false));
            expect(box.y + box.height < 123 || box.y > 137).toBe(true);
        });
    });

    it('protects the original member as well as the displaced curve', () => {
        const [box] = placeResultLabels([{ point: { x: 100, y: 156 }, width: 72, height: 24 }], [
            { points: [{ x: 40, y: 120 }, { x: 180, y: 120 }] },
            { points: [{ x: 40, y: 156 }, { x: 180, y: 156 }] },
        ], { width: 220, height: 260 });
        expect(box.y + box.height < 113 || box.y > 163).toBe(true);
    });
});
