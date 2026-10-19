import type { NoteValue } from './models/score.model';

export interface NotationPart {
  measureIndex: number;
  start: number;
  duration: NoteValue;
}

export function restSymbolForDuration(duration: NoteValue): string {
  switch (duration) {
    case 1:
      return '𝄻';
    case 2:
      return '𝄼';
    case 4:
      return '𝄽';
    case 8:
      return '𝄾';
    case 16:
      return '𝄿';
    case 32:
      return '𝅀';
    case 64:
      return '𝅁';
  }
}

export function splitIntoNotationParts(
  eventStart: number,
  eventEnd: number,
  ticksPerMeasure: number,
  ticksPerWholeNote: number,
  noteValues: readonly { value: NoteValue }[],
): NotationPart[] {
  const parts: NotationPart[] = [];
  const durationValues = [...noteValues].sort(
    (left, right) => ticksPerWholeNote / right.value - ticksPerWholeNote / left.value,
  );
  let cursor = eventStart;

  while (cursor < eventEnd) {
    const measureIndex = Math.floor(cursor / ticksPerMeasure);
    const measureStart = measureIndex * ticksPerMeasure;
    const measureEnd = measureStart + ticksPerMeasure;
    const segmentEnd = Math.min(eventEnd, measureEnd);
    let remaining = segmentEnd - cursor;
    while (remaining > 0) {
      const value = durationValues.find(
        (duration) => ticksPerWholeNote / duration.value <= remaining,
      );
      if (!value) {
        throw new Error('Notenlänge kann nicht im Notenraster dargestellt werden.');
      }
      const ticks = ticksPerWholeNote / value.value;
      parts.push({ measureIndex, start: cursor - measureStart, duration: value.value });
      cursor += ticks;
      remaining -= ticks;
    }
  }

  return parts;
}

export function makeTieArc(fromX: number, toX: number, y: number): string {
  const midpoint = (fromX + toX) / 2;
  return `M ${fromX} ${y + 5} Q ${midpoint} ${y + 15} ${toX} ${y + 5}`;
}
