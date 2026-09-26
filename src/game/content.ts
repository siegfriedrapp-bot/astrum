export type Mode = "duel" | "coop";
export type ShipId = "pfeil" | "bastion" | "schatten" | "komet";
export type GradeId = "12" | "34" | "56" | "78";

export type ShipClass = {
  id: ShipId;
  name: string;
  role: string;
  blurb: string;
  speed: number;
  turn: number;
  fire: number;
  damage: number;
  hit: number;
  mathBonus: number;
  tier: number;
};

export type Weapon = {
  name: string;
  pellets: number;
  spread: number;
  speed: number;
  damage: number;
  cooldown: number;
};

export const LIVES = 5;

export const SHIPS: ShipClass[] = [
  {
    id: "pfeil",
    name: "Pfeil",
    role: "Jäger",
    blurb: "Schnell und wendig. Kurze Salven.",
    speed: 1.28,
    turn: 1.38,
    fire: 0.74,
    damage: 0.85,
    hit: 1.02,
    mathBonus: 0,
    tier: 0,
  },
  {
    id: "bastion",
    name: "Bastion",
    role: "Kreuzer",
    blurb: "Träge, dafür mehr Zeit für die Schildrechnung.",
    speed: 0.78,
    turn: 0.7,
    fire: 1.28,
    damage: 1.32,
    hit: 1.38,
    mathBonus: 3.4,
    tier: 0,
  },
  {
    id: "schatten",
    name: "Schatten",
    role: "Phantom",
    blurb: "Schmale Silhouette. Startet bereits mit Streufeuer.",
    speed: 1.08,
    turn: 1.18,
    fire: 0.92,
    damage: 0.9,
    hit: 0.76,
    mathBonus: 0,
    tier: 2,
  },
  {
    id: "komet",
    name: "Komet",
    role: "Nova",
    blurb: "Schwere Schüsse, hohe Wucht, trägere Drehung.",
    speed: 0.96,
    turn: 0.86,
    fire: 1.42,
    damage: 1.7,
    hit: 1.12,
    mathBonus: 1,
    tier: 0,
  },
];

export const WEAPONS: Weapon[] = [
  { name: "Impuls", pellets: 1, spread: 0, speed: 76, damage: 1, cooldown: 0.32 },
  { name: "Zwilling", pellets: 2, spread: 0.07, speed: 80, damage: 1, cooldown: 0.3 },
  { name: "Streu", pellets: 3, spread: 0.16, speed: 70, damage: 0.82, cooldown: 0.4 },
  { name: "Rail", pellets: 1, spread: 0, speed: 128, damage: 2.5, cooldown: 0.56 },
  { name: "Nova", pellets: 5, spread: 0.22, speed: 86, damage: 1.05, cooldown: 0.64 },
];

export const GRADES: { id: GradeId; label: string; hint: string; seconds: number }[] = [
  { id: "12", label: "Klasse 1–2", hint: "Plus und Minus bis 20", seconds: 12 },
  { id: "34", label: "Klasse 3–4", hint: "Größere Zahlen und Malnehmen", seconds: 10 },
  { id: "56", label: "Klasse 5–6", hint: "Mal, geteilt und zweistufig", seconds: 9 },
  { id: "78", label: "Klasse 7–8", hint: "Klammern und negative Zahlen", seconds: 8 },
];

export function shipById(id: ShipId): ShipClass {
  return SHIPS.find((s) => s.id === id) ?? SHIPS[0];
}

export function gradeById(id: GradeId) {
  return GRADES.find((g) => g.id === id) ?? GRADES[1];
}

function ri(a: number, b: number) {
  return a + Math.floor(Math.random() * (b - a + 1));
}

export function makeProblem(grade: GradeId): { prompt: string; answer: number } {
  if (grade === "12") {
    const a = ri(1, 12);
    const b = ri(1, 12);
    if (Math.random() < 0.5) return { prompt: `${a} + ${b}`, answer: a + b };
    const x = Math.max(a, b);
    const y = Math.min(a, b);
    return { prompt: `${x} − ${y}`, answer: x - y };
  }
  if (grade === "34") {
    const roll = Math.random();
    if (roll < 0.34) {
      const a = ri(14, 70);
      const b = ri(8, 29);
      return { prompt: `${a} + ${b}`, answer: a + b };
    }
    if (roll < 0.67) {
      const a = ri(30, 90);
      const b = ri(6, 28);
      return { prompt: `${a} − ${b}`, answer: a - b };
    }
    const a = ri(3, 12);
    const b = ri(3, 9);
    return { prompt: `${a} × ${b}`, answer: a * b };
  }
  if (grade === "56") {
    if (Math.random() < 0.45) {
      const b = ri(3, 12);
      const q = ri(3, 12);
      return { prompt: `${b * q} ÷ ${b}`, answer: q };
    }
    const a = ri(4, 12);
    const b = ri(3, 9);
    const c = ri(5, 24);
    if (Math.random() < 0.5) return { prompt: `${a} × ${b} + ${c}`, answer: a * b + c };
    return { prompt: `${a} × ${b} − ${c}`, answer: a * b - c };
  }
  const a = ri(3, 9);
  const b = ri(3, 8);
  const c = ri(2, 9);
  if (Math.random() < 0.5) return { prompt: `(${a} + ${b}) × ${c}`, answer: (a + b) * c };
  const n = ri(4, 18);
  return { prompt: `${n} − (${a} × ${b})`, answer: n - a * b };
}

export type TouchInput = {
  x: number;
  y: number;
  active: boolean;
  fire: boolean;
  pitch: number;
};

export type MatchConfig = {
  mode: Mode;
  players: [
    { name: string; ship: ShipId; grade: GradeId },
    { name: string; ship: ShipId; grade: GradeId },
  ];
};

export const P1 = 0x3ddcbf;
export const P2 = 0xf0a202;
