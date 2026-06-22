/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Simple synthesizer for audio feedback simulating professional logistics scanners
class SoundEffects {
  private ctx: AudioContext | null = null;

  private initCtx() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  private getSettings() {
    try {
      const saved = localStorage.getItem('mobile_scanner_config_v1');
      if (saved) {
        const conf = JSON.parse(saved);
        return { dzwieki: conf.dzwieki ?? true, wibracje: conf.wibracje ?? true };
      }
    } catch(e) {}
    return { dzwieki: true, wibracje: true };
  }

  // Quick high-pitched beep representing successful scanner reads
  public playSuccess() {
    const { dzwieki, wibracje } = this.getSettings();
    if (wibracje && navigator.vibrate) {
      navigator.vibrate(50); // Krótka wibracja
    }
    if (!dzwieki) return;
    
    try {
      this.initCtx();
      if (!this.ctx) return;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(1800, this.ctx.currentTime); // Professional high scanner pitch

      gain.gain.setValueAtTime(0.12, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.12);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.12);
    } catch (e) {
      console.warn("Audio Context blocked or not supported", e);
    }
  }

  // Slower pitch double beep for Warnings, such as unknown codes
  public playWarning() {
    const { dzwieki, wibracje } = this.getSettings();
    if (wibracje && navigator.vibrate) {
      navigator.vibrate([150, 50, 150]); // Podwójna średnia wibracja
    }
    if (!dzwieki) return;

    try {
      this.initCtx();
      if (!this.ctx) return;

      const playBeep = (delay: number) => {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(880, this.ctx.currentTime + delay);

        gain.gain.setValueAtTime(0.1, this.ctx.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + delay + 0.15);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(this.ctx.currentTime + delay);
        osc.stop(this.ctx.currentTime + delay + 0.15);
      };

      playBeep(0);
      playBeep(0.2);
    } catch (e) {
      console.warn("Audio Context error", e);
    }
  }

  // Low frequency warning buzz for scanning blocks or errors
  public playError() {
    const { dzwieki, wibracje } = this.getSettings();
    if (wibracje && navigator.vibrate) {
      navigator.vibrate(400); // Długa silna wibracja na błąd
    }
    if (!dzwieki) return;

    try {
      this.initCtx();
      if (!this.ctx) return;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(150, this.ctx.currentTime); // Low buzz

      gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.3);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.3);
    } catch (e) {
      console.warn("Audio Context error", e);
    }
  }
}

export const sounds = new SoundEffects();
