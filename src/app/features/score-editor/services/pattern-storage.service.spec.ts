import { describe, expect, it } from 'vitest';
import {
  DRUM_INSTRUMENTS,
  NOTE_VALUES,
  TIME_SIGNATURE_DENOMINATORS,
} from '../score-editor.constants';
import { PatternStorageService } from './pattern-storage.service';

describe('PatternStorageService', () => {
  it('imports exported JSON and reads its time signature', () => {
    const service = new PatternStorageService();
    const tracks = Object.fromEntries(DRUM_INSTRUMENTS.map(({ id }) => [id, [[]]]));
    const fileContents = JSON.stringify({
      tempo: 112,
      timeSignature: '6/8',
      measures: 1,
      pattern: tracks,
      rests: tracks,
      annotations: [[]],
    });

    const imported = service.importJson(
      fileContents,
      DRUM_INSTRUMENTS,
      NOTE_VALUES,
      TIME_SIGNATURE_DENOMINATORS,
      () => 'note-imported',
    );

    expect(imported.tempo).toBe(112);
    expect(imported.numerator).toBe(6);
    expect(imported.denominator).toBe(8);
    expect(imported.measures).toBe(1);
  });

  it('imports patterns with more than four measures', () => {
    const service = new PatternStorageService();
    const tracks = Object.fromEntries(
      DRUM_INSTRUMENTS.map(({ id }) => [id, Array.from({ length: 5 }, () => [])]),
    );

    const imported = service.importJson(
      JSON.stringify({
        tempo: 112,
        measures: 5,
        numerator: 4,
        denominator: 4,
        pattern: tracks,
        rests: tracks,
        annotations: Array.from({ length: 5 }, () => []),
      }),
      DRUM_INSTRUMENTS,
      NOTE_VALUES,
      TIME_SIGNATURE_DENOMINATORS,
      () => 'note-imported',
    );

    expect(imported.measures).toBe(5);
  });

  it('rejects invalid JSON', () => {
    const service = new PatternStorageService();

    expect(() =>
      service.importJson(
        '{',
        DRUM_INSTRUMENTS,
        NOTE_VALUES,
        TIME_SIGNATURE_DENOMINATORS,
        () => 'note-imported',
      ),
    ).toThrow('Ungültige JSON-Datei.');
  });
});
