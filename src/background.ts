// Runs in every client for as long as the room is open, even with the panel closed.
import OBR from "@owlbear-rodeo/sdk";
import { ownerOf, readItemData, setActive, writePatch } from "./backend/items";
import { CH_REQUEST, CH_ROLL, ID, KEY_ITEM, KEY_SETTINGS } from "./constants";
import { appendHistory, parseRoll } from "./history";
import { readSettings, sanitizePlayerPatch } from "./logic";
import { loadPrefs } from "./prefs";

const asset = (file: string) => new URL(`${import.meta.env.BASE_URL}${file}`, location.origin).href;

function setupContextMenu(): void {
  void OBR.contextMenu.create({
    id: `${ID}/toggle`,
    icons: [
      {
        icon: asset("add.svg"),
        label: "Agregar a iniciativa",
        filter: {
          permissions: ["UPDATE"],
          every: [
            { key: "layer", value: "CHARACTER" },
            { key: ["metadata", KEY_ITEM, "active"], value: true, operator: "!=" },
          ],
        },
      },
      {
        icon: asset("remove.svg"),
        label: "Quitar de iniciativa",
        filter: { permissions: ["UPDATE"], every: [{ key: "layer", value: "CHARACTER" }] },
      },
    ],
    onClick(context) {
      const add = context.items.every((item) => !readItemData(item)?.active);
      void OBR.scene.items.updateItems(context.items, (drafts) => {
        for (const draft of drafts) setActive(draft, add);
      });
    },
  });
}

/**
 * A player asked to change a token. Only a GM's client applies it, and only when the GM setting is on
 * and the sender owns the token. The sender is identified by the connection, not by the message.
 */
async function handleRequest(event: { data: unknown; connectionId: string }): Promise<void> {
  if ((await OBR.player.getRole()) !== "GM") return;
  if (typeof event.data !== "object" || event.data === null) return;
  const { itemId, patch: rawPatch } = event.data as { itemId?: unknown; patch?: unknown };
  const patch = sanitizePlayerPatch(rawPatch);
  if (typeof itemId !== "string" || !patch) return;

  const [roomMetadata, players, items] = await Promise.all([
    OBR.room.getMetadata(),
    OBR.party.getPlayers(),
    OBR.scene.items.getItems([itemId]),
  ]);
  if (!readSettings(roomMetadata[KEY_SETTINGS]).playersEditOwn) return;
  const sender = players.find((player) => player.connectionId === event.connectionId);
  const item = items[0];
  const data = item ? readItemData(item) : null;
  if (!sender || !item || !data?.active || ownerOf(item, data) !== sender.id) return;

  await OBR.scene.items.updateItems([itemId], (drafts) => {
    for (const draft of drafts) writePatch(draft, patch);
  });
}

OBR.onReady(() => {
  setupContextMenu();
  OBR.broadcast.onMessage(CH_REQUEST, (event) => void handleRequest(event));
  OBR.broadcast.onMessage(CH_ROLL, (event) => {
    const roll = parseRoll(event.data);
    if (!roll) return;
    appendHistory(OBR.room.id, roll);
    if (loadPrefs().notify) void OBR.notification.show(`${roll.playerName}: ${roll.label ? `${roll.label}, ` : ""}${roll.notation} = ${roll.total}`);
  });
});
