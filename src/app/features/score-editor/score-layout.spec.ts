import type { Pattern } from './models/score.model';
import { NOTE_VALUES, DRUM_INSTRUMENTS } from './score-editor.constants';
import { layoutScoreMeasure } from './score-layout';

function createPattern(): Pattern {
  return {
    kick: [[]],
    snare: [[]],
    closedHat: [[]],
    openHat: [[]],
    crash: [[]],
    tom1: [[]],
    tom2: [[]],
    floorTom: [[]],
  };
}

function layout(
  pattern: Pattern,
  measureIndex = 0,
  autoBeaming = true,
  combineVoices = true,
) {
  return layoutScoreMeasure({
    measureIndex,
    pattern,
    instruments: DRUM_INSTRUMENTS,
    noteValues: NOTE_VALUES,
    stepsPerMeasure: 64,
    ticksPerWholeNote: 64,
    numerator: 4,
    denominator: 4,
    autoBeaming,
    combineVoices,
    stemDirection: 'up',
    measureWidth: 680,
  });
}

describe('layoutScoreMeasure', () => {
  it('splits notes at measure lines and connects the fragments with ties', () => {
    const pattern = createPattern();
    pattern.kick[0].push({ id: 'crossing-note', start: 56, duration: 2 });

    const firstMeasure = layout(pattern, 0);
    const secondMeasure = layout(pattern, 1);

    expect(firstMeasure.notes).toHaveLength(1);
    expect(firstMeasure.notes[0].tieArcOut).toBeDefined();
    expect(secondMeasure.notes.map((note) => note.duration)).toEqual([4, 8]);
    expect(secondMeasure.notes.every((note) => note.tieArcIn)).toBe(true);
  });

  it('beams adjacent short notes within a beat when automatic beaming is enabled', () => {
    const pattern = createPattern();
    pattern.closedHat[0].push(
      { id: 'hat-one', start: 0, duration: 8 },
      { id: 'hat-two', start: 8, duration: 8 },
    );

    const result = layout(pattern);

    expect(result.beams).toHaveLength(1);
    expect(result.notes.map((note) => note.beamGroupId)).toEqual([
      result.beams[0].id,
      result.beams[0].id,
    ]);
  });

  it('connects an eighth-sixteenth-eighth run with a partial secondary beam', () => {
    const pattern = createPattern();
    pattern.closedHat[0].push(
      { id: 'hat-eighth-one', start: 0, duration: 8 },
      { id: 'hat-eighth-two', start: 8, duration: 8 },
    );
    pattern.snare[0].push({ id: 'snare-sixteenth', start: 4, duration: 16 });

    const result = layout(pattern);
    const beam = result.beams[0];
    const secondary = beam.segments?.find((segment) => segment.level === 1);

    expect(result.beams).toHaveLength(1);
    expect(beam.levels).toBe(2);
    expect(result.notes.every((note) => note.beamGroupId === beam.id)).toBe(true);
    expect(beam.segments?.filter((segment) => segment.level === 0)).toHaveLength(1);
    expect(secondary).toBeDefined();
    expect(secondary?.xStart).toBeGreaterThan(beam.xStart);
    expect(secondary?.xEnd).toBeLessThan(beam.xEnd);
  });

  it('continues sixteenth beams through offbeat hits that also contain an eighth', () => {
    const pattern = createPattern();
    pattern.closedHat[0].push(
      { id: 'hat-one-e', start: 0, duration: 16 },
      { id: 'hat-one-and', start: 4, duration: 16 },
      { id: 'hat-one-and-eighth', start: 8, duration: 8 },
      { id: 'hat-two-e', start: 16, duration: 16 },
      { id: 'hat-two-and', start: 20, duration: 16 },
      { id: 'hat-two-and-eighth', start: 24, duration: 8 },
    );
    pattern.tom1[0].push({ id: 'tom-one-and', start: 8, duration: 16 });
    pattern.snare[0].push(
      { id: 'snare-two', start: 16, duration: 16 },
      { id: 'snare-two-and', start: 20, duration: 16 },
    );
    pattern.tom2[0].push({ id: 'tom-two-and', start: 24, duration: 16 });
    pattern.kick[0].push({ id: 'kick-two-and', start: 24, duration: 16 });

    const result = layout(pattern);
    const firstSixteenths = result.notes.filter(
      (note) => note.measureStep <= 8 && note.duration === 16,
    );
    const secondSixteenths = result.notes.filter(
      (note) => note.measureStep >= 16 && note.measureStep <= 24 && note.duration === 16,
    );
    const firstEighth = result.notes.find((note) => note.eventId === 'hat-one-and-eighth');
    const secondEighth = result.notes.find((note) => note.eventId === 'hat-two-and-eighth');

    expect(new Set(firstSixteenths.map((note) => note.beamGroupId)).size).toBe(1);
    expect(new Set(secondSixteenths.map((note) => note.beamGroupId)).size).toBe(1);
    expect(firstSixteenths.every((note) => note.stemDirection === 'up')).toBe(true);
    expect(secondSixteenths.every((note) => note.stemDirection === 'up')).toBe(true);
    expect(firstEighth?.beamGroupId).toBe(firstSixteenths[0].beamGroupId);
    expect(secondEighth?.beamGroupId).toBe(secondSixteenths[0].beamGroupId);
    expect(firstEighth?.stemDirection).toBe('up');
    expect(secondEighth?.stemDirection).toBe('up');
  });

  it('uses opposite stem directions for conflicting voices in an eighth-note beat', () => {
    const pattern = createPattern();
    pattern.closedHat[0].push(
      { id: 'hat-one', start: 32, duration: 16 },
      { id: 'hat-two', start: 36, duration: 16 },
      { id: 'hat-three', start: 40, duration: 8 },
    );
    pattern.snare[0].push(
      { id: 'snare-one', start: 32, duration: 16 },
      { id: 'snare-two', start: 36, duration: 16 },
      { id: 'snare-three', start: 40, duration: 16 },
    );
    pattern.kick[0].push({ id: 'kick-one', start: 40, duration: 16 });

    const result = layout(pattern, 0, true, false);
    const upVoice = result.notes.filter((note) => note.instrumentId === 'closedHat');
    const downVoice = result.notes.filter((note) => note.instrumentId === 'snare');
    const downBeam = result.beams.find((beam) => beam.direction === 'down');

    expect(upVoice.every((note) => note.stemDirection === 'up')).toBe(true);
    expect(downVoice.every((note) => note.stemDirection === 'down')).toBe(true);
    expect(downBeam).toBeDefined();
    expect(downBeam?.y).toBeGreaterThan(Math.max(...downVoice.map((note) => note.y)));
  });

  it('preserves a quarter-note direction when automatic beams separate voices', () => {
    const pattern = createPattern();
    pattern.closedHat[0].push(
      { id: 'hat-one', start: 0, duration: 8 },
      { id: 'hat-two', start: 8, duration: 8 },
    );
    pattern.kick[0].push({ id: 'kick-quarter', start: 0, duration: 4 });

    const result = layout(pattern);

    expect(result.notes.find((note) => note.eventId === 'kick-quarter')?.stemDirection).toBe('up');
  });

  it('combines matching rhythms from different instruments into one voice by default', () => {
    const pattern = createPattern();
    pattern.closedHat[0].push(
      { id: 'hat-one', start: 0, duration: 8 },
      { id: 'hat-two', start: 8, duration: 8 },
    );
    pattern.snare[0].push(
      { id: 'snare-one', start: 0, duration: 8 },
      { id: 'snare-two', start: 8, duration: 8 },
    );

    const result = layout(pattern);
    const beamIds = new Set(result.notes.map((note) => note.beamGroupId));

    expect(result.beams).toHaveLength(1);
    expect(beamIds).toEqual(new Set([result.beams[0].id]));
    expect(result.beams[0].xEnd).toBeGreaterThan(result.beams[0].xStart);
  });

  it('shares one stem and flag for a simultaneous un-beamed eighth-note hit', () => {
    const pattern = createPattern();
    pattern.closedHat[0].push({ id: 'hat-one', start: 0, duration: 8 });
    pattern.snare[0].push({ id: 'snare-one', start: 0, duration: 8 });

    const result = layout(pattern);

    expect(result.beams).toEqual([]);
    expect(result.notes.filter((note) => note.stemmed)).toHaveLength(1);
    expect(result.notes.find((note) => note.stemmed)?.stemEndOffset).toBe(-58);
  });

  it('keeps instrument rhythms in separate voices when voice combining is disabled', () => {
    const pattern = createPattern();
    pattern.closedHat[0].push(
      { id: 'hat-one', start: 0, duration: 8 },
      { id: 'hat-two', start: 8, duration: 8 },
    );
    pattern.snare[0].push(
      { id: 'snare-one', start: 0, duration: 8 },
      { id: 'snare-two', start: 8, duration: 8 },
    );

    const result = layout(pattern, 0, true, false);

    expect(result.beams).toHaveLength(2);
    expect(new Set(result.notes.map((note) => note.beamGroupId)).size).toBe(2);
  });

  it('leaves notes un-beamed when automatic beaming is disabled', () => {
    const pattern = createPattern();
    pattern.closedHat[0].push(
      { id: 'hat-one', start: 0, duration: 8 },
      { id: 'hat-two', start: 8, duration: 8 },
    );

    const result = layout(pattern, 0, false);

    expect(result.beams).toEqual([]);
    expect(result.notes.every((note) => note.beamGroupId === undefined)).toBe(true);
  });

  it('renders manually connected notes when automatic beaming is disabled', () => {
    const pattern = createPattern();
    pattern.closedHat[0].push(
      { id: 'hat-one', start: 0, duration: 8, manualBeamGroupId: 'manual-1' },
      { id: 'hat-two', start: 8, duration: 8, manualBeamGroupId: 'manual-1' },
    );

    const result = layout(pattern, 0, false);

    expect(result.beams).toHaveLength(1);
    expect(result.beams[0].id).toBe('manual-beam-manual-1');
    expect(result.notes.map((note) => note.beamGroupId)).toEqual([
      'manual-beam-manual-1',
      'manual-beam-manual-1',
    ]);
  });

  it('slightly offsets beams from different instruments on the same beat', () => {
    const pattern = createPattern();
    pattern.kick[0].push(
      { id: 'kick-one', start: 0, duration: 16 },
      { id: 'kick-two', start: 4, duration: 16 },
    );
    pattern.snare[0].push(
      { id: 'snare-one', start: 8, duration: 16 },
      { id: 'snare-two', start: 12, duration: 16 },
    );

    const result = layout(pattern, 0, true, false);
    const offsets = result.beams.map((beam) => {
      const note = result.notes.find((fragment) => fragment.instrumentId === beam.instrumentId);
      if (!note) {
        throw new Error('Instrumentnote wurde nicht angelegt.');
      }
      const baseY = note.y + (beam.direction === 'down' ? 34 : -34);
      return beam.y - baseY;
    });

    expect(offsets.some((offset) => offset !== 0)).toBe(true);
    expect(offsets.every((offset) => Math.abs(offset) <= 3)).toBe(true);
  });

  it('moves upward beams clear of other instrument noteheads', () => {
    const pattern = createPattern();
    pattern.snare[0].push(
      { id: 'snare-one', start: 0, duration: 8, stemDirection: 'up' },
      { id: 'snare-two', start: 8, duration: 8, stemDirection: 'up' },
    );
    pattern.openHat[0].push({ id: 'hat-hit', start: 4, duration: 4 });

    const result = layout(pattern);
    const beam = result.beams[0];

    expect(beam.direction).toBe('up');
    expect(beam.y + 3).toBeLessThan(44 - 4);
  });

  it('moves downward beams clear of other instrument noteheads', () => {
    const pattern = createPattern();
    pattern.tom1[0].push(
      { id: 'tom-one', start: 0, duration: 8, stemDirection: 'down' },
      { id: 'tom-two', start: 8, duration: 8, stemDirection: 'down' },
    );
    pattern.floorTom[0].push({ id: 'floor-hit', start: 4, duration: 4 });

    const result = layout(pattern);
    const beam = result.beams[0];

    expect(beam.direction).toBe('down');
    expect(beam.y - 3).toBeGreaterThan(100 + 4);
  });

  it('places a colliding beam above the other note when requested', () => {
    const pattern = createPattern();
    pattern.tom1[0].push(
      { id: 'tom-one', start: 0, duration: 8, stemDirection: 'down', beamCollisionSide: 'above' },
      { id: 'tom-two', start: 8, duration: 8, stemDirection: 'down', beamCollisionSide: 'above' },
    );
    pattern.floorTom[0].push({ id: 'floor-hit', start: 4, duration: 4 });

    const result = layout(pattern);
    const beam = result.beams[0];

    expect(beam.y).toBeLessThanOrEqual(100 - 8);
    expect(beam.collisionSide).toBe('above');
  });

  it('moves a beam above notes in its span even without an initial collision', () => {
    const pattern = createPattern();
    pattern.floorTom[0].push(
      { id: 'floor-one', start: 0, duration: 8, stemDirection: 'up', beamCollisionSide: 'above' },
      { id: 'floor-two', start: 8, duration: 8, stemDirection: 'up', beamCollisionSide: 'above' },
    );
    pattern.closedHat[0].push({ id: 'hat-hit', start: 4, duration: 4 });

    const result = layout(pattern);
    const beam = result.beams[0];

    expect(beam.y + 3).toBeLessThanOrEqual(52 - 8);
    expect(beam.collisionSide).toBe('above');
  });

  it('places a colliding beam below the other note when requested', () => {
    const pattern = createPattern();
    pattern.tom1[0].push(
      { id: 'tom-one', start: 0, duration: 8, stemDirection: 'down', beamCollisionSide: 'below' },
      { id: 'tom-two', start: 8, duration: 8, stemDirection: 'down', beamCollisionSide: 'below' },
    );
    pattern.floorTom[0].push({ id: 'floor-hit', start: 4, duration: 4 });

    const result = layout(pattern);
    const beam = result.beams[0];

    expect(beam.y - 3).toBeGreaterThanOrEqual(100 + 8);
    expect(beam.collisionSide).toBe('below');
  });
});
