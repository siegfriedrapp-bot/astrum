import * as THREE from "three";
import { sfx } from "@/game/audio";
import {
  LIVES,
  P1,
  P2,
  WEAPONS,
  gradeById,
  makeProblem,
  shipById,
  type GradeId,
  type MatchConfig,
  type Mode,
  type ShipId,
  type TouchInput,
} from "@/game/content";

const GAME_KEYS = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "KeyQ",
  "KeyE",
  "KeyF",
  "KeyI",
  "KeyK",
  "Space",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ShiftRight",
  "Enter",
  "Numpad0",
]);

const qaKeys = new Set<string>();
let steerOverride: number | null = null;

export type ControlsProbe = {
  getYaw: () => number;
  getSpeed: () => number;
  setKeys?: (codes: string[]) => void;
  setSteer?: (v: number) => void;
};

declare global {
  interface Window {
    __controlsTest?: ControlsProbe;
  }
}

export type Hud = {
  phase: "attract" | "play" | "pause" | "challenge" | "over";
  mode: Mode;
  wave: number;
  banner: string | null;
  result: string | null;
  challenge: null | {
    id: number;
    defender: 0 | 1;
    prompt: string;
    time: number;
    max: number;
    attacker: 0 | 1 | null;
  };
  ships: {
    name: string;
    className: string;
    weapon: string;
    tier: number;
    lives: number;
    kills: number;
    alive: boolean;
  }[];
};

type Ship = {
  index: 0 | 1;
  name: string;
  classId: ShipId;
  className: string;
  grade: GradeId;
  speedMul: number;
  turnMul: number;
  fireMul: number;
  damageMul: number;
  hit: number;
  mathBonus: number;
  pos: THREE.Vector3;
  yaw: number;
  pitch: number;
  roll: number;
  speed: number;
  lives: number;
  tier: number;
  cooldown: number;
  invuln: number;
  shield: number;
  alive: boolean;
  kills: number;
  mesh: THREE.Group;
  forward: THREE.Vector3;
};

type Bolt = {
  alive: boolean;
  owner: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  damage: number;
  life: number;
  r: number;
};

type Enemy = {
  alive: boolean;
  kind: "drone" | "hulk";
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  hp: number;
  r: number;
  cooldown: number;
  mesh: THREE.Group;
};

type Challenge = {
  id: number;
  defender: 0 | 1;
  attacker: 0 | 1 | null;
  prompt: string;
  answer: number;
  time: number;
  max: number;
};

type Spark = {
  alive: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  max: number;
  color: number;
};

const UP = new THREE.Vector3(0, 1, 0);

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  if (!g) return new THREE.CanvasTexture(c);
  draw(g);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeShip(kind: ShipId, accent: number) {
  const g = new THREE.Group();
  const hull = new THREE.MeshStandardMaterial({
    color: 0x172033,
    metalness: 0.84,
    roughness: 0.28,
    emissive: accent,
    emissiveIntensity: 0.09,
  });
  const trim = new THREE.MeshStandardMaterial({
    color: accent,
    emissive: accent,
    emissiveIntensity: 0.85,
    metalness: 0.35,
    roughness: 0.32,
  });
  const hot = new THREE.MeshBasicMaterial({
    color: accent,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const box = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    g.add(m);
  };
  const engines = (x: number, z: number, r: number) => {
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), hot);
      e.position.set(x * s, 0, z);
      if (s === 1) e.name = "glow";
      g.add(e);
    }
  };
  if (kind === "pfeil") {
    box(0.4, 0.26, 1.65, hull, 0, 0, 0.05);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.26, 1.05, 6), hull);
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, 0, 1.2);
    g.add(nose);
    box(2.05, 0.055, 0.58, hull, 0, 0, -0.08);
    box(0.07, 0.28, 0.46, trim, 0, 0.16, 0.25);
    engines(0.22, -0.95, 0.14);
  } else if (kind === "bastion") {
    box(1.2, 0.5, 2.15, hull, 0, 0, 0);
    box(2.45, 0.1, 0.9, hull, 0, -0.02, -0.15);
    box(0.42, 0.26, 0.62, trim, 0, 0.36, 0.1);
    box(0.55, 0.32, 0.5, hull, 0, 0, 1.3);
    const eng = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.5, 10), hot);
    eng.rotation.x = Math.PI / 2;
    eng.position.set(0, 0, -1.25);
    eng.name = "glow";
    g.add(eng);
  } else if (kind === "schatten") {
    const body = new THREE.Mesh(new THREE.OctahedronGeometry(0.82, 0), hull);
    body.scale.set(0.72, 0.2, 1.6);
    g.add(body);
    box(0.07, 0.07, 1.35, trim, 0.52, 0, 0.05);
    box(0.07, 0.07, 1.35, trim, -0.52, 0, 0.05);
    engines(0.16, -1.05, 0.1);
  } else {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.38, 2.15, 8), hull);
    body.rotation.x = Math.PI / 2;
    g.add(body);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.07, 8, 20), trim);
    ring.position.set(0, 0, 0.1);
    g.add(ring);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.85, 8), hull);
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, 0, 1.4);
    g.add(nose);
    const eng = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), hot);
    eng.position.set(0, 0, -1.2);
    eng.name = "glow";
    g.add(eng);
  }
  const shield = new THREE.Mesh(
    new THREE.SphereGeometry(1.45, 16, 12),
    new THREE.MeshBasicMaterial({
      color: accent,
      wireframe: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    }),
  );
  shield.name = "shield";
  g.add(shield);
  return g;
}

function makeDrone() {
  const g = new THREE.Group();
  const hull = new THREE.MeshStandardMaterial({
    color: 0x24180f,
    metalness: 0.45,
    roughness: 0.4,
    emissive: 0xf0a202,
    emissiveIntensity: 0.28,
  });
  const core = new THREE.MeshStandardMaterial({
    color: 0xf0a202,
    emissive: 0xf0a202,
    emissiveIntensity: 1.5,
    roughness: 0.3,
  });
  const body = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0), hull);
  body.scale.set(1.05, 0.48, 1.25);
  g.add(body);
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), core);
  eye.position.set(0, 0, 0.55);
  g.add(eye);
  return g;
}

function disposeObject(obj: THREE.Object3D) {
  obj.traverse((node) => {
    const mesh = node as THREE.Mesh;
    mesh.geometry?.dispose();
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (!mat) return;
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
    else mat.dispose();
  });
}

export class AstrumEngine {
  onHud: ((hud: Hud) => void) | null = null;
  readonly ships: Ship[] = [];
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly bolts: Bolt[] = [];
  private readonly enemies: Enemy[] = [];
  private readonly sparks: Spark[] = [];
  private readonly boltMesh: THREE.InstancedMesh;
  private readonly sparkMesh: THREE.InstancedMesh;
  private readonly rockPivot = new THREE.Group();
  private readonly station = new THREE.Group();
  private readonly arena: THREE.Mesh;
  private readonly keys = new Set<string>();
  private readonly touch: [TouchInput, TouchInput] = [
    { x: 0, y: 0, active: false, fire: false, pitch: 0 },
    { x: 0, y: 0, active: false, fire: false, pitch: 0 },
  ];
  private readonly dummy = new THREE.Object3D();
  private readonly color = new THREE.Color();
  private readonly _fwd = new THREE.Vector3();
  private readonly _dir = new THREE.Vector3();
  private readonly _axis = new THREE.Vector3();
  private readonly _mid = new THREE.Vector3();
  private readonly _x = new THREE.Vector3();
  private readonly _y = new THREE.Vector3();
  private readonly _z = new THREE.Vector3();
  private readonly _desired = new THREE.Vector3();
  private readonly _look = new THREE.Vector3();
  private readonly _lookS = new THREE.Vector3();
  private readonly _m = new THREE.Matrix4();
  private mode: Mode = "coop";
  private phase: Hud["phase"] = "attract";
  private wave = 1;
  private killsWave = 0;
  private spawnCd = 2;
  private challenge: Challenge | null = null;
  private challengeSeq = 0;
  private banner: string | null = null;
  private bannerT = 0;
  private result: string | null = null;
  private shake = 0;
  private t = 0;
  private acc = 0;
  private uiAcc = 0;
  private hudDirty = true;
  private last = 0;
  private raf = 0;
  private running = true;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.setClearColor(0x070b12, 1);
    this.camera = new THREE.PerspectiveCamera(58, 1, 0.1, 600);
    this.camera.position.set(16, 8, 18);
    this._lookS.set(0, 1, 0);
    this.scene.fog = new THREE.Fog(0x070b12, 55, 190);
    this.scene.add(new THREE.HemisphereLight(0xb7d4ff, 0x1a1208, 0.62));
    const sun = new THREE.DirectionalLight(0xfff3df, 1.45);
    sun.position.set(28, 46, 18);
    this.scene.add(sun);
    const rim = new THREE.DirectionalLight(0x3ddcbf, 0.35);
    rim.position.set(-20, 8, -30);
    this.scene.add(rim);
    this.buildSky();
    this.arena = this.buildArena();
    this.buildPlanet();
    this.buildStation();
    this.buildRocks();
    this.boltMesh = this.buildPoints(48, 0.22, true);
    this.sparkMesh = this.buildPoints(80, 0.12, false);
    for (let i = 0; i < 48; i++) {
      this.bolts.push({
        alive: false,
        owner: 0,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        damage: 1,
        life: 0,
        r: 0.3,
      });
    }
    for (let i = 0; i < 80; i++) {
      this.sparks.push({
        alive: false,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        life: 0,
        max: 1,
        color: 0xffffff,
      });
    }
    for (let i = 0; i < 7; i++) {
      const mesh = makeDrone();
      mesh.visible = false;
      this.scene.add(mesh);
      this.enemies.push({
        alive: false,
        kind: "drone",
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        hp: 1,
        r: 1.2,
        cooldown: 0,
        mesh,
      });
    }
    for (let i = 0; i < 2; i++) {
      const mesh = makeShip(i === 0 ? "pfeil" : "komet", i === 0 ? P1 : P2);
      this.scene.add(mesh);
      this.ships.push({
        index: i as 0 | 1,
        name: i === 0 ? "Spieler 1" : "Spieler 2",
        classId: i === 0 ? "pfeil" : "komet",
        className: i === 0 ? "Pfeil" : "Komet",
        grade: "34",
        speedMul: 1,
        turnMul: 1,
        fireMul: 1,
        damageMul: 1,
        hit: 1.1,
        mathBonus: 0,
        pos: new THREE.Vector3(i === 0 ? -5 : 5, 1.5, 0),
        yaw: i === 0 ? -0.4 : 2.4,
        pitch: 0,
        roll: 0,
        speed: 0,
        lives: LIVES,
        tier: 0,
        cooldown: 0,
        invuln: 0,
        shield: 0,
        alive: true,
        kills: 0,
        mesh,
        forward: new THREE.Vector3(0, 0, -1),
      });
    }
    this.resize();
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    document.addEventListener("visibilitychange", this.onHide);
    this.installProbe();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  dispose() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    document.removeEventListener("visibilitychange", this.onHide);
    this.scene.traverse((node) => {
      const mesh = node as THREE.Mesh;
      mesh.geometry?.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (!mat) return;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat.dispose();
    });
    this.renderer.dispose();
    if (window.__controlsTest && (window.__controlsTest as { engine?: AstrumEngine }).engine === undefined) {
      /* probe stays pointed at this instance until replaced */
    }
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  setTouch(index: 0 | 1, input: TouchInput) {
    this.touch[index] = input;
  }

  togglePause() {
    if (this.phase === "play") this.phase = "pause";
    else if (this.phase === "pause") this.phase = "play";
    else return;
    this.keys.clear();
    this.hudDirty = true;
    this.emit(true);
  }

  backToMenu() {
    this.phase = "attract";
    this.challenge = null;
    this.result = null;
    this.banner = null;
    this.mode = "coop";
    for (const b of this.bolts) b.alive = false;
    for (const e of this.enemies) {
      e.alive = false;
      e.mesh.visible = false;
    }
    this.keys.clear();
    this.hudDirty = true;
    this.emit(true);
  }

  submitAnswer(raw: string) {
    if (!this.challenge || this.phase !== "challenge") return;
    const cleaned = raw.trim().replace("−", "-").replace(",", ".");
    if (!cleaned || cleaned === "-" || cleaned === "." || cleaned === "-.") return;
    const n = Number(cleaned);
    this.resolve(Number.isFinite(n) && Math.abs(n - this.challenge.answer) < 0.001);
  }

  startMatch(cfg: MatchConfig) {
    this.mode = cfg.mode;
    this.wave = 1;
    this.killsWave = 0;
    this.spawnCd = 1.15;
    this.challenge = null;
    this.result = null;
    this.banner = cfg.mode === "coop" ? "Hinein in den Sektor." : "Links gegen rechts. Fünf Leben.";
    this.bannerT = 2.4;
    this.shake = 0;
    for (const b of this.bolts) b.alive = false;
    for (const e of this.enemies) {
      e.alive = false;
      e.mesh.visible = false;
    }
    cfg.players.forEach((p, i) => {
      const idx = (i === 0 ? 0 : 1) as 0 | 1;
      const klass = shipById(p.ship);
      this.mountShip(idx, klass.id);
      const s = this.ships[idx];
      s.name = p.name.trim().slice(0, 16) || (idx === 0 ? "Spieler 1" : "Spieler 2");
      s.classId = klass.id;
      s.className = klass.name;
      s.grade = p.grade;
      s.speedMul = klass.speed;
      s.turnMul = klass.turn;
      s.fireMul = klass.fire;
      s.damageMul = klass.damage;
      s.hit = klass.hit;
      s.mathBonus = klass.mathBonus;
      s.tier = klass.tier;
      s.lives = LIVES;
      s.kills = 0;
      s.cooldown = 0.35;
      s.invuln = 1.1;
      s.shield = 0;
      s.alive = true;
      s.roll = 0;
      if (cfg.mode === "duel") {
        s.pos.set(idx === 0 ? -13 : 13, 3.3, 0);
        s.yaw = idx === 0 ? -Math.PI / 2 : Math.PI / 2;
        s.pitch = 0;
        s.speed = 0;
      } else {
        s.pos.set(idx === 0 ? -3.4 : 3.4, 2.4, 26);
        s.yaw = 0;
        s.pitch = 0;
        s.speed = 14 * klass.speed;
      }
      this.fillForward(s);
    });
    this.phase = "play";
    if (cfg.mode === "duel") {
      this.camera.position.set(0, 10.5, 27);
      this._lookS.set(0, 2.4, 0);
    } else {
      this.camera.position.set(0, 7.2, 44);
      this._lookS.set(0, 2.4, 12);
    }
    this.hudDirty = true;
    this.emit(true);
  }

  private installProbe() {
    const dev = import.meta.env.DEV;
    const qa = typeof location !== "undefined" && new URLSearchParams(location.search).has("qa");
    if (!dev && !qa) return;
    const engine = this;
    window.__controlsTest = {
      getYaw: () => engine.ships[0]?.yaw ?? 0,
      getSpeed: () => engine.ships[0]?.speed ?? 0,
      setKeys: (codes) => {
        qaKeys.clear();
        for (const c of codes) qaKeys.add(c);
      },
      setSteer: (v) => {
        steerOverride = v;
      },
    };
    (window as unknown as { __astrumHit?: (defender?: 0 | 1) => void }).__astrumHit = (defender = 1) => {
      if (engine.phase === "attract" || engine.phase === "over" || engine.phase === "pause") return;
      engine.beginChallenge(defender, defender === 0 ? 1 : 0);
    };
  }

  private mountShip(index: 0 | 1, id: ShipId) {
    const prev = this.ships[index].mesh;
    this.scene.remove(prev);
    disposeObject(prev);
    const mesh = makeShip(id, index === 0 ? P1 : P2);
    this.scene.add(mesh);
    this.ships[index].mesh = mesh;
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.code === "Escape") {
      e.preventDefault();
      this.togglePause();
      return;
    }
    if (this.phase === "challenge") return;
    if (GAME_KEYS.has(e.code)) e.preventDefault();
    this.keys.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private onBlur = () => {
    this.keys.clear();
  };

  private onHide = () => {
    if (document.hidden) this.keys.clear();
  };

  private held(code: string) {
    return this.keys.has(code) || qaKeys.has(code);
  }

  private actions(i: 0 | 1) {
    const pad = this.touch[i];
    let steer = 0;
    let thrust = 0;
    let pitch = 0;
    let fire = false;
    if (i === 0) {
      if (this.held("KeyA")) steer += 1;
      if (this.held("KeyD")) steer -= 1;
      if (this.held("KeyW")) thrust += 1;
      if (this.held("KeyS")) thrust -= 1;
      if (this.held("KeyQ")) pitch += 1;
      if (this.held("KeyE")) pitch -= 1;
      fire = this.held("Space") || this.held("KeyF");
      if (steerOverride !== null) steer = steerOverride;
    } else {
      if (this.held("ArrowLeft")) steer += 1;
      if (this.held("ArrowRight")) steer -= 1;
      if (this.held("ArrowUp")) thrust += 1;
      if (this.held("ArrowDown")) thrust -= 1;
      if (this.held("KeyI")) pitch += 1;
      if (this.held("KeyK")) pitch -= 1;
      fire = this.held("ShiftRight") || this.held("Enter") || this.held("Numpad0");
    }
    if (pad.active) {
      steer = -pad.x;
      thrust = -pad.y;
    }
    if (pad.pitch) pitch = pad.pitch;
    if (pad.fire) fire = true;
    return {
      steer: clamp(steer, -1, 1),
      thrust: clamp(thrust, -1, 1),
      pitch: clamp(pitch, -1, 1),
      fire,
    };
  }

  private frame = (now: number) => {
    if (!this.running) return;
    const dt = Math.min(0.05, (now - this.last) / 1000 || 0);
    this.last = now;
    this.acc += dt;
    let guard = 0;
    while (this.acc >= 1 / 60 && guard < 5) {
      this.step(1 / 60);
      this.acc -= 1 / 60;
      guard++;
    }
    this.draw(dt);
    this.uiAcc += dt;
    if (this.hudDirty || this.phase === "challenge" || this.uiAcc > 0.12) {
      this.uiAcc = 0;
      this.emit(false);
    }
    this.raf = requestAnimationFrame(this.frame);
  };

  private emit(force: boolean) {
    if (!force) this.hudDirty = false;
    else this.hudDirty = false;
    this.onHud?.(this.makeHud());
  }

  private makeHud(): Hud {
    return {
      phase: this.phase,
      mode: this.mode,
      wave: this.wave,
      banner: this.bannerT > 0 ? this.banner : null,
      result: this.result,
      challenge: this.challenge
        ? {
            id: this.challenge.id,
            defender: this.challenge.defender,
            prompt: this.challenge.prompt,
            time: this.challenge.time,
            max: this.challenge.max,
            attacker: this.challenge.attacker,
          }
        : null,
      ships: this.ships.map((s) => ({
        name: s.name,
        className: s.className,
        weapon: WEAPONS[s.tier]?.name ?? "Impuls",
        tier: s.tier,
        lives: s.lives,
        kills: s.kills,
        alive: s.alive,
      })),
    };
  }

  private step(dt: number) {
    this.t += dt;
    if (this.bannerT > 0) this.bannerT -= dt;
    if (this.phase === "pause" || this.phase === "over") {
      this.decayFx(dt);
      return;
    }
    if (this.phase === "attract") {
      this.stepAttract();
      this.decayFx(dt);
      return;
    }
    if (this.phase === "challenge" && this.challenge) {
      this.challenge.time -= dt;
      if (this.challenge.time <= 0) this.resolve(false);
      this.decayFx(dt);
      return;
    }
    for (const s of this.ships) {
      if (s.cooldown > 0) s.cooldown -= dt;
      if (s.invuln > 0) s.invuln -= dt;
      if (s.shield > 0) s.shield = Math.max(0, s.shield - dt);
      if (!s.alive) continue;
      if (this.mode === "duel") this.stepDuel(s, dt);
      else this.stepFlight(s, dt);
    }
    if (this.mode === "coop") {
      this.stepEnemies(dt);
      this.leash(dt);
      this.bounds();
    }
    this.stepBolts(dt);
    this.collide();
    this.decayFx(dt);
  }

  private stepAttract() {
    const t = this.t;
    const a = this.ships[0];
    const b = this.ships[1];
    a.pos.set(Math.sin(t * 0.32) * 2.4 - 5.2, 1.7 + Math.sin(t * 0.8) * 0.35, Math.cos(t * 0.22) * 1.6);
    b.pos.set(5.6, 1.35 + Math.cos(t * 0.66) * 0.3, -0.8 + Math.sin(t * 0.37));
    a.yaw = -0.45 + Math.sin(t * 0.28) * 0.18;
    b.yaw = 2.55;
    a.pitch = 0.04;
    b.pitch = -0.02;
    a.roll = Math.sin(t * 0.5) * 0.25;
    b.roll = -0.18;
    a.alive = true;
    b.alive = true;
    this.fillForward(a);
    this.fillForward(b);
  }

  private stepDuel(s: Ship, dt: number) {
    const a = this.actions(s.index);
    const move = 14 * s.speedMul;
    const vx = -a.steer * move;
    const vy = a.thrust * move;
    s.pos.x += vx * dt;
    s.pos.y += vy * dt;
    const minX = s.index === 0 ? -20 : 5.4;
    const maxX = s.index === 0 ? -5.4 : 20;
    s.pos.x = clamp(s.pos.x, minX, maxX);
    s.pos.y = clamp(s.pos.y, 1.15, 8.4);
    s.yaw = s.index === 0 ? -Math.PI / 2 : Math.PI / 2;
    s.pitch = 0;
    s.speed = Math.hypot(vx, vy);
    s.roll += (-a.steer * 0.5 - s.roll) * Math.min(1, dt * 8);
    this.fillForward(s);
    if (a.fire) this.tryFire(s);
  }

  private stepFlight(s: Ship, dt: number) {
    const a = this.actions(s.index);
    s.yaw += a.steer * 1.9 * s.turnMul * dt;
    s.pitch = clamp(s.pitch + a.pitch * 1.05 * dt, -0.62, 0.7);
    const max = 32 * s.speedMul;
    const min = 8 * s.speedMul;
    if (a.thrust > 0) s.speed += 30 * s.speedMul * dt;
    else if (a.thrust < 0) s.speed -= 24 * s.speedMul * dt;
    else s.speed += (15 * s.speedMul - s.speed) * dt * 0.4;
    s.speed = clamp(s.speed, min, max);
    this.fillForward(s);
    s.pos.addScaledVector(s.forward, s.speed * dt);
    s.roll += (-a.steer * 0.58 - s.roll) * Math.min(1, dt * 6);
    if (a.fire) this.tryFire(s);
  }

  private fillForward(s: Ship) {
    const cp = Math.cos(s.pitch);
    s.forward.set(-Math.sin(s.yaw) * cp, Math.sin(s.pitch), -Math.cos(s.yaw) * cp);
  }

  private tryFire(s: Ship) {
    if (!s.alive || s.cooldown > 0 || this.phase !== "play") return;
    const w = WEAPONS[s.tier] ?? WEAPONS[0];
    s.cooldown = w.cooldown * s.fireMul;
    const n = w.pellets;
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0 : i / (n - 1) - 0.5;
      this._dir.copy(s.forward);
      this._axis.crossVectors(s.forward, UP);
      if (this._axis.lengthSq() < 1e-6) this._axis.set(1, 0, 0);
      else this._axis.normalize();
      this._dir.applyAxisAngle(UP, t * w.spread * 2);
      if (n > 3) this._dir.applyAxisAngle(this._axis, ((i % 2) === 0 ? -1 : 1) * w.spread * 0.45);
      this._dir.normalize();
      this.spawnBolt(s.index, s.pos, this._dir, w.speed, w.damage * s.damageMul, s.tier === 3 ? 0.42 : 0.3);
    }
    sfx.shot();
  }

  private spawnBolt(owner: number, origin: THREE.Vector3, dir: THREE.Vector3, speed: number, damage: number, r: number) {
    const b = this.bolts.find((x) => !x.alive);
    if (!b) return;
    b.alive = true;
    b.owner = owner;
    b.pos.copy(origin).addScaledVector(dir, 2.15);
    b.vel.copy(dir).multiplyScalar(speed);
    b.damage = damage;
    b.life = 2.15;
    b.r = r;
  }

  private stepBolts(dt: number) {
    for (const b of this.bolts) {
      if (!b.alive) continue;
      b.pos.addScaledVector(b.vel, dt);
      b.life -= dt;
      if (b.life <= 0) b.alive = false;
    }
  }

  private stepEnemies(dt: number) {
    let alive = 0;
    for (const e of this.enemies) if (e.alive) alive++;
    this.spawnCd -= dt;
    const cap = Math.min(6, 2 + Math.floor(this.wave / 2));
    const need = 2 + this.wave;
    if (alive === 0 && this.killsWave >= need) {
      this.wave += 1;
      this.killsWave = 0;
      this.banner = `Sektor ${this.wave}`;
      this.bannerT = 2.1;
      this.spawnCd = 1.05;
      this.hudDirty = true;
      try {
        const best = Number(localStorage.getItem("astrum-wave") || "0");
        if (this.wave > best) localStorage.setItem("astrum-wave", String(this.wave));
      } catch {
        /* ignore quota */
      }
    } else if (this.spawnCd <= 0 && alive < cap) {
      this.spawnEnemy();
      this.spawnCd = Math.max(0.8, 2.5 - this.wave * 0.12);
    }
    for (const e of this.enemies) {
      if (!e.alive) continue;
      let nearest = this.ships[0];
      let bestD = Infinity;
      for (const s of this.ships) {
        if (!s.alive) continue;
        const d = e.pos.distanceToSquared(s.pos);
        if (d < bestD) {
          bestD = d;
          nearest = s;
        }
      }
      this._dir.copy(nearest.pos).sub(e.pos);
      const dist = Math.sqrt(bestD);
      if (dist > 0.001) this._dir.multiplyScalar(1 / dist);
      const spd = (e.kind === "hulk" ? 9 : 14) + this.wave * 0.35;
      if (dist > 16) e.vel.copy(this._dir).multiplyScalar(spd);
      else {
        this._axis.set(-this._dir.z, 0, this._dir.x);
        if (this._axis.lengthSq() < 1e-4) this._axis.set(1, 0, 0);
        e.vel.copy(this._axis).normalize().multiplyScalar(spd * 0.85);
      }
      e.pos.addScaledVector(e.vel, dt);
      e.cooldown -= dt;
      if (e.cooldown <= 0 && dist < 50 && nearest.alive && this.phase === "play") {
        e.cooldown = e.kind === "hulk" ? 1.25 : 1.85;
        this._dir.copy(nearest.pos).sub(e.pos);
        if (this._dir.lengthSq() > 0.01) {
          this._dir.normalize();
          this.spawnBolt(-1, e.pos, this._dir, e.kind === "hulk" ? 44 : 34, 1, 0.34);
        }
      }
    }
  }

  private spawnEnemy() {
    const e = this.enemies.find((x) => !x.alive);
    if (!e) return;
    this.centroid(this._mid);
    this.avgForward(this._fwd);
    this._axis.set(-this._fwd.z, 0, this._fwd.x);
    if (this._axis.lengthSq() < 1e-4) this._axis.set(1, 0, 0);
    this._axis.normalize();
    e.pos
      .copy(this._mid)
      .addScaledVector(this._fwd, 42 + Math.random() * 18)
      .addScaledVector(this._axis, (Math.random() - 0.5) * 26);
    e.pos.y = clamp(e.pos.y + (Math.random() - 0.4) * 8, -3, 13);
    const hulk = this.wave >= 3 && Math.random() < 0.3;
    e.kind = hulk ? "hulk" : "drone";
    e.hp = hulk ? 6 + this.wave : 1.6 + this.wave * 0.45;
    e.r = hulk ? 2.05 : 1.2;
    e.cooldown = 0.6 + Math.random();
    e.alive = true;
    e.vel.set(0, 0, 0);
    e.mesh.visible = true;
    e.mesh.scale.setScalar(hulk ? 1.7 : 1);
  }

  private leash(dt: number) {
    this.centroid(this._mid);
    for (const s of this.ships) {
      if (!s.alive) continue;
      this._dir.copy(s.pos).sub(this._mid);
      const dist = this._dir.length();
      if (dist > 16) s.pos.addScaledVector(this._dir, -((dist - 16) * 1.6 * dt) / dist);
    }
  }

  private bounds() {
    for (const s of this.ships) {
      if (!s.alive) continue;
      const flat = Math.hypot(s.pos.x, s.pos.z);
      if (flat > 68) {
        s.pos.x *= 68 / flat;
        s.pos.z *= 68 / flat;
        s.speed *= 0.92;
      }
      s.pos.y = clamp(s.pos.y, -4.5, 16);
    }
  }

  private collide() {
    if (this.phase !== "play") return;
    for (const b of this.bolts) {
      if (!b.alive) continue;
      if (b.owner >= 0) {
        if (this.mode === "duel") {
          const target = this.ships[b.owner === 0 ? 1 : 0];
          if (target.alive && target.invuln <= 0 && b.pos.distanceTo(target.pos) < target.hit + b.r) {
            b.alive = false;
            this.beginChallenge(target.index, b.owner === 0 ? 0 : 1);
            return;
          }
        } else {
          for (const e of this.enemies) {
            if (!e.alive) continue;
            if (b.pos.distanceTo(e.pos) < e.r + b.r) {
              b.alive = false;
              e.hp -= b.damage;
              this.burst(b.pos, b.owner === 0 ? P1 : P2, 5);
              if (e.hp <= 0) this.killEnemy(e, b.owner === 0 ? 0 : 1);
              break;
            }
          }
        }
      } else {
        for (const s of this.ships) {
          if (!s.alive || s.invuln > 0) continue;
          if (b.pos.distanceTo(s.pos) < s.hit + b.r) {
            b.alive = false;
            this.beginChallenge(s.index, null);
            return;
          }
        }
      }
    }
    if (this.mode !== "coop") return;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      for (const s of this.ships) {
        if (!s.alive || s.invuln > 0) continue;
        if (e.pos.distanceTo(s.pos) < e.r + s.hit * 0.8) {
          this._dir.copy(e.pos).sub(s.pos).normalize();
          e.pos.addScaledVector(this._dir, 4);
          this.beginChallenge(s.index, null);
          return;
        }
      }
    }
  }

  private killEnemy(e: Enemy, killer: 0 | 1) {
    e.alive = false;
    e.mesh.visible = false;
    const s = this.ships[killer];
    s.kills += 1;
    this.killsWave += 1;
    this.burst(e.pos, killer === 0 ? P1 : P2, 16);
    sfx.boom();
    const name = this.upgrade(s);
    this.banner = name ? `${s.name} schaltet ${name} frei.` : `${s.name} trifft. Nova bleibt.`;
    this.bannerT = 1.8;
    if (name) sfx.up();
    this.hudDirty = true;
  }

  private upgrade(s: Ship) {
    if (s.tier >= WEAPONS.length - 1) return null;
    s.tier += 1;
    return WEAPONS[s.tier].name;
  }

  private beginChallenge(defender: 0 | 1, attacker: 0 | 1 | null) {
    if (this.phase !== "play") return;
    const ship = this.ships[defender];
    if (!ship.alive) return;
    const grade = gradeById(ship.grade);
    const problem = makeProblem(ship.grade);
    const max = grade.seconds + ship.mathBonus;
    this.challengeSeq += 1;
    this.challenge = {
      id: this.challengeSeq,
      defender,
      attacker,
      prompt: problem.prompt,
      answer: problem.answer,
      time: max,
      max,
    };
    this.phase = "challenge";
    this.shake = 0.25;
    this.hudDirty = true;
    sfx.hurt();
    this.emit(true);
  }

  private resolve(ok: boolean) {
    const c = this.challenge;
    if (!c) return;
    const ship = this.ships[c.defender];
    this.challenge = null;
    if (ok) {
      ship.shield = 1;
      this.banner = "Schild hält — kein Leben verloren.";
      this.bannerT = 2;
      this.shake = 0.12;
      sfx.shield();
    } else {
      ship.lives = Math.max(0, ship.lives - 1);
      this.shake = 0.75;
      this.burst(ship.pos, c.defender === 0 ? P1 : P2, 14);
      if (ship.lives <= 0) {
        ship.alive = false;
        sfx.boom();
      } else sfx.hurt();
      if (c.attacker !== null) {
        const foe = this.ships[c.attacker];
        const weapon = this.upgrade(foe);
        this.banner = weapon
          ? `${ship.name} verliert ein Leben. ${foe.name} erhält ${weapon}.`
          : `${ship.name} verliert ein Leben. ${foe.name} feuert schon Nova.`;
        if (weapon) sfx.up();
      } else {
        this.banner = `${ship.name} verliert ein Leben.`;
      }
      this.bannerT = 2.8;
    }
    ship.invuln = 1.45;
    ship.cooldown = Math.max(ship.cooldown, 0.28);
    this.phase = "play";
    this.hudDirty = true;
    this.checkEnd();
    this.emit(true);
  }

  private checkEnd() {
    if (this.phase === "over") return;
    const a = this.ships[0].alive && this.ships[0].lives > 0;
    const b = this.ships[1].alive && this.ships[1].lives > 0;
    if (this.mode === "duel") {
      if (!a && !b) this.finish("Unentschieden.");
      else if (!a) this.finish(`${this.ships[1].name} gewinnt.`);
      else if (!b) this.finish(`${this.ships[0].name} gewinnt.`);
      return;
    }
    if (!a && !b) {
      const kills = this.ships[0].kills + this.ships[1].kills;
      this.finish(`Sektor verloren. ${kills} Abschüsse, Welle ${this.wave}.`);
    }
  }

  private finish(text: string) {
    this.phase = "over";
    this.result = text;
    this.challenge = null;
    this.hudDirty = true;
  }

  private centroid(out: THREE.Vector3) {
    out.set(0, 0, 0);
    let n = 0;
    for (const s of this.ships) {
      if (!s.alive && this.phase !== "attract") continue;
      out.add(s.pos);
      n++;
    }
    if (n === 0) out.copy(this.ships[0].pos);
    else out.multiplyScalar(1 / n);
    return out;
  }

  private avgForward(out: THREE.Vector3) {
    out.set(0, 0, 0);
    let n = 0;
    for (const s of this.ships) {
      if (!s.alive && this.phase !== "attract") continue;
      out.add(s.forward);
      n++;
    }
    if (n === 0 || out.lengthSq() < 1e-6) out.set(0, 0, -1);
    else out.multiplyScalar(1 / n).normalize();
    return out;
  }

  private burst(at: THREE.Vector3, color: number, count: number) {
    let left = count;
    for (const p of this.sparks) {
      if (p.alive) continue;
      p.alive = true;
      p.pos.copy(at);
      p.vel.set((Math.random() - 0.5) * 16, (Math.random() - 0.5) * 16, (Math.random() - 0.5) * 16);
      p.max = 0.35 + Math.random() * 0.35;
      p.life = p.max;
      p.color = color;
      left--;
      if (left <= 0) break;
    }
  }

  private decayFx(dt: number) {
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 1.4);
    for (const p of this.sparks) {
      if (!p.alive) continue;
      p.life -= dt;
      p.pos.addScaledVector(p.vel, dt);
      p.vel.multiplyScalar(0.96);
      if (p.life <= 0) p.alive = false;
    }
  }

  private orient(obj: THREE.Object3D, forward: THREE.Vector3, roll: number) {
    this._z.copy(forward);
    if (this._z.lengthSq() < 1e-8) this._z.set(0, 0, -1);
    this._z.normalize();
    this._x.crossVectors(UP, this._z);
    if (this._x.lengthSq() < 1e-8) this._x.set(1, 0, 0);
    else this._x.normalize();
    this._y.crossVectors(this._z, this._x).normalize();
    if (roll) {
      this._x.applyAxisAngle(this._z, roll);
      this._y.crossVectors(this._z, this._x).normalize();
    }
    this._m.makeBasis(this._x, this._y, this._z);
    obj.quaternion.setFromRotationMatrix(this._m);
  }

  private draw(dt: number) {
    const k = 1 - Math.exp(-3.1 * Math.max(dt, 0.001));
    if (this.phase === "attract") {
      const a = this.t * 0.13;
      this._desired.set(Math.sin(a) * 18, 6.2 + Math.sin(this.t * 0.2) * 0.6, Math.cos(a) * 18);
      this._look.set(0, 1.2, 0);
    } else if (this.mode === "duel") {
      this._desired.set(0, 10.2, 26);
      this.centroid(this._look);
      this._look.y = clamp(this._look.y, 1.5, 6);
    } else {
      this.centroid(this._look);
      this.avgForward(this._fwd);
      this._desired.copy(this._look).addScaledVector(this._fwd, -15.5);
      this._desired.y += 4.8;
      this._look.addScaledVector(this._fwd, 12);
    }
    this.camera.position.lerp(this._desired, this.phase === "attract" ? k * 0.45 : k);
    this._lookS.lerp(this._look, k);
    if (this.shake > 0) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake * 0.7;
      this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.55;
    }
    this.camera.lookAt(this._lookS);
    this.arena.visible = this.phase === "attract" || this.mode === "duel";
    this.station.rotation.y = this.t * 0.07;
    this.rockPivot.rotation.y = this.t * 0.015;

    for (const s of this.ships) {
      const show = this.phase === "attract" || s.alive;
      s.mesh.visible = show && (s.invuln <= 0 || Math.sin(this.t * 26) > 0 || this.phase === "attract");
      s.mesh.position.copy(s.pos);
      this.orient(s.mesh, s.forward, s.roll);
      const glow = s.mesh.getObjectByName("glow");
      if (glow) {
        const pulse = 0.85 + Math.sin(this.t * 18 + s.index) * 0.12 + Math.min(s.speed / 40, 0.6);
        glow.scale.setScalar(pulse);
      }
      const shield = s.mesh.getObjectByName("shield") as THREE.Mesh | undefined;
      if (shield) {
        const mat = shield.material as THREE.MeshBasicMaterial;
        mat.opacity = s.shield > 0 ? 0.15 + s.shield * 0.45 : 0;
        shield.scale.setScalar(1 + (1 - Math.min(s.shield, 1)) * 0.15);
      }
    }

    for (const e of this.enemies) {
      if (!e.alive) continue;
      e.mesh.position.copy(e.pos);
      if (e.vel.lengthSq() > 0.2) {
        this._fwd.copy(e.vel).normalize();
        this.orient(e.mesh, this._fwd, Math.sin(this.t * 2 + e.pos.x) * 0.2);
      }
    }

    this.bolts.forEach((b, i) => {
      this.dummy.position.copy(b.pos);
      this.dummy.quaternion.identity();
      this.dummy.scale.setScalar(b.alive ? b.r * 3.4 : 0);
      this.dummy.updateMatrix();
      this.boltMesh.setMatrixAt(i, this.dummy.matrix);
      const hex = b.owner === 0 ? P1 : b.owner === 1 ? P2 : 0xffe2ad;
      this.boltMesh.setColorAt(i, this.color.setHex(hex));
    });
    this.boltMesh.instanceMatrix.needsUpdate = true;
    if (this.boltMesh.instanceColor) this.boltMesh.instanceColor.needsUpdate = true;

    this.sparks.forEach((p, i) => {
      this.dummy.position.copy(p.pos);
      this.dummy.quaternion.identity();
      const sc = p.alive ? (p.life / p.max) * 1.4 : 0;
      this.dummy.scale.setScalar(sc);
      this.dummy.updateMatrix();
      this.sparkMesh.setMatrixAt(i, this.dummy.matrix);
      this.sparkMesh.setColorAt(i, this.color.setHex(p.color));
    });
    this.sparkMesh.instanceMatrix.needsUpdate = true;
    if (this.sparkMesh.instanceColor) this.sparkMesh.instanceColor.needsUpdate = true;

    this.renderer.render(this.scene, this.camera);
  }

  private buildPoints(count: number, radius: number, additive: boolean) {
    const geo = new THREE.SphereGeometry(radius, 8, 6);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: additive ? 0.95 : 0.9,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      depthWrite: false,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
    mesh.frustumCulled = false;
    const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < count; i++) mesh.setMatrixAt(i, hidden);
    this.scene.add(mesh);
    return mesh;
  }

  private buildSky() {
    const tex = canvasTex(1024, 512, (g) => {
      g.fillStyle = "#070b12";
      g.fillRect(0, 0, 1024, 512);
      const blobs: [string, number, number, number][] = [
        ["#12324a", 180, 160, 300],
        ["#0d4c46", 760, 280, 340],
        ["#3a2a10", 520, 90, 180],
        ["#182848", 80, 400, 240],
        ["#143043", 900, 80, 200],
      ];
      for (const [col, x, y, r] of blobs) {
        const rad = g.createRadialGradient(x, y, 0, x, y, r);
        rad.addColorStop(0, col);
        rad.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = rad;
        g.fillRect(0, 0, 1024, 512);
      }
      for (let i = 0; i < 380; i++) {
        const a = 0.25 + Math.random() * 0.75;
        g.fillStyle = `rgba(231,238,248,${a})`;
        const s = Math.random() < 0.08 ? 2 : 1;
        g.fillRect(Math.random() * 1024, Math.random() * 512, s, s);
      }
    });
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(420, 32, 20),
      new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false }),
    );
    this.scene.add(sky);
    const starGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(1800 * 3);
    for (let i = 0; i < 1800; i++) {
      const r = 80 + Math.random() * 260;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = r * Math.sin(ph) * Math.cos(th);
      positions[i * 3 + 1] = r * Math.cos(ph) * 0.6;
      positions[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
    }
    starGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const stars = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({ color: 0xe7eef8, size: 0.55, sizeAttenuation: true, fog: false, transparent: true, opacity: 0.85 }),
    );
    this.scene.add(stars);
  }

  private buildArena() {
    const tex = canvasTex(512, 512, (g) => {
      g.fillStyle = "#101722";
      g.fillRect(0, 0, 512, 512);
      g.strokeStyle = "rgba(61,220,191,0.33)";
      g.lineWidth = 2;
      for (let i = 0; i <= 8; i++) {
        const p = (i / 8) * 512;
        g.beginPath();
        g.moveTo(p, 0);
        g.lineTo(p, 512);
        g.stroke();
        g.beginPath();
        g.moveTo(0, p);
        g.lineTo(512, p);
        g.stroke();
      }
      g.strokeStyle = "rgba(240,162,2,0.7)";
      g.lineWidth = 6;
      g.beginPath();
      g.moveTo(256, 24);
      g.lineTo(256, 488);
      g.stroke();
    });
    tex.wrapS = THREE.ClampToEdgeWrapping;
    const mesh = new THREE.Mesh(
      new THREE.CircleGeometry(18, 72),
      new THREE.MeshStandardMaterial({
        map: tex,
        color: 0x9fb0c4,
        metalness: 0.55,
        roughness: 0.62,
        emissive: 0x0b1c22,
        emissiveIntensity: 0.4,
      }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0;
    const lip = new THREE.Mesh(
      new THREE.TorusGeometry(18, 0.12, 8, 48),
      new THREE.MeshStandardMaterial({
        color: 0x3ddcbf,
        emissive: 0x3ddcbf,
        emissiveIntensity: 0.6,
        metalness: 0.4,
        roughness: 0.3,
      }),
    );
    lip.position.set(0, 0, 0.08);
    mesh.add(lip);
    this.scene.add(mesh);
    return mesh;
  }

  private buildPlanet() {
    const tex = canvasTex(512, 256, (g) => {
      g.fillStyle = "#142033";
      g.fillRect(0, 0, 512, 256);
      for (let y = 0; y < 256; y += 7) {
        const t = y / 256;
        const band = t > 0.58 && t < 0.72 ? "#1f8f86" : t > 0.32 && t < 0.42 ? "#8a5a16" : "#1a3048";
        g.fillStyle = band;
        g.fillRect(0, y, 512, 5);
      }
      g.globalAlpha = 0.35;
      g.fillStyle = "#d5e4f5";
      for (let i = 0; i < 10; i++) {
        g.beginPath();
        g.ellipse(40 + Math.random() * 440, 20 + Math.random() * 210, 18 + Math.random() * 36, 7 + Math.random() * 8, 0, 0, Math.PI * 2);
        g.fill();
      }
    });
    const planet = new THREE.Mesh(
      new THREE.SphereGeometry(24, 36, 24),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.82, metalness: 0.08 }),
    );
    planet.position.set(10, -8, -112);
    this.scene.add(planet);
    const atmo = new THREE.Mesh(
      new THREE.SphereGeometry(26.2, 36, 24),
      new THREE.MeshBasicMaterial({ color: 0x3ddcbf, transparent: true, opacity: 0.14, side: THREE.BackSide, depthWrite: false }),
    );
    atmo.position.copy(planet.position);
    this.scene.add(atmo);
    const ringTex = canvasTex(512, 64, (g) => {
      g.clearRect(0, 0, 512, 64);
      for (let i = 0; i < 48; i++) {
        g.fillStyle = `rgba(231,238,248,${0.15 + Math.random() * 0.55})`;
        g.fillRect(Math.random() * 512, 18 + Math.random() * 28, 6 + Math.random() * 36, 2);
      }
      g.fillStyle = "rgba(240,162,2,0.45)";
      g.fillRect(0, 30, 512, 3);
    });
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(30, 42, 64),
      new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, side: THREE.DoubleSide, depthWrite: false, opacity: 0.8 }),
    );
    ring.rotation.x = 1.15;
    ring.position.copy(planet.position);
    this.scene.add(ring);
    const moon = new THREE.Mesh(
      new THREE.SphereGeometry(4.2, 20, 16),
      new THREE.MeshStandardMaterial({ color: 0xc5d0de, roughness: 0.92, metalness: 0.05 }),
    );
    moon.position.set(-34, 14, -78);
    this.scene.add(moon);
  }

  private buildStation() {
    const metal = new THREE.MeshStandardMaterial({
      color: 0x1c2838,
      metalness: 0.78,
      roughness: 0.32,
      emissive: 0x102028,
      emissiveIntensity: 0.4,
    });
    const glow = new THREE.MeshStandardMaterial({
      color: 0x3ddcbf,
      emissive: 0x3ddcbf,
      emissiveIntensity: 1.1,
      roughness: 0.3,
    });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(7.5, 0.28, 8, 40), metal);
    this.station.add(ring);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 2.4, 8), metal);
    this.station.add(hub);
    for (let i = 0; i < 4; i++) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 6.2), metal);
      arm.rotation.y = (i / 4) * Math.PI;
      this.station.add(arm);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), glow);
      lamp.position.set(Math.cos((i / 4) * Math.PI * 2) * 6.4, 0, Math.sin((i / 4) * Math.PI * 2) * 6.4);
      this.station.add(lamp);
    }
    this.station.position.set(18, 5, -24);
    this.station.rotation.x = 0.4;
    this.scene.add(this.station);
  }

  private buildRocks() {
    const geo = new THREE.IcosahedronGeometry(1, 1);
    const attr = geo.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < attr.count; i++) {
      v.fromBufferAttribute(attr as THREE.BufferAttribute, i);
      const n = 0.72 + ((i * 17) % 10) / 28;
      v.multiplyScalar(n);
      attr.setXYZ(i, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ color: 0x2c3848, roughness: 0.92, metalness: 0.18 });
    const mesh = new THREE.InstancedMesh(geo, mat, 42);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < 42; i++) {
      const ang = (i / 42) * Math.PI * 2 + (i % 5);
      const rad = 14 + (i % 7) * 6.5;
      dummy.position.set(Math.cos(ang) * rad + (i % 3) * 4, ((i % 9) - 4) * 1.4, Math.sin(ang) * rad - 8);
      dummy.rotation.set(i, i * 0.7, i * 0.2);
      const s = 0.45 + (i % 5) * 0.28;
      dummy.scale.set(s, s * (0.7 + (i % 4) * 0.1), s * 1.15);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    this.rockPivot.add(mesh);
    this.scene.add(this.rockPivot);
  }
}
