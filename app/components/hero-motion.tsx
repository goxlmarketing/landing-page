"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

const STORAGE_KEY = "goxl-hero-studio-v23";
const LEGACY_KEYS = [
  "goxl-hero-studio-v23",
  "goxl-hero-studio-v22",
  "goxl-hero-studio-v21",
  "goxl-hero-studio-v20",
  "goxl-hero-studio-v19",
  "goxl-hero-studio-v18",
  "goxl-hero-studio-v17",
  "goxl-hero-studio-v16",
  "goxl-hero-studio-v15",
  "goxl-hero-studio-v14",
  "goxl-hero-studio-v13",
  "goxl-hero-studio-v12",
  "goxl-hero-studio-v11",
  "goxl-hero-studio-v10",
  "goxl-hero-studio-v9",
  "goxl-hero-studio-v8",
  "goxl-hero-studio-v7",
  "goxl-hero-studio-v6",
  "goxl-hero-studio-v5",
  "goxl-hero-studio-v4",
  "goxl-hero-studio-v3",
  "goxl-hero-studio-v2",
  "goxl-hero-studio-v1",
];

type Pos = { left: string; top: string };
type Mode = "move" | "text";
type Tab = "layout" | "type" | "cards" | "photo" | "content";

type QId = "q1" | "q2" | "q3" | "q4";
const Q_IDS: QId[] = ["q1", "q2", "q3", "q4"];

type StudioState = {
  positions: Record<string, Pos>;
  content: {
    brand: string;
    navCta: string;
    lead: string;
    ask: string;
    q1: string;
    q2: string;
    q3: string;
    q4: string;
    q1Icon: string;
    q2Icon: string;
    q3Icon: string;
    q4Icon: string;
  };
  visible: {
    q1: boolean;
    q2: boolean;
    q3: boolean;
    q4: boolean;
    ask: boolean;
    navCta: boolean;
  };
  type: {
    leadSize: number;
    askSize: number;
    leadWeight: number;
    askWeight: number;
    leadTracking: number;
    askTracking: number;
    leadColor: string;
    askColor: string;
    copyWidth: number;
    copyAlign: "left" | "center";
  };
  cards: {
    scale: number;
    opacity: number;
    radius: number;
    blur: number;
    pad: number;
    fontSize: number;
    width: number;
  };
  photo: {
    x: number;
    y: number;
    zoom: number;
    bright: number;
    contrast: number;
    saturate: number;
  };
  atmosphere: {
    scrim: number;
    vignette: number;
    topDim: number;
    bottomDim: number;
  };
};

const DEFAULTS: StudioState = {
  positions: {
    "hero-copy": { left: "0%", top: "34%" },
    q1: { left: "58%", top: "16%" },
    q2: { left: "76%", top: "38%" },
    q3: { left: "62%", top: "54%" },
    q4: { left: "58%", top: "58%" },
  },
  content: {
    brand: "goxl ally",
    navCta: "Register for Early Access",
    lead: "Founders are expected\nto have answers.",
    ask: "But who helps them find the right ones?",
    q1: "Am I making the right decisions?",
    q2: "Who do I turn to when stuck?",
    q3: "Where is my growth stuck?",
    q4: "Where is my growth stuck?",
    q1Icon: "",
    q2Icon: "",
    q3Icon: "",
    q4Icon: "",
  },
  visible: {
    q1: true,
    q2: true,
    q3: true,
    q4: false,
    ask: true,
    navCta: false,
  },
  type: {
    leadSize: 76,
    askSize: 30,
    leadWeight: 600,
    askWeight: 400,
    leadTracking: -3,
    askTracking: -1.2,
    leadColor: "#FFFFFF",
    askColor: "#2EE6A0",
    copyWidth: 520,
    copyAlign: "left",
  },
  cards: {
    scale: 100,
    opacity: 62,
    radius: 8,
    blur: 10,
    pad: 10,
    fontSize: 12,
    width: 210,
  },
  photo: {
    x: 50,
    y: 28,
    zoom: 134,
    bright: 108,
    contrast: 92,
    saturate: 8,
  },
  atmosphere: {
    scrim: 92,
    vignette: 22,
    topDim: 42,
    bottomDim: 48,
  },
};

function mergeState(parsed: Partial<StudioState> | null | undefined): StudioState {
  const base = structuredClone(DEFAULTS);
  if (!parsed) return base;
  return {
    ...base,
    ...parsed,
    content: { ...base.content, ...parsed.content },
    visible: { ...base.visible, ...parsed.visible },
    type: { ...base.type, ...parsed.type },
    cards: { ...base.cards, ...parsed.cards },
    photo: { ...base.photo, ...parsed.photo },
    atmosphere: { ...base.atmosphere, ...parsed.atmosphere },
    positions: { ...base.positions, ...parsed.positions },
  };
}

function loadState(): StudioState {
  try {
    // Only current key — never revive stale legacy studio drafts
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULTS);
    const parsed = JSON.parse(raw) as Partial<StudioState>;
    return mergeState(parsed);
  } catch {
    return structuredClone(DEFAULTS);
  }
}

function saveState(state: StudioState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function applyAll(hero: HTMLElement, root: HTMLElement, state: StudioState) {
  const { content, visible, type, cards, photo, atmosphere, positions } = state;

  // Always apply type + card styles so Studio color/card edits show on the live page
  root.style.setProperty("--studio-lead", `${type.leadSize}px`);
  root.style.setProperty("--studio-ask", `${type.askSize}px`);
  root.style.setProperty("--studio-copy-w", `${type.copyWidth}px`);
  root.style.setProperty("--studio-lead-w", String(type.leadWeight));
  root.style.setProperty("--studio-ask-w", String(type.askWeight));
  root.style.setProperty("--studio-lead-track", `${type.leadTracking / 100}em`);
  root.style.setProperty("--studio-ask-track", `${type.askTracking / 100}em`);
  root.style.setProperty("--studio-lead-color", type.leadColor);
  root.style.setProperty("--studio-ask-color", type.askColor);
  root.style.setProperty("--studio-copy-align", type.copyAlign);
  root.style.setProperty("--studio-card", String(cards.scale / 100));
  root.style.setProperty("--studio-card-op", String(cards.opacity / 100));
  root.style.setProperty("--studio-card-radius", `${cards.radius}px`);
  root.style.setProperty("--studio-card-blur", `${cards.blur}px`);
  root.style.setProperty("--studio-card-pad", `${cards.pad}px`);
  root.style.setProperty("--studio-card-fs", `${cards.fontSize}px`);
  root.style.setProperty("--studio-card-w", `${cards.width}px`);

  const leadEl = root.querySelector<HTMLElement>(".hero-title__lead");
  const askEl = root.querySelector<HTMLElement>(".hero-title__ask");
  if (leadEl) leadEl.style.color = type.leadColor;
  if (askEl) askEl.style.color = type.askColor;

  root.querySelectorAll<HTMLElement>(".question").forEach((card) => {
    card.style.width = `min(${cards.width}px, 100%)`;
    card.style.padding = `${cards.pad}px`;
    card.style.borderRadius = `${cards.radius}px`;
    const p = card.querySelector<HTMLElement>("p");
    if (p) p.style.fontSize = `${cards.fontSize}px`;
  });

  const brand = document.querySelector<HTMLElement>(".brand span:last-child");
  const navCta = document.querySelector<HTMLElement>(".nav-cta");
  if (brand) brand.textContent = content.brand;
  if (navCta) {
    navCta.textContent = content.navCta;
    navCta.style.display = visible.navCta ? "" : "none";
  }

  const lead = root.querySelector<HTMLElement>("[data-edit='lead']");
  const ask = root.querySelector<HTMLElement>("[data-edit='ask']");
  if (lead) {
    lead.innerHTML = content.lead
      .split("\n")
      .map((line) => `<span class="hero-title__row">${line}</span>`)
      .join("");
  }
  if (ask) {
    ask.textContent = content.ask.replace(/\n/g, " ");
    ask.style.display = visible.ask ? "" : "none";
  }

  Q_IDS.forEach((id) => {
    const card = root.querySelector<HTMLElement>(`[data-layout-id="${id}"]`);
    const p = card?.querySelector("p");
    const icon = card?.querySelector<HTMLElement>(".q-icon");
    if (p) p.textContent = content[id];
    if (icon) icon.textContent = content[`${id}Icon`];
    if (card) card.style.display = visible[id] ? "" : "none";
  });

  const img = hero.querySelector<HTMLImageElement>(".founder-photo");
  const scrim = hero.querySelector<HTMLElement>(".founder-scrim");
  if (img) {
    img.style.objectPosition = `${photo.x}% ${photo.y}%`;
    img.style.transform = `scale(${photo.zoom / 100})`;
    img.style.filter = `saturate(${photo.saturate / 100}) contrast(${photo.contrast / 100}) brightness(${photo.bright / 100})`;
  }
  if (scrim) {
    scrim.style.opacity = String(atmosphere.scrim / 100);
    scrim.style.setProperty("--vig", String(atmosphere.vignette / 100));
    scrim.style.setProperty("--top-dim", String(atmosphere.topDim / 100));
    scrim.style.setProperty("--bottom-dim", String(atmosphere.bottomDim / 100));
  }

  Object.entries(positions).forEach(([id, pos]) => {
    const el = root.querySelector<HTMLElement>(`[data-layout-id="${id}"]`);
    if (!el) return;
    const isEdit = new URLSearchParams(window.location.search).has("edit");
    const wide = window.matchMedia("(min-width: 981px)").matches;
    // Mobile public: use CSS media-query positions (studio % are desktop-stage coords)
    if (!isEdit && !wide && id.startsWith("q")) {
      el.style.left = "";
      el.style.top = "";
      el.style.right = "";
      el.style.bottom = "";
      el.style.position = "";
      return;
    }
    // Public hero copy uses CSS optical centering — don't fight it with studio top %
    if (!isEdit && id === "hero-copy") {
      el.style.left = "";
      el.style.top = "";
      el.style.right = "";
      el.style.bottom = "";
      el.style.position = "";
      return;
    }
    el.style.position = "absolute";
    el.style.left = pos.left;
    el.style.top = pos.top;
    el.style.right = "auto";
    el.style.bottom = "auto";
    if (id === "hero-copy") {
      el.style.transform = "translate3d(0, -34%, 0)";
    }
  });
}

function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="studio-slider">
      <span>{label}</span>
      <strong>{value}</strong>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

function StudioPanel({
  mode,
  setMode,
  tab,
  setTab,
  state,
  patch,
  onExit,
}: {
  mode: Mode;
  setMode: (m: Mode) => void;
  tab: Tab;
  setTab: (t: Tab) => void;
  state: StudioState;
  patch: (fn: (s: StudioState) => StudioState) => void;
  onExit: () => void;
}) {
  const copy = async () => {
    await navigator.clipboard.writeText(JSON.stringify(state, null, 2));
  };

  const [bakeMsg, setBakeMsg] = useState("");

  const bake = async () => {
    try {
      setBakeMsg("Saving…");
      const res = await fetch("/api/hero-lock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(state),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Save failed");
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      setBakeMsg("Saved ✓ — ab chat me bolo: set kar do");
    } catch (e) {
      setBakeMsg(e instanceof Error ? e.message : "Save failed");
    }
  };

  const reset = () => {
    for (const key of LEGACY_KEYS) localStorage.removeItem(key);
    window.location.reload();
  };

  return (
    <aside className="studio-panel" aria-label="Hero studio">
      <header className="studio-panel__head">
        <div>
          <p className="studio-panel__eyebrow">Full control</p>
          <h2>Hero Studio</h2>
        </div>
        <button type="button" className="studio-panel__exit" onClick={onExit}>
          Exit
        </button>
      </header>

      <div className="studio-panel__modes">
        <button type="button" className={mode === "move" ? "is-active" : undefined} onClick={() => setMode("move")}>
          Move
        </button>
        <button type="button" className={mode === "text" ? "is-active" : undefined} onClick={() => setMode("text")}>
          Type on page
        </button>
      </div>

      <div className="studio-panel__tabs">
        {(
          [
            ["layout", "Layout"],
            ["type", "Type"],
            ["cards", "Cards"],
            ["photo", "Photo"],
            ["content", "Copy"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={tab === id ? "is-active" : undefined}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="studio-panel__body">
        {tab === "layout" && (
          <>
            <p className="studio-panel__hint">Drag elements on the page in Move mode. Toggle visibility below.</p>
            {([...Q_IDS, "ask", "navCta"] as const).map((key) => (
              <label key={key} className="studio-check">
                <input
                  type="checkbox"
                  checked={state.visible[key]}
                  onChange={(e) =>
                    patch((s) => ({
                      ...s,
                      visible: { ...s.visible, [key]: e.target.checked },
                    }))
                  }
                />
                Show {key}
              </label>
            ))}
            <label className="studio-select">
              Copy align
              <select
                value={state.type.copyAlign}
                onChange={(e) =>
                  patch((s) => ({
                    ...s,
                    type: { ...s.type, copyAlign: e.target.value as "left" | "center" },
                  }))
                }
              >
                <option value="left">Left</option>
                <option value="center">Center</option>
              </select>
            </label>
            <Slider
              label="Copy width"
              value={state.type.copyWidth}
              min={280}
              max={720}
              onChange={(n) => patch((s) => ({ ...s, type: { ...s.type, copyWidth: n } }))}
            />
          </>
        )}

        {tab === "type" && (
          <>
            <Slider label="Lead size" value={state.type.leadSize} min={24} max={128} onChange={(n) => patch((s) => ({ ...s, type: { ...s.type, leadSize: n } }))} />
            <Slider label="Ask size" value={state.type.askSize} min={14} max={96} onChange={(n) => patch((s) => ({ ...s, type: { ...s.type, askSize: n } }))} />
            <Slider label="Lead weight" value={state.type.leadWeight} min={300} max={700} step={100} onChange={(n) => patch((s) => ({ ...s, type: { ...s.type, leadWeight: n } }))} />
            <Slider label="Ask weight" value={state.type.askWeight} min={300} max={700} step={100} onChange={(n) => patch((s) => ({ ...s, type: { ...s.type, askWeight: n } }))} />
            <Slider label="Lead tracking" value={state.type.leadTracking} min={-8} max={8} onChange={(n) => patch((s) => ({ ...s, type: { ...s.type, leadTracking: n } }))} />
            <Slider label="Ask tracking" value={state.type.askTracking} min={-8} max={8} onChange={(n) => patch((s) => ({ ...s, type: { ...s.type, askTracking: n } }))} />
            <label className="studio-color">
              Lead color
              <input
                type="color"
                value={state.type.leadColor}
                onChange={(e) => patch((s) => ({ ...s, type: { ...s.type, leadColor: e.target.value } }))}
              />
            </label>
            <label className="studio-color">
              Ask color
              <input
                type="color"
                value={state.type.askColor}
                onChange={(e) => patch((s) => ({ ...s, type: { ...s.type, askColor: e.target.value } }))}
              />
            </label>
          </>
        )}

        {tab === "cards" && (
          <>
            <Slider label="Scale" value={state.cards.scale} min={60} max={140} onChange={(n) => patch((s) => ({ ...s, cards: { ...s.cards, scale: n } }))} />
            <Slider label="Opacity" value={state.cards.opacity} min={30} max={100} onChange={(n) => patch((s) => ({ ...s, cards: { ...s.cards, opacity: n } }))} />
            <Slider label="Width" value={state.cards.width} min={140} max={320} onChange={(n) => patch((s) => ({ ...s, cards: { ...s.cards, width: n } }))} />
            <Slider label="Radius" value={state.cards.radius} min={0} max={24} onChange={(n) => patch((s) => ({ ...s, cards: { ...s.cards, radius: n } }))} />
            <Slider label="Blur" value={state.cards.blur} min={0} max={30} onChange={(n) => patch((s) => ({ ...s, cards: { ...s.cards, blur: n } }))} />
            <Slider label="Padding" value={state.cards.pad} min={6} max={24} onChange={(n) => patch((s) => ({ ...s, cards: { ...s.cards, pad: n } }))} />
            <Slider label="Font size" value={state.cards.fontSize} min={9} max={18} step={0.5} onChange={(n) => patch((s) => ({ ...s, cards: { ...s.cards, fontSize: n } }))} />
          </>
        )}

        {tab === "photo" && (
          <>
            <Slider label="Position X" value={state.photo.x} min={0} max={100} onChange={(n) => patch((s) => ({ ...s, photo: { ...s.photo, x: n } }))} />
            <Slider label="Position Y" value={state.photo.y} min={0} max={100} onChange={(n) => patch((s) => ({ ...s, photo: { ...s.photo, y: n } }))} />
            <Slider label="Zoom" value={state.photo.zoom} min={100} max={160} onChange={(n) => patch((s) => ({ ...s, photo: { ...s.photo, zoom: n } }))} />
            <Slider label="Brightness" value={state.photo.bright} min={40} max={140} onChange={(n) => patch((s) => ({ ...s, photo: { ...s.photo, bright: n } }))} />
            <Slider label="Contrast" value={state.photo.contrast} min={70} max={150} onChange={(n) => patch((s) => ({ ...s, photo: { ...s.photo, contrast: n } }))} />
            <Slider label="Saturate" value={state.photo.saturate} min={0} max={160} onChange={(n) => patch((s) => ({ ...s, photo: { ...s.photo, saturate: n } }))} />
            <Slider label="Scrim" value={state.atmosphere.scrim} min={20} max={100} onChange={(n) => patch((s) => ({ ...s, atmosphere: { ...s.atmosphere, scrim: n } }))} />
            <Slider label="Vignette" value={state.atmosphere.vignette} min={0} max={90} onChange={(n) => patch((s) => ({ ...s, atmosphere: { ...s.atmosphere, vignette: n } }))} />
            <Slider label="Top dim" value={state.atmosphere.topDim} min={0} max={90} onChange={(n) => patch((s) => ({ ...s, atmosphere: { ...s.atmosphere, topDim: n } }))} />
            <Slider label="Bottom dim" value={state.atmosphere.bottomDim} min={0} max={90} onChange={(n) => patch((s) => ({ ...s, atmosphere: { ...s.atmosphere, bottomDim: n } }))} />
          </>
        )}

        {tab === "content" && (
          <>
            <label className="studio-field">
              Brand
              <input
                value={state.content.brand}
                onChange={(e) => patch((s) => ({ ...s, content: { ...s.content, brand: e.target.value } }))}
              />
            </label>
            <label className="studio-field">
              Nav CTA
              <input
                value={state.content.navCta}
                onChange={(e) => patch((s) => ({ ...s, content: { ...s.content, navCta: e.target.value } }))}
              />
            </label>
            <label className="studio-field">
              Lead (use Enter for new line)
              <textarea
                rows={3}
                value={state.content.lead}
                onChange={(e) => patch((s) => ({ ...s, content: { ...s.content, lead: e.target.value } }))}
              />
            </label>
            <label className="studio-field">
              Ask
              <textarea
                rows={3}
                value={state.content.ask}
                onChange={(e) => patch((s) => ({ ...s, content: { ...s.content, ask: e.target.value } }))}
              />
            </label>
            {Q_IDS.map((id) => (
              <div key={id} className="studio-qrow">
                <label className="studio-field">
                  {id} icon
                  <input
                    value={state.content[`${id}Icon`]}
                    onChange={(e) =>
                      patch((s) => ({
                        ...s,
                        content: { ...s.content, [`${id}Icon`]: e.target.value },
                      }))
                    }
                  />
                </label>
                <label className="studio-field">
                  {id} text
                  <input
                    value={state.content[id]}
                    onChange={(e) =>
                      patch((s) => ({
                        ...s,
                        content: { ...s.content, [id]: e.target.value },
                      }))
                    }
                  />
                </label>
              </div>
            ))}
          </>
        )}
      </div>

      <div className="studio-panel__actions">
        <button type="button" className="studio-panel__bake" onClick={bake}>
          Set permanent
        </button>
        <button type="button" onClick={copy}>
          Copy JSON
        </button>
        <button type="button" onClick={reset}>
          Reset all
        </button>
      </div>
      {bakeMsg ? <p className="studio-panel__bake-msg">{bakeMsg}</p> : null}
      <p className="studio-panel__foot">
        Cards drag karo → <b>Set permanent</b> dabao → chat me bolo <b>“set kar do”</b>
      </p>
    </aside>
  );
}

export function HeroMotion({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);
  const [mode, setMode] = useState<Mode>("move");
  const [tab, setTab] = useState<Tab>("layout");
  const [state, setState] = useState<StudioState>(DEFAULTS);
  const stateRef = useRef(state);
  stateRef.current = state;

  const patch = (fn: (s: StudioState) => StudioState, skipApply = false) => {
    const next = fn(stateRef.current);
    stateRef.current = next;
    setState(next);
    saveState(next);
    if (skipApply) return;
    const root = ref.current;
    const hero = root?.closest(".hero") as HTMLElement | null;
    if (root && hero) applyAll(hero, root, next);
  };

  useEffect(() => {
    const isEdit = new URLSearchParams(window.location.search).has("edit");
    setEditing(isEdit);

    const root = ref.current;
    const hero = root?.closest(".hero") as HTMLElement | null;

    // Paint baked defaults immediately so public never flashes stale studio state
    const immediate = structuredClone(DEFAULTS);
    stateRef.current = immediate;
    setState(immediate);
    if (root && hero) {
      applyAll(hero, root, immediate);
      root.classList.add("is-ready");
      hero.classList.add("is-ready");
    }

    // Always wipe old studio drafts so baked composition wins after each deploy/tweak
    try {
      for (const key of LEGACY_KEYS) localStorage.removeItem(key);
    } catch {
      /* ignore */
    }

    const paint = (saved: StudioState) => {
      setState(saved);
      stateRef.current = saved;
      const r = ref.current;
      const h = r?.closest(".hero") as HTMLElement | null;
      if (!r || !h) return;
      applyAll(h, r, saved);
      r.classList.add("is-ready");
      h.classList.add("is-ready");
    };

    const boot = async () => {
      // Permanent lock file + hardcoded DEFAULTS are source of truth
      let saved = structuredClone(DEFAULTS);
      try {
        const res = await fetch(`/hero-lock.json?v=${STORAGE_KEY}`, { cache: "no-store" });
        if (res.ok) {
          const locked = (await res.json()) as Partial<StudioState>;
          saved = mergeState(locked);
        }
      } catch {
        /* keep defaults */
      }

      paint(saved);

      if (!isEdit) return;
      hero?.classList.add("is-editing");
      document.body.classList.add("hero-edit-mode");
    };

    void boot();

    const onResize = () => {
      const r = ref.current;
      const h = r?.closest(".hero") as HTMLElement | null;
      if (r && h) applyAll(h, r, stateRef.current);
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      const h = ref.current?.closest(".hero");
      h?.classList.remove("is-editing");
      document.body.classList.remove("hero-edit-mode");
    };
  }, []);

  useEffect(() => {
    if (!editing) return;
    const root = ref.current;
    const hero = root?.closest(".hero") as HTMLElement | null;
    if (!root || !hero) return;

    applyAll(hero, root, stateRef.current);
    root.classList.toggle("is-mode-move", mode === "move");
    root.classList.toggle("is-mode-text", mode === "text");

    const editables = Array.from(root.querySelectorAll<HTMLElement>("[data-edit], [data-layout-id] p"));
    editables.forEach((el) => {
      el.contentEditable = mode === "text" ? "true" : "false";
    });

    const onInput = () => {
      patch((s) => ({
        ...s,
        content: {
          ...s.content,
          lead: root.querySelector<HTMLElement>("[data-edit='lead']")?.innerText.trimEnd() || "",
          ask: root.querySelector<HTMLElement>("[data-edit='ask']")?.innerText.trimEnd() || "",
          q1: root.querySelector<HTMLElement>('[data-layout-id="q1"] p')?.innerText.trim() || "",
          q2: root.querySelector<HTMLElement>('[data-layout-id="q2"] p')?.innerText.trim() || "",
          q3: root.querySelector<HTMLElement>('[data-layout-id="q3"] p')?.innerText.trim() || "",
          q4: root.querySelector<HTMLElement>('[data-layout-id="q4"] p')?.innerText.trim() || "",
        },
      }), true);
    };
    editables.forEach((el) => el.addEventListener("input", onInput));

    let active: HTMLElement | null = null;
    let startX = 0;
    let startY = 0;
    let origLeft = 0;
    let origTop = 0;

    const ensureAbsolute = (el: HTMLElement) => {
      el.style.position = "absolute";
      if (!el.style.left || !el.style.top) {
        const rect = el.getBoundingClientRect();
        const parent = (el.offsetParent as HTMLElement | null) ?? root;
        const parentRect = parent.getBoundingClientRect();
        el.style.left = `${(((rect.left - parentRect.left) / parentRect.width) * 100).toFixed(1)}%`;
        el.style.top = `${(((rect.top - parentRect.top) / parentRect.height) * 100).toFixed(1)}%`;
        el.style.right = "auto";
        el.style.bottom = "auto";
      }
    };
    Array.from(root.querySelectorAll<HTMLElement>("[data-layout-id]")).forEach(ensureAbsolute);

    const onPointerDown = (e: PointerEvent) => {
      if (mode !== "move") return;
      if ((e.target as HTMLElement).closest("[contenteditable='true']")) return;
      const el = (e.target as HTMLElement).closest<HTMLElement>("[data-layout-id]");
      if (!el || !root.contains(el)) return;
      e.preventDefault();
      ensureAbsolute(el);
      active = el;
      el.setPointerCapture(e.pointerId);
      const rect = el.getBoundingClientRect();
      const parent = (el.offsetParent as HTMLElement | null) ?? root;
      const parentRect = parent.getBoundingClientRect();
      startX = e.clientX;
      startY = e.clientY;
      origLeft = rect.left - parentRect.left;
      origTop = rect.top - parentRect.top;
      el.classList.add("is-dragging");
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!active) return;
      const parent = (active.offsetParent as HTMLElement | null) ?? root;
      const parentRect = parent.getBoundingClientRect();
      const left = Math.max(0, Math.min(parentRect.width - active.offsetWidth, origLeft + e.clientX - startX));
      const top = Math.max(0, Math.min(parentRect.height - active.offsetHeight, origTop + e.clientY - startY));
      active.style.left = `${((left / parentRect.width) * 100).toFixed(1)}%`;
      active.style.top = `${((top / parentRect.height) * 100).toFixed(1)}%`;
      active.style.right = "auto";
      active.style.bottom = "auto";
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!active) return;
      active.releasePointerCapture(e.pointerId);
      active.classList.remove("is-dragging");
      const id = active.dataset.layoutId;
      if (id) {
        patch((s) => ({
          ...s,
          positions: {
            ...s.positions,
            [id]: { left: active!.style.left, top: active!.style.top },
          },
        }));
      }
      active = null;
    };

    root.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);

    return () => {
      editables.forEach((el) => {
        el.removeEventListener("input", onInput);
        el.contentEditable = "false";
      });
      root.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [editing, mode]);

  return (
    <>
      <div className="hero-inner" ref={ref}>
        {children}
      </div>
      {editing ? (
        <StudioPanel
          mode={mode}
          setMode={setMode}
          tab={tab}
          setTab={setTab}
          state={state}
          patch={patch}
          onExit={() => {
            window.location.href = "/";
          }}
        />
      ) : null}
    </>
  );
}
