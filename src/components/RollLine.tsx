import type { RollEntry } from "../types";

export function RollLine({ roll, big }: { roll: RollEntry; big?: boolean }) {
  return (
    <span class={`roll-line ${big ? "big" : ""}`}>
      <span class="roll-notation">
        {roll.label && <span class="roll-label">{roll.label}</span>}
        {roll.notation}
      </span>
      <span class="roll-dice">
        {roll.dice.map((d, i) => (
          <span key={i} class={`pip ${d.dropped ? "dropped" : ""} ${extreme(d)}`} title={`d${d.sides}`}>
            {d.value}
          </span>
        ))}
        {roll.modifier !== 0 && <span class="mod">{roll.modifier > 0 ? `+${roll.modifier}` : roll.modifier}</span>}
      </span>
      <strong class="roll-total">{roll.total}</strong>
    </span>
  );
}

/** Marks natural 20 and natural 1 on a d20. */
function extreme(die: { sides: number; value: number; dropped?: boolean }): string {
  if (die.sides !== 20 || die.dropped) return "";
  if (die.value === 20) return "crit";
  if (die.value === 1) return "fumble";
  return "";
}
