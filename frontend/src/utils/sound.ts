/**
 * Sound notification system for Restaurant POS.
 *
 * Uses the Web Audio API to synthesize clean, crisp, restaurant-grade service bell chimes.
 * Handles browser autoplay policy restrictions gracefully with auto-unlocking on first interaction.
 */

const SOUND_STORAGE_KEY = "pos_sound_enabled";

class SoundManager {
  private audioCtx: AudioContext | null = null;
  private isUnlocked = false;
  private recentOrderSounds = new Map<string, number>();

  public get audioUnlocked(): boolean {
    return this.isUnlocked;
  }

  constructor() {
    // Set up auto-unlock on first user gesture
    if (typeof window !== "undefined") {
      const unlock = () => {
        this.unlockAudio();
        window.removeEventListener("pointerdown", unlock);
        window.removeEventListener("keydown", unlock);
        window.removeEventListener("click", unlock);
      };
      window.addEventListener("pointerdown", unlock, { once: true });
      window.addEventListener("keydown", unlock, { once: true });
      window.addEventListener("click", unlock, { once: true });
    }
  }

  private getAudioContext(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.audioCtx) {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass) {
        this.audioCtx = new AudioContextClass();
      }
    }
    return this.audioCtx;
  }

  public unlockAudio(): void {
    const ctx = this.getAudioContext();
    if (ctx && ctx.state === "suspended") {
      ctx.resume().then(() => {
        this.isUnlocked = true;
      }).catch(() => {
        // Silently catch autoplay restriction until user interacts
      });
    } else if (ctx && ctx.state === "running") {
      this.isUnlocked = true;
    }
  }

  public isSoundEnabled(): boolean {
    if (typeof window === "undefined") return true;
    const stored = localStorage.getItem(SOUND_STORAGE_KEY);
    return stored === null ? true : stored === "true";
  }

  public setSoundEnabled(enabled: boolean): void {
    if (typeof window !== "undefined") {
      localStorage.setItem(SOUND_STORAGE_KEY, String(enabled));
      if (enabled) {
        this.unlockAudio();
      }
    }
  }

  /**
   * Play an elegant dual-tone chime (D5 -> A5) for waiter order ready notifications.
   */
  public async playOrderReadyChime(orderId?: string): Promise<void> {
    if (!this.isSoundEnabled()) return;

    if (orderId) {
      const now = Date.now();
      const lastPlayed = this.recentOrderSounds.get(orderId);
      if (lastPlayed && now - lastPlayed < 3_000) {
        return;
      }
      this.recentOrderSounds.set(orderId, now);

      for (const [id, time] of this.recentOrderSounds.entries()) {
        if (now - time > 15_000) {
          this.recentOrderSounds.delete(id);
        }
      }
    }

    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;

      if (ctx.state === "suspended") {
        await ctx.resume().catch(() => {});
      }

      const now = ctx.currentTime;

      // Tone 1: D5 (587.33 Hz)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(587.33, now);
      gain1.gain.setValueAtTime(0, now);
      gain1.gain.linearRampToValueAtTime(0.55, now + 0.02);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.46);

      // Tone 2: A5 (880.00 Hz)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(880.0, now + 0.15);
      gain2.gain.setValueAtTime(0, now + 0.15);
      gain2.gain.linearRampToValueAtTime(0.65, now + 0.17);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.85);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.15);
      osc2.stop(now + 0.86);
    } catch {
      // Catch audio failures gracefully
    }
  }

  /**
   * Play an energetic 3-tone attention chime (C5 -> E5 -> G5) for kitchen when a new order arrives.
   * Clear, loud, and resonant for noisy restaurant kitchen environments.
   */
  public async playNewOrderChime(orderId?: string): Promise<void> {
    if (!this.isSoundEnabled()) return;

    if (orderId) {
      const now = Date.now();
      const lastPlayed = this.recentOrderSounds.get(`kitchen_${orderId}`);
      if (lastPlayed && now - lastPlayed < 3_000) {
        return;
      }
      this.recentOrderSounds.set(`kitchen_${orderId}`, now);

      for (const [id, time] of this.recentOrderSounds.entries()) {
        if (now - time > 15_000) {
          this.recentOrderSounds.delete(id);
        }
      }
    }

    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;

      if (ctx.state === "suspended") {
        await ctx.resume().catch(() => {});
      }

      const now = ctx.currentTime;

      // Bell Strike 1: C5 (523.25 Hz)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = "triangle";
      osc1.frequency.setValueAtTime(523.25, now);
      gain1.gain.setValueAtTime(0, now);
      gain1.gain.linearRampToValueAtTime(0.65, now + 0.02);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.41);

      // Bell Strike 2: E5 (659.25 Hz)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = "triangle";
      osc2.frequency.setValueAtTime(659.25, now + 0.14);
      gain2.gain.setValueAtTime(0, now + 0.14);
      gain2.gain.linearRampToValueAtTime(0.7, now + 0.16);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.14);
      osc2.stop(now + 0.56);

      // Bell Strike 3: G5 (783.99 Hz) + C6 harmonic (1046.5 Hz)
      const osc3 = ctx.createOscillator();
      const gain3 = ctx.createGain();
      osc3.type = "sine";
      osc3.frequency.setValueAtTime(783.99, now + 0.28);
      gain3.gain.setValueAtTime(0, now + 0.28);
      gain3.gain.linearRampToValueAtTime(0.75, now + 0.3);
      gain3.gain.exponentialRampToValueAtTime(0.001, now + 0.95);
      osc3.connect(gain3);
      gain3.connect(ctx.destination);
      osc3.start(now + 0.28);
      osc3.stop(now + 0.96);

      const oscHarmonic = ctx.createOscillator();
      const gainHarmonic = ctx.createGain();
      oscHarmonic.type = "sine";
      oscHarmonic.frequency.setValueAtTime(1046.5, now + 0.28);
      gainHarmonic.gain.setValueAtTime(0, now + 0.28);
      gainHarmonic.gain.linearRampToValueAtTime(0.3, now + 0.3);
      gainHarmonic.gain.exponentialRampToValueAtTime(0.001, now + 0.85);
      oscHarmonic.connect(gainHarmonic);
      gainHarmonic.connect(ctx.destination);
      oscHarmonic.start(now + 0.28);
      oscHarmonic.stop(now + 0.86);
    } catch {
      // Catch audio failures gracefully
    }
  }

  public testKitchenSound(): void {
    this.unlockAudio();
    void this.playNewOrderChime();
  }

  public testWaiterSound(): void {
    this.unlockAudio();
    void this.playOrderReadyChime();
  }
}

export const soundManager = new SoundManager();
