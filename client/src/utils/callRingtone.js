let audioContext = null;
let ringTimer = null;
let oscillators = [];

const getContext = () => {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!audioContext) audioContext = new Ctx();
  return audioContext;
};

export const unlockCallAudio = async () => {
  const ctx = getContext();
  if (!ctx) return false;
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch {
      return false;
    }
  }
  return ctx.state === 'running';
};

const playTone = (ctx, freq, start, duration, volume = 0.12) => {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(volume, start + 0.02);
  gain.gain.linearRampToValueAtTime(0, start + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.05);
  oscillators.push(osc);
};

const pulse = (ctx) => {
  const t = ctx.currentTime;
  playTone(ctx, 440, t, 0.35);
  playTone(ctx, 480, t + 0.4, 0.35);
  playTone(ctx, 440, t + 0.85, 0.35);
  playTone(ctx, 480, t + 1.25, 0.35);
};

export const playIncomingRing = async () => {
  const ctx = getContext();
  if (!ctx) return;
  await unlockCallAudio();
  stopIncomingRing();
  pulse(ctx);
  ringTimer = window.setInterval(() => {
    if (ctx.state === 'running') pulse(ctx);
  }, 2400);
};

export const stopIncomingRing = () => {
  if (ringTimer) {
    clearInterval(ringTimer);
    ringTimer = null;
  }
  oscillators.forEach((osc) => {
    try {
      osc.stop();
      osc.disconnect();
    } catch {
      /* already stopped */
    }
  });
  oscillators = [];
};
