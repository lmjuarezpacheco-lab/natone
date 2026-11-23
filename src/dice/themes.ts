export interface DiceTheme {
  /** Folder name under assets/dice-box/themes. Keep in sync with scripts/copy-assets.mjs. */
  id: string;
  name: string;
  /** The model takes the player's chosen color. */
  colorable: boolean;
}

export const THEMES: DiceTheme[] = [
  { id: "default", name: "Clásico", colorable: true },
  { id: "smooth", name: "Liso", colorable: true },
  { id: "gemstone", name: "Gema", colorable: true },
  { id: "rock", name: "Roca", colorable: true },
  { id: "rust", name: "Óxido", colorable: true },
  { id: "gemstoneMarble", name: "Mármol arcoíris", colorable: false },
  { id: "blueGreenMetal", name: "Metal envejecido", colorable: false },
  { id: "diceOfRolling", name: "Dice of Rolling", colorable: false },
  { id: "wooden", name: "Madera", colorable: false },
];

export function findTheme(id: string): DiceTheme {
  return THEMES.find((theme) => theme.id === id) ?? THEMES[0];
}
