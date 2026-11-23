export type Role = "GM" | "PLAYER";

/** "standard": one roll for the whole combat. "reroll": new initiative every round. */
export type Mode = "standard" | "reroll";

export interface Settings {
  mode: Mode;
  /** Only used when mode is "reroll". true: the tracker rolls for everyone. false: values are entered by hand each round. */
  rerollAuto: boolean;
  /** Players may edit the initiative and bonus of tokens they own. */
  playersEditOwn: boolean;
  /** Draw a frame on the map around the token whose turn it is. */
  showMarker: boolean;
}

export interface Combat {
  /** 0 means no combat is running. */
  round: number;
  /** null while a round waits for manual initiative values. */
  activeId: string | null;
}

export interface Combatant {
  id: string;
  name: string;
  image?: string;
  initiative: number | null;
  bonus: number;
  ownerId: string;
  /** Linked monster sheet from the GM's library, or null. */
  profileId: string | null;
  /** Hidden tokens are not listed for players. */
  visible: boolean;
}

export interface Patch {
  initiative?: number | null;
  bonus?: number;
  ownerId?: string;
  profileId?: string | null;
}

export type Patches = Record<string, Patch>;

export interface Me {
  id: string;
  name: string;
  role: Role;
  color: string;
}

export interface PlayerInfo {
  id: string;
  name: string;
  role: Role;
}

export interface DieResult {
  sides: number;
  value: number;
  /** Discarded by advantage or disadvantage. */
  dropped?: boolean;
}

export interface RollEntry {
  id: string;
  playerId: string;
  playerName: string;
  color: string;
  /** What the roll is for, when it comes from a monster sheet. */
  label?: string;
  notation: string;
  dice: DieResult[];
  modifier: number;
  total: number;
  hidden: boolean;
  time: number;
}

export interface ThemeColors {
  mode: "DARK" | "LIGHT";
  primary: string;
  primaryContrast: string;
  background: string;
  paper: string;
  text: string;
  textSecondary: string;
}

export interface State {
  /** True when running outside Owlbear Rodeo with sample data. */
  standalone: boolean;
  /** False while no scene is open. */
  sceneReady: boolean;
  me: Me;
  players: PlayerInfo[];
  combatants: Combatant[];
  settings: Settings;
  combat: Combat;
  rolls: RollEntry[];
  theme: ThemeColors;
}

export interface Backend {
  getState(): State;
  subscribe(listener: () => void): () => void;
  /** GM: writes directly. Player: asks the GM's client, which checks ownership. */
  patchCombatants(patches: Patches): Promise<void>;
  removeCombatants(ids: string[]): Promise<void>;
  /** Ids of the tokens the user has selected on the map. */
  getSelection(): Promise<string[]>;
  /** GM only. Links tokens to a monster sheet, sets their bonus and adds them to the tracker. Returns how many tokens changed. */
  assignProfile(ids: string[], profileId: string, bonus: number): Promise<number>;
  setSettings(settings: Settings): Promise<void>;
  setCombat(combat: Combat): Promise<void>;
  /** Adds the roll to the log and shares it unless it is hidden. */
  sendRoll(entry: RollEntry): void;
  /** Standalone preview only. */
  setRole?(role: Role): void;
}

export const DEFAULT_SETTINGS: Settings = {
  mode: "standard",
  rerollAuto: true,
  playersEditOwn: false,
  showMarker: true,
};

export const DEFAULT_COMBAT: Combat = { round: 0, activeId: null };
