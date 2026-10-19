import { Injectable, inject, signal } from '@angular/core';
import type { OnDestroy } from '@angular/core';
import type { DrumInstrument, Pattern } from '../models/score.model';
import { DrumAudioService } from './drum-audio.service';

export interface PlaybackScore {
  pattern: Pattern;
  stepsPerMeasure: number;
  totalSteps: number;
}

export interface ScorePlaybackOptions {
  tempo: number;
  ticksPerWholeNote: number;
  instruments: readonly DrumInstrument[];
  getScore: () => PlaybackScore;
}

@Injectable({ providedIn: 'root' })
export class ScorePlaybackService implements OnDestroy {
  private readonly audio = inject(DrumAudioService);
  readonly playingStep = signal(-1);
  readonly isPlaying = signal(false);

  private timer?: number;
  private readonly scheduledTupletTimeouts = new Set<number>();
  private readonly scheduledTupletIntervals = new Set<number>();

  async start(options: ScorePlaybackOptions): Promise<boolean> {
    if (this.isPlaying()) {
      this.stop();
    }
    if (!(await this.audio.start())) {
      return false;
    }

    this.isPlaying.set(true);
    const tickDurationMs = 60_000 / options.tempo / (options.ticksPerWholeNote / 4);
    let step = 0;
    const playCurrentStep = () => {
      const score = options.getScore();
      step %= score.totalSteps;
      this.playingStep.set(step);
      const measureIndex = Math.floor(step / score.stepsPerMeasure);
      const stepInMeasure = step % score.stepsPerMeasure;
      for (const instrument of options.instruments) {
        if (
          score.pattern[instrument.id][measureIndex]?.some(
            (note) => Math.abs(note.start - stepInMeasure) < 1e-7,
          )
        ) {
          this.audio.play(instrument.id);
        }
      }
      step = (step + 1) % options.getScore().totalSteps;
    };

    playCurrentStep();
    this.timer = window.setInterval(playCurrentStep, tickDurationMs);
    this.scheduleTupletPlayback(options, tickDurationMs);
    return true;
  }

  stop(): void {
    if (this.timer !== undefined) {
      window.clearInterval(this.timer);
      this.timer = undefined;
    }
    for (const timeout of this.scheduledTupletTimeouts) {
      window.clearTimeout(timeout);
    }
    for (const interval of this.scheduledTupletIntervals) {
      window.clearInterval(interval);
    }
    this.scheduledTupletTimeouts.clear();
    this.scheduledTupletIntervals.clear();
    this.isPlaying.set(false);
    this.playingStep.set(-1);
    this.audio.stop();
  }

  ngOnDestroy(): void {
    this.stop();
  }

  private scheduleTupletPlayback(
    options: ScorePlaybackOptions,
    tickDurationMs: number,
  ): void {
    const score = options.getScore();
    const cycleDurationMs = score.totalSteps * tickDurationMs;
    for (const instrument of options.instruments) {
      score.pattern[instrument.id].forEach((measure, measureIndex) => {
        for (const note of measure) {
          if (!note.tuplet || Math.abs(note.start - Math.round(note.start)) < 1e-7) {
            continue;
          }
          const delay =
            (measureIndex * score.stepsPerMeasure + note.start) * tickDurationMs;
          let repeatTimer: number | undefined;
          const timeout = window.setTimeout(() => {
            this.scheduledTupletTimeouts.delete(timeout);
            const playIfPresent = () => {
              const exists = options
                .getScore()
                .pattern[instrument.id].some((items) =>
                  items.some((item) => item.id === note.id),
                );
              if (!exists) {
                if (repeatTimer !== undefined) {
                  window.clearInterval(repeatTimer);
                  this.scheduledTupletIntervals.delete(repeatTimer);
                }
                return;
              }
              this.audio.play(instrument.id);
            };
            playIfPresent();
            repeatTimer = window.setInterval(playIfPresent, cycleDurationMs);
            this.scheduledTupletIntervals.add(repeatTimer);
          }, delay);
          this.scheduledTupletTimeouts.add(timeout);
        }
      });
    }
  }
}
