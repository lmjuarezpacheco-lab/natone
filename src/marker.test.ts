import { describe, expect, it } from "vitest";
import { markerShape } from "./marker";

describe("markerShape", () => {
  const shape = markerShape(150, 150, 150);

  it("draws four corner brackets outside the token", () => {
    expect(shape.commands).toHaveLength(12);
    expect(shape.commands.filter((c) => c[0] === 0)).toHaveLength(4);
    const half = 75 + 150 * 0.07;
    // Every corner of the frame lies beyond the token's edge.
    const corners = shape.commands.filter((_, i) => i % 3 === 1);
    expect(corners.map(([, x, y]) => [Math.abs(x), Math.abs(y)])).toEqual(Array(4).fill([half, half]));
    expect(new Set(corners.map(([, x, y]) => `${Math.sign(x)},${Math.sign(y)}`)).size).toBe(4);
  });

  it("leaves the middle of each side open", () => {
    const starts = shape.commands.filter((c) => c[0] === 0);
    for (const [, x, y] of starts) expect(Math.abs(y)).toBeLessThan(Math.abs(x));
  });

  it("uses the longer side of a token that is not square", () => {
    expect(markerShape(300, 150, 150).signature).toBe(markerShape(300, 300, 150).signature);
  });

  it("keeps the line width within readable limits", () => {
    expect(markerShape(20, 20, 30).strokeWidth).toBe(4);
    expect(markerShape(900, 900, 600).strokeWidth).toBe(14);
  });

  it("changes its signature when the token changes size", () => {
    expect(markerShape(150, 150, 150).signature).toBe(shape.signature);
    expect(markerShape(300, 300, 150).signature).not.toBe(shape.signature);
  });
});
