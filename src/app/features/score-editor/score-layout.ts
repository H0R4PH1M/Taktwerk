import type {
  BeamCollisionSide,
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
            beamOffset: note.beamOffset,
            beamOffsetX: note.beamOffsetX,
            beamCollisionSide: note.beamCollisionSide,
            manualBeamGroupId: note.manualBeamGroupId,
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
            beamOffset: note.beamOffset,
            beamOffsetX: note.beamOffsetX,
            beamCollisionSide: note.beamCollisionSide,
            manualBeamGroupId: note.manualBeamGroupId,
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
  const beatLength =
    (options.ticksPerWholeNote / options.denominator) *
    (options.denominator >= 8 && options.numerator > 3 && options.numerator % 3 === 0 ? 3 : 1);
  const notesByBeat = new Map<string, { beatIndex: number; notes: ScoreFragment[] }>();
  if (options.autoBeaming) {
    for (const note of notes) {
      if (
        note.duration < 8 ||
        note.tieArcIn ||
        note.tieArcOut ||
        note.manualBeamGroupId
      ) {
        continue;
      }
      const beatIndex = Math.floor(note.measureStep / beatLength);
      const key = [
        note.instrumentId,
        note.duration,
        note.beamOffset ?? 0,
        note.beamOffsetX ?? 0,
        note.beamCollisionSide ?? 'automatic',
        beatIndex,
        note.stemDirection,
        note.tupletId ?? 'regular',
      ].join(':');
      const group = notesByBeat.get(key) ?? { beatIndex, notes: [] };
      group.notes.push(note);
      notesByBeat.set(key, group);
    }
  }

  const pendingBeams: Array<
    ScoreBeamMarker & {
      beatIndex: number;
      noteIds: string[];
      beamOffset: number;
      beamOffsetX: number;
      beamCollisionSide?: BeamCollisionSide;
    }
  > = [];
  const addBeam = (group: ScoreFragment[], beatIndex: number, manualGroupId?: string) => {
    if (group.length < 2) {
      return;
    }
    const first = group[0];
    const last = group[group.length - 1];
    const direction = first.stemDirection;
    const stemX = direction === 'down' ? -5 : 5;
    pendingBeams.push({
      id: manualGroupId
        ? `manual-beam-${manualGroupId}`
        : `beam-${options.measureIndex}-${first.eventId}`,
      beatIndex,
      noteIds: group.map((note) => note.id),
      instrumentId: first.instrumentId,
      levels: first.flagCount,
      xStart: first.x + stemX + (first.beamOffsetX ?? 0),
      xEnd: last.x + stemX + (last.beamOffsetX ?? 0),
      y: first.y + (direction === 'down' ? 34 : -34),
      beamOffset: first.beamOffset ?? 0,
      beamOffsetX: first.beamOffsetX ?? 0,
      beamCollisionSide: first.beamCollisionSide,
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

  const manualGroups = new Map<string, ScoreFragment[]>();
  for (const note of notes) {
    if (!note.manualBeamGroupId || note.duration < 8 || note.tieArcIn || note.tieArcOut || note.tupletId) {
      continue;
    }
    const group = manualGroups.get(note.manualBeamGroupId) ?? [];
    group.push(note);
    manualGroups.set(note.manualBeamGroupId, group);
  }
  for (const [groupId, group] of manualGroups) {
    group.sort((left, right) => left.measureStep - right.measureStep);
    const first = group[0];
    const spacing = options.ticksPerWholeNote / first.duration;
    const isValidGroup =
      group.length >= 2 &&
      group.every(
        (note, index) =>
          note.duration === first.duration &&
          note.stemDirection === first.stemDirection &&
          note.beamOffsetX === first.beamOffsetX &&
          note.beamCollisionSide === first.beamCollisionSide &&
          (index === 0 || Math.abs(note.measureStep - (group[index - 1].measureStep + spacing)) < 1e-7),
      );
    if (!isValidGroup) {
      continue;
    }
    const beatIndex = Math.floor(first.measureStep / beatLength);
    addBeam(group, beatIndex, groupId);
  }
  const beamedNotes = new Map<
    string,
    { id: string; stemOffset: number; stemXOffset: number }
  >();
  const placedBeams: Array<ScoreBeamMarker & { beatIndex: number }> = [];
  const beams: ScoreBeamMarker[] = [];
  const instrumentsByBeat = new Map<number, Map<ScoreBeamMarker['instrumentId'], number>>();
  for (const candidate of pendingBeams) {
    const hasSeparateInstrumentBeam = pendingBeams.some(
      (other) =>
        other.beatIndex === candidate.beatIndex &&
        other.instrumentId !== candidate.instrumentId &&
        (candidate.xEnd <= other.xStart || candidate.xStart >= other.xEnd),
    );
    if (!hasSeparateInstrumentBeam) {
      continue;
    }
    const instruments = instrumentsByBeat.get(candidate.beatIndex) ?? new Map();
    const currentY = instruments.get(candidate.instrumentId);
    instruments.set(candidate.instrumentId, currentY === undefined ? candidate.y : Math.min(currentY, candidate.y));
    instrumentsByBeat.set(candidate.beatIndex, instruments);
  }
  const instrumentOffsets = new Map<string, number>();
  for (const [beatIndex, instruments] of instrumentsByBeat) {
    const ordered = [...instruments.entries()].sort(
      ([leftId, leftY], [rightId, rightY]) => leftY - rightY || leftId.localeCompare(rightId),
    );
    const center = (ordered.length - 1) / 2;
    ordered.forEach(([instrumentId], index) => {
      instrumentOffsets.set(`${beatIndex}:${instrumentId}`, (index - center) * 3);
    });
  }
  pendingBeams.sort(
    (left, right) =>
      left.beatIndex - right.beatIndex ||
      left.y - right.y ||
      right.levels - left.levels ||
      left.xStart - right.xStart,
  );
  const notesById = new Map(notes.map((note) => [note.id, note] as const));
  for (const candidate of pendingBeams) {
    let y =
      candidate.y +
      (instrumentOffsets.get(`${candidate.beatIndex}:${candidate.instrumentId}`) ?? 0) +
      candidate.beamOffset;
    const beamHeight = (candidate.levels - 1) * 5 + 3;
    const candidateHasTupletLabel = candidate.tupletIndexStart === 0;
    const offsetDirection =
      candidate.beamCollisionSide === 'above'
        ? -1
        : candidate.beamCollisionSide === 'below'
          ? 1
          : candidate.direction === 'down'
            ? 1
            : -1;
    const notesInBeamSpan = notes.filter(
      (note) =>
        !candidate.noteIds.includes(note.id) &&
        candidate.xStart <= note.x + 8 &&
        candidate.xEnd >= note.x - 8,
    );
    if (candidate.beamCollisionSide === 'above' && notesInBeamSpan.length > 0) {
      const highestNoteY = Math.min(...notesInBeamSpan.map((note) => note.y));
      const beamBottomOffset = candidate.direction === 'down' ? 0 : beamHeight;
      y = Math.min(y, highestNoteY - 8 - beamBottomOffset);
    } else if (candidate.beamCollisionSide === 'below' && notesInBeamSpan.length > 0) {
      const lowestNoteY = Math.max(...notesInBeamSpan.map((note) => note.y));
      const beamTopOffset = candidate.direction === 'down' ? beamHeight : 0;
      y = Math.max(y, lowestNoteY + 8 + beamTopOffset);
    }
    const bounds = (direction: StemDirection, beamY: number, height: number, hasLabel: boolean) => ({
      top: direction === 'down' ? beamY - height : beamY - (hasLabel ? 11 : 0),
      bottom: direction === 'down' ? beamY + (hasLabel ? 11 : 0) : beamY + height,
    });
    const collides = () => {
      const current = bounds(
        candidate.direction,
        y,
        beamHeight,
        candidateHasTupletLabel,
      );
      const noteCollision = notes.some((note) => {
        if (
          candidate.noteIds.includes(note.id) ||
          candidate.xStart > note.x + 6 ||
          candidate.xEnd < note.x - 6
        ) {
          return false;
        }
        return current.top < note.y + 8 && current.bottom > note.y - 8;
      });
      const beamCollision = placedBeams.some((previous) => {
        if (candidate.xStart > previous.xEnd || candidate.xEnd < previous.xStart) {
          return false;
        }
        const previousBounds = bounds(
          previous.direction,
          previous.y,
          (previous.levels - 1) * 5 + 3,
          previous.tupletIndexStart === 0,
        );
        return current.top < previousBounds.bottom + 2 && current.bottom > previousBounds.top - 2;
      });
      return noteCollision || beamCollision;
    };
    while (collides()) {
      y += offsetDirection * 2;
    }

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
      collisionSide: placed.beamCollisionSide,
      tupletId: placed.tupletId,
      tupletCount: placed.tupletCount,
      tupletInTimeOf: placed.tupletInTimeOf,
      tupletIndexStart: placed.tupletIndexStart,
    });
    for (const noteId of placed.noteIds) {
      const note = notesById.get(noteId);
      if (!note) {
        continue;
      }
      beamedNotes.set(noteId, {
        id: placed.id,
        stemOffset: y - note.y - (note.stemDirection === 'down' ? 34 : -34),
        stemXOffset: placed.beamOffsetX,
      });
    }
  }

  return {
    notes: notes.map((note) => {
      const beam = beamedNotes.get(note.id);
      return beam
        ? {
            ...note,
            beamGroupId: beam.id,
            beamStemOffset: beam.stemOffset,
            beamStemXOffset: beam.stemXOffset,
          }
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
    case 'tom1':
      return 64;
    case 'snare':
      return 76;
    case 'tom2':
      return 88;
    case 'floorTom':
      return 100;
    case 'kick':
      return 112;
  }
}

function noteValueName(duration: NoteValue, options: ScoreLayoutOptions): string {
  return options.noteValues.find((note) => note.value === duration)?.name ?? 'Note';
}
