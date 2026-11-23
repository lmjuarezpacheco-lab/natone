import { isImage, type Item } from "@owlbear-rodeo/sdk";
import { KEY_ITEM } from "../constants";
import { BONUS_RANGE, INITIATIVE_RANGE, clampInt } from "../logic";
import type { Combatant, Patch } from "../types";

const TOKEN_LAYERS = new Set(["CHARACTER", "MOUNT"]);

/** Shape stored in a token's metadata. `active: false` keeps the bonus after the token leaves the tracker. */
export interface ItemData {
  active: boolean;
  initiative: number | null;
  bonus: number;
  ownerId?: string;
  profileId?: string;
}

export function readItemData(item: Item): ItemData | null {
  const raw = item.metadata[KEY_ITEM];
  if (typeof raw !== "object" || raw === null) return null;
  const input = raw as Record<string, unknown>;
  return {
    active: input.active === true,
    initiative: clampInt(input.initiative, INITIATIVE_RANGE.min, INITIATIVE_RANGE.max),
    bonus: clampInt(input.bonus, BONUS_RANGE.min, BONUS_RANGE.max) ?? 0,
    ...(typeof input.ownerId === "string" ? { ownerId: input.ownerId } : {}),
    ...(typeof input.profileId === "string" ? { profileId: input.profileId } : {}),
  };
}

export function ownerOf(item: Item, data: ItemData): string {
  return data.ownerId ?? item.createdUserId;
}

export function toCombatants(items: readonly Item[]): Combatant[] {
  return items.flatMap((item) => {
    const data = readItemData(item);
    if (!data?.active) return [];
    return [
      {
        id: item.id,
        name: (isImage(item) && item.text.plainText.trim()) || item.name,
        image: isImage(item) ? item.image.url : undefined,
        initiative: data.initiative,
        bonus: data.bonus,
        ownerId: ownerOf(item, data),
        profileId: data.profileId ?? null,
        visible: item.visible,
      },
    ];
  });
}

/** Mutates a draft item inside `updateItems`. */
export function writePatch(draft: Item, patch: Patch): void {
  const current = readItemData(draft) ?? { active: true, initiative: null, bonus: 0 };
  const { profileId, ...rest } = patch;
  const next: ItemData = { ...current, ...rest };
  if (profileId === null) delete next.profileId;
  else if (profileId !== undefined) next.profileId = profileId;
  draft.metadata[KEY_ITEM] = next;
}

export function setActive(draft: Item, active: boolean): void {
  const current = readItemData(draft) ?? { active, initiative: null, bonus: 0 };
  draft.metadata[KEY_ITEM] = { ...current, active, initiative: active ? current.initiative : null };
}

/** Mutates a draft item inside `updateItems`. Returns false for items that are not tokens. */
export function linkProfile(draft: Item, profileId: string, bonus: number): boolean {
  if (!TOKEN_LAYERS.has(draft.layer)) return false;
  const current = readItemData(draft) ?? { active: true, initiative: null, bonus: 0 };
  draft.metadata[KEY_ITEM] = { ...current, active: true, bonus, profileId };
  return true;
}
