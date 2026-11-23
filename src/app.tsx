import { useEffect, useState } from "preact/hooks";
import { Dice } from "./components/Dice";
import { Initiative } from "./components/Initiative";
import { Monsters } from "./components/Monsters";
import type { Backend, State } from "./types";

type Tab = "initiative" | "dice" | "monsters";

function useBackendState(backend: Backend): State {
  const [state, setState] = useState(backend.getState());
  useEffect(() => {
    setState(backend.getState());
    return backend.subscribe(() => setState(backend.getState()));
  }, [backend]);
  return state;
}

export function App({ backend }: { backend: Backend }) {
  const state = useBackendState(backend);
  const [selectedTab, setTab] = useState<Tab>("initiative");
  const [profileId, setProfileId] = useState<string | null>(null);
  const isGM = state.me.role === "GM";
  // The monster library belongs to the GM.
  const tab = selectedTab === "monsters" && !isGM ? "initiative" : selectedTab;

  // Follow Owlbear Rodeo's light or dark theme.
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.mode = state.theme.mode.toLowerCase();
    root.classList.toggle("standalone", state.standalone);
    root.style.setProperty("--primary", state.theme.primary);
    root.style.setProperty("--primary-contrast", state.theme.primaryContrast);
    root.style.setProperty("--bg", state.theme.background);
    root.style.setProperty("--paper", state.theme.paper);
    root.style.setProperty("--text", state.theme.text);
    root.style.setProperty("--text-2", state.theme.textSecondary);
  }, [state.theme, state.standalone]);

  return (
    <div class="app">
      <nav class="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "initiative"} onClick={() => setTab("initiative")}>
          Iniciativa
        </button>
        <button type="button" role="tab" aria-selected={tab === "dice"} onClick={() => setTab("dice")}>
          Dados
        </button>
        {isGM && (
          <button type="button" role="tab" aria-selected={tab === "monsters"} onClick={() => setTab("monsters")}>
            Monstruos
          </button>
        )}
      </nav>

      {state.standalone && backend.setRole && (
        <div class="devbar">
          Vista previa con datos de ejemplo.
          <button type="button" onClick={() => backend.setRole!(state.me.role === "GM" ? "PLAYER" : "GM")}>
            Ver como {state.me.role === "GM" ? "jugador" : "GM"}
          </button>
        </div>
      )}

      {/* Both panels stay mounted so the 3D tray keeps its canvas between tab changes. */}
      <section class={`panel ${tab === "initiative" ? "" : "hidden"}`} role="tabpanel">
        <Initiative
          backend={backend}
          state={state}
          onOpenProfile={(id) => {
            setProfileId(id);
            setTab("monsters");
          }}
        />
      </section>
      <section class={`panel ${tab === "dice" ? "" : "hidden"}`} role="tabpanel">
        <Dice backend={backend} state={state} visible={tab === "dice"} />
      </section>
      {isGM && (
        <section class={`panel ${tab === "monsters" ? "" : "hidden"}`} role="tabpanel">
          <Monsters backend={backend} state={state} openId={profileId} onOpen={setProfileId} />
        </section>
      )}
    </div>
  );
}
