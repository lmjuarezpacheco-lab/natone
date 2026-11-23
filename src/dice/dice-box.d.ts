declare module "@3d-dice/dice-box" {
  export interface DiceBoxResult {
    sides: number | string;
    value: number;
  }
  export default class DiceBox {
    constructor(config: Record<string, unknown>);
    init(): Promise<unknown>;
    roll(notation: string | string[], options?: { theme?: string; themeColor?: string }): Promise<DiceBoxResult[]>;
    updateConfig(config: Record<string, unknown>): Promise<unknown>;
    clear(): unknown;
    resizeWorld(): void;
  }
}
