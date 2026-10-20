export type DrumId =
  | 'kick'
  | 'snare'
  | 'closedHat'
  | 'openHat'
  | 'crash'
  | 'tom1'
  | 'tom2'
  | 'floorTom';
export type NoteValue = 1 | 2 | 4 | 8 | 16 | 32 | 64;
export type ToolMode = 'notes' | 'rests' | 'freeText' | 'noteText' | 'select';
export type NoteTextPosition = 'above' | 'below';
export type StemDirection = 'up' | 'down';

export interface DrumInstrument {
  id: DrumId;
  name: string;
  abbreviation: string;
  note: string;
  color: string;
}

export interface DrumNote {
  id: string;
  start: number;
  duration: NoteValue;
  manualBeamGroupId?: string;
  stemDirection?: StemDirection;
  tuplet?: {
    id: string;
    count: number;
    inTimeOf: number;
    index: number;
  };
}

export interface DrumRest {
  id: string;
  start: number;
  duration: NoteValue;
}

export interface ScoreAnnotation {
  id: string;
  text: string;
  step: number;
  y: number;
  noteId?: string;
}

export interface RenderedAnnotation extends ScoreAnnotation {
  x: number;
  kind: 'free' | 'note';
}

export interface ScoreFragment {
  id: string;
  eventId: string;
  instrumentId: DrumId;
  instrumentName: string;
  sourceMeasure: number;
  sourceStep: number;
  measureStep: number;
  x: number;
  y: number;
  duration: NoteValue;
  stemDirection: StemDirection;
  filledHead: boolean;
  stemmed: boolean;
  flagCount: number;
  beamGroupId?: string;
  beamStemOffset?: number;
  manualBeamGroupId?: string;
  tupletId?: string;
  tupletCount?: number;
  tupletInTimeOf?: number;
  tupletIndex?: number;
  tieArcIn?: string;
  tieArcOut?: string;
  label: string;
}

export interface ScoreTupletMarker {
  id: string;
  count: number;
  inTimeOf: number;
  xStart: number;
  xEnd: number;
}

export interface ScoreBeamMarker {
  id: string;
  instrumentId: DrumId;
  direction: StemDirection;
  levels: number;
  xStart: number;
  xEnd: number;
  y: number;
  tupletId?: string;
  tupletCount?: number;
  tupletInTimeOf?: number;
  tupletIndexStart?: number;
}

export interface ScoreRestFragment {
  id: string;
  eventId: string;
  instrumentId: DrumId;
  sourceMeasure: number;
  sourceStep: number;
  measureStep: number;
  x: number;
  y: number;
  duration: NoteValue;
  label: string;
}

export type Pattern = Record<DrumId, DrumNote[][]>;
export type RestPattern = Record<DrumId, DrumRest[][]>;

export interface PatternSnapshot {
  tempo: number;
  measures: number;
  numerator: number;
  denominator: number;
  noteTextPosition?: NoteTextPosition;
  autoBeaming?: boolean;
  stemDirection?: StemDirection;
  pattern: Pattern;
  rests?: RestPattern;
  annotations: ScoreAnnotation[][];
}
