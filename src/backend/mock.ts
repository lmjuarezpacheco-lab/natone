// Sample data for previewing the panel outside Owlbear Rodeo. Nothing here is shared or saved.
import { mergeRolls } from "../history";
import { applyPatches, canEdit } from "../logic";
import type { Backend, Combatant, State } from "../types";
import { DEFAULT_COMBAT, DEFAULT_SETTINGS } from "../types";

const SAMPLE: Combatant[] = [
  { id: "t1", name: "Lyra", initiative: null, bonus: 3, ownerId: "me", profileId: null, visible: true },
  { id: "t2", name: "Brom", initiative: null, bonus: 1, ownerId: "ana", profileId: null, visible: true },
  { id: "t3", name: "Kael", initiative: null, bonus: 4, ownerId: "beto", profileId: null, visible: true },
  { id: "t4", name: "Goblin A", initiative: null, bonus: 2, ownerId: "sara", profileId: null, visible: true },
  { id: "t5", name: "Ogro oculto", initiative: null, bonus: -1, ownerId: "sara", profileId: null, visible: false },
];

export function createMockBackend(): Backend {
  let state: State = {
    standalone: true,
    sceneReady: true,
    me: { id: "me", name: "Tú", role: "GM", color: "#7c5cff" },
    players: [
      { id: "me", name: "Tú", role: "GM" },
      { id: "ana", name: "Ana", role: "PLAYER" },
      { id: "beto", name: "Beto", role: "PLAYER" },
      { id: "sara", name: "Sara", role: "GM" },
    ],
    combatants: SAMPLE,
    settings: { ...DEFAULT_SETTINGS },
    combat: { ...DEFAULT_COMBAT },
    rolls: [],
    theme: {
      mode: "DARK",
      primary: "#bb99ff",
      primaryContrast: "#1a1a2e",
      background: "#1e2231",
      paper: "#222639",
      text: "#ffffff",
      textSecondary: "rgba(255,255,255,0.7)",
    },
  };
  const listeners = new Set<() => void>();
  const set = (patch: Partial<State>) => {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  };

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async patchCombatants(patches) {
      // Same rule the GM's client enforces in a real room.
      const allowed = Object.fromEntries(
        Object.entries(patches).filter(([id]) => {
          const target = state.combatants.find((c) => c.id === id);
          return target !== undefined && canEdit(state.me, state.settings, target);
        }),
      );
      set({ combatants: applyPatches(state.combatants, allowed) });
    },
    async removeCombatants(ids) {
      set({ combatants: state.combatants.filter((c) => !ids.includes(c.id)) });
    },
    async getSelection() {
      // The preview has no map. It behaves as if the sample goblin were selected.
      return ["t4"];
    },
    async assignProfile(ids, profileId, bonus) {
      const targets = state.combatants.filter((c) => ids.includes(c.id));
      set({ combatants: state.combatants.map((c) => (ids.includes(c.id) ? { ...c, profileId, bonus } : c)) });
      return targets.length;
    },
    async setSettings(settings) {
      set({ settings });
    },
    async setCombat(combat) {
      set({ combat });
    },
    sendRoll(entry) {
      set({ rolls: mergeRolls(state.rolls, [entry]) });
    },
    setRole(role) {
      set({ me: { ...state.me, role }, players: state.players.map((p) => (p.id === "me" ? { ...p, role } : p)) });
    },
  };
}
