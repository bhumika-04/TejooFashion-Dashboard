'use client';

// Lightweight notification helpers: a generated "ping" sound (no asset file needed) and
// browser desktop notifications. Preferences persist in localStorage.

const SOUND_KEY = 'notif.sound';
const DESKTOP_KEY = 'notif.desktop';

export const getSoundEnabled = () =>
  typeof window === 'undefined' ? false : localStorage.getItem(SOUND_KEY) !== 'off';

export const setSoundEnabled = (on: boolean) =>
  localStorage.setItem(SOUND_KEY, on ? 'on' : 'off');

export const getDesktopEnabled = () =>
  typeof window === 'undefined' ? false : localStorage.getItem(DESKTOP_KEY) === 'on';

export const setDesktopEnabled = (on: boolean) =>
  localStorage.setItem(DESKTOP_KEY, on ? 'on' : 'off');

// Reuse a single AudioContext (created lazily after a user gesture, per browser policy).
let audioCtx: AudioContext | null = null;

/** Short two-tone "ping" via the Web Audio API — no sound file required. */
export function playNotificationSound() {
  if (typeof window === 'undefined') return;
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    audioCtx = audioCtx ?? new Ctx();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const now = audioCtx.currentTime;
    const tones = [
      { freq: 880, start: 0,    dur: 0.12 },
      { freq: 1175, start: 0.1, dur: 0.14 },
    ];
    for (const t of tones) {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = t.freq;
      gain.gain.setValueAtTime(0.0001, now + t.start);
      gain.gain.exponentialRampToValueAtTime(0.18, now + t.start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + t.start + t.dur);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(now + t.start);
      osc.stop(now + t.start + t.dur + 0.02);
    }
  } catch { /* audio not available — ignore */ }
}

/** Ask the browser for desktop-notification permission. Returns true if granted. */
export async function ensureDesktopPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const res = await Notification.requestPermission();
  return res === 'granted';
}

/** Show a desktop notification (only when the tab is hidden, to avoid spamming an active user). */
export function showDesktopNotification(title: string, body: string, onClick?: () => void) {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  if (!document.hidden) return; // user is looking at the app — the toast/bell is enough
  try {
    const n = new Notification(title, { body, icon: '/favicon.ico', tag: 'tejoo-msg' });
    if (onClick) n.onclick = () => { window.focus(); onClick(); n.close(); };
  } catch { /* ignore */ }
}
