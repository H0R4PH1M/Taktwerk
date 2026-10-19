import { Injectable } from '@angular/core';
import type { DrumId } from '../models/score.model';

@Injectable({ providedIn: 'root' })
export class DrumAudioService {
  private audioContext?: AudioContext;

  async start(): Promise<boolean> {
    const AudioContextConstructor =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) {
      return false;
    }

    this.audioContext = new AudioContextConstructor();
    await this.audioContext.resume();
    return true;
  }

  play(instrumentId: DrumId): void {
    const context = this.audioContext;
    if (!context || context.state !== 'running') {
      return;
    }
    const now = context.currentTime;
    if (instrumentId === 'kick') {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.setValueAtTime(150, now);
      oscillator.frequency.exponentialRampToValueAtTime(45, now + 0.12);
      gain.gain.setValueAtTime(0.8, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(now);
      oscillator.stop(now + 0.16);
      return;
    }

    const duration = instrumentId === 'crash' || instrumentId === 'openHat' ? 0.28 : 0.16;
    const buffer = context.createBuffer(
      1,
      Math.ceil(context.sampleRate * duration),
      context.sampleRate,
    );
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < channel.length; index++) {
      channel[index] = Math.random() * 2 - 1;
    }
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = buffer;
    filter.type = 'highpass';
    filter.frequency.value = instrumentId === 'snare' ? 1_200 : 6_000;
    gain.gain.setValueAtTime(instrumentId === 'crash' ? 0.4 : 0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    source.connect(filter).connect(gain).connect(context.destination);
    source.start(now);
  }

  stop(): void {
    const context = this.audioContext;
    this.audioContext = undefined;
    if (context && context.state !== 'closed') {
      void context.close();
    }
  }
}
