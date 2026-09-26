import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Pause, Play, RotateCcw, Shield, Swords, Users } from "lucide-react";
import { unlockAudio } from "@/game/audio";
import {
  GRADES,
  LIVES,
  SHIPS,
  WEAPONS,
  type GradeId,
  type Mode,
  type ShipId,
  type TouchInput,
} from "@/game/content";
import { AstrumEngine, type Hud } from "@/game/engine";

const EMPTY_TOUCH: TouchInput = { x: 0, y: 0, active: false, fire: false, pitch: 0 };

export function AstrumApp() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<AstrumEngine | null>(null);
  const [hud, setHud] = useState<Hud | null>(null);
  const [mode, setMode] = useState<Mode>("coop");
  const [names, setNames] = useState(["Spieler 1", "Spieler 2"]);
  const [ships, setShips] = useState<[ShipId, ShipId]>(["pfeil", "bastion"]);
  const [grades, setGrades] = useState<[GradeId, GradeId]>(["34", "34"]);
  const [answer, setAnswer] = useState("");
  const [best, setBest] = useState<number | null>(null);
  const [coarse, setCoarse] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = new AstrumEngine(canvas);
    engine.onHud = setHud;
    engineRef.current = engine;
    const onResize = () => engine.resize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    try {
      const n = Number(localStorage.getItem("astrum-wave") || "0");
      if (n > 0) setBest(n);
    } catch {
      /* ignore */
    }
    const mq = window.matchMedia("(pointer: coarse), (max-width: 900px)");
    const apply = () => setCoarse(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const challengeId = hud?.challenge?.id ?? 0;
  useEffect(() => {
    setAnswer("");
    if (challengeId) inputRef.current?.focus();
  }, [challengeId]);

  function start() {
    unlockAudio();
    engineRef.current?.startMatch({
      mode,
      players: [
        { name: names[0] || "Spieler 1", ship: ships[0], grade: grades[0] },
        { name: names[1] || "Spieler 2", ship: ships[1], grade: grades[1] },
      ],
    });
  }

  const lobby = !hud || hud.phase === "attract";
  const playing = hud && (hud.phase === "play" || hud.phase === "pause" || hud.phase === "challenge");

  return (
    <main className="relative h-dvh overflow-hidden bg-bg text-fg">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />
      <div className="vignette pointer-events-none absolute inset-0" />

      {lobby && (
        <div className="absolute inset-x-0 top-0 bottom-20 overflow-y-auto sm:inset-0 sm:bottom-0">
          <div className="mx-auto grid min-h-full w-full max-w-6xl gap-4 p-4 lg:grid-cols-[minmax(0,34rem)_1fr] lg:p-8">
            <section className="flex flex-col gap-4 rounded-lg border border-line bg-surface/90 p-4 shadow-none backdrop-blur-md sm:p-6">
              <header className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-xs font-medium tracking-widest text-primary uppercase">Sektor 7</p>
                  <h1 className="font-display text-4xl leading-none font-extrabold text-fg sm:text-5xl">ASTRUM</h1>
                  <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted">
                    Zwei Schiffe, eine Rechnung. Richtig gerechnet hält der Schild. Falsch, und ein Leben ist weg.
                  </p>
                </div>
                {best !== null && (
                  <p className="shrink-0 text-right text-xs text-muted">
                    Beste Welle
                    <span className="mt-1 block font-display text-2xl text-accent">{best}</span>
                  </p>
                )}
              </header>

              <div className="grid grid-cols-2 gap-2">
                <ModeButton
                  active={mode === "duel"}
                  onClick={() => setMode("duel")}
                  icon={<Swords className="size-4" />}
                  title="Gegeneinander"
                  text="Links gegen rechts"
                />
                <ModeButton
                  active={mode === "coop"}
                  onClick={() => setMode("coop")}
                  icon={<Users className="size-4" />}
                  title="Miteinander"
                  text="In den Sektor"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {[0, 1].map((index) => (
                  <PlayerCard
                    key={index}
                    index={index as 0 | 1}
                    name={names[index]}
                    ship={ships[index]}
                    grade={grades[index]}
                    onName={(value) =>
                      setNames((prev) => {
                        const next = [...prev] as [string, string];
                        next[index] = value;
                        return next;
                      })
                    }
                    onShip={(id) =>
                      setShips((prev) => {
                        const next: [ShipId, ShipId] = [...prev];
                        next[index] = id;
                        return next;
                      })
                    }
                    onGrade={(id) =>
                      setGrades((prev) => {
                        const next: [GradeId, GradeId] = [...prev];
                        next[index] = id;
                        return next;
                      })
                    }
                  />
                ))}
              </div>

              <p className="hidden text-xs leading-relaxed text-muted sm:block">{mode === "duel" ? DUEL_HELP : COOP_HELP}</p>
              <details className="text-xs text-muted sm:hidden">
                <summary className="min-h-11 cursor-pointer py-2 text-fg">Steuerung</summary>
                <p className="pb-2 leading-relaxed">{mode === "duel" ? DUEL_HELP : COOP_HELP}</p>
              </details>

              <button
                type="button"
                onClick={start}
                className="hidden min-h-12 rounded-lg bg-primary px-4 text-base font-semibold text-bg transition-opacity hover:opacity-90 sm:block"
              >
                Start
              </button>
            </section>
            <div className="hidden lg:block" />
          </div>
        </div>
      )}

      {lobby && (
        <div className="absolute inset-x-0 bottom-0 z-10 p-3 sm:hidden">
          <button
            type="button"
            onClick={start}
            className="min-h-12 w-full rounded-lg bg-primary text-base font-semibold text-bg"
          >
            Start
          </button>
        </div>
      )}

      {playing && hud && (
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3 sm:p-4">
          <ShipHud ship={hud.ships[0]} tone="primary" align="left" />
          <div className="pointer-events-auto flex flex-col items-center gap-2">
            <p className="rounded-full border border-line bg-surface/80 px-3 py-1 text-xs text-muted backdrop-blur-md">
              {hud.mode === "duel" ? "Duell" : `Sektor ${hud.wave}`}
            </p>
            {hud.phase !== "challenge" && (
              <button
                type="button"
                onClick={() => engineRef.current?.togglePause()}
                className="inline-flex min-h-11 items-center gap-1 rounded-full border border-line bg-surface/80 px-3 text-xs text-fg backdrop-blur-md"
              >
                {hud.phase === "pause" ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
                {hud.phase === "pause" ? "Weiter" : "Pause"}
              </button>
            )}
          </div>
          <ShipHud ship={hud.ships[1]} tone="accent" align="right" />
        </div>
      )}

      {hud?.banner && hud.phase !== "attract" && (
        <p className="pointer-events-none absolute inset-x-0 top-24 px-4 text-center text-sm font-medium text-fg sm:top-20">
          <span className="inline-block rounded-full border border-line bg-surface/85 px-4 py-2 backdrop-blur-md">{hud.banner}</span>
        </p>
      )}

      {hud?.phase === "challenge" && hud.challenge && (
        <div className="absolute inset-0 flex items-end justify-center p-3 sm:items-center sm:p-6">
          <form
            className={`w-full max-w-md rounded-lg border bg-surface/95 p-4 backdrop-blur-md sm:p-6 ${
              hud.challenge.defender === 0 ? "border-primary" : "border-accent"
            }`}
            onSubmit={(e) => {
              e.preventDefault();
              engineRef.current?.submitAnswer(answer);
            }}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="inline-flex items-center gap-2 text-sm font-semibold text-fg">
                <Shield className="size-4 text-primary" />
                {hud.ships[hud.challenge.defender]?.name}
              </p>
              <p className="text-xs text-muted">
                {hud.challenge.time.toFixed(1)}s
              </p>
            </div>
            <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-surface-2">
              <div
                className={hud.challenge.defender === 0 ? "h-full bg-primary" : "h-full bg-accent"}
                style={{ width: `${Math.max(0, (hud.challenge.time / hud.challenge.max) * 100)}%` }}
              />
            </div>
            <p className="text-sm text-muted">
              {hud.mode === "duel"
                ? "Richtig: kein Abzug. Falsch: ein Leben weg, der Gegner bekommt eine bessere Waffe."
                : "Richtig gehalten, und der Treffer verpufft. Falsch kostet ein Leben."}
            </p>
            <p className="font-display my-4 text-center text-4xl font-extrabold tracking-tight text-fg sm:text-5xl">
              {hud.challenge.prompt}
            </p>
            <input
              ref={inputRef}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              inputMode="numeric"
              autoComplete="off"
              aria-label="Antwort"
              className="mb-3 min-h-12 w-full rounded-lg border border-line bg-bg px-3 text-center font-display text-2xl text-fg outline-none focus:border-primary"
            />
            <Keypad
              onDigit={(d) => setAnswer((v) => (v.length > 6 ? v : v + d))}
              onMinus={() =>
                setAnswer((v) => (v.startsWith("-") || v.startsWith("−") ? v.slice(1) : `-${v}`))
              }
              onBack={() => setAnswer((v) => v.slice(0, -1))}
            />
            <button
              type="submit"
              className="mt-3 min-h-12 w-full rounded-lg bg-primary text-base font-semibold text-bg"
            >
              Antworten
            </button>
          </form>
        </div>
      )}

      {hud?.phase === "pause" && (
        <Overlay
          title="Pause"
          text="Die Sektoren warten."
          primary="Weiter"
          onPrimary={() => engineRef.current?.togglePause()}
          secondary="Zur Auswahl"
          onSecondary={() => engineRef.current?.backToMenu()}
        />
      )}

      {hud?.phase === "over" && (
        <Overlay
          title={hud.result ?? "Ende"}
          text={
            hud.mode === "coop"
              ? `Abschüsse ${hud.ships[0].kills + hud.ships[1].kills}`
              : `${hud.ships[0].name} ${hud.ships[0].lives} · ${hud.ships[1].name} ${hud.ships[1].lives}`
          }
          primary="Nochmal"
          onPrimary={start}
          secondary="Zur Auswahl"
          onSecondary={() => engineRef.current?.backToMenu()}
        />
      )}

      {coarse && playing && hud?.phase !== "challenge" && (
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-3">
          <Stick label="S1" showPitch={hud.mode === "coop"} onChange={(v) => engineRef.current?.setTouch(0, v)} />
          <Stick label="S2" showPitch={hud.mode === "coop"} onChange={(v) => engineRef.current?.setTouch(1, v)} />
        </div>
      )}
    </main>
  );
}

const COOP_HELP =
  "Spieler 1: W Schub, S Bremse, A links, D rechts, Q hoch, E runter, Leertaste Feuer. Spieler 2: Pfeile, I hoch, K runter, rechte Umschalt Feuer. Abschüsse verbessern die Waffe.";

const DUEL_HELP =
  "Spieler 1 links: W/S hoch und runter, A/D links und rechts, Leertaste Feuer. Spieler 2 rechts: Pfeiltasten, Enter Feuer. Wer die Rechnung verfehlt, verliert ein Leben — der andere schaltet die nächste Waffe frei.";

function ModeButton({
  active,
  onClick,
  icon,
  title,
  text,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  title: string;
  text: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex min-h-16 flex-col items-start gap-1 rounded-lg border px-3 py-2 text-left ${
        active ? "border-primary bg-surface-2 text-fg" : "border-line bg-bg/40 text-muted"
      }`}
    >
      <span className={`inline-flex items-center gap-2 text-sm font-semibold ${active ? "text-fg" : "text-muted"}`}>
        {icon}
        {title}
      </span>
      <span className="text-xs">{text}</span>
    </button>
  );
}

function PlayerCard({
  index,
  name,
  ship,
  grade,
  onName,
  onShip,
  onGrade,
}: {
  index: 0 | 1;
  name: string;
  ship: ShipId;
  grade: GradeId;
  onName: (v: string) => void;
  onShip: (id: ShipId) => void;
  onGrade: (id: GradeId) => void;
}) {
  const tone = index === 0 ? "border-primary" : "border-accent";
  const picked = SHIPS.find((s) => s.id === ship) ?? SHIPS[0];
  return (
    <fieldset className={`rounded-lg border border-line bg-bg/50 p-3 ${tone} border-t-2`}>
      <legend className="px-1 text-xs font-semibold tracking-wide text-muted uppercase">
        {index === 0 ? "Spieler 1" : "Spieler 2"}
      </legend>
      <input
        value={name}
        maxLength={16}
        aria-label={index === 0 ? "Name Spieler 1" : "Name Spieler 2"}
        onChange={(e) => onName(e.target.value)}
        className="mb-2 min-h-11 w-full rounded-md border border-line bg-surface px-2 text-sm text-fg outline-none focus:border-primary"
      />
      <div className="grid grid-cols-4 gap-1">
        {SHIPS.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={ship === item.id}
            onClick={() => onShip(item.id)}
            className={`min-h-14 rounded-md border px-1 py-1 text-center ${
              ship === item.id
                ? index === 0
                  ? "border-primary bg-surface-2 text-fg"
                  : "border-accent bg-surface-2 text-fg"
                : "border-line text-muted"
            }`}
          >
            <span className="block text-xs font-semibold">{item.name}</span>
            <span className="block text-xs leading-tight">{item.role}</span>
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs leading-snug text-muted">{picked.blurb}</p>
      <p className="mt-2 text-xs text-muted">Rechenklasse</p>
      <div className="mt-1 flex flex-wrap gap-1">
        {GRADES.map((g) => (
          <button
            key={g.id}
            type="button"
            aria-pressed={grade === g.id}
            title={g.hint}
            onClick={() => onGrade(g.id)}
            className={`min-h-11 rounded-full border px-3 text-xs ${
              grade === g.id ? "border-primary text-fg" : "border-line text-muted"
            }`}
          >
            {g.label.replace("Klasse ", "")}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function ShipHud({
  ship,
  tone,
  align,
}: {
  ship: Hud["ships"][number];
  tone: "primary" | "accent";
  align: "left" | "right";
}) {
  return (
    <div className={`min-w-28 rounded-lg border border-line bg-surface/80 p-2 backdrop-blur-md ${align === "right" ? "text-right" : "text-left"}`}>
      <p className="truncate text-sm font-semibold text-fg">{ship.name}</p>
      <p className="text-xs text-muted">
        {ship.className} · {ship.weapon}
      </p>
      <div className={`mt-2 flex gap-1 ${align === "right" ? "justify-end" : ""}`}>
        {Array.from({ length: LIVES }, (_, i) => (
          <span
            key={i}
            className={`h-2.5 w-2.5 rounded-full ${i < ship.lives ? (tone === "primary" ? "bg-primary" : "bg-accent") : "bg-line"}`}
          />
        ))}
      </div>
      <div className={`mt-1 flex gap-1 ${align === "right" ? "justify-end" : ""}`}>
        {WEAPONS.map((w, i) => (
          <span key={w.name} className={`h-1 w-3 rounded-full ${i <= ship.tier ? (tone === "primary" ? "bg-primary" : "bg-accent") : "bg-line"}`} />
        ))}
      </div>
    </div>
  );
}

function Keypad({
  onDigit,
  onMinus,
  onBack,
}: {
  onDigit: (d: string) => void;
  onMinus: () => void;
  onBack: () => void;
}) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "−", "0", "⌫"];
  return (
    <div className="grid grid-cols-3 gap-2">
      {keys.map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => {
            if (k === "−") onMinus();
            else if (k === "⌫") onBack();
            else onDigit(k);
          }}
          className="min-h-11 rounded-md border border-line bg-bg text-base font-semibold text-fg"
        >
          {k}
        </button>
      ))}
    </div>
  );
}

function Overlay({
  title,
  text,
  primary,
  onPrimary,
  secondary,
  onSecondary,
}: {
  title: string;
  text: string;
  primary: string;
  onPrimary: () => void;
  secondary: string;
  onSecondary: () => void;
}) {
  return (
    <div className="absolute inset-0 flex items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-lg border border-line bg-surface/95 p-6 text-center backdrop-blur-md">
        <h2 className="font-display text-3xl font-extrabold text-fg">{title}</h2>
        <p className="mt-2 text-sm text-muted">{text}</p>
        <button type="button" onClick={onPrimary} className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary font-semibold text-bg">
          <RotateCcw className="size-4" />
          {primary}
        </button>
        <button type="button" onClick={onSecondary} className="mt-2 min-h-11 w-full rounded-lg border border-line text-sm text-fg">
          {secondary}
        </button>
      </div>
    </div>
  );
}

function Stick({
  label,
  onChange,
  showPitch,
}: {
  label: string;
  onChange: (v: TouchInput) => void;
  showPitch: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const state = useRef<TouchInput>({ ...EMPTY_TOUCH });
  const [knob, setKnob] = useState({ x: 0, y: 0 });

  function emit(partial: Partial<TouchInput>) {
    state.current = { ...state.current, ...partial };
    onChange(state.current);
  }

  function setFromPointer(clientX: number, clientY: number) {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let x = (clientX - (r.left + r.width / 2)) / (r.width / 2);
    let y = (clientY - (r.top + r.height / 2)) / (r.height / 2);
    const m = Math.hypot(x, y);
    if (m > 1) {
      x /= m;
      y /= m;
    }
    setKnob({ x, y });
    emit({ x, y, active: true });
  }

  return (
    <div className="flex items-end gap-2">
      <div
        ref={ref}
        className="relative size-28 touch-none rounded-full border border-line bg-surface/70"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          setFromPointer(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) setFromPointer(e.clientX, e.clientY);
        }}
        onPointerUp={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
          setKnob({ x: 0, y: 0 });
          emit({ x: 0, y: 0, active: false });
        }}
      >
        <span className="absolute top-2 left-3 text-xs text-muted">{label}</span>
        <span
          className="absolute size-10 rounded-full bg-primary"
          style={{
            left: `calc(50% + ${knob.x * 32}px - 1.25rem)`,
            top: `calc(50% + ${knob.y * 32}px - 1.25rem)`,
          }}
        />
      </div>
      <div className="flex flex-col gap-2">
        {showPitch && (
          <div className="flex gap-1">
            <button
              type="button"
              className="min-h-11 min-w-11 rounded-md border border-line bg-surface/80 px-2 text-xs text-fg"
              onPointerDown={() => emit({ pitch: 1 })}
              onPointerUp={() => emit({ pitch: 0 })}
              onPointerLeave={() => emit({ pitch: 0 })}
            >
              Hoch
            </button>
            <button
              type="button"
              className="min-h-11 min-w-11 rounded-md border border-line bg-surface/80 px-2 text-xs text-fg"
              onPointerDown={() => emit({ pitch: -1 })}
              onPointerUp={() => emit({ pitch: 0 })}
              onPointerLeave={() => emit({ pitch: 0 })}
            >
              Runter
            </button>
          </div>
        )}
        <button
          type="button"
          className="min-h-14 min-w-16 rounded-lg bg-accent font-semibold text-bg"
          onPointerDown={() => emit({ fire: true })}
          onPointerUp={() => emit({ fire: false })}
          onPointerLeave={() => emit({ fire: false })}
        >
          Feuer
        </button>
      </div>
    </div>
  );
}
