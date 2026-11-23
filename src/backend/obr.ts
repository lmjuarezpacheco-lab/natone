import OBR, { type Player, type Theme } from "@owlbear-rodeo/sdk";
import { CH_REQUEST, CH_ROLL, KEY_COMBAT, KEY_SETTINGS } from "../constants";
import { appendHistory, isHistoryKey, loadHistory, mergeRolls, parseRoll } from "../history";
import { readCombat, readSettings } from "../logic";
import type { Backend, PlayerInfo, State, ThemeColors } from "../types";
import { DEFAULT_COMBAT } from "../types";
import { linkProfile, setActive, toCombatants, writePatch } from "./items";

function toTheme(theme: Theme): ThemeColors {
  return {
    mode: theme.mode,
    primary: theme.primary.main,
    primaryContrast: theme.primary.contrastText,
    background: theme.background.default,
    paper: theme.background.paper,
    text: theme.text.primary,
    textSecondary: theme.text.secondary,
  };
}

const toInfo = (p: Pick<Player, "id" | "name" | "role">): PlayerInfo => ({ id: p.id, name: p.name, role: p.role });

export async function createObrBackend(): Promise<Backend> {
  await new Promise<void>((resolve) => OBR.onReady(resolve));

  const roomId = OBR.room.id;
  const [id, name, role, color, theme, roomMetadata, party] = await Promise.all([
    OBR.player.getId(),
    OBR.player.getName(),
    OBR.player.getRole(),
    OBR.player.getColor(),
    OBR.theme.getTheme(),
    OBR.room.getMetadata(),
    OBR.party.getPlayers(),
  ]);

  let state: State = {
    standalone: false,
    sceneReady: false,
    me: { id, name, role, color },
    players: [{ id, name, role }, ...party.map(toInfo)],
    combatants: [],
    settings: readSettings(roomMetadata[KEY_SETTINGS]),
    combat: { ...DEFAULT_COMBAT },
    rolls: loadHistory(roomId),
    theme: toTheme(theme),
  };
  const listeners = new Set<() => void>();
  const set = (patch: Partial<State>) => {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  };

  const readScene = async () => {
    if (!(await OBR.scene.isReady())) {
      set({ sceneReady: false, combatants: [], combat: { ...DEFAULT_COMBAT } });
      return;
    }
    const [items, metadata] = await Promise.all([OBR.scene.items.getItems(), OBR.scene.getMetadata()]);
    set({ sceneReady: true, combatants: toCombatants(items), combat: readCombat(metadata[KEY_COMBAT]) });
  };

  OBR.scene.onReadyChange(() => void readScene());
  OBR.scene.items.onChange((items) => set({ combatants: toCombatants(items) }));
  OBR.scene.onMetadataChange((metadata) => set({ combat: readCombat(metadata[KEY_COMBAT]) }));
  OBR.room.onMetadataChange((metadata) => set({ settings: readSettings(metadata[KEY_SETTINGS]) }));
  OBR.theme.onChange((next) => set({ theme: toTheme(next) }));
  OBR.player.onChange((p) => set({ me: { id: p.id, name: p.name, role: p.role, color: p.color } }));
  OBR.party.onChange((players) => set({ players: [toInfo(state.me), ...players.map(toInfo)] }));
  OBR.broadcast.onMessage(CH_ROLL, (event) => {
    const roll = parseRoll(event.data);
    if (roll) set({ rolls: mergeRolls(state.rolls, [roll]) });
  });
  // The background page stores rolls that arrive while this panel is closed or busy.
  window.addEventListener("storage", (event) => {
    if (isHistoryKey(roomId, event.key)) set({ rolls: mergeRolls(state.rolls, loadHistory(roomId)) });
  });

  await readScene();

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async patchCombatants(patches) {
      const ids = Object.keys(patches);
      if (ids.length === 0) return;
      if (state.me.role === "GM") {
        await OBR.scene.items.updateItems(ids, (drafts) => {
          for (const draft of drafts) writePatch(draft, patches[draft.id]);
        });
        return;
      }
      await Promise.all(
        ids.map((itemId) => {
          const { initiative, bonus } = patches[itemId];
          const patch = { ...(initiative !== undefined ? { initiative } : {}), ...(bonus !== undefined ? { bonus } : {}) };
          return OBR.broadcast.sendMessage(CH_REQUEST, { itemId, patch }, { destination: "REMOTE" });
        }),
      );
    },
    async removeCombatants(ids) {
      if (ids.length === 0) return;
      await OBR.scene.items.updateItems(ids, (drafts) => {
        for (const draft of drafts) setActive(draft, false);
      });
    },
    async getSelection() {
      return (await OBR.player.getSelection()) ?? [];
    },
    async assignProfile(ids, profileId, bonus) {
      if (ids.length === 0) return 0;
      let changed = 0;
      await OBR.scene.items.updateItems(ids, (drafts) => {
        changed = drafts.filter((draft) => linkProfile(draft, profileId, bonus)).length;
      });
      return changed;
    },
    async setSettings(settings) {
      await OBR.room.setMetadata({ [KEY_SETTINGS]: settings });
    },
    async setCombat(combat) {
      await OBR.scene.setMetadata({ [KEY_COMBAT]: combat });
    },
    sendRoll(entry) {
      set({ rolls: mergeRolls(state.rolls, [entry]) });
      appendHistory(roomId, entry);
      if (!entry.hidden) void OBR.broadcast.sendMessage(CH_ROLL, entry, { destination: "REMOTE" });
    },
  };
}
