import type { DrumInstrument, NoteValue } from './models/score.model';

export const DRUM_INSTRUMENTS: readonly DrumInstrument[] = [
  { id: 'crash', name: 'Crash-Becken', abbreviation: 'CR', note: '×', color: 'coral' },
  { id: 'openHat', name: 'Hi-Hat offen', abbreviation: 'OH', note: '○', color: 'gold' },
  { id: 'closedHat', name: 'Hi-Hat geschlossen', abbreviation: 'HH', note: '×', color: 'gold' },
  { id: 'tom1', name: 'Erstes Tom', abbreviation: 'T1', note: '●', color: 'blue' },
  { id: 'snare', name: 'Snare', abbreviation: 'SD', note: '●', color: 'blue' },
  { id: 'tom2', name: 'Zweites Tom', abbreviation: 'T2', note: '●', color: 'violet' },
  { id: 'floorTom', name: 'Floortom', abbreviation: 'FT', note: '●', color: 'coral' },
  { id: 'kick', name: 'Bass Drum', abbreviation: 'BD', note: '●', color: 'violet' },
];

export const NOTE_VALUES: readonly { value: NoteValue; name: string; label: string }[] = [
  { value: 1, name: 'Ganze Note', label: 'Ganze' },
  { value: 2, name: 'Halbe Note', label: 'Halbe' },
  { value: 4, name: 'Viertelnote', label: 'Viertel' },
  { value: 8, name: 'Achtelnote', label: 'Achtel' },
  { value: 16, name: 'Sechzehntelnote', label: 'Sechzehntel' },
  { value: 32, name: 'Zweiunddreißigstelnote', label: '32tel' },
  { value: 64, name: 'Vierundsechzigstelnote', label: '64tel' },
];

export const STAFF_LINES = [52, 64, 76, 88, 100];
export const TIME_SIGNATURE_DENOMINATORS = [1, 2, 4, 8, 16, 32, 64];
export const SCORE_CONTENT_OFFSET_Y = 22;
export const SCORE_SHEET_HEIGHT = 183;
export const NOTE_TEXT_ABOVE_Y = 13;
export const NOTE_TEXT_BELOW_Y = 148;
