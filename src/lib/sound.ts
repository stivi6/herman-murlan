"use client";
/** Tiny WebAudio bleeps. Off by default; only plays after a user gesture. */

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new AC();
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function blip(freq: number, durMs: number, delayMs = 0, gain = 0.04) {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime + delayMs / 1000;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + durMs / 1000);
  osc.connect(g).connect(ac.destination);
  osc.start(t);
  osc.stop(t + durMs / 1000 + 0.02);
}

export const sounds = {
  play() {
    blip(520, 90);
    blip(660, 90, 70);
  },
  pass() {
    blip(300, 120);
  },
  win() {
    blip(523, 120);
    blip(659, 120, 110);
    blip(784, 180, 220);
  },
  error() {
    blip(180, 150);
  },
};
