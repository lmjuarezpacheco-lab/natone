// Draws a frame on the map around the token whose turn it is.
// The frame is a local item: each client draws its own, nothing is saved in the scene, and a player's
// client never draws it for a token that is hidden from players.
import OBR, { type Item, buildPath } from "@owlbear-rodeo/sdk";
import { ID, KEY_COMBAT, KEY_SETTINGS } from "../constants";
import { readCombat, readSettings } from "../logic";
import { markerShape } from "../marker";
import { readItemData } from "./items";

const KEY_MARKER = `${ID}/turn-marker`;
const COLOR = "#ffb020";
const OUTLINE = "#14151f";

async function findTarget(): Promise<Item | null> {
  const [sceneMetadata, roomMetadata, role] = await Promise.all([
    OBR.scene.getMetadata(),
    OBR.room.getMetadata(),
    OBR.player.getRole(),
  ]);
  const combat = readCombat(sceneMetadata[KEY_COMBAT]);
  if (!readSettings(roomMetadata[KEY_SETTINGS]).showMarker || combat.round === 0 || !combat.activeId) return null;
  const [item] = await OBR.scene.items.getItems([combat.activeId]);
  if (!item || !readItemData(item)?.active) return null;
  return item.visible || role === "GM" ? item : null;
}

async function sync(): Promise<void> {
  if (!(await OBR.scene.isReady())) return;
  const existing = await OBR.scene.local.getItems((item) => item.metadata[KEY_MARKER] !== undefined);
  const remove = () => (existing.length > 0 ? OBR.scene.local.deleteItems(existing.map((item) => item.id)) : undefined);

  const target = await findTarget();
  if (!target) {
    await remove();
    return;
  }

  const [bounds, dpi] = await Promise.all([OBR.scene.items.getItemBounds([target.id]), OBR.scene.grid.getDpi()]);
  const shape = markerShape(bounds.width, bounds.height, dpi);
  const signature = `${target.id}|${shape.signature}`;

  if (existing.length === 2 && existing.every((item) => item.metadata[KEY_MARKER] === signature)) {
    // Same token and size. The frame follows the token as an attachment; this corrects any drift.
    const { x, y } = existing[0].position;
    if (Math.hypot(x - bounds.center.x, y - bounds.center.y) > 1) {
      await OBR.scene.local.updateItems(
        existing.map((item) => item.id),
        (drafts) => {
          for (const draft of drafts) draft.position = bounds.center;
        },
      );
    }
    return;
  }

  await remove();
  // A dark line under the colored one keeps the frame readable on any map.
  const layers = [
    { color: OUTLINE, width: shape.strokeWidth + 5, opacity: 0.75, zIndex: 0 },
    { color: COLOR, width: shape.strokeWidth, opacity: 1, zIndex: 1 },
  ];
  const build = (attach: boolean) =>
    layers.map((layer) => {
      const builder = buildPath()
        .name("Turno")
        .commands(shape.commands)
        .fillOpacity(0)
        .strokeColor(layer.color)
        .strokeOpacity(layer.opacity)
        .strokeWidth(layer.width)
        .position(bounds.center)
        .layer("ATTACHMENT")
        .zIndex(layer.zIndex)
        .locked(true)
        .disableHit(true)
        .metadata({ [KEY_MARKER]: signature });
      // The frame keeps its own size and angle. It is redrawn when the token changes.
      return attach
        ? builder.attachedTo(target.id).disableAttachmentBehavior(["ROTATION", "SCALE", "COPY"]).build()
        : builder.build();
    });
  try {
    await OBR.scene.local.addItems(build(true));
  } catch {
    // Without attachment the frame is still placed correctly after every move.
    await OBR.scene.local.addItems(build(false));
  }
}

let running = false;
let pending = false;

/** Brings the frame up to date. Calls made while an update runs are merged into one more pass. */
export function syncTurnMarker(): void {
  if (running) {
    pending = true;
    return;
  }
  running = true;
  void (async () => {
    do {
      pending = false;
      try {
        await sync();
      } catch (error) {
        console.warn("Tirada: turn marker update failed.", error);
      }
    } while (pending);
    running = false;
  })();
}
