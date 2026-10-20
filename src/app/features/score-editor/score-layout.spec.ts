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

function layout(pattern: Pattern, measureIndex = 0, autoBeaming = true) {
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

    const result = layout(pattern);
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
});
