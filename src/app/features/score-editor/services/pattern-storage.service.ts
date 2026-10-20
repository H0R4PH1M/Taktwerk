import { Injectable } from '@angular/core';
import type {
  DrumId,
  DrumInstrument,
  NoteValue,
  NoteTextPosition,
  Pattern,
  PatternSnapshot,
  RestPattern,
  ScoreAnnotation,
  StemDirection,
} from '../models/score.model';

interface SavedPatternMetadata {
  tempo: number;
  measures: number;
  numerator: number;
  denominator: number;
  noteTextPosition?: NoteTextPosition;
  autoBeaming?: boolean;
  stemDirection?: StemDirection;
  pattern: unknown;
  rests?: unknown;
  annotations?: unknown;
}

const TOM_INSTRUMENT_IDS: readonly DrumId[] = ['tom1', 'tom2', 'floorTom'];

@Injectable({ providedIn: 'root' })
export class PatternStorageService {
  private readonly storageKey = 'taktwerk-pattern-v1';

  save(snapshot: PatternSnapshot): void {
    localStorage.setItem(
      this.storageKey,
      JSON.stringify({ schemaVersion: 2, ...snapshot }),
    );
  }

  restore(
    instruments: readonly DrumInstrument[],
    noteValues: readonly { value: NoteValue }[],
    denominators: readonly number[],
    createNoteId: () => string,
  ): PatternSnapshot | undefined {
    const stored = localStorage.getItem(this.storageKey);
    if (!stored) {
      return undefined;
    }

    return this.readSnapshot(JSON.parse(stored) as unknown, instruments, noteValues, denominators, createNoteId);
  }

  importJson(
    serialized: string,
    instruments: readonly DrumInstrument[],
    noteValues: readonly { value: NoteValue }[],
    denominators: readonly number[],
    createNoteId: () => string,
  ): PatternSnapshot {
    let value: unknown;
    try {
      value = JSON.parse(serialized) as unknown;
    } catch {
      throw new Error('Ungültige JSON-Datei.');
    }
    return this.readSnapshot(value, instruments, noteValues, denominators, createNoteId);
  }

  private readSnapshot(
    value: unknown,
    instruments: readonly DrumInstrument[],
    noteValues: readonly { value: NoteValue }[],
    denominators: readonly number[],
    createNoteId: () => string,
  ): PatternSnapshot {
    const metadata = this.readMetadata(value, denominators);
    if (!metadata) {
      throw new Error('Ungültiges Pattern-Format');
    }

    let pattern: Pattern;
    if (this.isCurrentPattern(metadata, instruments, noteValues)) {
      pattern = this.addMissingTomTracks(metadata.pattern, metadata.measures) as Pattern;
    } else if (this.isLegacyPattern(metadata, instruments)) {
      pattern = this.migrateLegacyPattern(metadata, instruments, createNoteId);
    } else {
      throw new Error('Ungültiges Pattern-Format');
    }

    const stepsPerMeasure =
      (metadata.numerator * Math.max(64, metadata.denominator)) / metadata.denominator;
    const rests =
      metadata.rests === undefined
        ? this.createEmptyRests(metadata.measures, instruments)
        : this.readRests(
            this.addMissingTomTracks(metadata.rests, metadata.measures),
            metadata.measures,
            stepsPerMeasure,
            instruments,
            noteValues,
          );
    if (!rests) {
      throw new Error('Ungültiges Pausenformat');
    }
    if (
      metadata.annotations !== undefined &&
      (!this.isValidAnnotations(metadata.annotations, metadata.measures, stepsPerMeasure) ||
        !this.annotationsReferenceExistingNotes(metadata.annotations, pattern, instruments))
    ) {
      throw new Error('Ungültiges Text-Annotationsformat');
    }

    return {
      tempo: metadata.tempo,
      numerator: metadata.numerator,
      denominator: metadata.denominator,
      noteTextPosition: metadata.noteTextPosition,
      autoBeaming: metadata.autoBeaming,
      stemDirection: metadata.stemDirection,
      measures: metadata.measures,
      pattern,
      rests,
      annotations:
        metadata.annotations === undefined
          ? this.createEmptyAnnotations(metadata.measures)
          : metadata.annotations,
    };
  }

  private readMetadata(
    value: unknown,
    denominators: readonly number[],
  ): SavedPatternMetadata | undefined {
    if (!value || typeof value !== 'object') {
      return undefined;
    }
    const saved = value as {
      tempo?: unknown;
      measures?: unknown;
      numerator?: unknown;
      denominator?: unknown;
      timeSignature?: unknown;
      noteTextPosition?: unknown;
      autoBeaming?: unknown;
      stemDirection?: unknown;
      pattern?: unknown;
      rests?: unknown;
      annotations?: unknown;
    };
    const timeSignature =
      typeof saved.timeSignature === 'string'
        ? /^(\d+)\/(\d+)$/.exec(saved.timeSignature)
        : undefined;
    if (saved.timeSignature !== undefined && !timeSignature) {
      return undefined;
    }
    const numerator = saved.numerator ?? (timeSignature ? Number(timeSignature[1]) : 4);
    const denominator = saved.denominator ?? (timeSignature ? Number(timeSignature[2]) : 4);
    const noteTextPosition =
      saved.noteTextPosition === 'above' || saved.noteTextPosition === 'below'
        ? saved.noteTextPosition
        : undefined;
    if (
      typeof saved.tempo !== 'number' ||
      saved.tempo < 40 ||
      saved.tempo > 240 ||
      typeof saved.measures !== 'number' ||
      !Number.isInteger(saved.measures) ||
      saved.measures < 1 ||
      typeof numerator !== 'number' ||
      !Number.isInteger(numerator) ||
      numerator < 1 ||
      numerator > 32 ||
      typeof denominator !== 'number' ||
      !denominators.includes(denominator) ||
      (saved.noteTextPosition !== undefined &&
        saved.noteTextPosition !== 'above' &&
        saved.noteTextPosition !== 'below') ||
      (saved.autoBeaming !== undefined && typeof saved.autoBeaming !== 'boolean') ||
      (saved.stemDirection !== undefined &&
        saved.stemDirection !== 'up' &&
        saved.stemDirection !== 'down')
    ) {
      return undefined;
    }
    return {
      tempo: saved.tempo,
      measures: saved.measures,
      numerator,
      denominator,
      noteTextPosition,
      autoBeaming: typeof saved.autoBeaming === 'boolean' ? saved.autoBeaming : undefined,
      stemDirection:
        saved.stemDirection === 'up' || saved.stemDirection === 'down'
          ? saved.stemDirection
          : undefined,
      pattern: saved.pattern,
      rests: saved.rests,
      annotations: saved.annotations,
    };
  }

  private readRests(
    value: unknown,
    measures: number,
    stepsPerMeasure: number,
    instruments: readonly DrumInstrument[],
    noteValues: readonly { value: NoteValue }[],
  ): RestPattern | undefined {
    if (!value || typeof value !== 'object') {
      return undefined;
    }
    const rests = value as Record<string, unknown>;
    const restIds = new Set<string>();
    const isValid = instruments.every((instrument) => {
      const track = rests[instrument.id];
      return (
        Array.isArray(track) &&
        track.length === measures &&
        track.every(
          (measure) =>
            Array.isArray(measure) &&
            measure.every(
              (rest) => {
                if (
                  !rest ||
                  typeof rest !== 'object' ||
                  typeof rest.id !== 'string' ||
                  restIds.has(rest.id) ||
                  !Number.isInteger(rest.start) ||
                  rest.start < 0 ||
                  rest.start >= stepsPerMeasure ||
                  !noteValues.some((note) => note.value === rest.duration)
                ) {
                  return false;
                }
                restIds.add(rest.id);
                return true;
              },
            ),
        )
      );
    });
    return isValid ? (rests as RestPattern) : undefined;
  }

  private isCurrentPattern(
    saved: SavedPatternMetadata,
    instruments: readonly DrumInstrument[],
    noteValues: readonly { value: NoteValue }[],
  ): saved is SavedPatternMetadata & { pattern: Pattern } {
    if (!saved.pattern || typeof saved.pattern !== 'object') {
      return false;
    }
    const stepsPerMeasure =
      (saved.numerator * Math.max(64, saved.denominator)) / saved.denominator;
    const ticksPerWholeNote = Math.max(64, saved.denominator);
    const groups = new Map<
      string,
      {
        count: number;
        inTimeOf: number;
        duration: NoteValue;
        measureIndex: number;
        start: number;
        indexes: Set<number>;
      }
    >();
    const validTracks = instruments.every((instrument) => {
      const track = (saved.pattern as Record<string, unknown>)[instrument.id];
      if (track === undefined && TOM_INSTRUMENT_IDS.includes(instrument.id)) {
        return true;
      }
      return (
        Array.isArray(track) &&
        track.length === saved.measures &&
        track.every(
          (measure, measureIndex) =>
            Array.isArray(measure) &&
            measure.every((note) => {
              if (
                !note ||
                typeof note !== 'object' ||
                typeof note.id !== 'string' ||
                typeof note.start !== 'number' ||
                !Number.isFinite(note.start) ||
                note.start < 0 ||
                note.start >= stepsPerMeasure ||
                (note.tuplet === undefined && !Number.isInteger(note.start)) ||
                (note.beamOffset !== undefined &&
                  (!Number.isInteger(note.beamOffset) || Math.abs(note.beamOffset) > 12)) ||
                (note.beamOffsetX !== undefined &&
                  (!Number.isInteger(note.beamOffsetX) || Math.abs(note.beamOffsetX) > 12)) ||
                (note.beamCollisionSide !== undefined &&
                  note.beamCollisionSide !== 'above' &&
                  note.beamCollisionSide !== 'below') ||
                (note.manualBeamGroupId !== undefined &&
                  (typeof note.manualBeamGroupId !== 'string' ||
                    note.manualBeamGroupId.length === 0)) ||
                (note.stemDirection !== undefined &&
                  note.stemDirection !== 'up' &&
                  note.stemDirection !== 'down') ||
                !noteValues.some((value) => value.value === note.duration)
              ) {
                return false;
              }
              if (note.tuplet === undefined) {
                return true;
              }
              const tuplet = note.tuplet;
              if (
                !tuplet ||
                typeof tuplet !== 'object' ||
                typeof tuplet.id !== 'string' ||
                !Number.isInteger(tuplet.count) ||
                tuplet.count < 2 ||
                tuplet.count > 32 ||
                !Number.isInteger(tuplet.inTimeOf) ||
                tuplet.inTimeOf < 1 ||
                tuplet.inTimeOf > 32 ||
                !Number.isInteger(tuplet.index) ||
                tuplet.index < 0 ||
                tuplet.index >= tuplet.count
              ) {
                return false;
              }

              const duration = note.duration as NoteValue;
              const spacing =
                (ticksPerWholeNote / duration) * (tuplet.inTimeOf / tuplet.count);
              const groupStart = note.start - spacing * tuplet.index;
              const existing = groups.get(tuplet.id);
              if (!existing) {
                groups.set(tuplet.id, {
                  count: tuplet.count,
                  inTimeOf: tuplet.inTimeOf,
                  duration,
                  measureIndex,
                  start: groupStart,
                  indexes: new Set([tuplet.index]),
                });
                return true;
              }
              if (
                existing.count !== tuplet.count ||
                existing.inTimeOf !== tuplet.inTimeOf ||
                existing.duration !== duration ||
                existing.measureIndex !== measureIndex ||
                Math.abs(existing.start - groupStart) > 1e-7 ||
                existing.indexes.has(tuplet.index)
              ) {
                return false;
              }
              existing.indexes.add(tuplet.index);
              return true;
            }),
        )
      );
    });
    return (
      validTracks &&
      [...groups.values()].every((group) => {
        const groupTicks = (ticksPerWholeNote / group.duration) * group.inTimeOf;
        const indexes = [...group.indexes].sort((left, right) => left - right);
        return (
          group.indexes.has(0) &&
          indexes.every((index, position) => index === position) &&
          group.start + groupTicks <= stepsPerMeasure + 1e-7
        );
      })
    );
  }

  private isLegacyPattern(
    saved: SavedPatternMetadata,
    instruments: readonly DrumInstrument[],
  ): saved is SavedPatternMetadata & { pattern: Record<DrumId, boolean[][]> } {
    if (!saved.pattern || typeof saved.pattern !== 'object') {
      return false;
    }

    const stepsPerMeasure =
      (saved.numerator * Math.max(16, saved.denominator)) / saved.denominator;
    return instruments.every((instrument) => {
      const track = (saved.pattern as Record<string, unknown>)[instrument.id];
      if (track === undefined && TOM_INSTRUMENT_IDS.includes(instrument.id)) {
        return true;
      }
      return (
        Array.isArray(track) &&
        track.length === saved.measures &&
        track.every(
          (measure) =>
            Array.isArray(measure) &&
            measure.length === stepsPerMeasure &&
            measure.every((note) => typeof note === 'boolean'),
        )
      );
    });
  }

  private isValidAnnotations(
    value: unknown,
    measures: number,
    stepsPerMeasure: number,
  ): value is ScoreAnnotation[][] {
    if (!Array.isArray(value) || value.length !== measures) {
      return false;
    }
    return value.every(
      (measure) =>
        Array.isArray(measure) &&
        measure.every(
          (annotation) =>
            annotation &&
            typeof annotation === 'object' &&
            typeof annotation.id === 'string' &&
            typeof annotation.text === 'string' &&
            annotation.text.trim().length > 0 &&
            annotation.text.length <= 60 &&
            typeof annotation.step === 'number' &&
            Number.isFinite(annotation.step) &&
            (Number.isInteger(annotation.step) || typeof annotation.noteId === 'string') &&
            annotation.step >= 0 &&
            annotation.step < stepsPerMeasure &&
            typeof annotation.y === 'number' &&
            Number.isFinite(annotation.y) &&
            annotation.y >= 13 &&
            annotation.y <= 148 &&
            (annotation.noteId === undefined || typeof annotation.noteId === 'string'),
        ),
    );
  }

  private annotationsReferenceExistingNotes(
    annotations: ScoreAnnotation[][],
    pattern: Pattern,
    instruments: readonly DrumInstrument[],
  ): boolean {
    const noteIds = new Set(
      instruments.flatMap((instrument) =>
        pattern[instrument.id].flatMap((measure) => measure.map((note) => note.id)),
      ),
    );
    return annotations
      .flat()
      .every((annotation) => !annotation.noteId || noteIds.has(annotation.noteId));
  }

  private migrateLegacyPattern(
    saved: SavedPatternMetadata & { pattern: Record<DrumId, boolean[][]> },
    instruments: readonly DrumInstrument[],
    createNoteId: () => string,
  ): Pattern {
    const legacyTicksPerWholeNote = Math.max(16, saved.denominator);
    const scale = Math.max(64, saved.denominator) / legacyTicksPerWholeNote;
    const migrated = this.createEmptyPattern(saved.measures, instruments);
    for (const instrument of instruments) {
      const savedTrack = saved.pattern[instrument.id];
      if (!savedTrack) {
        continue;
      }
      migrated[instrument.id] = savedTrack.map((measure) =>
        measure.flatMap((isActive, step) =>
          isActive ? [{ id: createNoteId(), start: step * scale, duration: 16 as NoteValue }] : [],
        ),
      );
    }
    return migrated;
  }

  private addMissingTomTracks(value: unknown, measures: number): unknown {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return value;
    }
    const tracks = { ...(value as Record<string, unknown>) };
    for (const instrumentId of TOM_INSTRUMENT_IDS) {
      if (tracks[instrumentId] === undefined) {
        tracks[instrumentId] = Array.from({ length: measures }, () => []);
      }
    }
    return tracks;
  }

  private createEmptyPattern(
    measures: number,
    instruments: readonly DrumInstrument[],
  ): Pattern {
    const pattern = {} as Pattern;
    for (const instrument of instruments) {
      pattern[instrument.id] = Array.from({ length: measures }, () => []);
    }
    return pattern;
  }

  private createEmptyAnnotations(measures: number): ScoreAnnotation[][] {
    return Array.from({ length: measures }, () => []);
  }

  private createEmptyRests(
    measures: number,
    instruments: readonly DrumInstrument[],
  ): RestPattern {
    const rests = {} as RestPattern;
    for (const instrument of instruments) {
      rests[instrument.id] = Array.from({ length: measures }, () => []);
    }
    return rests;
  }
}
