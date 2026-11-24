import { t } from "../i18n";
import type { RollEntry } from "../types";
import { RollLine } from "./RollLine";

/** The shared list of rolls, newest first. Lives in the tray, and in the Dice tab while the tray is closed. */
export function RollLog({ rolls }: { rolls: RollEntry[] }) {
  return (
    <>
      <h3 class="log-title">{t("tray.rolls")}</h3>
      {rolls.length === 0 ? (
        <p class="empty">{t("tray.noRolls")}</p>
      ) : (
        <ul class="log" tabIndex={0} aria-label={t("tray.log")}>
          {rolls.map((r) => (
            <li key={r.id}>
              <span class="log-who">
                <span class="dot" style={{ background: r.color }} />
                {r.playerName}
                {r.hidden && <span class="tag">{t("tray.hiddenTag")}</span>}
              </span>
              <RollLine roll={r} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
