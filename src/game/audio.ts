let ctx: AudioContext | null = null;

function ac(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  return ctx;
}

export function unlockAudio() {
  const c = ac();
  if (c && c.state === "suspended") void c.resume();
}

function tone(freq: number, dur: number, type: OscillatorType, gain = 0.05, delay = 0) {
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g);
  g.connect(c.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

export const sfx = {
  shot() {
    tone(520, 0.05, "square", 0.03);
    tone(180, 0.07, "sine", 0.02);
  },
  shield() {
    tone(660, 0.1, "triangle", 0.05);
    tone(880, 0.16, "triangle", 0.04, 0.08);
  },
  hurt() {
    tone(140, 0.22, "sawtooth", 0.05);
    tone(70, 0.28, "square", 0.03, 0.04);
  },
  boom() {
    tone(90, 0.3, "sawtooth", 0.06);
    tone(180, 0.12, "square", 0.03);
  },
  up() {
    tone(440, 0.08, "square", 0.04);
    tone(660, 0.12, "square", 0.04, 0.07);
  },
};
