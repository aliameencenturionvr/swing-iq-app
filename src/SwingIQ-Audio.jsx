import { useState, useEffect, useRef, useCallback } from "react";
/*
 * SWINGIQ — Voice-Guided Golf Swing Trainer
 * CV BRIDGE: window.swingIQ.startSession / submitFrame / endSwing
 * Voice interface: all feedback spoken via Web Speech Synthesis
 */
const fontEl = document.createElement("link");
fontEl.href = "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700;900&family=Outfit:wght@300;400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap";
fontEl.rel = "stylesheet";
document.head.appendChild(fontEl);
const globalCSS = document.createElement("style");
globalCSS.textContent = ` @keyframes fadeUp{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}} @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}} @keyframes breathe{0%,100%{box-shadow:0 0 0 0 rgba(184,230,72,.3)}50%{box-shadow:0 0 0 24px rgba(184,230,72,0)}} @keyframes rec{0%,100%{box-shadow:0 0 0 0 rgba(230,60,60,.4)}50%{box-shadow:0 0 0 16px rgba(230,60,60,0)}} @keyframes wave{0%{height:4px}50%{height:var(--h)}100%{height:4px}} @keyframes slideIn{from{opacity:0;transform:translateX(-20px)}to{opacity:1;transform:translateX(0)}} *{box-sizing:border-box;margin:0;padding:0} body{background:#07090a} ::-webkit-scrollbar{width:5px} ::-webkit-scrollbar-thumb{background:#1a2a1e;border-radius:4px}`;
document.head.appendChild(globalCSS);

const C = { bg: "#07090a", surface: "#0c1210", card: "#101c16", accent: "#b8e648", accentDark: "#7aab10", accentGlow: "rgba(184,230,72,.12)", gold: "#f0c030", red: "#e6503c", cyan: "#48d4c0", white: "#ecf4ee", text: "#8fb89a", muted: "#456050", border: "#182820", borderMid: "#203828" };
const F = { display: "'Playfair Display', Georgia, serif", body: "'Outfit', system-ui, sans-serif", mono: "'IBM Plex Mono', monospace" };
const IDEAL = { driver: { setup: { spine: 32, hip: 0, shoulder: 0, knee: 25, elbow: 170, wrist: 165 }, backswing: { spine: 34, hip: 45, shoulder: 90, knee: 28, elbow: 150, wrist: 130 }, top: { spine: 35, hip: 48, shoulder: 100, knee: 30, elbow: 90, wrist: 100 }, downswing: { spine: 30, hip: 20, shoulder: 50, knee: 35, elbow: 140, wrist: 120 }, impact: { spine: 28, hip: -30, shoulder: 0, knee: 32, elbow: 165, wrist: 155 }, finish: { spine: 15, hip: -60, shoulder: -40, knee: 20, elbow: 140, wrist: 160 } }, iron: { setup: { spine: 35, hip: 0, shoulder: 0, knee: 28, elbow: 168, wrist: 162 }, backswing: { spine: 36, hip: 42, shoulder: 85, knee: 30, elbow: 148, wrist: 125 }, top: { spine: 37, hip: 45, shoulder: 95, knee: 32, elbow: 88, wrist: 95 }, downswing: { spine: 33, hip: 18, shoulder: 45, knee: 38, elbow: 138, wrist: 115 }, impact: { spine: 30, hip: -28, shoulder: -5, knee: 35, elbow: 170, wrist: 158 }, finish: { spine: 18, hip: -55, shoulder: -35, knee: 22, elbow: 135, wrist: 158 } }, wedge: { setup: { spine: 36, hip: 0, shoulder: 0, knee: 30, elbow: 165, wrist: 160 }, backswing: { spine: 37, hip: 35, shoulder: 75, knee: 32, elbow: 145, wrist: 120 }, top: { spine: 38, hip: 38, shoulder: 82, knee: 34, elbow: 95, wrist: 100 }, downswing: { spine: 34, hip: 15, shoulder: 38, knee: 40, elbow: 135, wrist: 112 }, impact: { spine: 32, hip: -25, shoulder: -8, knee: 38, elbow: 172, wrist: 160 }, finish: { spine: 22, hip: -48, shoulder: -30, knee: 24, elbow: 130, wrist: 155 } } };
const PHASES = ["setup", "backswing", "top", "downswing", "impact", "finish"];
const PL = { setup: "Setup", backswing: "Backswing", top: "Top", downswing: "Downswing", impact: "Impact", finish: "Finish" };
const FAULTS = [
  { id: "ott", name: "Over the Top", ck: p => p.downswing && p.downswing.shoulder > 60, phase: "downswing", sev: "high", fix: "Drop hands inside. Trail elbow tucks to hip before rotating.", drill: "Slot Drill", vf: "You're coming over the top. Focus on dropping your hands inside on the downswing." },
  { id: "earlyExt", name: "Early Extension", ck: p => p.impact && p.impact.spine < 22, phase: "impact", sev: "high", fix: "Maintain spine angle through impact. Keep hips back.", drill: "Chair Drill", vf: "You're standing up too early at impact. Maintain your spine angle through the ball." },
  { id: "sway", name: "Lateral Sway", ck: p => p.backswing && p.backswing.hip < 30, phase: "backswing", sev: "medium", fix: "Rotate hips, don't slide. Pressure inside trail foot.", drill: "Headcover Drill", vf: "You're swaying instead of rotating. Focus on turning your hips, not sliding." },
  { id: "cast", name: "Casting", ck: p => p.downswing && p.downswing.wrist > 140, phase: "downswing", sev: "high", fix: "Maintain wrist hinge deeper into downswing. Hands lead clubhead.", drill: "Pump Drill", vf: "You're casting early. Keep your wrist hinge longer. Let your hands lead the club." },
  { id: "chicken", name: "Chicken Wing", ck: p => p.finish && p.finish.elbow < 120, phase: "finish", sev: "medium", fix: "Extend lead arm fully through the ball.", drill: "Towel Drill", vf: "Your lead arm is collapsing through impact. Work on full extension." },
  { id: "revPivot", name: "Reverse Pivot", ck: p => p.top && p.top.spine > 40, phase: "top", sev: "high", fix: "Keep weight centered at top. Head behind ball.", drill: "Step Drill", vf: "You have a reverse pivot. Keep your weight behind the ball at the top." },
  { id: "posture", name: "Loss of Posture", ck: p => p.impact && Math.abs((p.impact.spine || 30) - (p.setup?.spine || 32)) > 10, phase: "impact", sev: "medium", fix: "Maintain consistent spine angle setup through impact.", drill: "Spine Stick Drill", vf: "You're losing posture through the swing. Keep spine angle consistent." },
  { id: "flat", name: "Flat Shoulder Turn", ck: p => p.top && p.top.shoulder < 75, phase: "top", sev: "low", fix: "Lead shoulder works under chin for fuller turn.", drill: "Cross Arms Turn", vf: "Your shoulder turn is flat. Get your lead shoulder under your chin." }
];
const DRILLS = {
  "Slot Drill": { dur: "10 min", lv: "Intermediate", desc: "Pause at top, trail elbow slots to hip before rotating.", vg: "Slot Drill. Take your backswing. Pause at the top. Feel your trail elbow drop straight down to your hip. Then rotate through. Repeat ten times." },
  "Chair Drill": { dur: "10 min", lv: "Beginner", desc: "Glutes touching chair at address. Maintain contact through swing.", vg: "Chair Drill. Place a chair behind you so your glutes just touch it. Swing while keeping contact with the chair. This prevents early extension." },
  "Headcover Drill": { dur: "10 min", lv: "Beginner", desc: "Headcover under trail foot outside edge. Maintain pressure.", vg: "Headcover drill. Place a headcover under the outside of your trail foot. Swing while keeping pressure on it. This trains hip rotation instead of sway." },
  "Pump Drill": { dur: "15 min", lv: "Intermediate", desc: "3 partial downswings keeping wrist hinge, release on 4th.", vg: "Pump Drill. Take your backswing. Make three small pumps to hip height keeping your wrist hinge. On the fourth, release fully through the ball." },
  "Towel Drill": { dur: "10 min", lv: "Beginner", desc: "Towel under both armpits. Swing without dropping it.", vg: "Towel drill. Tuck a towel under both armpits. Make half swings without letting it drop. This keeps your arms connected." },
  "Step Drill": { dur: "15 min", lv: "Intermediate", desc: "Feet together at setup. Step lead foot to start downswing.", vg: "Step Drill. Start with feet together. Take your backswing. Step your lead foot toward the target to start down. This trains weight shift." },
  "Spine Stick Drill": { dur: "10 min", lv: "Advanced", desc: "Alignment stick along spine. Maintain contact through impact.", vg: "Spine Stick Drill. Hold an alignment stick along your spine. Swing while keeping the stick in contact with your back through impact." },
  "Cross Arms Turn": { dur: "10 min", lv: "Beginner", desc: "Cross arms on chest, rotate. Lead shoulder under chin.", vg: "Cross Arms Turn. Cross your arms on your chest. Take your stance. Rotate back feeling your lead shoulder under your chin. Hold. Rotate through. Repeat." },
  "9-to-3 Swings": { dur: "15 min", lv: "Beginner", desc: "Half swings focusing on center contact.", vg: "9 to 3 drill. Half swings. Hands to 9 o'clock back, 3 o'clock through. Focus on center face contact." },
  "Pause at Top": { dur: "10 min", lv: "Intermediate", desc: "Full backswing, hold 2 seconds, swing through.", vg: "Pause at Top. Full backswing. Hold two seconds. Feel weight in your trail side. Swing through. Improves transition." },
  "Impact Bag": { dur: "15 min", lv: "Advanced", desc: "Strike bag with forward shaft lean and compression.", vg: "Impact Bag drill. Hit the bag with hands ahead of the clubhead. Feel forward shaft lean and body rotation through impact." },
  "Alignment Gate": { dur: "15 min", lv: "Intermediate", desc: "Two tees wider than clubhead on target line.", vg: "Alignment Gate. Two tees wider than your clubhead on the target line. Swing through the gate. Trains your path." }
};

// ── Voice & Sound ───────────────────────────────────────────
class Voice {
  constructor() { this.s = window.speechSynthesis; this.q = []; this.busy = false; this.on = true; this.v = null; const p = () => { const vs = this.s.getVoices(); this.v = vs.find(x => x.name.includes("Samantha")) || vs.find(x => /google/i.test(x.name) && x.lang.startsWith("en")) || vs.find(x => x.lang.startsWith("en-") && x.localService) || vs.find(x => x.lang.startsWith("en")) || vs[0]; }; p(); if (this.s.onvoiceschanged !== undefined) this.s.onvoiceschanged = p; }
  say(t, pri = false) { if (!this.on || !t) return; if (pri) { this.s.cancel(); this.q = []; } this.q.push(t); this._d(); }
  _d() { if (this.busy || !this.q.length) return; this.busy = true; const u = new SpeechSynthesisUtterance(this.q.shift()); u.rate = 0.95; if (this.v) u.voice = this.v; u.onend = () => { this.busy = false; this._d(); }; u.onerror = () => { this.busy = false; this._d(); }; this.s.speak(u); }
  stop() { this.s.cancel(); this.q = []; this.busy = false; }
  toggle() { this.on = !this.on; if (!this.on) this.stop(); return this.on; }
}

class Sound {
  constructor() { this.ctx = null; this.on = true; }
  _e() { if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)(); if (this.ctx.state === "suspended") this.ctx.resume(); }
  b(f = 880, d = .12, v = .3) { if (!this.on) return; this._e(); const o = this.ctx.createOscillator(), g = this.ctx.createGain(); o.type = "sine"; o.frequency.value = f; g.gain.setValueAtTime(v, this.ctx.currentTime); g.gain.exponentialRampToValueAtTime(.001, this.ctx.currentTime + d); o.connect(g); g.connect(this.ctx.destination); o.start(); o.stop(this.ctx.currentTime + d); }
  ready() { this.b(660, .15, .2); setTimeout(() => this.b(880, .15, .2), 180); }
  swing() { this.b(1100, .08, .25); setTimeout(() => this.b(1320, .08, .25), 100); setTimeout(() => this.b(1540, .12, .3), 200); }
  good() { this.b(523, .1, .2); setTimeout(() => this.b(659, .1, .2), 120); setTimeout(() => this.b(784, .2, .25), 240); }
  great() { this.b(523, .08, .2); setTimeout(() => this.b(659, .08, .2), 100); setTimeout(() => this.b(784, .08, .2), 200); setTimeout(() => this.b(1047, .25, .3), 300); }
  alert() { this.b(440, .15, .2); setTimeout(() => this.b(370, .2, .2), 180); }
  tick() { this.b(1000, .04, .15); }
  phase() { this.b(700, .06, .15); }
}

let _voice = null, _sound = null;
function gv() { if (!_voice) _voice = new Voice(); return _voice; }
function gs() { if (!_sound) _sound = new Sound(); return _sound; }

// ── Analysis ────────────────────────────────────────────────
const AKEYS = ["spine", "hip", "shoulder", "knee", "elbow", "wrist"];
const FRAME_KEYS = { spineAngle: "spine", hipRotation: "hip", shoulderRotation: "shoulder", kneeFlexion: "knee", elbowAngle: "elbow", wristAngle: "wrist" };

function analyze(frames, club = "driver") {
  const ideal = IDEAL[club] || IDEAL.driver;
  const byPhase = {};
  for (const fr of frames) {
    if (!fr.phase || !fr.angles) continue;
    if (!byPhase[fr.phase]) byPhase[fr.phase] = [];
    const mapped = {};
    for (const [k, v] of Object.entries(fr.angles)) { mapped[FRAME_KEYS[k] || k] = v; }
    byPhase[fr.phase].push(mapped);
  }
  const avg = {};
  for (const [ph, list] of Object.entries(byPhase)) { const a = {}; for (const k of AKEYS) { const vals = list.map(x => x[k]).filter(v => typeof v === "number"); a[k] = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0; } avg[ph] = a; }
  const scores = {}; let tw = 0, ws = 0;
  const wt = { setup: 1, backswing: 1.2, top: 1.3, downswing: 1.5, impact: 2, finish: .8 };
  for (const ph of PHASES) {
    if (!avg[ph]) { scores[ph] = null; continue; }
    const id = ideal[ph]; if (!id) { scores[ph] = null; continue; }
    let d = 0, c = 0;
    for (const k of AKEYS) { if (avg[ph][k] !== undefined && id[k] !== undefined) { d += Math.max(0, 1 - Math.abs(avg[ph][k] - id[k]) / (Math.abs(id[k]) * .5 || 25)); c++; } }
    const s = c > 0 ? Math.round((d / c) * 100) : 50; scores[ph] = Math.min(100, Math.max(0, s)); const w = wt[ph] || 1; ws += s * w; tw += w;
  }
  const overall = tw > 0 ? Math.round(ws / tw) : 0;
  const faults = FAULTS.filter(f => { try { return f.ck(avg); } catch { return false; } }).sort((a, b) => ({ high: 3, medium: 2, low: 1 }[b.sev] || 0) - ({ high: 3, medium: 2, low: 1 }[a.sev] || 0));
  let tempo = null;
  const sf = frames.filter(f => f.phase === "setup"), imf = frames.filter(f => f.phase === "impact");
  if (sf.length && imf.length) { const tot = imf[imf.length - 1].timestamp - sf[0].timestamp; const bk = (frames.find(f => f.phase === "top")?.timestamp || 0) - sf[0].timestamp; const dn = tot - bk; if (dn > 0) tempo = `${(bk / dn).toFixed(1)} to 1`; }
  const spd = frames.filter(f => f.clubData?.clubheadSpeed);
  const maxSpd = spd.length ? Math.round(Math.max(...spd.map(f => f.clubData.clubheadSpeed))) : null;
  const drills = faults.slice(0, 3).map(f => f.drill).filter(Boolean);
  if (!drills.length) drills.push("9-to-3 Swings", "Pause at Top");
  return { overall, scores, avg, faults, tempo, maxSpd, drills, club, ts: Date.now() };
}

// ── Components ──────────────────────────────────────────────
function Ring({ score, size = 130, sw = 9, delay = 0 }) {
  const [v, setV] = useState(0); const r = (size - sw) / 2, ci = 2 * Math.PI * r;
  const col = score >= 85 ? C.accent : score >= 70 ? C.gold : score >= 55 ? "#e6a030" : C.red;
  useEffect(() => { const t = setTimeout(() => { let c = 0; const tick = () => { c += 1.5; if (c >= score) { setV(score); return; } setV(Math.round(c)); requestAnimationFrame(tick); }; tick(); }, delay); return () => clearTimeout(t); }, [score, delay]);
  return (<div style={{ position: "relative", width: size, height: size }}><svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}><circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={C.border} strokeWidth={sw} /><circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={col} strokeWidth={sw} strokeDasharray={ci} strokeDashoffset={ci - (v / 100) * ci} strokeLinecap="round" style={{ transition: "stroke-dashoffset .08s linear", filter: `drop-shadow(0 0 10px ${col}50)` }} /></svg><div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}><span style={{ fontFamily: F.display, fontSize: size * .3, fontWeight: 700, color: col, lineHeight: 1 }}>{v}</span><span style={{ fontFamily: F.body, fontSize: 10, color: C.muted, marginTop: 2 }}>/100</span></div></div>);
}

function PBar({ phase, score, delay = 0 }) {
  const [w, setW] = useState(0); const col = score >= 85 ? C.accent : score >= 70 ? C.gold : score >= 55 ? "#e6a030" : C.red;
  useEffect(() => { const t = setTimeout(() => setW(score), delay); return () => clearTimeout(t); }, [score, delay]);
  return (<div style={{ display: "flex", alignItems: "center", gap: 10 }}><span style={{ fontFamily: F.body, fontSize: 12, color: C.text, width: 78, textAlign: "right", fontWeight: 500 }}>{PL[phase]}</span><div style={{ flex: 1, height: 7, background: C.border, borderRadius: 4, overflow: "hidden" }}><div style={{ height: "100%", width: `${w}%`, background: `linear-gradient(90deg,${col}90,${col})`, borderRadius: 4, transition: "width .7s cubic-bezier(.4,0,.2,1)" }} /></div><span style={{ fontFamily: F.mono, fontSize: 12, color: col, width: 28, fontWeight: 500 }}>{score}</span></div>);
}

const Cd = ({ children, style: s }) => <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 22, ...s }}>{children}</div>;
const Bg = ({ text, color: cl = C.accent, small }) => <span style={{ fontFamily: F.body, fontSize: small ? 10 : 11, fontWeight: 600, color: cl, background: `${cl}15`, border: `1px solid ${cl}28`, padding: small ? "2px 7px" : "3px 10px", borderRadius: 16, whiteSpace: "nowrap" }}>{text}</span>;
const Dot = ({ s }) => { const c = s === "high" ? C.red : s === "medium" ? C.gold : C.accent; return <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: c, boxShadow: `0 0 6px ${c}60`, flexShrink: 0, marginTop: 5 }} />; };
const Wave = ({ on }) => <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 3, height: 40 }}>{Array.from({ length: 24 }).map((_, i) => <div key={i} style={{ width: 3, borderRadius: 2, background: on ? C.accent : C.muted, height: on ? undefined : 4, animation: on ? `wave ${.4 + Math.random() * .5}s ease-in-out infinite alternate` : "none", animationDelay: `${i * .04}s`, "--h": `${8 + Math.random() * 28}px` }} />)}</div>;
const VB = ({ text, icon = "\u{1F50A}" }) => <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", background: `${C.accent}08`, border: `1px solid ${C.accent}15`, borderRadius: 10, animation: "slideIn .3s ease" }}><span style={{ fontSize: 18 }}>{icon}</span><span style={{ fontFamily: F.body, fontSize: 13, color: C.text, fontWeight: 500, fontStyle: "italic" }}>"{text}"</span></div>;

// ── Main App ────────────────────────────────────────────────
export default function SwingIQ() {
  const [scr, setScr] = useState("home");
  const [sessions, setSess] = useState([]);
  const [res, setRes] = useState(null);
  const [club, setClub] = useState("driver");
  const [ss, setSS] = useState("idle");
  const [cp, setCP] = useState(null);
  const [spoken, setSpoken] = useState("");
  const [vOn, setVO] = useState(true);
  const [sOn, setSO] = useState(true);
  const [drill, setDrill] = useState(null);
  const fr = useRef([]);
  const lp = useRef(null);

  const say = useCallback((t, pri = false) => { setSpoken(t); gv().say(t, pri); }, []);

  useEffect(() => {
    window.swingIQ = {
      startSession: (c) => { setClub(c || "driver"); setSS("recording"); setCP(null); fr.current = []; lp.current = null; setScr("session"); gs().swing(); say(`Recording. Swing your ${c || "driver"} when ready.`, true); },
      submitFrame: (fd) => { fr.current.push(fd); if (fd.phase && fd.phase !== lp.current) { lp.current = fd.phase; setCP(fd.phase); gs().phase(); } },
      endSwing: () => {
        setSS("analyzing"); say("Analyzing your swing.", true);
        const r = analyze(fr.current, club);
        setTimeout(() => {
          setRes(r); setSess(p => [r, ...p].slice(0, 50)); setSS("idle"); setScr("analysis");
          const g = r.overall >= 85 ? "Excellent" : r.overall >= 75 ? "Good" : r.overall >= 60 ? "Needs work" : "Let's improve this";
          if (r.overall >= 85) gs().great(); else if (r.overall >= 70) gs().good(); else gs().alert();
          say(`Score: ${r.overall}. ${g}.`);
          if (r.faults.length > 0) setTimeout(() => say(r.faults[0].vf), 3000);
          else setTimeout(() => say("Clean swing. No major faults detected."), 3000);
          if (r.tempo) setTimeout(() => say(`Tempo was ${r.tempo}.`), 6000);
          if (window.swingIQ.onAnalysisComplete) window.swingIQ.onAnalysisComplete(r);
        }, 500); return r;
      },
      onAnalysisComplete: null
    };
    return () => { delete window.swingIQ; };
  }, [club, say]);

  const begin = useCallback(() => {
    setScr("session"); setSS("calibrating"); gs().ready();
    say(`Starting session with ${club}. Get into your address position. Make sure your full body is visible.`, true);
    setTimeout(() => { setSS("ready"); gs().tick(); say("Good. Hold your setup.", true); }, 5000);
    setTimeout(() => { setSS("recording"); fr.current = []; lp.current = null; setCP(null); gs().swing(); say("Swing now.", true); }, 8000);
  }, [club, say]);

  const playDrill = useCallback((n) => { const d = DRILLS[n]; if (!d) return; setDrill(n); gs().ready(); say(d.vg, true); }, [say]);
  const avg = sessions.length ? Math.round(sessions.reduce((s, r) => s + r.overall, 0) / sessions.length) : 0;

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.white, fontFamily: F.body, maxWidth: 520, margin: "0 auto", padding: "0 16px 80px" }}>
      {/* Header */}
      <div style={{ padding: "20px 0 6px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div><h1 style={{ fontFamily: F.display, fontSize: 28, fontWeight: 700 }}>Swing<span style={{ color: C.accent }}>IQ</span></h1>
          <p style={{ fontFamily: F.body, fontSize: 10, color: C.muted, letterSpacing: 2, textTransform: "uppercase", marginTop: 2 }}>Voice-Guided Training</p></div>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={() => { const o = gv().toggle(); setVO(o); }} style={{ width: 36, height: 36, borderRadius: 10, border: `1px solid ${C.border}`, background: vOn ? `${C.accent}14` : C.surface, color: vOn ? C.accent : C.muted, fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>{vOn ? "\u{1F50A}" : "\u{1F507}"}</button>
          <button onClick={() => { gs().on = !gs().on; setSO(gs().on); }} style={{ width: 36, height: 36, borderRadius: 10, border: `1px solid ${C.border}`, background: sOn ? `${C.accent}14` : C.surface, color: sOn ? C.accent : C.muted, fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>{"\u266A"}</button>
        </div></div>

      {/* Nav */}
      {scr !== "session" && <div style={{ display: "flex", gap: 2, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 3, margin: "10px 0 18px" }}>
        {[{ id: "home", l: "Home", i: "\u2B21" }, { id: "analysis", l: "Analysis", i: "\u25CE" }, { id: "drills", l: "Drills", i: "\u25C6" }, { id: "history", l: "History", i: "\u2637" }].map(t =>
          <button key={t.id} onClick={() => setScr(t.id)} style={{ flex: 1, padding: "9px 4px", borderRadius: 9, border: "none", cursor: "pointer", background: scr === t.id ? `${C.accent}14` : "transparent", color: scr === t.id ? C.accent : C.muted, fontFamily: F.body, fontSize: 11, fontWeight: 600, display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}><span style={{ fontSize: 14 }}>{t.i}</span>{t.l}</button>)}
      </div>}

      {/* HOME */}
      {scr === "home" && <div style={{ display: "flex", flexDirection: "column", gap: 16, animation: "fadeUp .4s ease" }}>
        <Cd><span style={{ fontFamily: F.body, fontSize: 12, color: C.muted, fontWeight: 500, marginBottom: 10, display: "block" }}>Select Club</span>
          <div style={{ display: "flex", gap: 8 }}>{["driver", "iron", "wedge"].map(c =>
            <button key={c} onClick={() => { setClub(c); gs().tick(); say(`${c} selected.`); }} style={{ flex: 1, padding: "14px 8px", borderRadius: 10, border: `2px solid ${club === c ? C.accent : C.border}`, background: club === c ? `${C.accent}14` : "transparent", color: club === c ? C.accent : C.text, fontFamily: F.body, fontSize: 14, fontWeight: 700, cursor: "pointer", textTransform: "capitalize" }}>{c}</button>)}</div></Cd>

        <button onClick={begin} style={{ width: "100%", padding: "28px 20px", borderRadius: 16, border: "none", background: `linear-gradient(135deg,${C.accent},${C.accentDark})`, color: C.bg, fontFamily: F.display, fontSize: 22, fontWeight: 700, cursor: "pointer", animation: "breathe 3s ease infinite", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 36 }}>{"\u26F3"}</span>Start Session
          <span style={{ fontFamily: F.body, fontSize: 12, fontWeight: 500, opacity: .7 }}>Voice-guided swing analysis</span></button>

        {sessions.length > 0 && <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          {[{ l: "Swings", v: sessions.length, c: C.text }, { l: "Average", v: avg, c: avg >= 80 ? C.accent : C.gold }, { l: "Best", v: Math.max(...sessions.map(s => s.overall)), c: C.accent }].map((s, i) =>
            <Cd key={i} style={{ padding: 14, textAlign: "center" }}><div style={{ fontFamily: F.display, fontSize: 26, fontWeight: 700, color: s.c }}>{s.v}</div><div style={{ fontFamily: F.body, fontSize: 10, color: C.muted, marginTop: 2 }}>{s.l}</div></Cd>)}</div>}

        {spoken && <VB text={spoken} />}

        {res?.faults?.length > 0 && <Cd>
          <span style={{ fontFamily: F.body, fontSize: 13, fontWeight: 700, color: C.white, marginBottom: 10, display: "block" }}>Focus Areas</span>
          {res.faults.slice(0, 2).map((f, i) => <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 8 }}>
            <Dot s={f.sev} /><div><span style={{ fontFamily: F.body, fontSize: 13, color: C.white, fontWeight: 600 }}>{f.name}</span><p style={{ fontFamily: F.body, fontSize: 11, color: C.muted, marginTop: 2 }}>{f.fix}</p></div></div>)}</Cd>}
      </div>}

      {/* SESSION */}
      {scr === "session" && <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "70vh", gap: 24, animation: "fadeUp .3s ease" }}>
        <div style={{ width: 180, height: 180, borderRadius: "50%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: ss === "recording" ? `${C.red}12` : ss === "ready" ? `${C.accent}12` : `${C.cyan}08`, border: `3px solid ${ss === "recording" ? C.red : ss === "ready" ? C.accent : C.cyan}30`, animation: ss === "recording" ? "rec 1.5s infinite" : ss === "ready" ? "breathe 2s infinite" : "none" }}>
          <span style={{ fontSize: 48 }}>{ss === "calibrating" ? "\u{1F4F7}" : ss === "ready" ? "\u26F3" : ss === "recording" ? "\u{1F3CC}\uFE0F" : "\u2699\uFE0F"}</span>
          <span style={{ fontFamily: F.body, fontSize: 14, fontWeight: 700, marginTop: 8, color: ss === "recording" ? C.red : ss === "ready" ? C.accent : C.cyan }}>{ss === "calibrating" ? "CALIBRATING" : ss === "ready" ? "GET READY" : ss === "recording" ? "RECORDING" : "ANALYZING"}</span></div>
        <Wave on={ss === "recording" || ss === "calibrating"} />
        {cp && ss === "recording" && <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "center" }}>
          {PHASES.map(p => <div key={p} style={{ padding: "6px 12px", borderRadius: 8, fontFamily: F.body, fontSize: 11, fontWeight: 600, background: cp === p ? `${C.accent}20` : C.surface, color: cp === p ? C.accent : C.muted, border: `1px solid ${cp === p ? C.accent + "40" : C.border}` }}>{PL[p]}</div>)}</div>}
        {spoken && <div style={{ maxWidth: 320, textAlign: "center" }}><VB text={spoken} icon={ss === "recording" ? "\u{1F534}" : "\u{1F50A}"} /></div>}
        <button onClick={() => { gv().stop(); setSS("idle"); setScr("home"); }} style={{ padding: "10px 24px", borderRadius: 10, border: `1px solid ${C.border}`, background: "transparent", color: C.muted, fontFamily: F.body, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Cancel Session</button>
      </div>}

      {/* ANALYSIS */}
      {scr === "analysis" && res && <div style={{ display: "flex", flexDirection: "column", gap: 16, animation: "fadeUp .4s ease" }}>
        <Cd style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "28px 22px", background: `linear-gradient(170deg,${C.card} 0%,${C.surface} 100%)`, boxShadow: `0 0 30px ${C.accentGlow}` }}>
          <div style={{ fontFamily: F.body, fontSize: 11, color: C.muted, letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>Swing Score</div>
          <Ring score={res.overall} size={150} sw={10} />
          <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap", justifyContent: "center" }}>
            <Bg text={res.club.toUpperCase()} />{res.tempo && <Bg text={`Tempo ${res.tempo}`} color={C.gold} />}{res.maxSpd && <Bg text={`${res.maxSpd} mph`} color={C.cyan} />}</div>
          <button onClick={() => { const g = res.overall >= 85 ? "Excellent" : res.overall >= 75 ? "Good" : "Needs work"; say(`Score: ${res.overall}. ${g}.${res.faults[0] ? " " + res.faults[0].vf : " No major faults."}`, true); }} style={{ marginTop: 14, padding: "8px 20px", borderRadius: 8, border: `1px solid ${C.accent}30`, background: `${C.accent}10`, color: C.accent, fontFamily: F.body, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{"\u{1F50A}"} Hear Analysis Again</button>
        </Cd>

        <Cd><span style={{ fontFamily: F.body, fontSize: 13, fontWeight: 700, color: C.white, display: "block", marginBottom: 12 }}>Phase Breakdown</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {PHASES.map((ph, i) => res.scores[ph] != null && <PBar key={ph} phase={ph} score={res.scores[ph]} delay={i * 80} />)}</div></Cd>

        {res.faults.length > 0 && <Cd>
          <span style={{ fontFamily: F.body, fontSize: 13, fontWeight: 700, color: C.white, display: "block", marginBottom: 12 }}>Issues ({res.faults.length})</span>
          {res.faults.map((f, i) => <div key={i} style={{ padding: 14, background: C.surface, borderRadius: 10, border: `1px solid ${f.sev === "high" ? C.red + "20" : C.border}`, marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}><Dot s={f.sev} /><span style={{ fontFamily: F.body, fontSize: 14, color: C.white, fontWeight: 600 }}>{f.name}</span><Bg text={f.sev} color={f.sev === "high" ? C.red : f.sev === "medium" ? C.gold : C.accent} small /></div>
            <p style={{ fontFamily: F.body, fontSize: 12, color: C.text, lineHeight: 1.5, marginBottom: 8 }}>{f.fix}</p>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => say(f.vf, true)} style={{ padding: "5px 12px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.surface, color: C.text, fontFamily: F.body, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>{"\u{1F50A}"} Hear Fix</button>
              {f.drill && <button onClick={() => { setDrill(f.drill); setScr("drills"); playDrill(f.drill); }} style={{ padding: "5px 12px", borderRadius: 6, border: `1px solid ${C.accent}30`, background: `${C.accent}10`, color: C.accent, fontFamily: F.body, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>{"\u25C6"} Start Drill</button>}
            </div></div>)}</Cd>}

        <button onClick={begin} style={{ width: "100%", padding: "16px", borderRadius: 12, border: "none", background: `linear-gradient(135deg,${C.accent},${C.accentDark})`, color: C.bg, fontFamily: F.body, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>{"\u26F3"} Next Swing</button>
      </div>}
      {scr === "analysis" && !res && <Cd style={{ textAlign: "center", padding: 40 }}><p style={{ fontFamily: F.body, fontSize: 14, color: C.text }}>No swing analyzed yet</p><button onClick={() => setScr("home")} style={{ marginTop: 14, padding: "10px 24px", borderRadius: 10, border: `1px solid ${C.borderMid}`, background: C.card, color: C.accent, fontFamily: F.body, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Go to Home</button></Cd>}

      {/* DRILLS */}
      {scr === "drills" && <div style={{ display: "flex", flexDirection: "column", gap: 14, animation: "fadeUp .4s ease" }}>
        {drill && DRILLS[drill] && <Cd style={{ border: `1px solid ${C.accent}30`, boxShadow: `0 0 24px ${C.accentGlow}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ fontFamily: F.body, fontSize: 10, color: C.accent, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" }}>Now Playing</span>
            <button onClick={() => { gv().stop(); setDrill(null); }} style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${C.border}`, background: "transparent", color: C.muted, fontFamily: F.body, fontSize: 10, cursor: "pointer" }}>Stop</button></div>
          <span style={{ fontFamily: F.body, fontSize: 18, color: C.white, fontWeight: 700, display: "block", marginBottom: 6 }}>{drill}</span>
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}><Bg text={DRILLS[drill].dur} small color={C.cyan} /><Bg text={DRILLS[drill].lv} small color={C.gold} /></div>
          <Wave on={true} />
          <p style={{ fontFamily: F.body, fontSize: 13, color: C.text, lineHeight: 1.6, marginTop: 10 }}>{DRILLS[drill].desc}</p>
          <button onClick={() => playDrill(drill)} style={{ marginTop: 12, width: "100%", padding: "10px", borderRadius: 8, border: `1px solid ${C.accent}30`, background: `${C.accent}10`, color: C.accent, fontFamily: F.body, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>{"\u{1F50A}"} Replay Voice Guide</button></Cd>}

        {res?.drills?.length > 0 && <><span style={{ fontFamily: F.body, fontSize: 13, fontWeight: 700, color: C.white }}>Recommended</span>
          {res.drills.map((n, i) => { const d = DRILLS[n]; if (!d) return null; return (
            <Cd key={i}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div><span style={{ fontFamily: F.body, fontSize: 14, color: C.white, fontWeight: 600 }}>{n}</span><div style={{ display: "flex", gap: 6, marginTop: 4 }}><Bg text={d.dur} small color={C.cyan} /><Bg text={d.lv} small /></div></div>
              <button onClick={() => playDrill(n)} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: C.accent, color: C.bg, fontFamily: F.body, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{"\u{1F50A}"} Start</button></div></Cd>); })}</>}

        <span style={{ fontFamily: F.body, fontSize: 13, fontWeight: 700, color: C.white, marginTop: 8 }}>All Drills</span>
        {Object.entries(DRILLS).map(([n, d]) =>
          <Cd key={n}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ flex: 1 }}><span style={{ fontFamily: F.body, fontSize: 14, color: C.white, fontWeight: 600 }}>{n}</span><div style={{ display: "flex", gap: 6, marginTop: 4 }}><Bg text={d.dur} small color={C.cyan} /><Bg text={d.lv} small color={d.lv === "Advanced" ? C.gold : C.accent} /></div>
              <p style={{ fontFamily: F.body, fontSize: 12, color: C.muted, marginTop: 6, lineHeight: 1.4 }}>{d.desc}</p></div>
            <button onClick={() => playDrill(n)} style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${C.borderMid}`, background: C.card, color: C.accent, fontFamily: F.body, fontSize: 11, fontWeight: 700, cursor: "pointer", flexShrink: 0, marginLeft: 10 }}>{"\u{1F50A}"}</button></div></Cd>)}
      </div>}

      {/* HISTORY */}
      {scr === "history" && <div style={{ display: "flex", flexDirection: "column", gap: 12, animation: "fadeUp .4s ease" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontFamily: F.body, fontSize: 13, fontWeight: 700, color: C.white }}>{sessions.length} Sessions</span>
          {sessions.length > 0 && <button onClick={() => { setSess([]); setRes(null); say("History cleared."); }} style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${C.red}20`, background: "transparent", color: C.red, fontFamily: F.body, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Clear</button>}</div>
        {!sessions.length && <Cd style={{ textAlign: "center", padding: 32 }}><p style={{ fontFamily: F.body, fontSize: 13, color: C.muted }}>No sessions yet. Start swinging.</p></Cd>}
        {sessions.map((s, i) => { const sc = s.overall >= 85 ? C.accent : s.overall >= 70 ? C.gold : s.overall >= 55 ? "#e6a030" : C.red; return (
          <Cd key={i} style={{ cursor: "pointer" }}><div onClick={() => { setRes(s); setScr("analysis"); }} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div><div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ fontFamily: F.display, fontSize: 24, fontWeight: 700, color: sc }}>{s.overall}</span><Bg text={s.club.toUpperCase()} small /></div>
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>{s.tempo && <span style={{ fontFamily: F.mono, fontSize: 10, color: C.muted }}>Tempo {s.tempo}</span>}<span style={{ fontFamily: F.mono, fontSize: 10, color: C.muted }}>{s.faults.length} issues</span></div></div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
              <span style={{ fontFamily: F.mono, fontSize: 10, color: C.muted }}>{new Date(s.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
              <button onClick={(e) => { e.stopPropagation(); say(`Score ${s.overall}. ${s.faults[0] ? s.faults[0].vf : "No faults."}`, true); }} style={{ padding: "3px 8px", borderRadius: 4, border: `1px solid ${C.border}`, background: "transparent", color: C.text, fontSize: 10, cursor: "pointer" }}>{"\u{1F50A}"}</button>
            </div></div></Cd>); })}
      </div>}

      {/* Voice bar */}
      {spoken && scr !== "session" && <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, padding: "10px 16px", background: `${C.surface}ee`, borderTop: `1px solid ${C.border}`, backdropFilter: "blur(10px)", display: "flex", alignItems: "center", gap: 10, justifyContent: "center" }}>
        <span style={{ color: C.accent, fontSize: 14 }}>{"\u{1F50A}"}</span>
        <span style={{ fontFamily: F.body, fontSize: 12, color: C.text, fontStyle: "italic", maxWidth: 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>"{spoken}"</span></div>}

    </div>);
}
