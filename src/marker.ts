// Geometry of the frame drawn around the token whose turn it is. Pure, so it can be tested without a map.

/** Path commands in the numbering Owlbear Rodeo uses: 0 moves the pen, 1 draws a line. */
export type MarkerCommand = [0, number, number] | [1, number, number];

export interface MarkerShape {
  /** Four corner brackets, in coordinates relative to the token's center. */
  commands: MarkerCommand[];
  strokeWidth: number;
  /** Changes whenever the frame must be redrawn. */
  signature: string;
}

/**
 * Builds a square frame around a token of the given size.
 * `dpi` is the scene's pixels per grid cell, so the frame scales with the map.
 */
export function markerShape(width: number, height: number, dpi: number): MarkerShape {
  const gap = dpi * 0.07;
  const half = Math.max(width, height) / 2 + gap;
  const arm = half * 0.5;
  const strokeWidth = Math.min(14, Math.max(4, dpi * 0.045));
  const commands: MarkerCommand[] = [];
  for (const [sx, sy] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ]) {
    commands.push([0, sx * half, sy * (half - arm)], [1, sx * half, sy * half], [1, sx * (half - arm), sy * half]);
  }
  return { commands, strokeWidth, signature: `${Math.round(half)}:${Math.round(strokeWidth)}` };
}
