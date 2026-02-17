import { useState, useEffect, useRef, useCallback } from "react";
import { PoseLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

/*
 ╔══════════════════════════════════════════════════════════════╗
 ║  SWINGIQ — AI Golf Swing Training App                       ║
 ║  CV Integration Ready                                       ║
 ╠══════════════════════════════════════════════════════════════╣
 ║                                                              ║
 ║  CV BRIDGE API — window.swingIQ                              ║
 ║                                                              ║
 ║  Your CV module calls these methods:                         ║
 ║                                                              ║
 ║  window.swingIQ.startSession(clubType)                       ║
 ║    → begins a new recording session                          ║
 ║                                                              ║
 ║  window.swingIQ.submitFrame(frameData)                       ║
 ║    frameData = {                                             ║
 ║      timestamp: number (ms),                                 ║
 ║      landmarks: [...],  // 33 pose landmarks                 ║
 ║      phase: "setup"|"backswing"|"top"|"downswing"            ║
 ║             |"impact"|"finish",                              ║
 ║      angles: {                                               ║
 ║        spineAngle: number,    // degrees                     ║
 ║        hipRotation: number,   // degrees                     ║
 ║        shoulderRotation: number,                             ║
 ║        elbowAngle: number,                                   ║
 ║        kneeFlexion: number,                                  ║
 ║        wristAngle: number,                                   ║
 ║        headMovement: {x,y},   // delta from setup            ║
 ║      },                                                      ║
 ║      clubData: {              // if club detected             ║
 ║        shaftAngle: number,                                   ║
 ║        clubheadSpeed: number, // estimated mph                ║
 ║        swingPlane: number,    // degrees                      ║
 ║      }                                                       ║
 ║    }                                                         ║
 ║                                                              ║
 ║  window.swingIQ.endSwing()                                   ║
 ║    → finalizes swing, triggers analysis                      ║
 ║                                                              ║
 ║  window.swingIQ.onAnalysisComplete = (result) => {}          ║
 ║    → callback with full analysis result                      ║
 ║                                                              ║
 ╚══════════════════════════════════════════════════════════════╝
*/

// ── Fonts ───────────────────────────────────────────────────
const fontEl = document.createElement("link");
fontEl.href = "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700;900&family=Outfit:wght@300;400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap";
fontEl.rel = "stylesheet";
document.head.appendChild(fontEl);

const globalCSS = document.createElement("style");
globalCSS.textContent = `
  @keyframes fadeUp{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}}
  @keyframes fadeIn{from{opacity:0}to{opacity:1}}
  @keyframes scalePop{0%{transform:scale(.7);opacity:0}70%{transform:scale(1.08)}100%{transform:scale(1);opacity:1}}
  @keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.45}}
  @keyframes ringFill{from{stroke-dashoffset:var(--circ)}to{stroke-dashoffset:var(--off)}}
  @keyframes barGrow{from{transform:scaleX(0)}to{transform:scaleX(1)}}
  @keyframes glow{0%,100%{filter:drop-shadow(0 0 6px rgba(200,255,120,.2))}50%{filter:drop-shadow(0 0 18px rgba(200,255,120,.5))}}
  @keyframes bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
  @keyframes recording{0%,100%{box-shadow:0 0 0 0 rgba(230,60,60,.4)}50%{box-shadow:0 0 0 12px rgba(230,60,60,0)}}
  @keyframes wave{0%{height:4px}50%{height:var(--h)}100%{height:4px}}
  @keyframes slideIn{from{opacity:0;transform:translateX(-20px)}to{opacity:1;transform:translateX(0)}}
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#07090a}
  ::-webkit-scrollbar{width:5px}
  ::-webkit-scrollbar-track{background:transparent}
  ::-webkit-scrollbar-thumb{background:#1a2a1e;border-radius:4px}
  input,select,button{font-family:inherit}
`;
document.head.appendChild(globalCSS);

// ── Theme ───────────────────────────────────────────────────
const C = {
  bg: "#07090a", surface: "#0c1210", card: "#101c16", cardHover: "#152a1e",
  accent: "#b8e648", accentDark: "#7aab10", accentGlow: "rgba(184,230,72,.12)",
  gold: "#f0c030", red: "#e6503c", cyan: "#48d4c0", blue: "#4890e6",
  white: "#ecf4ee", text: "#8fb89a", muted: "#456050",
  border: "#182820", borderMid: "#203828",
  green: "#1e8a3e", fairway: "#1a5e2a",
};
const F = {
  display: "'Playfair Display',Georgia,serif",
  body: "'Outfit',system-ui,sans-serif",
  mono: "'IBM Plex Mono',monospace",
};

// ── Ideal Angles per Phase (degrees) ────────────────────────
const IDEAL_ANGLES = {
  driver: {
    setup:     { spineAngle: 32, hipRotation: 0, shoulderRotation: 0, kneeFlexion: 25, elbowAngle: 170, wristAngle: 165 },
    backswing: { spineAngle: 34, hipRotation: 45, shoulderRotation: 90, kneeFlexion: 28, elbowAngle: 150, wristAngle: 130 },
    top:       { spineAngle: 35, hipRotation: 48, shoulderRotation: 100, kneeFlexion: 30, elbowAngle: 90, wristAngle: 100 },
    downswing: { spineAngle: 30, hipRotation: 20, shoulderRotation: 50, kneeFlexion: 35, elbowAngle: 140, wristAngle: 120 },
    impact:    { spineAngle: 28, hipRotation: -30, shoulderRotation: 0, kneeFlexion: 32, elbowAngle: 165, wristAngle: 155 },
    finish:    { spineAngle: 15, hipRotation: -60, shoulderRotation: -40, kneeFlexion: 20, elbowAngle: 140, wristAngle: 160 },
  },
  iron: {
    setup:     { spineAngle: 35, hipRotation: 0, shoulderRotation: 0, kneeFlexion: 28, elbowAngle: 168, wristAngle: 162 },
    backswing: { spineAngle: 36, hipRotation: 42, shoulderRotation: 85, kneeFlexion: 30, elbowAngle: 148, wristAngle: 125 },
    top:       { spineAngle: 37, hipRotation: 45, shoulderRotation: 95, kneeFlexion: 32, elbowAngle: 88, wristAngle: 95 },
    downswing: { spineAngle: 33, hipRotation: 18, shoulderRotation: 45, kneeFlexion: 38, elbowAngle: 138, wristAngle: 115 },
    impact:    { spineAngle: 30, hipRotation: -28, shoulderRotation: -5, kneeFlexion: 35, elbowAngle: 170, wristAngle: 158 },
    finish:    { spineAngle: 18, hipRotation: -55, shoulderRotation: -35, kneeFlexion: 22, elbowAngle: 135, wristAngle: 158 },
  },
  wedge: {
    setup:     { spineAngle: 36, hipRotation: 0, shoulderRotation: 0, kneeFlexion: 30, elbowAngle: 165, wristAngle: 160 },
    backswing: { spineAngle: 37, hipRotation: 35, shoulderRotation: 75, kneeFlexion: 32, elbowAngle: 145, wristAngle: 120 },
    top:       { spineAngle: 38, hipRotation: 38, shoulderRotation: 82, kneeFlexion: 34, elbowAngle: 95, wristAngle: 100 },
    downswing: { spineAngle: 34, hipRotation: 15, shoulderRotation: 38, kneeFlexion: 40, elbowAngle: 135, wristAngle: 112 },
    impact:    { spineAngle: 32, hipRotation: -25, shoulderRotation: -8, kneeFlexion: 38, elbowAngle: 172, wristAngle: 160 },
    finish:    { spineAngle: 22, hipRotation: -48, shoulderRotation: -30, kneeFlexion: 24, elbowAngle: 130, wristAngle: 155 },
  },
};

const PHASE_ORDER = ["setup", "backswing", "top", "downswing", "impact", "finish"];
const PHASE_LABELS = { setup: "Setup", backswing: "Backswing", top: "Top", downswing: "Downswing", impact: "Impact", finish: "Finish" };

// ── Fault Detection ─────────────────────────────────────────
const FAULTS = [
  { id: "ott", name: "Over the Top", check: (p) => p.downswing && p.downswing.shoulderRotation > 60, phase: "downswing", severity: "high", fix: "Focus on dropping hands inside. Try the slot drill — feel the right elbow tuck to your hip before rotating.", drill: "Slot Drill", vf: "You're coming over the top. Focus on dropping your hands inside on the downswing." },
  { id: "earlyExt", name: "Early Extension", check: (p) => p.impact && p.impact.spineAngle < 22, phase: "impact", severity: "high", fix: "Maintain your spine angle through impact. Practice with your glutes against a chair — they should stay connected.", drill: "Chair Drill", vf: "You're standing up too early at impact. Maintain your spine angle through the ball." },
  { id: "sway", name: "Lateral Sway", check: (p) => p.backswing && p.backswing.hipRotation < 30, phase: "backswing", severity: "medium", fix: "Rotate hips rather than sliding. Feel pressure into the inside of your trail foot.", drill: "Headcover Under Foot", vf: "You're swaying instead of rotating. Focus on turning your hips, not sliding." },
  { id: "castEarly", name: "Casting / Early Release", check: (p) => p.downswing && p.downswing.wristAngle > 140, phase: "downswing", severity: "high", fix: "Maintain wrist hinge deeper into downswing. Feel like your hands lead the clubhead to the ball.", drill: "Pump Drill", vf: "You're casting early. Keep your wrist hinge longer. Let your hands lead the club." },
  { id: "chickenWing", name: "Chicken Wing", check: (p) => p.finish && p.finish.elbowAngle < 120, phase: "finish", severity: "medium", fix: "Allow the lead arm to extend fully through the ball. Practice slow swings feeling full extension.", drill: "Towel Extension Drill", vf: "Your lead arm is collapsing through impact. Work on full extension." },
  { id: "reversePivot", name: "Reverse Pivot", check: (p) => p.top && p.top.spineAngle > 40, phase: "top", severity: "high", fix: "Keep your weight centered or slightly trail-side at the top. Your head should stay behind the ball.", drill: "Step Drill", vf: "You have a reverse pivot. Keep your weight behind the ball at the top." },
  { id: "lossPosture", name: "Loss of Posture", check: (p) => p.impact && Math.abs((p.impact.spineAngle || 30) - (p.setup?.spineAngle || 32)) > 10, phase: "impact", severity: "medium", fix: "Maintain consistent spine angle from setup through impact. Practice with alignment stick along your spine.", drill: "Spine Stick Drill", vf: "You're losing posture through the swing. Keep spine angle consistent." },
  { id: "flatShould", name: "Flat Shoulder Turn", check: (p) => p.top && p.top.shoulderRotation < 75, phase: "top", severity: "low", fix: "Feel your lead shoulder working more under your chin. A fuller turn generates more power.", drill: "Cross Arms Turn", vf: "Your shoulder turn is flat. Get your lead shoulder under your chin." },
];

const DRILLS = {
  "Slot Drill": { duration: "10 min", level: "Intermediate", desc: "Pause at top, then feel right elbow slot to trail hip before rotating body. Builds inside-out path.", vg: "Slot Drill. Take your backswing. Pause at the top. Feel your trail elbow drop straight down to your hip. Then rotate through. Repeat ten times." },
  "Chair Drill": { duration: "10 min", level: "Beginner", desc: "Set up with your glutes touching a chair. Maintain contact through the swing to prevent early extension.", vg: "Chair Drill. Place a chair behind you so your glutes just touch it. Swing while keeping contact with the chair. This prevents early extension." },
  "Headcover Under Foot": { duration: "10 min", level: "Beginner", desc: "Place headcover under trail foot outside edge. Maintain pressure to groove hip rotation over sway.", vg: "Headcover drill. Place a headcover under the outside of your trail foot. Swing while keeping pressure on it. This trains hip rotation instead of sway." },
  "Pump Drill": { duration: "15 min", level: "Intermediate", desc: "Make 3 partial downswings to hip height keeping wrist hinge, then release on 4th. Trains lag.", vg: "Pump Drill. Take your backswing. Make three small pumps to hip height keeping your wrist hinge. On the fourth, release fully through the ball." },
  "Towel Extension Drill": { duration: "10 min", level: "Beginner", desc: "Tuck towel under both armpits. Swing without dropping it to maintain connection and prevent chicken wing.", vg: "Towel drill. Tuck a towel under both armpits. Make half swings without letting it drop. This keeps your arms connected." },
  "Step Drill": { duration: "15 min", level: "Intermediate", desc: "Feet together at setup. Step toward target with lead foot to start downswing. Trains proper weight shift.", vg: "Step Drill. Start with feet together. Take your backswing. Step your lead foot toward the target to start down. This trains weight shift." },
  "Spine Stick Drill": { duration: "10 min", level: "Advanced", desc: "Place alignment stick along spine at setup. Maintain contact through impact to lock in posture.", vg: "Spine Stick Drill. Hold an alignment stick along your spine. Swing while keeping the stick in contact with your back through impact." },
  "Cross Arms Turn": { duration: "10 min", level: "Beginner", desc: "Cross arms on chest, take your stance, and rotate. Feel lead shoulder work under chin for fuller turn.", vg: "Cross Arms Turn. Cross your arms on your chest. Take your stance. Rotate back feeling your lead shoulder under your chin. Hold. Rotate through. Repeat." },
  "9-to-3 Swings": { duration: "15 min", level: "Beginner", desc: "Half swings from 9 o'clock to 3 o'clock. Focus on center contact and controlling low point.", vg: "9 to 3 drill. Half swings. Hands to 9 o'clock back, 3 o'clock through. Focus on center face contact." },
  "Pause at Top": { duration: "10 min", level: "Intermediate", desc: "Full backswing, hold for 2 seconds at top, then swing through. Improves transition tempo and sequencing.", vg: "Pause at Top. Full backswing. Hold two seconds. Feel weight in your trail side. Swing through. Improves transition." },
  "Impact Bag": { duration: "15 min", level: "Advanced", desc: "Strike impact bag focusing on forward shaft lean, hands ahead, and body rotation through impact.", vg: "Impact Bag drill. Hit the bag with hands ahead of the clubhead. Feel forward shaft lean and body rotation through impact." },
  "Alignment Gate": { duration: "15 min", level: "Intermediate", desc: "Place two tees just wider than clubhead on target line. Swing through the gate for path control.", vg: "Alignment Gate. Two tees wider than your clubhead on the target line. Swing through the gate. Trains your path." },
};

// ── Voice & Sound ───────────────────────────────────────────
class Voice {
  constructor() {
    this.s = window.speechSynthesis; this.q = []; this.busy = false; this.on = true; this.v = null;
    this.unlocked = false; this._keepAlive = null;
    const p = () => {
      const vs = this.s.getVoices();
      this.v = vs.find(x => x.name.includes("Samantha"))
        || vs.find(x => /google/i.test(x.name) && x.lang.startsWith("en"))
        || vs.find(x => x.lang.startsWith("en-") && x.localService)
        || vs.find(x => x.lang.startsWith("en")) || vs[0];
    };
    p(); if (this.s.onvoiceschanged !== undefined) this.s.onvoiceschanged = p;
  }
  // iOS requires first speak() from a user gesture — call this from a tap/click handler
  // force = true allows re-unlocking (used for iOS touch fallback after non-gesture attempt)
  unlock(force = false) {
    if (this.unlocked && !force) return;
    this.unlocked = true;
    // iOS ignores empty strings and volume=0 — use a real word at low volume
    this.s.cancel();
    const u = new SpeechSynthesisUtterance(".");
    u.volume = 0.01;
    u.rate = 2;
    if (this.v) u.voice = this.v;
    this.s.speak(u);
    // iOS pauses speechSynthesis after ~15s — keep-alive timer resumes it
    if (!this._keepAlive) {
      this._keepAlive = setInterval(() => {
        this.s.resume();
      }, 5000);
    }
  }
  say(t, pri = false) {
    if (!this.on || !t) return;
    if (pri) { this.s.cancel(); this.q = []; }
    this.q.push(t); this._d();
  }
  _d() {
    if (this.busy || !this.q.length) return; this.busy = true;
    const u = new SpeechSynthesisUtterance(this.q.shift());
    u.rate = 0.95; if (this.v) u.voice = this.v;
    u.onend = () => { this.busy = false; this._d(); };
    u.onerror = () => { this.busy = false; this._d(); };
    this.s.speak(u);
  }
  stop() { this.s.cancel(); this.q = []; this.busy = false; }
  toggle() { this.on = !this.on; if (!this.on) this.stop(); return this.on; }
}

class Sound {
  constructor() { this.ctx = null; this.on = true; }
  _e() {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === "suspended") this.ctx.resume();
  }
  b(f = 880, d = 0.12, v = 0.3) {
    if (!this.on) return; this._e();
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = "sine"; o.frequency.value = f;
    g.gain.setValueAtTime(v, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + d);
    o.connect(g); g.connect(this.ctx.destination); o.start(); o.stop(this.ctx.currentTime + d);
  }
  ready() { this.b(660, 0.15, 0.2); setTimeout(() => this.b(880, 0.15, 0.2), 180); }
  swing() { this.b(1100, 0.08, 0.25); setTimeout(() => this.b(1320, 0.08, 0.25), 100); setTimeout(() => this.b(1540, 0.12, 0.3), 200); }
  good() { this.b(523, 0.1, 0.2); setTimeout(() => this.b(659, 0.1, 0.2), 120); setTimeout(() => this.b(784, 0.2, 0.25), 240); }
  great() { this.b(523, 0.08, 0.2); setTimeout(() => this.b(659, 0.08, 0.2), 100); setTimeout(() => this.b(784, 0.08, 0.2), 200); setTimeout(() => this.b(1047, 0.25, 0.3), 300); }
  alert() { this.b(440, 0.15, 0.2); setTimeout(() => this.b(370, 0.2, 0.2), 180); }
  tick() { this.b(1000, 0.04, 0.15); }
  phase() { this.b(700, 0.06, 0.15); }
}

let _voice = null, _sound = null;
function gv() { if (!_voice) _voice = new Voice(); return _voice; }
function gs() { if (!_sound) _sound = new Sound(); return _sound; }

// ── MediaPipe Pose Loader (tasks-vision API) ─────────────────
const VISION_WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm";
const POSE_MODEL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task";

let poseLandmarker = null;
let poseLoadingPromise = null;

function loadPoseLandmarker() {
  if (poseLandmarker) return Promise.resolve(poseLandmarker);
  if (poseLoadingPromise) return poseLoadingPromise;

  console.log("[SwingIQ] Loading MediaPipe tasks-vision...");
  poseLoadingPromise = FilesetResolver.forVisionTasks(VISION_WASM)
    .then(async (vision) => {
      console.log("[SwingIQ] WASM loaded, downloading model & creating PoseLandmarker...");

      // Try GPU first, fall back to CPU if it hangs or fails
      for (const delegate of ["GPU", "CPU"]) {
        try {
          console.log(`[SwingIQ] Trying ${delegate} delegate...`);
          const landmarker = await Promise.race([
            PoseLandmarker.createFromOptions(vision, {
              baseOptions: {
                modelAssetPath: POSE_MODEL,
                delegate,
              },
              runningMode: "VIDEO",
              numPoses: 1,
            }),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error(`${delegate} timed out`)), 15000)
            ),
          ]);
          console.log(`[SwingIQ] PoseLandmarker ready (${delegate})`);
          poseLandmarker = landmarker;
          return landmarker;
        } catch (e) {
          console.warn(`[SwingIQ] ${delegate} delegate failed:`, e.message);
          if (delegate === "CPU") throw e;
          console.log("[SwingIQ] Falling back to CPU...");
        }
      }
    })
    .catch((err) => {
      console.error("[SwingIQ] PoseLandmarker failed:", err);
      poseLoadingPromise = null;
      throw err;
    });

  return poseLoadingPromise;
}

// ── Angle Computation from Pose Landmarks ───────────────────
// MediaPipe Pose landmark indices
const LM = {
  NOSE: 0, LEFT_SHOULDER: 11, RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13, RIGHT_ELBOW: 14, LEFT_WRIST: 15, RIGHT_WRIST: 16,
  LEFT_INDEX: 19, RIGHT_INDEX: 20,
  LEFT_HIP: 23, RIGHT_HIP: 24, LEFT_KNEE: 25, RIGHT_KNEE: 26,
  LEFT_ANKLE: 27, RIGHT_ANKLE: 28,
};

function angleBetween3D(a, b, c) {
  const ba = { x: a.x - b.x, y: a.y - b.y, z: (a.z || 0) - (b.z || 0) };
  const bc = { x: c.x - b.x, y: c.y - b.y, z: (c.z || 0) - (b.z || 0) };
  const dot = ba.x * bc.x + ba.y * bc.y + ba.z * bc.z;
  const magBA = Math.sqrt(ba.x ** 2 + ba.y ** 2 + ba.z ** 2);
  const magBC = Math.sqrt(bc.x ** 2 + bc.y ** 2 + bc.z ** 2);
  if (magBA === 0 || magBC === 0) return 0;
  return Math.acos(Math.max(-1, Math.min(1, dot / (magBA * magBC)))) * (180 / Math.PI);
}

function mid(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: ((a.z || 0) + (b.z || 0)) / 2 };
}

function computeAnglesFromLandmarks(lm, rightHanded = true) {
  if (!lm || lm.length < 33) return null;

  const lS = lm[LM.LEFT_SHOULDER], rS = lm[LM.RIGHT_SHOULDER];
  const lH = lm[LM.LEFT_HIP], rH = lm[LM.RIGHT_HIP];
  const lK = lm[LM.LEFT_KNEE], rK = lm[LM.RIGHT_KNEE];
  const lA = lm[LM.LEFT_ANKLE], rA = lm[LM.RIGHT_ANKLE];
  const nose = lm[LM.NOSE];

  // Lead side: left for right-handed, right for left-handed
  const leadElbow = rightHanded ? lm[LM.LEFT_ELBOW] : lm[LM.RIGHT_ELBOW];
  const leadWrist = rightHanded ? lm[LM.LEFT_WRIST] : lm[LM.RIGHT_WRIST];
  const leadShoulder = rightHanded ? lS : rS;
  const leadIndex = rightHanded ? lm[LM.LEFT_INDEX] : lm[LM.RIGHT_INDEX];
  const leadHip = rightHanded ? lH : rH;
  const leadKnee = rightHanded ? lK : rK;
  const leadAnkle = rightHanded ? lA : rA;

  const mH = mid(lH, rH);
  const mS = mid(lS, rS);

  // Spine angle: torso tilt from vertical
  const vertUp = { x: mS.x, y: mS.y - 0.5, z: mS.z || 0 };
  const spineAngle = 180 - angleBetween3D(vertUp, mS, mH);

  // Hip & shoulder rotation via z-depth difference
  const hipRotation = Math.atan2((lH.z || 0) - (rH.z || 0), Math.abs(lH.x - rH.x) || 0.01) * (180 / Math.PI);
  const shoulderRotation = Math.atan2((lS.z || 0) - (rS.z || 0), Math.abs(lS.x - rS.x) || 0.01) * (180 / Math.PI);

  // Lead arm elbow angle (shoulder-elbow-wrist)
  const elbowAngle = angleBetween3D(leadShoulder, leadElbow, leadWrist);

  // Lead knee flexion (hip-knee-ankle)
  const leadKneeFlex = angleBetween3D(leadHip, leadKnee, leadAnkle);
  const trailKneeFlex = angleBetween3D(
    rightHanded ? rH : lH,
    rightHanded ? rK : lK,
    rightHanded ? rA : lA
  );
  const kneeFlexion = 180 - (leadKneeFlex + trailKneeFlex) / 2;

  // Wrist angle: elbow-wrist-index finger (per spec section 6)
  const wristAngle = leadIndex
    ? angleBetween3D(leadElbow, leadWrist, leadIndex)
    : angleBetween3D(leadElbow, leadWrist, { x: leadWrist.x, y: leadWrist.y + 0.1, z: leadWrist.z || 0 });

  const headMovement = { x: nose.x - mH.x, y: nose.y - mH.y };

  return {
    spineAngle: Math.max(0, Math.min(60, Math.abs(spineAngle))),
    hipRotation,
    shoulderRotation,
    kneeFlexion: Math.max(0, Math.min(50, kneeFlexion)),
    elbowAngle: Math.max(30, Math.min(180, elbowAngle)),
    wristAngle: Math.max(60, Math.min(180, wristAngle)),
    headMovement,
  };
}

// ── Body Visibility Detection ────────────────────────────────
const VIS_THRESHOLD = 0.4;

function checkGroup(landmarks, indices) {
  return indices.every(i => landmarks[i] && (landmarks[i].visibility || 0) >= VIS_THRESHOLD);
}

function computeVisibility(landmarks) {
  if (!landmarks || landmarks.length < 33) {
    return { head: false, torso: false, leftArm: false, rightArm: false, leftLeg: false, rightLeg: false };
  }
  return {
    head: checkGroup(landmarks, [LM.NOSE]),
    torso: checkGroup(landmarks, [LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER, LM.LEFT_HIP, LM.RIGHT_HIP]),
    leftArm: checkGroup(landmarks, [LM.LEFT_SHOULDER, LM.LEFT_ELBOW]),
    rightArm: checkGroup(landmarks, [LM.RIGHT_SHOULDER, LM.RIGHT_ELBOW]),
    leftLeg: checkGroup(landmarks, [LM.LEFT_HIP, LM.LEFT_KNEE]),   // thighs only, ankles not required
    rightLeg: checkGroup(landmarks, [LM.RIGHT_HIP, LM.RIGHT_KNEE]), // thighs only, ankles not required
  };
}

function isFullBodyVisible(vis) {
  // Core requirement: head, torso, and both legs (thighs visible)
  // Arms are nice-to-have but don't block calibration
  return vis.head && vis.torso && vis.leftLeg && vis.rightLeg;
}

// ── Swing Phase Detector (state machine) ────────────────────
function createPhaseDetector() {
  let setupAngles = null;
  let phase = "setup";
  let frameCount = 0;
  let cooldown = 0;

  return {
    reset() { setupAngles = null; phase = "setup"; frameCount = 0; cooldown = 0; },
    detect(angles) {
      frameCount++;
      cooldown = Math.max(0, cooldown - 1);

      if (!setupAngles && frameCount > 5) setupAngles = { ...angles };
      if (!setupAngles) return "setup";
      if (cooldown > 0) return phase;

      const sDelta = Math.abs(angles.shoulderRotation - setupAngles.shoulderRotation);
      const hDelta = Math.abs(angles.hipRotation - setupAngles.hipRotation);
      const eDelta = Math.abs(angles.elbowAngle - setupAngles.elbowAngle);

      const go = (p) => { phase = p; cooldown = 4; };

      switch (phase) {
        case "setup":      if (sDelta > 15 || hDelta > 10) go("backswing"); break;
        case "backswing":   if (sDelta > 55 && angles.elbowAngle < 130) go("top"); break;
        case "top":         if (sDelta < 50 || eDelta < 40) go("downswing"); break;
        case "downswing":   if (sDelta < 15 && eDelta < 20) go("impact"); break;
        case "impact":      if (hDelta > 25 && sDelta > 20) go("finish"); break;
        case "finish":      break;
      }
      return phase;
    },
    getPhase() { return phase; },
  };
}

// ── LiveCamera Component ────────────────────────────────────
function LiveCamera({ onFrame, isActive, onReady, onError }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const timerRef = useRef(null);

  // Store callbacks in refs so the camera loop never restarts when parent re-renders
  const onFrameRef = useRef(onFrame);
  const onReadyRef = useRef(onReady);
  const onErrorRef = useRef(onError);
  useEffect(() => { onFrameRef.current = onFrame; }, [onFrame]);
  useEffect(() => { onReadyRef.current = onReady; }, [onReady]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  const [status, setStatus] = useState("idle");
  const [errMsg, setErrMsg] = useState("");

  const drawSkeleton = useCallback((ctx, landmarks, w, h) => {
    if (!landmarks) return;
    const conns = [
      [11,13],[13,15],[12,14],[14,16],
      [11,12],[11,23],[12,24],[23,24],
      [23,25],[25,27],[24,26],[26,28],
    ];
    ctx.strokeStyle = C.accent + "90";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    for (const [i, j] of conns) {
      if (landmarks[i] && landmarks[j]) {
        ctx.beginPath();
        ctx.moveTo(landmarks[i].x * w, landmarks[i].y * h);
        ctx.lineTo(landmarks[j].x * w, landmarks[j].y * h);
        ctx.stroke();
      }
    }
    const pts = [0,11,12,13,14,15,16,23,24,25,26,27,28];
    for (const idx of pts) {
      if (!landmarks[idx]) continue;
      const x = landmarks[idx].x * w, y = landmarks[idx].y * h;
      ctx.fillStyle = C.accent;
      ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = C.accentGlow;
      ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill();
    }
  }, []);

  const startCamera = useCallback(async () => {
    setStatus("loading");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      const landmarker = await loadPoseLandmarker();

      let sending = false;
      const tick = async () => {
        const vid = videoRef.current;
        const cvs = canvasRef.current;
        if (!sending && vid && vid.readyState >= 2 && cvs && landmarker) {
          sending = true;
          try {
            const ctx = cvs.getContext("2d");
            cvs.width = vid.videoWidth || 640;
            cvs.height = vid.videoHeight || 480;

            // Draw mirrored video
            ctx.save();
            ctx.scale(-1, 1);
            ctx.drawImage(vid, -cvs.width, 0, cvs.width, cvs.height);
            ctx.restore();

            const result = landmarker.detectForVideo(vid, performance.now());
            if (result.landmarks && result.landmarks.length > 0) {
              const landmarks = result.landmarks[0];
              const mirrored = landmarks.map(l => ({ ...l, x: 1 - l.x }));
              drawSkeleton(ctx, mirrored, cvs.width, cvs.height);
              const worldLm = result.worldLandmarks?.[0];
              const merged = landmarks.map((l, i) => ({
                ...l,
                visibility: worldLm?.[i]?.visibility ?? l.visibility ?? 1,
              }));
              onFrameRef.current(merged);
            }
          } catch (e) {
            console.warn("[SwingIQ] Detection error:", e);
          }
          sending = false;
        }
        timerRef.current = setTimeout(tick, 33); // ~30fps
      };
      tick();

      setStatus("ready");
      if (onReadyRef.current) onReadyRef.current();
    } catch (err) {
      console.error("[SwingIQ] Camera start failed:", err);
      setErrMsg(err.message || "Camera access denied");
      setStatus("error");
      if (onErrorRef.current) onErrorRef.current(err);
    }
  }, [drawSkeleton]); // stable deps only — no callback props

  const stopCamera = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    setStatus("idle");
  }, []);

  useEffect(() => {
    if (isActive) startCamera();
    else stopCamera();
    return stopCamera;
  }, [isActive, startCamera, stopCamera]);

  return (
    <div style={{ position: "relative", borderRadius: 14, overflow: "hidden", background: C.surface, border: `1px solid ${C.border}` }}>
      <video ref={videoRef} playsInline muted style={{ display: "none" }} />
      <canvas ref={canvasRef} style={{ width: "100%", display: "block", borderRadius: 14, minHeight: 280 }} />

      {status === "idle" && (
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
          <span style={{ fontSize: 40 }}>📷</span>
          <span style={{ fontFamily: F.body, fontSize: 13, color: C.muted }}>Camera starts when you hit Record</span>
        </div>
      )}
      {status === "loading" && (
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, background: C.surface + "ee" }}>
          <div style={{ width: 36, height: 36, border: `3px solid ${C.border}`, borderTopColor: C.accent, borderRadius: "50%", animation: "spin 1s linear infinite" }} />
          <span style={{ fontFamily: F.body, fontSize: 13, color: C.text }}>Loading pose model...</span>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      )}
      {status === "error" && (
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, background: C.surface + "ee" }}>
          <span style={{ fontSize: 32 }}>⚠️</span>
          <span style={{ fontFamily: F.body, fontSize: 13, color: C.red, textAlign: "center", padding: "0 20px" }}>{errMsg}</span>
          <Btn onClick={startCamera} variant="secondary" style={{ marginTop: 4, fontSize: 11, padding: "6px 14px" }}>Retry</Btn>
        </div>
      )}
    </div>
  );
}

// ── Analysis Engine ─────────────────────────────────────────
function analyzeSwing(frames, clubType = "driver") {
  const idealSet = IDEAL_ANGLES[clubType] || IDEAL_ANGLES.driver;
  const phaseAngles = {};
  
  // Group frames by phase, take average angles per phase
  for (const frame of frames) {
    if (!frame.phase || !frame.angles) continue;
    if (!phaseAngles[frame.phase]) phaseAngles[frame.phase] = [];
    phaseAngles[frame.phase].push(frame.angles);
  }

  const phaseAvg = {};
  for (const [phase, anglesList] of Object.entries(phaseAngles)) {
    const avg = {};
    const keys = Object.keys(anglesList[0] || {});
    for (const k of keys) {
      if (k === "headMovement") continue;
      const vals = anglesList.map(a => a[k]).filter(v => typeof v === "number");
      avg[k] = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
    }
    phaseAvg[phase] = avg;
  }

  // Score each phase (0-100)
  const phaseScores = {};
  let totalWeight = 0, weightedSum = 0;
  const phaseWeights = { setup: 1, backswing: 1.2, top: 1.3, downswing: 1.5, impact: 2, finish: 0.8 };

  for (const phase of PHASE_ORDER) {
    if (!phaseAvg[phase]) { phaseScores[phase] = null; continue; }
    const ideal = idealSet[phase];
    if (!ideal) { phaseScores[phase] = null; continue; }
    let diffs = 0, count = 0;
    for (const [k, idealVal] of Object.entries(ideal)) {
      if (phaseAvg[phase][k] !== undefined) {
        const diff = Math.abs(phaseAvg[phase][k] - idealVal);
        const maxDiff = idealVal * 0.5 || 25;
        diffs += Math.max(0, 1 - diff / maxDiff);
        count++;
      }
    }
    const score = count > 0 ? Math.round((diffs / count) * 100) : 50;
    phaseScores[phase] = Math.min(100, Math.max(0, score));
    const w = phaseWeights[phase] || 1;
    weightedSum += score * w;
    totalWeight += w;
  }

  const overallScore = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;

  // Detect faults
  const detectedFaults = FAULTS.filter(f => {
    try { return f.check(phaseAvg); } catch { return false; }
  }).sort((a, b) => {
    const sev = { high: 3, medium: 2, low: 1 };
    return (sev[b.severity] || 0) - (sev[a.severity] || 0);
  });

  // Tempo
  const setupFrames = frames.filter(f => f.phase === "setup");
  const impactFrames = frames.filter(f => f.phase === "impact");
  let tempo = "—";
  if (setupFrames.length && impactFrames.length) {
    const totalTime = impactFrames[impactFrames.length - 1].timestamp - setupFrames[0].timestamp;
    const backTime = (frames.find(f => f.phase === "top")?.timestamp || 0) - setupFrames[0].timestamp;
    const downTime = totalTime - backTime;
    if (downTime > 0) tempo = `${(backTime / downTime).toFixed(1)}:1`;
  }

  // Clubhead speed
  const speedFrames = frames.filter(f => f.clubData?.clubheadSpeed);
  const maxSpeed = speedFrames.length ? Math.max(...speedFrames.map(f => f.clubData.clubheadSpeed)) : null;

  // Recommend drills
  const recommendedDrills = detectedFaults.slice(0, 3).map(f => f.drill).filter(Boolean);
  if (recommendedDrills.length === 0) recommendedDrills.push("9-to-3 Swings", "Pause at Top");

  return {
    overallScore,
    phaseScores,
    phaseAngles: phaseAvg,
    faults: detectedFaults,
    tempo,
    maxSpeed: maxSpeed ? `${Math.round(maxSpeed)} mph` : null,
    recommendedDrills,
    clubType,
    timestamp: Date.now(),
  };
}


// ── Components ──────────────────────────────────────────────

function ScoreRing({ score, size = 130, stroke = 9, label, delay = 0 }) {
  const [val, setVal] = useState(0);
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const color = score >= 85 ? C.accent : score >= 70 ? C.gold : score >= 55 ? "#e6a030" : C.red;

  useEffect(() => {
    const timer = setTimeout(() => {
      let cur = 0;
      const tick = () => { cur += 1.5; if (cur >= score) { setVal(score); return; } setVal(Math.round(cur)); requestAnimationFrame(tick); };
      tick();
    }, delay);
    return () => clearTimeout(timer);
  }, [score, delay]);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <div style={{ position: "relative", width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={C.border} strokeWidth={stroke} />
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
            strokeDasharray={circ} strokeDashoffset={circ - (val / 100) * circ}
            strokeLinecap="round" style={{ transition: "stroke-dashoffset .08s linear", filter: `drop-shadow(0 0 10px ${color}50)` }} />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontFamily: F.display, fontSize: size * 0.28, fontWeight: 700, color, lineHeight: 1 }}>{val}</span>
          <span style={{ fontFamily: F.body, fontSize: 10, color: C.muted, fontWeight: 500, marginTop: 2 }}>/100</span>
        </div>
      </div>
      {label && <span style={{ fontFamily: F.body, fontSize: 11, color: C.text, fontWeight: 500 }}>{label}</span>}
    </div>
  );
}

function PhaseBar({ phase, score, delay = 0 }) {
  const [w, setW] = useState(0);
  const color = score >= 85 ? C.accent : score >= 70 ? C.gold : score >= 55 ? "#e6a030" : C.red;
  useEffect(() => { const t = setTimeout(() => setW(score), delay); return () => clearTimeout(t); }, [score, delay]);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ fontFamily: F.body, fontSize: 12, color: C.text, width: 80, textAlign: "right", fontWeight: 500 }}>{PHASE_LABELS[phase]}</span>
      <div style={{ flex: 1, height: 7, background: C.border, borderRadius: 4, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${w}%`, background: `linear-gradient(90deg, ${color}90, ${color})`, borderRadius: 4, transition: "width .7s cubic-bezier(.4,0,.2,1)", boxShadow: `0 0 10px ${color}25` }} />
      </div>
      <span style={{ fontFamily: F.mono, fontSize: 12, color, width: 28, fontWeight: 500 }}>{score}</span>
    </div>
  );
}

function Card({ children, style: s, onClick, glow }) {
  const [hover, setHover] = useState(false);
  return (
    <div onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} style={{
      background: hover && onClick ? C.cardHover : C.card,
      border: `1px solid ${glow ? C.accentDark + "40" : C.border}`,
      borderRadius: 14, padding: 22, cursor: onClick ? "pointer" : "default",
      transition: "all .2s ease",
      ...(glow ? { boxShadow: `0 0 30px ${C.accentGlow}` } : {}),
      ...(hover && onClick ? { transform: "translateY(-1px)", borderColor: C.borderMid } : {}),
      ...s,
    }}>{children}</div>
  );
}

function Badge({ text, color = C.accent, small }) {
  return (
    <span style={{
      fontFamily: F.body, fontSize: small ? 10 : 11, fontWeight: 600, color,
      background: `${color}15`, border: `1px solid ${color}28`,
      padding: small ? "2px 7px" : "3px 10px", borderRadius: 16, whiteSpace: "nowrap",
    }}>{text}</span>
  );
}

function Btn({ children, onClick, variant = "primary", style: s, disabled }) {
  const styles = {
    primary: { background: C.accent, color: C.bg, fontWeight: 700 },
    secondary: { background: C.card, color: C.accent, border: `1px solid ${C.borderMid}` },
    ghost: { background: "transparent", color: C.text },
    danger: { background: `${C.red}18`, color: C.red, border: `1px solid ${C.red}30` },
  };
  return (
    <button disabled={disabled} onClick={onClick} style={{
      fontFamily: F.body, fontSize: 13, padding: "10px 20px", borderRadius: 10,
      border: "none", cursor: disabled ? "not-allowed" : "pointer", transition: "all .2s",
      opacity: disabled ? 0.5 : 1, ...styles[variant], ...s,
    }}>{children}</button>
  );
}

function SeverityDot({ severity }) {
  const c = severity === "high" ? C.red : severity === "medium" ? C.gold : C.accent;
  return <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: c, boxShadow: `0 0 6px ${c}60`, flexShrink: 0, marginTop: 4 }} />;
}

// ── Body Visibility Indicator ────────────────────────────────
function BodyVisibilityIndicator({ visibility }) {
  const on = C.accent;
  const off = C.muted + "40";
  const v = visibility || {};
  const c = (part) => v[part] ? on : off;
  const glow = (part) => v[part] ? `drop-shadow(0 0 4px ${C.accent}60)` : "none";

  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
      padding: "10px 8px", background: C.bg + "cc", borderRadius: 10,
      border: `1px solid ${C.border}`, backdropFilter: "blur(6px)",
    }}>
      <svg width="48" height="96" viewBox="0 0 48 96">
        {/* Head */}
        <circle cx="24" cy="10" r="7" fill={c("head")} style={{ filter: glow("head"), transition: "fill .3s" }} />

        {/* Torso */}
        <path d="M16 22 L32 22 L30 52 L18 52 Z" fill={c("torso")} style={{ filter: glow("torso"), transition: "fill .3s" }} />

        {/* Left Arm */}
        <path d="M16 22 L6 36 L4 52" stroke={c("leftArm")} strokeWidth="4" strokeLinecap="round" fill="none" style={{ filter: glow("leftArm"), transition: "stroke .3s" }} />

        {/* Right Arm */}
        <path d="M32 22 L42 36 L44 52" stroke={c("rightArm")} strokeWidth="4" strokeLinecap="round" fill="none" style={{ filter: glow("rightArm"), transition: "stroke .3s" }} />

        {/* Left Leg */}
        <path d="M20 52 L16 72 L14 90" stroke={c("leftLeg")} strokeWidth="4.5" strokeLinecap="round" fill="none" style={{ filter: glow("leftLeg"), transition: "stroke .3s" }} />

        {/* Right Leg */}
        <path d="M28 52 L32 72 L34 90" stroke={c("rightLeg")} strokeWidth="4.5" strokeLinecap="round" fill="none" style={{ filter: glow("rightLeg"), transition: "stroke .3s" }} />
      </svg>
      <span style={{ fontFamily: F.mono, fontSize: 9, color: C.muted, textAlign: "center", lineHeight: 1.2 }}>
        {Object.values(v).filter(Boolean).length}/6
      </span>
    </div>
  );
}

// ── Swing Silhouette Canvas ─────────────────────────────────
function SwingSilhouette({ phase, size = 200 }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext("2d");
    const w = size, h = size;
    cvs.width = w * 2; cvs.height = h * 2;
    ctx.scale(2, 2);
    ctx.clearRect(0, 0, w, h);

    // Draw simplified stick figure in golf pose
    const cx = w / 2, ground = h - 30;
    ctx.lineCap = "round"; ctx.lineJoin = "round";

    // Ground line
    ctx.strokeStyle = C.border;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(20, ground); ctx.lineTo(w - 20, ground); ctx.stroke();

    // Ball
    ctx.fillStyle = C.white + "30";
    ctx.beginPath(); ctx.arc(cx + 15, ground - 4, 4, 0, Math.PI * 2); ctx.fill();

    // Body poses per phase
    const poses = {
      setup: { head: [cx, ground-120], lShoulder: [cx-18, ground-100], rShoulder: [cx+18, ground-100], hip: [cx, ground-55], lKnee: [cx-12, ground-28], rKnee: [cx+12, ground-28], lFoot: [cx-16, ground], rFoot: [cx+16, ground], lHand: [cx+15, ground-60], rHand: [cx+15, ground-58], club: [cx+15, ground-10] },
      backswing: { head: [cx-2, ground-120], lShoulder: [cx-16, ground-100], rShoulder: [cx+20, ground-98], hip: [cx+4, ground-55], lKnee: [cx-8, ground-28], rKnee: [cx+16, ground-28], lFoot: [cx-14, ground], rFoot: [cx+18, ground], lHand: [cx+40, ground-130], rHand: [cx+38, ground-128], club: [cx+55, ground-115] },
      top: { head: [cx-4, ground-118], lShoulder: [cx-14, ground-98], rShoulder: [cx+22, ground-96], hip: [cx+6, ground-55], lKnee: [cx-6, ground-28], rKnee: [cx+18, ground-28], lFoot: [cx-12, ground], rFoot: [cx+18, ground], lHand: [cx+30, ground-140], rHand: [cx+28, ground-138], club: [cx-10, ground-130] },
      downswing: { head: [cx-2, ground-120], lShoulder: [cx-16, ground-100], rShoulder: [cx+18, ground-100], hip: [cx+2, ground-55], lKnee: [cx-10, ground-28], rKnee: [cx+14, ground-28], lFoot: [cx-14, ground], rFoot: [cx+16, ground], lHand: [cx+20, ground-85], rHand: [cx+18, ground-83], club: [cx+30, ground-40] },
      impact: { head: [cx-4, ground-120], lShoulder: [cx-20, ground-100], rShoulder: [cx+16, ground-102], hip: [cx-4, ground-55], lKnee: [cx-14, ground-28], rKnee: [cx+10, ground-28], lFoot: [cx-16, ground], rFoot: [cx+14, ground], lHand: [cx+14, ground-62], rHand: [cx+16, ground-60], club: [cx+16, ground-8] },
      finish: { head: [cx-8, ground-118], lShoulder: [cx-22, ground-98], rShoulder: [cx+12, ground-100], hip: [cx-8, ground-55], lKnee: [cx-16, ground-28], rKnee: [cx+6, ground-30], lFoot: [cx-18, ground], rFoot: [cx+10, ground], lHand: [cx-30, ground-130], rHand: [cx-28, ground-128], club: [cx-50, ground-110] },
    };
    const p = poses[phase] || poses.setup;

    // Draw body
    ctx.strokeStyle = C.accent + "90";
    ctx.lineWidth = 3;
    const line = (a, b) => { ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke(); };
    
    // Torso
    line(p.lShoulder, p.rShoulder);
    line([(p.lShoulder[0]+p.rShoulder[0])/2, (p.lShoulder[1]+p.rShoulder[1])/2], p.hip);
    // Head
    ctx.fillStyle = C.accent + "70";
    ctx.beginPath(); ctx.arc(...p.head, 10, 0, Math.PI * 2); ctx.fill();
    // Head to shoulders
    line(p.head, [(p.lShoulder[0]+p.rShoulder[0])/2, (p.lShoulder[1]+p.rShoulder[1])/2]);
    // Arms
    line(p.lShoulder, p.lHand);
    line(p.rShoulder, p.rHand);
    // Legs
    line(p.hip, p.lKnee); line(p.lKnee, p.lFoot);
    line(p.hip, p.rKnee); line(p.rKnee, p.rFoot);
    // Club
    ctx.strokeStyle = C.gold + "80"; ctx.lineWidth = 2.5;
    line(p.lHand, p.club);
    // Club head
    ctx.fillStyle = C.gold + "60";
    ctx.beginPath(); ctx.arc(...p.club, 5, 0, Math.PI * 2); ctx.fill();
    // Glow at hands
    const grad = ctx.createRadialGradient(p.lHand[0], p.lHand[1], 0, p.lHand[0], p.lHand[1], 15);
    grad.addColorStop(0, C.accent + "30"); grad.addColorStop(1, "transparent");
    ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(p.lHand[0], p.lHand[1], 15, 0, Math.PI * 2); ctx.fill();
  }, [phase, size]);

  return <canvas ref={canvasRef} style={{ width: size, height: size }} />;
}

// ── Voice Bubble ─────────────────────────────────────────────
function VoiceBubble({ text, icon = "\u{1F50A}" }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", background: `${C.accent}08`, border: `1px solid ${C.accent}15`, borderRadius: 10, animation: "slideIn .3s ease" }}>
      <span style={{ fontSize: 18 }}>{icon}</span>
      <span style={{ fontFamily: F.body, fontSize: 13, color: C.text, fontWeight: 500, fontStyle: "italic" }}>"{text}"</span>
    </div>
  );
}

// ── Main App ────────────────────────────────────────────────
export default function SwingIQ() {
  const [tab, setTab] = useState("dashboard");
  const [sessions, setSessions] = useState([]);
  const [currentResult, setCurrentResult] = useState(null);
  const [clubType, setClubType] = useState("driver");
  const [selectedPhase, setSelectedPhase] = useState("setup");

  const [cameraActive, setCameraActive] = useState(false);
  const [livePhase, setLivePhase] = useState("setup");
  const [liveAngles, setLiveAngles] = useState(null);
  const [rightHanded, setRightHanded] = useState(true);
  const [calibrationState, setCalibrationState] = useState("idle"); // idle | waiting | calibrating | ready | recording | feedback
  const [calibrationCountdown, setCalibrationCountdown] = useState(0);
  const [calibrationBaseline, setCalibrationBaseline] = useState(null);
  const [poseDetected, setPoseDetected] = useState(false);
  const [bodyVisibility, setBodyVisibility] = useState({ head: false, torso: false, leftArm: false, rightArm: false, leftLeg: false, rightLeg: false });
  const framesRef = useRef([]);
  const phaseDetectorRef = useRef(createPhaseDetector());
  const recordStartRef = useRef(0);
  const calibrationFramesRef = useRef([]);
  const prevPhaseRef = useRef(null);
  const [spoken, setSpoken] = useState("");
  const [vOn, setVO] = useState(true);
  const [sOn, setSO] = useState(true);
  const [camPermission, setCamPermission] = useState(null); // null = not asked, true = granted, false = denied
  const feedbackTimers = useRef([]);

  const say = useCallback((t, pri = false) => { setSpoken(t); gv().say(t, pri); }, []);
  const playDrill = useCallback((n) => { const d = DRILLS[n]; if (!d) return; gs().ready(); say(d.vg, true); }, [say]);

  // Request camera permission — always try getUserMedia directly
  // (Permissions API is unreliable on iOS Safari — returns "denied" when never asked)
  const requestCamPermission = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      stream.getTracks().forEach(t => t.stop());
      setCamPermission(true);
      setCameraActive(true);
    } catch {
      setCamPermission(false);
      say("Camera permission was denied. Please allow camera access in your browser settings.", true);
    }
  }, [say]);

  // Start flow — always trigger getUserMedia to let browser prompt
  const startWithPermissionCheck = useCallback(async () => {
    setCalibrationState("waiting");
    calibrationFramesRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      stream.getTracks().forEach(t => t.stop());
      setCamPermission(true);
      setCameraActive(true);
    } catch {
      setCamPermission(false);
      say("Camera permission was declined. Tap the button to try again.", true);
    }
  }, [say]);

  // Handle incoming pose landmarks from the camera
  const handlePoseFrame = useCallback((landmarks) => {
    const vis = computeVisibility(landmarks);
    setBodyVisibility(vis);
    const fullBody = isFullBodyVisible(vis);
    setPoseDetected(fullBody);

    const angles = computeAnglesFromLandmarks(landmarks, rightHanded);
    if (!angles) return;

    // During calibration — collect baseline frames
    if (calibrationState === "calibrating") {
      calibrationFramesRef.current.push(angles);
      return;
    }

    const phase = phaseDetectorRef.current.detect(angles);
    if (phase !== prevPhaseRef.current && calibrationState === "recording") {
      prevPhaseRef.current = phase;
      gs().phase();
    }
    setLivePhase(phase);
    setLiveAngles(angles);

    if (calibrationState === "recording") {
      const elapsed = Date.now() - recordStartRef.current;
      framesRef.current.push({
        timestamp: elapsed,
        phase,
        angles,
        landmarks,
        clubData: null,
      });

      // Auto-stop after finish phase is held, or after 12 seconds
      if (phase === "finish" && framesRef.current.filter(f => f.phase === "finish").length > 8) {
        finishRecording();
      }
      if (elapsed > 12000) {
        finishRecording();
      }
    }
  }, [calibrationState, rightHanded]);

  // Calibration: wait for full body, then stand at address for 3 seconds
  const startCalibration = useCallback(() => {
    // Cancel any in-progress TTS and pending feedback timeouts
    gv().stop();
    feedbackTimers.current.forEach(t => clearTimeout(t));
    feedbackTimers.current = [];
    // Reset stale pose state so calibration waits for fresh detection
    setPoseDetected(false);
    setBodyVisibility({ head: false, torso: false, leftArm: false, rightArm: false, leftLeg: false, rightLeg: false });
    setLiveAngles(null);
    setTab("dashboard");
    gs()._e();
    gv().unlock();
    gs().ready();
    startWithPermissionCheck();
  }, [startWithPermissionCheck]);

  const handleCameraReady = useCallback(() => {
    gs().ready();
    say(`Starting session with ${clubType}. Get into your address position. Make sure your full body is visible.`, true);
  }, [clubType, say]);

  // Auto-transition: waiting → calibrating once full body is visible
  // Delay detection so the TTS prompt can finish before we start checking visibility
  const [detectReady, setDetectReady] = useState(false);
  useEffect(() => {
    if (calibrationState !== "waiting") { setDetectReady(false); return; }
    // Reset pose state when entering waiting — clear stale data from previous session
    setPoseDetected(false);
    setBodyVisibility({ head: false, torso: false, leftArm: false, rightArm: false, leftLeg: false, rightLeg: false });
    setLiveAngles(null);
    setDetectReady(false);
    const timer = setTimeout(() => setDetectReady(true), 5000);
    return () => clearTimeout(timer);
  }, [calibrationState]);

  useEffect(() => {
    if (calibrationState !== "waiting" || !poseDetected || !detectReady) return;
    calibrationFramesRef.current = [];
    setCalibrationCountdown(3);
    setCalibrationState("calibrating");
  }, [calibrationState, poseDetected, detectReady]);

  // Run the countdown timer when calibrating
  useEffect(() => {
    if (calibrationState !== "calibrating") return;

    let remaining = 3;
    const interval = setInterval(() => {
      remaining--;
      gs().tick();
      setCalibrationCountdown(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
        const frames = calibrationFramesRef.current;
        if (frames.length > 5) {
          const baseline = {};
          const keys = Object.keys(frames[0]).filter(k => k !== "headMovement");
          for (const k of keys) {
            baseline[k] = frames.reduce((sum, f) => sum + (f[k] || 0), 0) / frames.length;
          }
          setCalibrationBaseline(baseline);
        }
        setCalibrationState("ready");
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [calibrationState]);

  const [recordCountdown, setRecordCountdown] = useState(0);

  const startRecording = useCallback(() => {
    phaseDetectorRef.current.reset();
    framesRef.current = [];
    recordStartRef.current = Date.now();
    prevPhaseRef.current = null;
    setRecordCountdown(0);
    gs().swing();
    say("Swing now.", true);
    setCalibrationState("recording");
  }, [say]);

  // Auto-start recording 5 seconds after calibration completes
  useEffect(() => {
    if (calibrationState !== "ready") { setRecordCountdown(0); return; }
    gs().tick();
    say("Good. Hold your setup. Recording starts in 5 seconds.", true);

    let remaining = 5;
    setRecordCountdown(remaining);
    const interval = setInterval(() => {
      remaining--;
      setRecordCountdown(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
        startRecording();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [calibrationState, startRecording]);

  const finishRecording = useCallback(() => {
    if (framesRef.current.length < 5) {
      setCalibrationState("ready");
      return;
    }

    say("Analyzing your swing.", true);
    const result = analyzeSwing(framesRef.current, clubType);
    setCurrentResult(result);
    setSessions(prev => [result, ...prev].slice(0, 50));
    setTab("analysis");
    setCameraActive(false);
    // Stay in "feedback" state — mic stays OFF while TTS plays results
    setCalibrationState("feedback");

    const grade = result.overallScore >= 85 ? "Excellent" : result.overallScore >= 75 ? "Good" : result.overallScore >= 60 ? "Needs work" : "Let's improve this";
    if (result.overallScore >= 85) gs().great();
    else if (result.overallScore >= 70) gs().good();
    else gs().alert();

    const t = feedbackTimers.current = [];
    t.push(setTimeout(() => say(`Score: ${result.overallScore}. ${grade}.`), 500));
    if (result.faults.length > 0) {
      t.push(setTimeout(() => say(result.faults[0].vf), 3500));
    } else {
      t.push(setTimeout(() => say("Clean swing. No major faults detected."), 3500));
    }
    if (result.tempo && result.tempo !== "—") {
      t.push(setTimeout(() => say(`Tempo was ${result.tempo}.`), 6500));
    }
    // After all feedback, prompt restart
    t.push(setTimeout(() => {
      say("Tap Swing Again to record another swing.");
      t.push(setTimeout(() => setCalibrationState("idle"), 4000));
    }, 9000));

    if (window.swingIQ?.onAnalysisComplete) window.swingIQ.onAnalysisComplete(result);
  }, [clubType, say]);

  const cancelCamera = useCallback(() => {
    gv().stop();
    setCameraActive(false);
    setCalibrationState("idle");
    setCalibrationBaseline(null);
    setPoseDetected(false);
    setLiveAngles(null);
    setCamPermission(null);
  }, []);

  // ── CV Bridge (external API) ─────────────────────────────
  useEffect(() => {
    window.swingIQ = {
      startSession: (club) => {
        setClubType(club || "driver");
        setCalibrationState("recording");
        framesRef.current = [];
        recordStartRef.current = Date.now();
      },
      submitFrame: (frameData) => {
        if (calibrationState === "recording") framesRef.current.push(frameData);
      },
      endSwing: () => {
        setCalibrationState("idle");
        const result = analyzeSwing(framesRef.current, clubType);
        setCurrentResult(result);
        setSessions(prev => [result, ...prev].slice(0, 50));
        setTab("analysis");
        if (window.swingIQ.onAnalysisComplete) window.swingIQ.onAnalysisComplete(result);
        return result;
      },
      onAnalysisComplete: null,
    };
    return () => { delete window.swingIQ; };
  }, [calibrationState, clubType]);

  // Compute averages for dashboard
  const avgScore = sessions.length ? Math.round(sessions.reduce((s, r) => s + r.overallScore, 0) / sessions.length) : 0;
  const bestScore = sessions.length ? Math.max(...sessions.map(r => r.overallScore)) : 0;
  const latestFaults = currentResult?.faults || [];

  // ── Tab Nav ─────────────────────────────────────────────
  const tabs = [
    { id: "dashboard", label: "Home", icon: "⬡" },
    { id: "analysis", label: "Analysis", icon: "◎" },
    { id: "history", label: "History", icon: "☷" },
    { id: "guide", label: "Guide", icon: "\u{1F4D6}" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.white, fontFamily: F.body, maxWidth: 520, margin: "0 auto", padding: "0 16px 100px" }}>
      {/* Header */}
      <div style={{ padding: "24px 0 8px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ fontFamily: F.display, fontSize: 28, fontWeight: 700, color: C.white, letterSpacing: -0.5 }}>
            Swing<span style={{ color: C.accent }}>IQ</span>
          </h1>
          <p style={{ fontFamily: F.body, fontSize: 11, color: C.muted, fontWeight: 400, letterSpacing: 1.5, textTransform: "uppercase", marginTop: 2 }}>Voice-Guided Training</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {calibrationState === "recording" && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 14px", background: `${C.red}18`, border: `1px solid ${C.red}30`, borderRadius: 20, animation: "recording 1.5s infinite" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.red, animation: "pulse 1s infinite" }} />
              <span style={{ fontFamily: F.mono, fontSize: 11, color: C.red, fontWeight: 600 }}>RECORDING</span>
            </div>
          )}
          <button onClick={() => { const o = gv().toggle(); setVO(o); }} style={{ width: 36, height: 36, borderRadius: 10, border: `1px solid ${C.border}`, background: vOn ? `${C.accent}14` : C.surface, color: vOn ? C.accent : C.muted, fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>{vOn ? "\u{1F50A}" : "\u{1F507}"}</button>
          <button onClick={() => { gs().on = !gs().on; setSO(gs().on); }} style={{ width: 36, height: 36, borderRadius: 10, border: `1px solid ${C.border}`, background: sOn ? `${C.accent}14` : C.surface, color: sOn ? C.accent : C.muted, fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>{"\u266A"}</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 2, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 3, margin: "12px 0 20px" }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            flex: 1, padding: "9px 4px", borderRadius: 9, border: "none", cursor: "pointer",
            background: tab === t.id ? `${C.accent}14` : "transparent",
            color: tab === t.id ? C.accent : C.muted,
            fontFamily: F.body, fontSize: 11, fontWeight: 600, transition: "all .2s",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 1,
          }}>
            <span style={{ fontSize: 14, lineHeight: 1 }}>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* ═══ GUIDE ═══ */}
      {tab === "guide" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14, animation: "fadeUp .4s ease" }}>

          <Card glow style={{ textAlign: "center", padding: "28px 22px", background: `linear-gradient(170deg, ${C.card} 0%, ${C.surface} 100%)` }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>🏌️</div>
            <h2 style={{ fontFamily: F.display, fontSize: 22, fontWeight: 700, color: C.white, marginBottom: 4 }}>
              How to Use Swing<span style={{ color: C.accent }}>IQ</span>
            </h2>
            <p style={{ fontFamily: F.body, fontSize: 12, color: C.muted, lineHeight: 1.5 }}>
              AI-powered swing analysis using your camera. No club needed.
            </p>
          </Card>

          {/* Steps */}
          {[
            {
              num: "1",
              title: "Set Up Your Camera",
              desc: "Place your phone or laptop so the camera can see your body from the thighs up. A side view (down-the-line) works best, but facing the camera works too. Good lighting helps.",
              tip: "Prop your phone against something stable about 8-10 feet away at hip height.",
            },
            {
              num: "2",
              title: "Select Your Club",
              desc: "On the Home tab, pick Driver, Iron, or Wedge. Each has different ideal angles that your swing is scored against. If you're just testing, Driver is a good default.",
              tip: "You don't need an actual club — just mime the swing motion with your arms.",
            },
            {
              num: "3",
              title: "Start",
              desc: "Hit the Start button on the Home tab. The app will turn on your camera and wait until it can see your body. A silhouette in the corner shows which parts are detected. Once your thighs, torso, and head are visible, a 3-second calibration starts automatically.",
              tip: "Just stand naturally and stay still for the 3-second countdown.",
            },
            {
              num: "4",
              title: "Recording Starts Automatically",
              desc: "After calibration, a 5-second countdown begins. Use this time to get into your stance. When it hits zero, recording starts. You can also tap 'Start Now' to skip the wait.",
              tip: null,
            },
            {
              num: "5",
              title: "Perform Your Swing",
              desc: "Do a full swing motion: setup position, backswing, reach the top, swing down through impact, and finish. The app tracks 6 phases by watching your shoulder rotation, hip turn, and elbow angles.",
              tip: "Go at a natural pace. Recording auto-stops when it detects your finish position, or after 12 seconds.",
            },
            {
              num: "6",
              title: "Review Your Analysis",
              desc: "You'll see an overall score (0-100), phase-by-phase breakdown, and detected faults with explanations. Tap any fault to see how to fix it.",
              tip: null,
            },
          ].map((step) => (
            <Card key={step.num}>
              <div style={{ display: "flex", gap: 14 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
                  background: `${C.accent}18`, border: `1px solid ${C.accent}35`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontFamily: F.display, fontSize: 16, fontWeight: 700, color: C.accent,
                }}>{step.num}</div>
                <div style={{ flex: 1 }}>
                  <h3 style={{ fontFamily: F.body, fontSize: 14, fontWeight: 700, color: C.white, marginBottom: 6 }}>{step.title}</h3>
                  <p style={{ fontFamily: F.body, fontSize: 12, color: C.text, lineHeight: 1.6 }}>{step.desc}</p>
                  {step.tip && (
                    <div style={{ marginTop: 8, padding: "8px 10px", background: C.surface, borderRadius: 8, border: `1px solid ${C.border}` }}>
                      <span style={{ fontFamily: F.body, fontSize: 11, color: C.muted, lineHeight: 1.5 }}>
                        <span style={{ color: C.gold, fontWeight: 600 }}>Tip: </span>{step.tip}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          ))}

          {/* Scoring explanation */}
          <Card>
            <h3 style={{ fontFamily: F.body, fontSize: 14, fontWeight: 700, color: C.white, marginBottom: 10 }}>How Scoring Works</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                { range: "85-100", color: C.accent, label: "Excellent", desc: "Tour-level form for that phase" },
                { range: "70-84", color: C.gold, label: "Good", desc: "Solid fundamentals, minor tweaks needed" },
                { range: "55-69", color: "#e6a030", label: "Fair", desc: "Noticeable deviations from ideal" },
                { range: "0-54", color: C.red, label: "Needs Work", desc: "Significant faults detected" },
              ].map((tier) => (
                <div key={tier.range} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}>
                  <span style={{ fontFamily: F.mono, fontSize: 11, fontWeight: 600, color: tier.color, width: 50 }}>{tier.range}</span>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: tier.color, flexShrink: 0 }} />
                  <div>
                    <span style={{ fontFamily: F.body, fontSize: 12, fontWeight: 600, color: C.white }}>{tier.label}</span>
                    <span style={{ fontFamily: F.body, fontSize: 11, color: C.muted, marginLeft: 6 }}>{tier.desc}</span>
                  </div>
                </div>
              ))}
            </div>
            <p style={{ fontFamily: F.body, fontSize: 11, color: C.muted, marginTop: 10, lineHeight: 1.5 }}>
              Impact is weighted heaviest (2x), followed by downswing (1.5x) and top (1.3x). Your overall score is the weighted average across all detected phases.
            </p>
          </Card>

          {/* Other tabs */}
          <Card>
            <h3 style={{ fontFamily: F.body, fontSize: 14, fontWeight: 700, color: C.white, marginBottom: 10 }}>Other Tabs</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                { icon: "◎", name: "Analysis", desc: "Detailed breakdown of your last swing — scores, angles vs ideal, faults, and priority fixes." },
                { icon: "☷", name: "History", desc: "All your recorded sessions. Tap any to view its full analysis." },
              ].map((t) => (
                <div key={t.name} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "6px 0" }}>
                  <span style={{ fontSize: 14, width: 20, textAlign: "center", color: C.accent }}>{t.icon}</span>
                  <div>
                    <span style={{ fontFamily: F.body, fontSize: 12, fontWeight: 600, color: C.white }}>{t.name}</span>
                    <p style={{ fontFamily: F.body, fontSize: 11, color: C.muted, lineHeight: 1.5, marginTop: 2 }}>{t.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Btn onClick={() => setTab("dashboard")} style={{ width: "100%" }}>
            Get Started
          </Btn>
        </div>
      )}

      {/* ═══ DASHBOARD ═══ */}
      {tab === "dashboard" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, animation: "fadeUp .4s ease" }}>
          {/* Club selector — hidden during camera/calibration flow */}
          {(calibrationState === "idle" || calibrationState === "feedback") && <Card style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <span style={{ fontFamily: F.body, fontSize: 12, color: C.muted, fontWeight: 500 }}>Select Club</span>
            <div style={{ display: "flex", gap: 8 }}>
              {["driver", "iron", "wedge"].map(c => (
                <button key={c} onClick={() => { setClubType(c); gs().tick(); say(`${c} selected.`); }} style={{
                  flex: 1, padding: "14px 8px", borderRadius: 10, border: `2px solid ${clubType === c ? C.accent : C.border}`,
                  background: clubType === c ? `${C.accent}14` : "transparent",
                  color: clubType === c ? C.accent : C.text,
                  fontFamily: F.body, fontSize: 14, fontWeight: 700, cursor: "pointer", textTransform: "capitalize",
                }}>{c}</button>
              ))}
            </div>

          </Card>}

          {/* Start / Restart button */}
          {calibrationState === "idle" && (
            <button onClick={startCalibration} style={{ width: "100%", padding: "28px 20px", borderRadius: 16, border: "none", background: `linear-gradient(135deg, ${C.accent}, ${C.accentDark})`, color: C.bg, fontFamily: F.body, fontSize: 22, fontWeight: 700, cursor: "pointer", animation: "breathe 3s ease infinite", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 36 }}>{"\u26F3"}</span>
              {sessions.length > 0 ? "Tap to swing again" : "Tap to begin"}
              <span style={{ fontFamily: F.body, fontSize: 12, fontWeight: 500, opacity: .7 }}>Voice-guided swing analysis</span>
            </button>
          )}

          {/* Feedback state — waiting for TTS to finish */}
          {calibrationState === "feedback" && (
            <Card style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: 24 }}>
              <span style={{ fontSize: 28 }}>🔊</span>
              <span style={{ fontFamily: F.body, fontSize: 16, color: C.text }}>Playing feedback...</span>
            </Card>
          )}

          {/* Camera + calibration flow — visible after start */}
          {calibrationState !== "idle" && calibrationState !== "feedback" && (
            <Card style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Camera denied — show retry button */}
              {camPermission === false && (
                <div style={{ padding: "40px 20px", textAlign: "center", background: C.surface, borderRadius: 14, border: `1px solid ${C.border}` }}>
                  <span style={{ fontSize: 40, display: "block", marginBottom: 12 }}>{"\u{1F4F7}"}</span>
                  <p style={{ fontFamily: F.body, fontSize: 14, color: C.text, fontWeight: 600, marginBottom: 6 }}>Camera permission declined</p>
                  <p style={{ fontFamily: F.body, fontSize: 12, color: C.muted, marginBottom: 16, lineHeight: 1.5 }}>SwingIQ needs camera access to analyze your swing. Please allow access to continue.</p>
                  <Btn onClick={requestCamPermission} style={{ padding: "12px 28px", fontSize: 14 }}>Allow Camera Access</Btn>
                </div>
              )}
              {camPermission === true && (
                <div style={{ position: "relative" }}>
                  <LiveCamera
                    isActive={cameraActive}
                    onFrame={handlePoseFrame}
                    onReady={handleCameraReady}
                    onError={() => {}}
                  />
                  {cameraActive && (calibrationState === "waiting" || calibrationState === "calibrating" || calibrationState === "ready") && (
                    <div style={{ position: "absolute", top: 10, right: 10, zIndex: 2 }}>
                      <BodyVisibilityIndicator visibility={bodyVisibility} />
                    </div>
                  )}
                </div>
              )}

              {/* Waiting for full body visibility */}
              {cameraActive && calibrationState === "waiting" && (
                <div style={{ padding: "16px 14px", background: `${C.gold}12`, borderRadius: 12, border: `1px solid ${C.gold}30`, textAlign: "center" }}>
                  <p style={{ fontFamily: F.body, fontSize: 14, color: C.gold, fontWeight: 600 }}>Step into frame</p>
                  <p style={{ fontFamily: F.body, fontSize: 12, color: C.muted, marginTop: 6, lineHeight: 1.5 }}>Make sure your full body is visible. The silhouette shows which parts are detected.</p>
                  <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                    {[
                      { key: "head", label: "Head" }, { key: "torso", label: "Torso" },
                      { key: "leftArm", label: "L Arm" }, { key: "rightArm", label: "R Arm" },
                      { key: "leftLeg", label: "L Leg" }, { key: "rightLeg", label: "R Leg" },
                    ].map(p => (
                      <span key={p.key} style={{
                        fontFamily: F.mono, fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 6,
                        color: bodyVisibility[p.key] ? C.accent : C.muted,
                        background: bodyVisibility[p.key] ? `${C.accent}18` : `${C.muted}12`,
                        border: `1px solid ${bodyVisibility[p.key] ? C.accent + "40" : C.muted + "20"}`,
                        transition: "all .3s",
                      }}>{bodyVisibility[p.key] ? "\u2713" : "\u2717"} {p.label}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Calibrating countdown */}
              {cameraActive && calibrationState === "calibrating" && (
                <div style={{ padding: "16px 14px", background: `${C.blue}12`, borderRadius: 12, border: `1px solid ${C.blue}30`, textAlign: "center" }}>
                  <div style={{ fontFamily: F.display, fontSize: 48, fontWeight: 700, color: C.blue, animation: "scalePop .4s ease" }}>{calibrationCountdown}</div>
                  <p style={{ fontFamily: F.body, fontSize: 13, color: C.blue, fontWeight: 500, marginTop: 4 }}>Stand still — calibrating...</p>
                  {!poseDetected && (
                    <p style={{ fontFamily: F.body, fontSize: 11, color: C.red, marginTop: 6 }}>Full body not detected — step back or adjust camera</p>
                  )}
                </div>
              )}

              {/* Calibration baseline */}
              {(calibrationState === "ready" || calibrationState === "recording") && calibrationBaseline && (
                <div style={{ padding: "10px 14px", background: `${C.accent}08`, borderRadius: 10, border: `1px solid ${C.accent}20`, display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 18 }}>{"\u2713"}</span>
                  <div>
                    <span style={{ fontFamily: F.body, fontSize: 12, color: C.accent, fontWeight: 600 }}>Calibrated</span>
                    <span style={{ fontFamily: F.mono, fontSize: 10, color: C.muted, marginLeft: 8 }}>
                      Spine {Math.round(calibrationBaseline.spineAngle)}{"\u00B0"} {"\u00B7"} Knee {Math.round(calibrationBaseline.kneeFlexion)}{"\u00B0"}
                    </span>
                  </div>
                </div>
              )}

              {/* Live phase + angles HUD */}
              {cameraActive && liveAngles && calibrationState !== "calibrating" && calibrationState !== "waiting" && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: C.surface, borderRadius: 10, border: `1px solid ${C.border}` }}>
                  <div>
                    <span style={{ fontFamily: F.body, fontSize: 10, color: C.muted, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>Phase</span>
                    <div style={{ fontFamily: F.display, fontSize: 18, fontWeight: 700, color: C.accent }}>{PHASE_LABELS[livePhase]}</div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {[
                      { label: "Spine", val: liveAngles.spineAngle },
                      { label: "Elbow", val: liveAngles.elbowAngle },
                      { label: "Hip", val: liveAngles.hipRotation },
                      { label: "Knee", val: liveAngles.kneeFlexion },
                    ].map(a => (
                      <div key={a.label} style={{ textAlign: "center" }}>
                        <span style={{ fontFamily: F.mono, fontSize: 14, color: C.white, fontWeight: 600 }}>{Math.round(a.val)}{"\u00B0"}</span>
                        <div style={{ fontFamily: F.body, fontSize: 9, color: C.muted }}>{a.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Action buttons */}
              {calibrationState === "waiting" && (
                <Btn onClick={cancelCamera} variant="secondary" style={{ width: "100%" }}>{"\u2715"} Cancel</Btn>
              )}
              {calibrationState === "ready" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ padding: "14px", background: `${C.accent}10`, borderRadius: 12, border: `1px solid ${C.accent}25`, textAlign: "center" }}>
                    <div style={{ fontFamily: F.display, fontSize: 36, fontWeight: 700, color: C.accent, animation: "scalePop .4s ease" }}>{recordCountdown}</div>
                    <p style={{ fontFamily: F.body, fontSize: 13, color: C.accent, fontWeight: 500, marginTop: 2 }}>Get into your stance — recording starts automatically</p>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <Btn onClick={startRecording} style={{ flex: 1 }}>{"\u25CF"} Start Now</Btn>
                    <Btn onClick={cancelCamera} variant="secondary" style={{ padding: "10px 14px" }}>{"\u2715"}</Btn>
                  </div>
                </div>
              )}
              {calibrationState === "recording" && (
                <div style={{ display: "flex", gap: 8 }}>
                  <Btn onClick={finishRecording} variant="danger" style={{ flex: 1 }}>{"\u25A0"} Stop &amp; Analyze</Btn>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 12px", background: `${C.red}12`, borderRadius: 10, border: `1px solid ${C.red}25` }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.red, animation: "pulse 1s infinite" }} />
                    <span style={{ fontFamily: F.mono, fontSize: 11, color: C.red }}>{framesRef.current.length} frames</span>
                  </div>
                </div>
              )}

              {/* Setup guidance */}
              <div style={{ padding: "10px 12px", background: C.surface, borderRadius: 8, border: `1px solid ${C.border}` }}>
                <p style={{ fontFamily: F.body, fontSize: 11, color: C.muted, lineHeight: 1.6 }}>
                  <strong style={{ color: C.text }}>Camera setup:</strong> Position camera at hip height, 8-10 ft away, side view. Ensure your full body is visible with good lighting.
                </p>
              </div>
            </Card>
          )}

          {/* Stats */}
          {sessions.length > 0 && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                {[
                  { label: "Sessions", value: sessions.length, color: C.text },
                  { label: "Average", value: avgScore, color: avgScore >= 80 ? C.accent : C.gold },
                  { label: "Best", value: bestScore, color: C.accent },
                ].map((st, i) => (
                  <Card key={i} style={{ padding: 14, textAlign: "center" }}>
                    <div style={{ fontFamily: F.display, fontSize: 26, fontWeight: 700, color: st.color }}>{st.value}</div>
                    <div style={{ fontFamily: F.body, fontSize: 10, color: C.muted, fontWeight: 500, marginTop: 2 }}>{st.label}</div>
                  </Card>
                ))}
              </div>

              {/* Quick trend */}
              <Card>
                <span style={{ fontFamily: F.body, fontSize: 13, fontWeight: 700, color: C.white }}>Score Trend</span>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 80, marginTop: 12 }}>
                  {sessions.slice(0, 12).reverse().map((s, i) => {
                    const max = Math.max(...sessions.slice(0, 12).map(x => x.overallScore));
                    const color = s.overallScore >= 85 ? C.accent : s.overallScore >= 70 ? C.gold : C.red;
                    return (
                      <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                        <span style={{ fontFamily: F.mono, fontSize: 8, color: C.muted }}>{s.overallScore}</span>
                        <div style={{
                          width: "100%", borderRadius: 4, minHeight: 4,
                          height: `${(s.overallScore / max) * 64}px`,
                          background: `linear-gradient(180deg, ${color}, ${color}60)`,
                        }} />
                      </div>
                    );
                  })}
                </div>
              </Card>

              {/* Current faults summary */}
              {latestFaults.length > 0 && (
                <Card>
                  <span style={{ fontFamily: F.body, fontSize: 13, fontWeight: 700, color: C.white, marginBottom: 10, display: "block" }}>Active Faults</span>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {latestFaults.slice(0, 3).map((f, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                        <SeverityDot severity={f.severity} />
                        <div>
                          <span style={{ fontFamily: F.body, fontSize: 13, color: C.white, fontWeight: 600 }}>{f.name}</span>
                          <span style={{ fontFamily: F.body, fontSize: 11, color: C.muted, marginLeft: 8 }}>{PHASE_LABELS[f.phase]}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </>
          )}

          {spoken && <VoiceBubble text={spoken} />}

          {sessions.length === 0 && (
            <Card style={{ textAlign: "center", padding: 40 }}>
              <div style={{ fontSize: 40, marginBottom: 12, animation: "bounce 2s ease infinite" }}>🏌️</div>
              <p style={{ fontFamily: F.body, fontSize: 14, color: C.text, fontWeight: 500 }}>No swings yet</p>
              <p style={{ fontFamily: F.body, fontSize: 12, color: C.muted, marginTop: 6 }}>Tap Start to begin your first swing session</p>
            </Card>
          )}
        </div>
      )}

      {/* ═══ ANALYSIS ═══ */}
      {tab === "analysis" && currentResult && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, animation: "fadeUp .4s ease" }}>
          {/* Swing Again button */}
          <button onClick={startCalibration} style={{ width: "100%", padding: "16px 20px", borderRadius: 14, border: "none", background: `linear-gradient(135deg, ${C.accent}, ${C.accentDark})`, color: C.bg, fontFamily: F.body, fontSize: 18, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
            <span style={{ fontSize: 24 }}>{"\u26F3"}</span> Swing Again
          </button>
          {/* Hero Score */}
          <Card glow style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "28px 22px", background: `linear-gradient(170deg, ${C.card} 0%, ${C.surface} 100%)` }}>
            <div style={{ fontFamily: F.body, fontSize: 11, color: C.muted, fontWeight: 500, letterSpacing: 2, textTransform: "uppercase", marginBottom: 6 }}>Swing Score</div>
            <ScoreRing score={currentResult.overallScore} size={150} stroke={10} />
            <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap", justifyContent: "center" }}>
              <Badge text={currentResult.clubType.toUpperCase()} />
              {currentResult.tempo !== "—" && <Badge text={`Tempo ${currentResult.tempo}`} color={C.gold} />}
              {currentResult.maxSpeed && <Badge text={currentResult.maxSpeed} color={C.cyan} />}
            </div>
            <button onClick={() => { const g = currentResult.overallScore >= 85 ? "Excellent" : currentResult.overallScore >= 75 ? "Good" : "Needs work"; say(`Score: ${currentResult.overallScore}. ${g}.${currentResult.faults[0] ? " " + currentResult.faults[0].vf : " No major faults."}`, true); }} style={{ marginTop: 14, padding: "8px 20px", borderRadius: 8, border: `1px solid ${C.accent}30`, background: `${C.accent}10`, color: C.accent, fontFamily: F.body, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{"\u{1F50A}"} Hear Analysis Again</button>
          </Card>

          {/* Phase Breakdown */}
          <Card>
            <span style={{ fontFamily: F.body, fontSize: 13, fontWeight: 700, color: C.white, display: "block", marginBottom: 14 }}>Phase Breakdown</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {PHASE_ORDER.map((ph, i) => currentResult.phaseScores[ph] != null && (
                <PhaseBar key={ph} phase={ph} score={currentResult.phaseScores[ph]} delay={i * 80} />
              ))}
            </div>
          </Card>

          {/* Phase Silhouette Viewer */}
          <Card>
            <span style={{ fontFamily: F.body, fontSize: 13, fontWeight: 700, color: C.white, display: "block", marginBottom: 10 }}>Swing Phases</span>
            <div style={{ display: "flex", gap: 4, marginBottom: 12, flexWrap: "wrap" }}>
              {PHASE_ORDER.map(ph => (
                <button key={ph} onClick={() => setSelectedPhase(ph)} style={{
                  padding: "5px 12px", borderRadius: 7, border: `1px solid ${selectedPhase === ph ? C.accent + "50" : C.border}`,
                  background: selectedPhase === ph ? `${C.accent}14` : "transparent",
                  color: selectedPhase === ph ? C.accent : C.muted,
                  fontFamily: F.body, fontSize: 11, fontWeight: 600, cursor: "pointer", transition: "all .2s",
                }}>{PHASE_LABELS[ph]}</button>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "center", background: C.surface, borderRadius: 12, padding: 12 }}>
              <SwingSilhouette phase={selectedPhase} size={220} />
            </div>
            {currentResult.phaseAngles[selectedPhase] && (
              <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                {Object.entries(currentResult.phaseAngles[selectedPhase]).map(([k, v]) => {
                  const ideal = (IDEAL_ANGLES[currentResult.clubType] || IDEAL_ANGLES.driver)[selectedPhase]?.[k];
                  const diff = ideal ? Math.abs(v - ideal) : 0;
                  const good = diff < ideal * 0.15;
                  return (
                    <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "6px 10px", background: C.surface, borderRadius: 6 }}>
                      <span style={{ fontFamily: F.body, fontSize: 11, color: C.text, fontWeight: 500 }}>{k.replace(/([A-Z])/g, " $1").trim()}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontFamily: F.mono, fontSize: 11, color: good ? C.accent : C.gold, fontWeight: 500 }}>{Math.round(v)}°</span>
                        {ideal && <span style={{ fontFamily: F.mono, fontSize: 9, color: C.muted }}>({ideal}°)</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Faults */}
          {currentResult.faults.length > 0 && (
            <Card>
              <span style={{ fontFamily: F.body, fontSize: 13, fontWeight: 700, color: C.white, display: "block", marginBottom: 12 }}>
                Detected Issues ({currentResult.faults.length})
              </span>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {currentResult.faults.map((f, i) => (
                  <div key={i} style={{ padding: 14, background: C.surface, borderRadius: 10, border: `1px solid ${f.severity === "high" ? C.red + "20" : C.border}` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <SeverityDot severity={f.severity} />
                      <span style={{ fontFamily: F.body, fontSize: 14, color: C.white, fontWeight: 600 }}>{f.name}</span>
                      <Badge text={f.severity} color={f.severity === "high" ? C.red : f.severity === "medium" ? C.gold : C.accent} small />
                      <Badge text={PHASE_LABELS[f.phase]} small color={C.text} />
                    </div>
                    <p style={{ fontFamily: F.body, fontSize: 12, color: C.text, lineHeight: 1.5 }}>{f.fix}</p>
                    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                      {f.vf && <button onClick={() => say(f.vf, true)} style={{ padding: "5px 12px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.surface, color: C.text, fontFamily: F.body, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>{"\u{1F50A}"} Hear Fix</button>}
                      {f.drill && <button onClick={() => { playDrill(f.drill); }} style={{ padding: "5px 12px", borderRadius: 6, border: `1px solid ${C.accent}30`, background: `${C.accent}10`, color: C.accent, fontFamily: F.body, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>{"\u{1F50A}"} Play Drill</button>}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Top Priority */}
          {currentResult.faults.length > 0 && (
            <Card style={{ background: `linear-gradient(135deg, ${C.red}08, ${C.card})`, border: `1px solid ${C.red}18` }}>
              <div style={{ fontFamily: F.body, fontSize: 11, color: C.red, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 6 }}>🎯 Top Priority Fix</div>
              <p style={{ fontFamily: F.display, fontSize: 20, color: C.white, fontWeight: 700, lineHeight: 1.3 }}>{currentResult.faults[0].name}</p>
              <p style={{ fontFamily: F.body, fontSize: 13, color: C.text, marginTop: 8, lineHeight: 1.5 }}>{currentResult.faults[0].fix}</p>
            </Card>
          )}
        </div>
      )}

      {tab === "analysis" && !currentResult && (
        <Card style={{ textAlign: "center", padding: 40, animation: "fadeUp .4s ease" }}>
          <p style={{ fontFamily: F.body, fontSize: 14, color: C.text }}>No swing analyzed yet.</p>
          <Btn onClick={() => setTab("dashboard")} variant="secondary" style={{ marginTop: 12 }}>Go to Home</Btn>
        </Card>
      )}

      {/* ═══ HISTORY ═══ */}
      {tab === "history" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, animation: "fadeUp .4s ease" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontFamily: F.body, fontSize: 13, fontWeight: 700, color: C.white }}>{sessions.length} Sessions</span>
            {sessions.length > 0 && (
              <Btn variant="ghost" onClick={() => { setSessions([]); setCurrentResult(null); }} style={{ fontSize: 11, padding: "4px 10px", color: C.red }}>Clear All</Btn>
            )}
          </div>
          {sessions.length === 0 && (
            <Card style={{ textAlign: "center", padding: 32 }}>
              <p style={{ fontFamily: F.body, fontSize: 13, color: C.muted }}>No sessions recorded yet</p>
            </Card>
          )}
          {sessions.map((s, i) => {
            const scoreColor = s.overallScore >= 85 ? C.accent : s.overallScore >= 70 ? C.gold : s.overallScore >= 55 ? "#e6a030" : C.red;
            return (
              <Card key={i} hover onClick={() => { setCurrentResult(s); setTab("analysis"); }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontFamily: F.display, fontSize: 24, fontWeight: 700, color: scoreColor }}>{s.overallScore}</span>
                      <Badge text={s.clubType.toUpperCase()} small />
                    </div>
                    <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                      {s.tempo !== "—" && <span style={{ fontFamily: F.mono, fontSize: 10, color: C.muted }}>Tempo {s.tempo}</span>}
                      {s.maxSpeed && <span style={{ fontFamily: F.mono, fontSize: 10, color: C.muted }}>{s.maxSpeed}</span>}
                      <span style={{ fontFamily: F.mono, fontSize: 10, color: C.muted }}>{s.faults.length} issues</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                    <span style={{ fontFamily: F.mono, fontSize: 10, color: C.muted }}>{new Date(s.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                    {s.faults[0] && <Badge text={s.faults[0].name} small color={s.faults[0].severity === "high" ? C.red : C.gold} />}
                    <button onClick={(e) => { e.stopPropagation(); say(`Score ${s.overallScore}. ${s.faults[0] ? s.faults[0].vf : "No faults."}`, true); }} style={{ padding: "3px 8px", borderRadius: 4, border: `1px solid ${C.border}`, background: "transparent", color: C.text, fontSize: 10, cursor: "pointer" }}>{"\u{1F50A}"}</button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Footer */}
      <div style={{ marginTop: 40, padding: "20px 0 60px", borderTop: `1px solid ${C.border}`, textAlign: "center" }}>
        <span style={{ fontFamily: F.body, fontSize: 10, color: C.muted }}>
          SwingIQ — Voice-Guided Training
        </span>
      </div>

      {/* Voice bar */}
      {spoken && (
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, padding: "10px 16px", background: `${C.surface}ee`, borderTop: `1px solid ${C.border}`, backdropFilter: "blur(10px)", display: "flex", alignItems: "center", gap: 10, justifyContent: "center", zIndex: 50 }}>
          <span style={{ color: C.accent, fontSize: 14 }}>{"\u{1F50A}"}</span>
          <span style={{ fontFamily: F.body, fontSize: 12, color: C.text, fontStyle: "italic", maxWidth: 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>"{spoken}"</span>
        </div>
      )}
    </div>
  );
}
