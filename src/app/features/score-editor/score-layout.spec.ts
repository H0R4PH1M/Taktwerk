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
});
