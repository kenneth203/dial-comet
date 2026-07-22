// Generates a short ping sound using the Web Audio API
let audioCtx: AudioContext | null = null;
let userHasInteracted = false;

// Track user interaction so we know AudioContext can be used
if (typeof window !== 'undefined') {
  const markInteracted = () => {
    userHasInteracted = true;
    // Initialize AudioContext on first interaction
    if (!audioCtx) {
      try {
        audioCtx = new AudioContext();
      } catch (_) {}
    }
    if (audioCtx?.state === 'suspended') {
      audioCtx.resume();
    }
  };
  window.addEventListener('click', markInteracted, { once: false, passive: true });
  window.addEventListener('keydown', markInteracted, { once: false, passive: true });
  window.addEventListener('touchstart', markInteracted, { once: false, passive: true });
}

export function playNotificationPing() {
  try {
    if (!audioCtx) {
      audioCtx = new AudioContext();
    }

    // Resume if suspended (browsers require user gesture)
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
      // If we can't resume, skip this ping
      if (!userHasInteracted) return;
    }

    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    // Pleasant ping tone
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
    oscillator.frequency.setValueAtTime(1320, audioCtx.currentTime + 0.08); // E6

    gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);

    oscillator.start(audioCtx.currentTime);
    oscillator.stop(audioCtx.currentTime + 0.4);
  } catch (e) {
    // Silently fail if audio isn't available
    console.debug('Notification ping failed:', e);
  }
}
