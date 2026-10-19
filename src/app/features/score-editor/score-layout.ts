import type {
  DrumInstrument,
  NoteValue,
  Pattern,
  ScoreBeamMarker,
  ScoreFragment,
  ScoreTupletMarker,
  StemDirection,
} from './models/score.model';
import { makeTieArc, splitIntoNotationParts } from './score-notation';

interface NoteValueOption {
  value: NoteValue;
  name: string;
}

export interface ScoreLayoutOptions {
  measureIndex: number;
  pattern: Pattern;
  instruments: readonly DrumInstrument[];
  noteValues: readonly NoteValueOption[];
  stepsPerMeasure: number;
  ticksPerWholeNote: number;
  numerator: number;
  denominator: number;
  autoBeaming: boolean;
  stemDirection: StemDirection;
  measureWidth: number;
}

export interface ScoreNoteLayout {
  notes: ScoreFragment[];
  beams: ScoreBeamMarker[];
  tuplets: ScoreTupletMarker[];
}

const STAFF_START_X = 112;
const STAFF_END_INSET = 24;

export function layoutScoreMeasure(options: ScoreLayoutOptions): ScoreNoteLayout {
  const notes = notesForMeasure(options);
  const beamedNotes = beamNotesForMeasure(options, notes);

  return {
    ...beamedNotes,
    tuplets: tupletsForMeasure(options),
  };
}

function notesForMeasure(options: ScoreLayoutOptions): ScoreFragment[] {
  const { instruments, pattern, measureIndex, stepsPerMeasure, ticksPerWholeNote } = options;
  const fragments: ScoreFragment[] = [];

  for (const instrument of instruments) {
    const track = pattern[instrument.id];
    for (let sourceMeasure = 0; sourceMeasure < track.length; sourceMeasure++) {
      for (const note of track[sourceMeasure]) {
        if (note.tuplet) {
          if (sourceMeasure !== measureIndex) {
            continue;
          }
          const x = xForStep(note.start, options);
          const y = instrumentY(instrument.id);
          fragments.push({
            id: note.id,
            eventId: note.id,
            instrumentId: instrument.id,
            instrumentName: instrument.name,
            sourceMeasure,
            sourceStep: note.start,
            measureStep: note.start,
            x,
            y,
            duration: note.duration,
            stemDirection: note.stemDirection ?? options.stemDirection,
            filledHead: note.duration >= 4,
            stemmed: note.duration >= 4,
            flagCount: Math.max(0, Math.log2(note.duration) - 2),
            tupletId: note.tuplet.id,
            tupletCount: note.tuplet.count,
            tupletInTimeOf: note.tuplet.inTimeOf,
            tupletIndex: note.tuplet.index,
            label: `${instrument.name}, ${noteValueName(note.duration, options)} Tuplet ${
              note.tuplet.index + 1
            } von ${note.tuplet.count}, Takt ${measureIndex + 1}`,
          });
          continue;
        }

        const eventStart = sourceMeasure * stepsPerMeasure + note.start;
        const eventEnd = eventStart + ticksPerWholeNote / note.duration;
        const parts = splitIntoNotationParts(
          eventStart,
          eventEnd,
          stepsPerMeasure,
          ticksPerWholeNote,
          options.noteValues,
        );

        for (let index = 0; index < parts.length; index++) {
          const part = parts[index];
          if (part.measureIndex !== measureIndex) {
            continue;
          }
          const previousPart = parts[index - 1];
          const nextPart = parts[index + 1];
          const x = xForStep(part.start, options);
          const y = instrumentY(instrument.id);
          const tieFromX = previousPart
            ? previousPart.measureIndex === measureIndex
              ? xForStep(previousPart.start, options) + 5
              : staffStartX() - 27
            : undefined;
          const tieToX = nextPart
            ? nextPart.measureIndex === measureIndex
              ? xForStep(nextPart.start, options) - 5
              : staffEndX(options) - 6
            : undefined;

          fragments.push({
            id: `${note.id}:${part.start}`,
            eventId: note.id,
            instrumentId: instrument.id,
            instrumentName: instrument.name,
            sourceMeasure,
            sourceStep: note.start,
            measureStep: part.start,
            x,
            y,
            duration: part.duration,
            stemDirection: note.stemDirection ?? options.stemDirection,
            filledHead: part.duration >= 4,
            stemmed: part.duration >= 4,
            flagCount: Math.max(0, Math.log2(part.duration) - 2),
            tieArcIn:
              tieFromX === undefined ? undefined : makeTieArc(tieFromX, x - 5, y),
            tieArcOut:
              tieToX === undefined ? undefined : makeTieArc(x + 5, tieToX, y),
            label: `${instrument.name}, ${noteValueName(part.duration, options)}, Takt ${
              measureIndex + 1
            }`,
          });
        }
      }
    }
  }

  return fragments.sort((left, right) => left.x - right.x || left.y - right.y);
}

function beamNotesForMeasure(
  options: ScoreLayoutOptions,
  notes: ScoreFragment[],
): { notes: ScoreFragment[]; beams: ScoreBeamMarker[] } {
  if (!options.autoBeaming) {
    return { notes, beams: [] };
  }

  const beatLength =
    (options.ticksPerWholeNote / options.denominator) *
    (options.denominator >= 8 && options.numerator > 3 && options.numerator % 3 === 0 ? 3 : 1);
  const notesByBeat = new Map<string, { beatIndex: number; notes: ScoreFragment[] }>();
  for (const note of notes) {
    if (note.duration < 8 || note.tieArcIn || note.tieArcOut) {
      continue;
    }
    const beatIndex = Math.floor(note.measureStep / beatLength);
    const key = [
      note.instrumentId,
      note.duration,
      beatIndex,
      note.stemDirection,
      note.tupletId ?? 'regular',
    ].join(':');
    const group = notesByBeat.get(key) ?? { beatIndex, notes: [] };
    group.notes.push(note);
    notesByBeat.set(key, group);
  }

  const pendingBeams: Array<ScoreBeamMarker & { beatIndex: number; noteIds: string[] }> = [];
  const addBeam = (group: ScoreFragment[], beatIndex: number) => {
    if (group.length < 2) {
      return;
    }
    const first = group[0];
    const last = group[group.length - 1];
    const direction = first.stemDirection;
    const stemX = direction === 'down' ? -5 : 5;
    pendingBeams.push({
      id: `beam-${options.measureIndex}-${first.eventId}`,
      beatIndex,
      noteIds: group.map((note) => note.id),
      instrumentId: first.instrumentId,
      levels: first.flagCount,
      xStart: first.x + stemX,
      xEnd: last.x + stemX,
      y: first.y + (direction === 'down' ? 34 : -34),
      tupletId: first.tupletId,
      tupletCount: first.tupletCount,
      tupletInTimeOf: first.tupletInTimeOf,
      tupletIndexStart: first.tupletIndex,
      direction,
    });
  };

  for (const { beatIndex, notes: group } of notesByBeat.values()) {
    group.sort((left, right) => left.measureStep - right.measureStep);
    const first = group[0];
    const spacing =
      (options.ticksPerWholeNote / first.duration) *
      (first.tupletId
        ? (first.tupletInTimeOf ?? 1) / (first.tupletCount ?? 1)
        : 1);
    let consecutive: ScoreFragment[] = [];
    for (const note of group) {
      const previous = consecutive[consecutive.length - 1];
      if (
        previous &&
        (Math.abs(note.measureStep - (previous.measureStep + spacing)) > 1e-7 ||
          (previous.tupletId !== undefined &&
            note.tupletIndex !== (previous.tupletIndex ?? -1) + 1))
      ) {
        addBeam(consecutive, beatIndex);
        consecutive = [];
      }
      consecutive.push(note);
    }
    addBeam(consecutive, beatIndex);
  }

  const beamedNotes = new Map<string, { id: string; stemOffset: number }>();
  const placedBeams: Array<ScoreBeamMarker & { beatIndex: number }> = [];
  const beams: ScoreBeamMarker[] = [];
  pendingBeams.sort(
    (left, right) =>
      left.beatIndex - right.beatIndex ||
      left.y - right.y ||
      right.levels - left.levels ||
      left.xStart - right.xStart,
  );
  for (const candidate of pendingBeams) {
    let y = candidate.y;
    const beamHeight = (candidate.levels - 1) * 5 + 3;
    const candidateHasTupletLabel = candidate.tupletIndexStart === 0;
    for (const previous of placedBeams) {
      if (
        previous.beatIndex !== candidate.beatIndex ||
        candidate.xStart >= previous.xEnd ||
        candidate.xEnd <= previous.xStart
      ) {
        continue;
      }
      const previousHasTupletLabel = previous.tupletIndexStart === 0;
      const previousLabelOffset = previousHasTupletLabel ? 11 : 0;
      const currentLabelOffset = candidateHasTupletLabel ? 11 : 0;
      const previousHeight = (previous.levels - 1) * 5 + 3;
      const previousTop =
        previous.direction === 'down'
          ? previous.y - previousHeight
          : previous.y - previousLabelOffset;
      const previousBottom =
        previous.direction === 'down'
          ? previous.y + previousLabelOffset
          : previous.y + previousHeight;
      const currentTop =
        candidate.direction === 'down' ? y - beamHeight : y - currentLabelOffset;
      const currentBottom =
        candidate.direction === 'down' ? y + currentLabelOffset : y + beamHeight;
      if (currentTop < previousBottom + 2 && currentBottom > previousTop - 2) {
        y =
          previousBottom +
          2 +
          (candidate.direction === 'down' ? beamHeight : currentLabelOffset);
      }
    }

    const stemOffset = y - candidate.y;
    const placed = { ...candidate, y };
    placedBeams.push(placed);
    beams.push({
      id: placed.id,
      instrumentId: placed.instrumentId,
      direction: placed.direction,
      levels: placed.levels,
      xStart: placed.xStart,
      xEnd: placed.xEnd,
      y: placed.y,
      tupletId: placed.tupletId,
      tupletCount: placed.tupletCount,
      tupletInTimeOf: placed.tupletInTimeOf,
      tupletIndexStart: placed.tupletIndexStart,
    });
    for (const noteId of placed.noteIds) {
      beamedNotes.set(noteId, { id: placed.id, stemOffset });
    }
  }

  return {
    notes: notes.map((note) => {
      const beam = beamedNotes.get(note.id);
      return beam
        ? { ...note, beamGroupId: beam.id, beamStemOffset: beam.stemOffset }
        : note;
    }),
    beams,
  };
}

function tupletsForMeasure(options: ScoreLayoutOptions): ScoreTupletMarker[] {
  const markers = new Map<string, ScoreTupletMarker>();
  for (const instrument of options.instruments) {
    for (const note of options.pattern[instrument.id][options.measureIndex] ?? []) {
      const tuplet = note.tuplet;
      if (!tuplet || tuplet.index !== 0) {
        continue;
      }
      const groupTicks = (options.ticksPerWholeNote / note.duration) * tuplet.inTimeOf;
      markers.set(tuplet.id, {
        id: tuplet.id,
        count: tuplet.count,
        inTimeOf: tuplet.inTimeOf,
        xStart: xForStep(note.start, options),
        xEnd: xForStep(note.start + groupTicks, options),
      });
    }
  }
  return [...markers.values()];
}

function xForStep(step: number, options: ScoreLayoutOptions): number {
  const width = staffWidth(options);
  return staffStartX() + (step / options.stepsPerMeasure) * width;
}

function staffWidth(options: ScoreLayoutOptions): number {
  return staffEndX(options) - staffStartX();
}

function staffStartX(): number {
  return STAFF_START_X;
}

function staffEndX(options: ScoreLayoutOptions): number {
  return options.measureWidth - STAFF_END_INSET;
}

function instrumentY(instrumentId: DrumInstrument['id']): number {
  switch (instrumentId) {
    case 'crash':
      return 34;
    case 'openHat':
      return 44;
    case 'closedHat':
      return 52;
    case 'snare':
      return 76;
    case 'kick':
      return 112;
  }
}

function noteValueName(duration: NoteValue, options: ScoreLayoutOptions): string {
  return options.noteValues.find((note) => note.value === duration)?.name ?? 'Note';
}
