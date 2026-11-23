/** Namespace for every key and channel this extension uses inside Owlbear Rodeo. */
// The project was first called Tirada. The id keeps that name so data saved in rooms stays readable.
export const ID = "app.tirada";
/** Item metadata: marks a token as part of the tracker. */
export const KEY_ITEM = `${ID}/combatant`;
/** Room metadata: GM settings, shared by all scenes. */
export const KEY_SETTINGS = `${ID}/settings`;
/** Scene metadata: round and active turn. */
export const KEY_COMBAT = `${ID}/combat`;
/** Broadcast: a player asks the GM's client to change that player's own token. */
export const CH_REQUEST = `${ID}/request`;
/** Broadcast: a shared dice roll. */
export const CH_ROLL = `${ID}/roll`;
