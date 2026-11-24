import { t } from "../i18n";

export interface DiceTheme {
  /** Folder name under assets/dice-box/themes. Keep in sync with scripts/copy-assets.mjs. */
  id: string;
  name: string;
  /** The model takes the player's chosen color. */
  colorable: boolean;
}

export const THEMES: DiceTheme[] = [
  { id: "default", name: t("theme.default"), colorable: true },
  { id: "smooth", name: t("theme.smooth"), colorable: true },
  { id: "gemstone", name: t("theme.gemstone"), colorable: true },
  { id: "rock", name: t("theme.rock"), colorable: true },
  { id: "rust", name: t("theme.rust"), colorable: true },
  { id: "gemstoneMarble", name: t("theme.gemstoneMarble"), colorable: false },
  { id: "blueGreenMetal", name: t("theme.blueGreenMetal"), colorable: false },
  { id: "diceOfRolling", name: t("theme.diceOfRolling"), colorable: false },
  { id: "wooden", name: t("theme.wooden"), colorable: false },
];

export function findTheme(id: string): DiceTheme {
  return THEMES.find((theme) => theme.id === id) ?? THEMES[0];
}
