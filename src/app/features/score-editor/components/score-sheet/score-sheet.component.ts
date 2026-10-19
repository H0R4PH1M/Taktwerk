import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import {
  DRUM_INSTRUMENTS,
  SCORE_CONTENT_OFFSET_Y,
  SCORE_SHEET_HEIGHT,
} from '../../score-editor.constants';
import type {
  DrumId,
  NoteValue,
  RenderedAnnotation,
  ScoreBeamMarker,
  ScoreFragment,
  ScoreRestFragment,
  ScoreTupletMarker,
  StemDirection,
  ToolMode,
} from '../../models/score.model';
import { restSymbolForDuration } from '../../score-notation';

export interface ScoreMeasureView {
  index: number;
  notes: ScoreFragment[];
  beams: ScoreBeamMarker[];
  rests: ScoreRestFragment[];
  tuplets: ScoreTupletMarker[];
  annotations: RenderedAnnotation[];
}

interface SelectionMarquee {
  measureIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

@Component({
  selector: 'app-score-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './score-sheet.component.html',
  styleUrl: './score-sheet.component.css',
})
export class ScoreSheetComponent {
  protected readonly scoreSheetHeight = SCORE_SHEET_HEIGHT;
  protected readonly scoreContentOffsetY = SCORE_CONTENT_OFFSET_Y;
  protected readonly tupletBracketTop = SCORE_CONTENT_OFFSET_Y - 15;
  protected readonly tupletBracketBottom = SCORE_CONTENT_OFFSET_Y - 11;
  protected readonly tupletLabelY = SCORE_CONTENT_OFFSET_Y - 19;
  protected readonly tupletLabelTextY = SCORE_CONTENT_OFFSET_Y - 10;
  readonly measures = input.required<ScoreMeasureView[]>();
  readonly measureSteps = input.required<number[]>();
  readonly staffLines = input.required<number[]>();
  readonly numerator = input.required<number>();
  readonly denominator = input.required<number>();
  readonly subdivisionLabel = input.required<string>();
  readonly tempo = input.required<number>();
  readonly stepsPerMeasure = input.required<number>();
  readonly measureWidth = input.required<number>();
  readonly staffStartX = input.required<number>();
  readonly staffEndX = input.required<number>();
  readonly staffWidth = input.required<number>();
  readonly toolMode = input.required<ToolMode>();
  readonly playingStep = input.required<number>();
  readonly pastePending = input.required<boolean>();
  readonly selectedNoteIds = input.required<string[]>();
  readonly selectedAnnotationIds = input.required<string[]>();

  readonly placementClicked = output<{
    event: Event;
    measureIndex: number;
    step: number;
    keyboardInstrument?: DrumId;
  }>();
  readonly noteClicked = output<{
    event: Event;
    measureIndex: number;
    note: ScoreFragment;
  }>();
  readonly noteSelectionToggled = output<{ noteId: string; additive: boolean }>();
  readonly selectionChanged = output<{
    noteIds: string[];
    annotationIds: string[];
    additive: boolean;
  }>();
  readonly annotationRemoved = output<{
    event: Event;
    measureIndex: number;
    annotationId: string;
  }>();
  readonly addMeasureClicked = output<void>();
  readonly removeMeasureClicked = output<void>();
  private readonly keyboardInstrumentIndex = signal(2);
  protected readonly selectionMarquee = signal<SelectionMarquee | undefined>(undefined);
  private selectionPointer?: {
    svg: SVGSVGElement;
    pointerId: number;
    measureIndex: number;
    clientX: number;
    clientY: number;
    svgX: number;
    svgY: number;
    additive: boolean;
  };
  private suppressNextClick = false;
  protected readonly keyboardInstrument = computed(
    () => DRUM_INSTRUMENTS[this.keyboardInstrumentIndex()].id,
  );
  protected readonly keyboardInstrumentName = computed(
    () => DRUM_INSTRUMENTS[this.keyboardInstrumentIndex()].name,
  );

  noteFlags(value: number): number[] {
    return Array.from({ length: Math.max(0, Math.log2(value) - 2) }, (_, index) => index);
  }

  restSymbol(duration: NoteValue): string {
    return restSymbolForDuration(duration);
  }

  tupletBracketPath(tuplet: ScoreTupletMarker): string {
    const center = (tuplet.xStart + tuplet.xEnd) / 2;
    const labelGap = Math.min(
      this.tupletLabelWidth(tuplet.count, tuplet.inTimeOf) / 2 + 1,
      Math.max(0, (tuplet.xEnd - tuplet.xStart - 2) / 2),
    );
    return `M ${tuplet.xStart} ${this.tupletBracketTop} V ${this.tupletBracketBottom} H ${center - labelGap} M ${center + labelGap} ${this.tupletBracketBottom} H ${tuplet.xEnd} V ${this.tupletBracketTop}`;
  }

  tupletLabel(count: number, inTimeOf: number): string {
    return inTimeOf === 2 ? `${count}` : `${count}:${inTimeOf}`;
  }

  tupletLabelWidth(count: number, inTimeOf: number): number {
    return Math.max(8, this.tupletLabel(count, inTimeOf).length * 5.5);
  }

  hasTupletBeam(beams: ScoreBeamMarker[], tupletId: string): boolean {
    return beams.some(
      (beam) => beam.tupletId === tupletId && beam.tupletIndexStart === 0,
    );
  }

  beamLevels(levels: number): number[] {
    return Array.from({ length: levels }, (_, index) => index);
  }

  beamStemEnd(levels: number, offset: number, direction: StemDirection): number {
    return direction === 'down'
      ? 34 + offset - (levels - 1) * 5
      : -34 + offset + (levels - 1) * 5;
  }

  beamPath(beam: ScoreBeamMarker, level: number): string {
    const y = beam.y + (beam.direction === 'down' ? -level * 5 : level * 5);
    const outerY = y + (beam.direction === 'down' ? -3 : 3);
    return `M ${beam.xStart} ${y} L ${beam.xEnd} ${y} L ${beam.xEnd} ${outerY} L ${beam.xStart} ${outerY} Z`;
  }

  protected handlePlacementClick(event: Event, measureIndex: number, step: number): void {
    if (this.consumeSuppressedClick(event)) {
      return;
    }
    this.placementClicked.emit({ event, measureIndex, step });
  }

  protected handleNoteClick(event: Event, measureIndex: number, note: ScoreFragment): void {
    event.stopPropagation();
    if (this.consumeSuppressedClick(event)) {
      return;
    }
    if (this.toolMode() === 'select') {
      if (this.pastePending()) {
        this.placementClicked.emit({
          event,
          measureIndex: note.sourceMeasure,
          step: note.sourceStep,
        });
        return;
      }
      const additive = event instanceof MouseEvent && (event.ctrlKey || event.metaKey);
      this.noteSelectionToggled.emit({ noteId: note.eventId, additive });
      return;
    }
    this.noteClicked.emit({ event, measureIndex, note });
  }

  protected startSelection(event: PointerEvent, measureIndex: number): void {
    if (
      event.button !== 0 ||
      this.toolMode() !== 'select' ||
      (event.target instanceof Element &&
        event.target.closest('.score-note, .score-rest, .score-annotation'))
    ) {
      return;
    }
    const svg = event.currentTarget as SVGSVGElement;
    const point = this.svgPoint(svg, event);
    if (!point) {
      return;
    }
    this.selectionPointer = {
      svg,
      pointerId: event.pointerId,
      measureIndex,
      clientX: event.clientX,
      clientY: event.clientY,
      svgX: point.x,
      svgY: point.y,
      additive: event.ctrlKey || event.metaKey,
    };
  }

  protected moveSelection(event: PointerEvent): void {
    const pointer = this.selectionPointer;
    if (!pointer || pointer.pointerId !== event.pointerId) {
      return;
    }
    const point = this.svgPoint(pointer.svg, event);
    if (!point) {
      return;
    }
    const width = Math.abs(event.clientX - pointer.clientX);
    const height = Math.abs(event.clientY - pointer.clientY);
    if (Math.hypot(width, height) < 4) {
      return;
    }
    event.preventDefault();
    this.selectionMarquee.set({
      measureIndex: pointer.measureIndex,
      x: Math.min(pointer.svgX, point.x),
      y: Math.min(pointer.svgY, point.y),
      width: Math.abs(point.x - pointer.svgX),
      height: Math.abs(point.y - pointer.svgY),
    });
  }

  protected endSelection(event: PointerEvent): void {
    const pointer = this.selectionPointer;
    if (!pointer || pointer.pointerId !== event.pointerId) {
      return;
    }
    this.selectionPointer = undefined;
    const marquee = this.selectionMarquee();
    this.selectionMarquee.set(undefined);
    if (!marquee || marquee.measureIndex !== pointer.measureIndex) {
      return;
    }

    const left = Math.min(pointer.clientX, event.clientX);
    const right = Math.max(pointer.clientX, event.clientX);
    const top = Math.min(pointer.clientY, event.clientY);
    const bottom = Math.max(pointer.clientY, event.clientY);
    const noteIds = Array.from(pointer.svg.querySelectorAll<SVGGElement>('.score-note'))
      .filter((note) => {
        const bounds = note.querySelector('.note-hit-area')?.getBoundingClientRect();
        if (!bounds) {
          return false;
        }
        const x = bounds.left + bounds.width / 2;
        const y = bounds.top + bounds.height / 2;
        return x >= left && x <= right && y >= top && y <= bottom;
      })
      .map((note) => note.getAttribute('data-event-id'))
      .filter((noteId): noteId is string => noteId !== null);
    const annotationIds = Array.from(
      pointer.svg.querySelectorAll<SVGTextElement>('.score-annotation'),
    )
      .filter((annotation) => {
        const bounds = annotation.getBoundingClientRect();
        const x = bounds.left + bounds.width / 2;
        const y = bounds.top + bounds.height / 2;
        return x >= left && x <= right && y >= top && y <= bottom;
      })
      .map((annotation) => annotation.getAttribute('data-annotation-id'))
      .filter((annotationId): annotationId is string => annotationId !== null);
    this.suppressNextClick = true;
    window.setTimeout(() => (this.suppressNextClick = false));
    this.selectionChanged.emit({ noteIds, annotationIds, additive: pointer.additive });
  }

  protected cancelSelection(event: PointerEvent): void {
    if (this.selectionPointer?.pointerId === event.pointerId) {
      this.selectionPointer = undefined;
      this.selectionMarquee.set(undefined);
    }
  }

  protected handlePlacementKeydown(
    event: KeyboardEvent,
    measureIndex: number,
    step: number,
  ): void {
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      const direction = event.key === 'ArrowUp' ? -1 : 1;
      this.keyboardInstrumentIndex.update(
        (index) =>
          (index + direction + DRUM_INSTRUMENTS.length) % DRUM_INSTRUMENTS.length,
      );
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.placementClicked.emit({
        event,
        measureIndex,
        step,
        keyboardInstrument: this.keyboardInstrument(),
      });
    }
  }

  private svgPoint(svg: SVGSVGElement, event: PointerEvent): DOMPoint | undefined {
    const transform = svg.getScreenCTM();
    if (!transform) {
      return undefined;
    }
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    return point.matrixTransform(transform.inverse());
  }

  private consumeSuppressedClick(event: Event): boolean {
    if (!this.suppressNextClick) {
      return false;
    }
    this.suppressNextClick = false;
    event.preventDefault();
    event.stopPropagation();
    return true;
  }
}
