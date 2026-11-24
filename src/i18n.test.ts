import { afterEach, describe, expect, it } from "vitest";
import { DICTIONARIES, type Key, langOf, plural, setLang, t } from "./i18n";

afterEach(() => setLang("es"));

describe("dictionaries", () => {
  it("have exactly the same keys in both languages", () => {
    expect(Object.keys(DICTIONARIES.en).sort()).toEqual(Object.keys(DICTIONARIES.es).sort());
  });

  it("have no empty text", () => {
    for (const [lang, dictionary] of Object.entries(DICTIONARIES)) {
      for (const [key, text] of Object.entries(dictionary)) {
        expect(text.trim(), `${lang} ${key}`).not.toBe("");
      }
    }
  });

  it("use the same placeholders in both languages", () => {
    const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const key of Object.keys(DICTIONARIES.es) as Key[]) {
      expect(placeholders(DICTIONARIES.en[key]), key).toEqual(placeholders(DICTIONARIES.es[key]));
    }
  });
});

describe("langOf", () => {
  it("is Spanish unless the address asks for English", () => {
    expect(langOf(undefined)).toBe("es");
    expect(langOf({ pathname: "/natone/panel.html", search: "" })).toBe("es");
    expect(langOf({ pathname: "/natone/panel.html", search: "?lang=fr" })).toBe("es");
  });

  it("is English under /en/ or with ?lang=en", () => {
    expect(langOf({ pathname: "/natone/en/panel.html", search: "" })).toBe("en");
    expect(langOf({ pathname: "/natone/en/panel", search: "?obrref=abc" })).toBe("en");
    expect(langOf({ pathname: "/natone/panel.html", search: "?lang=en" })).toBe("en");
    expect(langOf({ pathname: "/natone/panel.html", search: "?obrref=abc&lang=en" })).toBe("en");
  });
});

describe("t", () => {
  it("fills in the parameters", () => {
    expect(t("init.round", { n: 3 })).toBe("Ronda 3");
    setLang("en");
    expect(t("init.round", { n: 3 })).toBe("Round 3");
  });

  it("picks the singular or the plural", () => {
    expect(plural(1, "mon.sheetsOne", "mon.sheetsMany", { n: 1 })).toBe("1 hoja");
    expect(plural(2, "mon.sheetsOne", "mon.sheetsMany", { n: 2 })).toBe("2 hojas");
    setLang("en");
    expect(plural(1, "mon.sheetsOne", "mon.sheetsMany", { n: 1 })).toBe("1 sheet");
  });
});

describe("text kept inside shared data", () => {
  it("follows the language of whoever rolls", async () => {
    const { initiativeEntries } = await import("./dice/entry");
    const me = { id: "p1", name: "Ana", role: "GM" as const, color: "#fff" };
    const goblin = { id: "t1", name: "Goblin", initiative: null, bonus: 2, ownerId: "p1", profileId: null, visible: true };
    expect(initiativeEntries(me, [goblin], { t1: { initiative: 14 } })[0].label).toBe("Iniciativa · Goblin");
    setLang("en");
    expect(initiativeEntries(me, [goblin], { t1: { initiative: 14 } })[0].label).toBe("Initiative · Goblin");
  });
});
