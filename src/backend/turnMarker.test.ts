import { beforeEach, describe, expect, it, vi } from "vitest";

// A small stand-in for the parts of Owlbear Rodeo that the turn frame uses.
const world = vi.hoisted(() => ({
  ready: true,
  role: "GM" as "GM" | "PLAYER",
  sceneMetadata: {} as Record<string, unknown>,
  roomMetadata: {} as Record<string, unknown>,
  tokens: [] as { id: string; visible: boolean; metadata: Record<string, unknown>; center: { x: number; y: number }; size: number }[],
  local: [] as Record<string, any>[],
  rejectAttachments: false,
  nextId: 1,
}));

vi.mock("@owlbear-rodeo/sdk", () => {
  const buildPath = () => {
    const item: Record<string, any> = { type: "PATH", metadata: {}, style: {} };
    const builder: Record<string, any> = {};
    const set = (key: string) => (value: unknown) => ((item[key] = value), builder);
    for (const key of ["name", "commands", "position", "layer", "zIndex", "locked", "disableHit", "metadata", "attachedTo", "disableAttachmentBehavior"]) {
      builder[key] = set(key);
    }
    for (const key of ["fillOpacity", "strokeColor", "strokeOpacity", "strokeWidth"]) {
      builder[key] = (value: unknown) => ((item.style[key] = value), builder);
    }
    builder.build = () => ({ ...item, id: `local-${world.nextId++}` });
    return builder;
  };
  const OBR = {
    scene: {
      isReady: async () => world.ready,
      getMetadata: async () => world.sceneMetadata,
      grid: { getDpi: async () => 150 },
      items: {
        getItems: async (ids: string[]) => world.tokens.filter((t) => ids.includes(t.id)),
        getItemBounds: async (ids: string[]) => {
          const token = world.tokens.find((t) => t.id === ids[0])!;
          return { center: token.center, width: token.size, height: token.size };
        },
      },
      local: {
        getItems: async (filter: (item: any) => boolean) => world.local.filter(filter),
        addItems: async (items: any[]) => {
          if (world.rejectAttachments && items.some((item) => item.attachedTo)) throw new Error("attachments not supported");
          world.local.push(...items);
        },
        deleteItems: async (ids: string[]) => {
          world.local = world.local.filter((item) => !ids.includes(item.id));
        },
        updateItems: async (ids: string[], update: (drafts: any[]) => void) => {
          update(world.local.filter((item) => ids.includes(item.id)));
        },
      },
    },
    room: { getMetadata: async () => world.roomMetadata },
    player: { getRole: async () => world.role },
  };
  return { default: OBR, buildPath, isImage: () => false };
});

import { KEY_COMBAT, KEY_ITEM, KEY_SETTINGS } from "../constants";
import { syncTurnMarker } from "./turnMarker";

const token = (id: string, x: number, visible = true) => ({
  id,
  visible,
  metadata: { [KEY_ITEM]: { active: true, initiative: 10, bonus: 0 } },
  center: { x, y: 100 },
  size: 150,
});

/** Runs an update and waits until the frame stops changing. */
async function sync() {
  syncTurnMarker();
  let previous = "";
  await vi.waitFor(() => {
    const now = JSON.stringify(world.local);
    const settled = now === previous;
    previous = now;
    expect(settled).toBe(true);
  });
}

beforeEach(() => {
  world.ready = true;
  world.role = "GM";
  world.sceneMetadata = { [KEY_COMBAT]: { round: 1, activeId: "a" } };
  world.roomMetadata = {};
  world.tokens = [token("a", 100), token("b", 500)];
  world.local = [];
  world.rejectAttachments = false;
});

describe("turn frame", () => {
  it("draws nothing while no combat is running", async () => {
    world.sceneMetadata = { [KEY_COMBAT]: { round: 0, activeId: null } };
    await sync();
    expect(world.local).toEqual([]);
  });

  it("frames the active token and follows it as an attachment", async () => {
    await sync();
    expect(world.local).toHaveLength(2);
    for (const item of world.local) {
      expect(item).toMatchObject({ attachedTo: "a", position: { x: 100, y: 100 }, layer: "ATTACHMENT", disableHit: true, locked: true });
      expect(item.commands).toHaveLength(12);
    }
    // The dark line sits under the colored one and is wider.
    const [under, over] = world.local;
    expect(under.zIndex).toBeLessThan(over.zIndex);
    expect(under.style.strokeWidth).toBeGreaterThan(over.style.strokeWidth);
  });

  it("keeps the same frame when nothing changed", async () => {
    await sync();
    const ids = world.local.map((item) => item.id);
    await sync();
    expect(world.local.map((item) => item.id)).toEqual(ids);
  });

  it("moves the frame when the token moved without it", async () => {
    await sync();
    const ids = world.local.map((item) => item.id);
    world.tokens[0].center = { x: 260, y: 340 };
    await sync();
    expect(world.local.map((item) => item.id)).toEqual(ids);
    expect(world.local.map((item) => item.position)).toEqual([{ x: 260, y: 340 }, { x: 260, y: 340 }]);
  });

  it("moves to the next token when the turn changes", async () => {
    await sync();
    world.sceneMetadata = { [KEY_COMBAT]: { round: 1, activeId: "b" } };
    await sync();
    expect(world.local).toHaveLength(2);
    expect(world.local.every((item) => item.attachedTo === "b" && item.position.x === 500)).toBe(true);
  });

  it("redraws when the token changes size", async () => {
    await sync();
    const before = world.local[0].commands;
    world.tokens[0].size = 300;
    await sync();
    expect(world.local).toHaveLength(2);
    expect(world.local[0].commands).not.toEqual(before);
  });

  it("is removed when the round waits for values, the token leaves the tracker, or the token is deleted", async () => {
    await sync();
    world.sceneMetadata = { [KEY_COMBAT]: { round: 2, activeId: null } };
    await sync();
    expect(world.local).toEqual([]);

    world.sceneMetadata = { [KEY_COMBAT]: { round: 2, activeId: "a" } };
    await sync();
    expect(world.local).toHaveLength(2);
    world.tokens[0].metadata = { [KEY_ITEM]: { active: false, initiative: null, bonus: 0 } };
    await sync();
    expect(world.local).toEqual([]);

    world.sceneMetadata = { [KEY_COMBAT]: { round: 2, activeId: "b" } };
    await sync();
    expect(world.local).toHaveLength(2);
    world.tokens = world.tokens.filter((t) => t.id !== "b");
    await sync();
    expect(world.local).toEqual([]);
  });

  it("is hidden from players when the active token is hidden, and shown to the GM", async () => {
    world.tokens = [token("a", 100, false)];
    world.role = "PLAYER";
    await sync();
    expect(world.local).toEqual([]);
    world.role = "GM";
    await sync();
    expect(world.local).toHaveLength(2);
  });

  it("can be turned off by the GM", async () => {
    await sync();
    world.roomMetadata = { [KEY_SETTINGS]: { showMarker: false } };
    await sync();
    expect(world.local).toEqual([]);
  });

  it("still draws the frame when attachments are refused", async () => {
    world.rejectAttachments = true;
    await sync();
    expect(world.local).toHaveLength(2);
    expect(world.local.every((item) => item.attachedTo === undefined && item.position.x === 100)).toBe(true);
  });

  it("does nothing while no scene is open", async () => {
    world.ready = false;
    await sync();
    expect(world.local).toEqual([]);
  });
});
