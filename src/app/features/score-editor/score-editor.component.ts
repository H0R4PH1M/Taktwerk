import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  HostListener,
  inject,
  signal,
} from '@angular/core';
import type { OnDestroy } from '@angular/core';
import { PatternStorageService } from './services/pattern-storage.service';
import { ScorePlaybackService } from './services/score-playback.service';
import { PdfExportService } from './services/pdf-export.service';
import type {
  DrumId,
  DrumNote,
  DrumRest,
  NoteTextPosition,
  NoteValue,
  Pattern,
  PatternSnapshot,
  RenderedAnnotation,
  RestPattern,
  ScoreAnnotation,
  ScoreFragment,
  ScoreRestFragment,
  StemDirection,
  ToolMode,
} from './models/score.model';
import type {
  NoteEditChange,
  SelectionAnnotationEdit,
  SelectionNoteEdit,
} from './components/editor-toolbox/editor-toolbox.component';
import {
  DRUM_INSTRUMENTS,
  NOTE_VALUES,
  NOTE_TEXT_ABOVE_Y,
  NOTE_TEXT_BELOW_Y,
  SCORE_CONTENT_OFFSET_Y,
  SCORE_SHEET_HEIGHT,
  STAFF_LINES,
  TIME_SIGNATURE_DENOMINATORS,
} from './score-editor.constants';
import { splitIntoNotationParts } from './score-notation';
import { layoutScoreMeasure } from './score-layout';
import { EditorToolbarComponent } from './components/editor-toolbar/editor-toolbar.component';
import { EditorToolboxComponent } from './components/editor-toolbox/editor-toolbox.component';
import { PatternActionsComponent } from './components/pattern-actions/pattern-actions.component';
import type { PdfExportSettings } from './models/pdf-export.model';
import { ScoreSheetComponent } from './components/score-sheet/score-sheet.component';
import type { ScoreMeasureView } from './components/score-sheet/score-sheet.component';
import { BUILD_INFO } from '../../build-info.generated';

const MAX_UNDO_ENTRIES = 50;

interface ActiveTupletGroup {
  id: string;
  count: number;
  inTimeOf: number;
  duration: NoteValue;
  start: number;
  measureIndex: number;
  nextIndex: number;
}

interface ClipboardNote {
  sourceId: string;
  instrumentId: DrumId;
  absoluteStart: number;
  duration: NoteValue;
  stemDirection?: StemDirection;
  tuplet?: DrumNote['tuplet'];
}

interface ClipboardAnnotation {
  annotation: ScoreAnnotation;
  absoluteStep: number;
  sourceNoteId?: string;
}

interface ScoreClipboard {
  origin: number;
  notes: ClipboardNote[];
  annotations: ClipboardAnnotation[];
}

interface UndoEntry {
  measures: number;
  numerator: number;
  denominator: number;
  pattern: Pattern;
  rests: RestPattern;
  annotations: ScoreAnnotation[][];
  tempo?: number;
  noteTextPosition?: NoteTextPosition;
  autoBeaming?: boolean;
  stemDirection?: StemDirection;
}

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    EditorToolbarComponent,
    EditorToolboxComponent,
    PatternActionsComponent,
    ScoreSheetComponent,
  ],
  templateUrl: './score-editor.html',
  styleUrl: './score-editor.css',
})
export class ScoreEditorComponent implements OnDestroy {
  protected readonly buildInfo = BUILD_INFO;
  protected readonly instruments = DRUM_INSTRUMENTS;
  protected readonly noteValues = NOTE_VALUES;
  protected readonly staffLines = STAFF_LINES;
  protected readonly measureIndexes = signal([0, 1]);
  protected readonly tempo = signal(92);
  protected readonly timeSignatureNumerator = signal(4);
  protected readonly timeSignatureDenominator = signal(4);
  protected readonly timeSignatureDenominators = TIME_SIGNATURE_DENOMINATORS;
  protected readonly selectedNoteValue = signal<NoteValue>(4);
  protected readonly selectedRestValue = signal<NoteValue>(4);
  protected readonly selectedInstrumentId = signal<DrumId | null>(null);
  protected readonly autoBeaming = signal(true);
  protected readonly stemDirection = signal<StemDirection>('up');
  protected readonly tupletsEnabled = signal(false);
  protected readonly tupletCount = signal(3);
  protected readonly tupletInTimeOf = signal(2);
  protected readonly toolMode = signal<ToolMode>('notes');
  protected readonly noteTextPosition = signal<NoteTextPosition>('above');
  protected readonly selectedNoteIds = signal<string[]>([]);
  protected readonly selectedAnnotationIds = signal<string[]>([]);
  protected readonly selectedObjectCount = computed(
    () => this.selectedNoteIds().length + this.selectedAnnotationIds().length,
  );
  protected readonly undoHistory = signal<UndoEntry[]>([]);
  protected readonly undoAvailable = computed(() => this.undoHistory().length > 0);
  protected readonly editingSelection = signal(false);
  protected readonly pastePending = signal(false);
  protected readonly fillMeasurePending = signal(false);
  protected readonly clipboard = signal<ScoreClipboard | undefined>(undefined);
  protected readonly clipboardAvailable = computed(() => this.clipboard() !== undefined);
  protected readonly selectedNoteEdit = computed<SelectionNoteEdit | null>(() => {
    if (this.selectedNoteIds().length !== 1 || this.selectedAnnotationIds().length !== 0) {
      return null;
    }
    const noteId = this.selectedNoteIds()[0];
    for (const instrument of this.instruments) {
      for (let measureIndex = 0; measureIndex < this.pattern()[instrument.id].length; measureIndex++) {
        const note = this.pattern()[instrument.id][measureIndex].find((item) => item.id === noteId);
        if (note) {
          return {
            id: note.id,
            instrumentId: instrument.id,
            measureIndex,
            start: note.start,
            duration: note.duration,
            isTuplet: note.tuplet !== undefined,
          };
        }
      }
    }
    return null;
  });
  protected readonly selectedAnnotationEdit = computed<SelectionAnnotationEdit | null>(() => {
    if (this.selectedAnnotationIds().length !== 1 || this.selectedNoteIds().length !== 0) {
      return null;
    }
    const annotationId = this.selectedAnnotationIds()[0];
    return (
      this.annotations()
        .flat()
        .find((annotation) => annotation.id === annotationId) ?? null
    );
  });
  protected readonly selectedNoteCount = computed(() => {
    const selected = new Set(this.selectedNoteIds());
    return this.instruments.reduce(
      (count, instrument) =>
        count + this.pattern()[instrument.id].flat().filter((note) => selected.has(note.id)).length,
      0,
    );
  });
  protected readonly annotationInput = signal('');
  protected readonly ticksPerWholeNote = computed(() =>
    Math.max(64, this.timeSignatureDenominator()),
  );
  protected readonly stepsPerMeasure = computed(
    () =>
      (this.timeSignatureNumerator() * this.ticksPerWholeNote()) /
      this.timeSignatureDenominator(),
  );
  protected readonly measureSteps = computed(() =>
    Array.from({ length: this.stepsPerMeasure() }, (_, index) => index),
  );
  protected readonly subdivisionLabel = computed(() => `${this.ticksPerWholeNote()}tel`);
  protected readonly scoreMeasures = computed<ScoreMeasureView[]>(() =>
    this.measureIndexes().map((index) => {
      const noteLayout = layoutScoreMeasure({
        measureIndex: index,
        pattern: this.pattern(),
        instruments: this.instruments,
        noteValues: this.noteValues,
        stepsPerMeasure: this.stepsPerMeasure(),
        ticksPerWholeNote: this.ticksPerWholeNote(),
        numerator: this.timeSignatureNumerator(),
        denominator: this.timeSignatureDenominator(),
        autoBeaming: this.autoBeaming(),
        stemDirection: this.stemDirection(),
        measureWidth: this.measureWidth(),
      });
      return {
        index,
        ...noteLayout,
        rests: this.restsForMeasure(index),
        annotations: this.annotationsForMeasure(index, noteLayout.notes),
      };
    }),
  );
  private noteIdCounter = 0;
  private restIdCounter = 0;
  private annotationIdCounter = 0;
  private tupletIdCounter = 0;
  private activeTupletGroup = signal<ActiveTupletGroup | undefined>(undefined);
  protected readonly pattern = signal<Pattern>(this.createStarterPattern());
  protected readonly rests = signal<RestPattern>(this.createEmptyRests(2));
  protected readonly annotations = signal<ScoreAnnotation[][]>(this.createEmptyAnnotations(2));
  protected readonly message = signal('');

  private readonly playback = inject(ScorePlaybackService);
  protected readonly playingStep = this.playback.playingStep;
  protected readonly isPlaying = this.playback.isPlaying;
  private readonly patternStorage = inject(PatternStorageService);
  private readonly pdfExport = inject(PdfExportService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    this.restorePattern();
  }

  ngOnDestroy(): void {
    this.stopPlayback();
  }

  protected measureWidth(): number {
    return Math.max(680, 180 + this.stepsPerMeasure() * 10);
  }

  protected staffStartX(): number {
    return 112;
  }

  protected staffEndX(): number {
    return this.measureWidth() - 24;
  }

  protected staffWidth(): number {
    return this.staffEndX() - this.staffStartX();
  }

  protected xForStep(step: number): number {
    return this.staffStartX() + (step / this.stepsPerMeasure()) * this.staffWidth();
  }

  protected instrumentY(instrumentId: DrumId): number {
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

  protected noteValuesForDuration(duration: NoteValue): string {
    return this.noteValues.find((note) => note.value === duration)?.name ?? 'Note';
  }

  protected restsForMeasure(measureIndex: number): ScoreRestFragment[] {
    const ticksPerMeasure = this.stepsPerMeasure();
    const fragments: ScoreRestFragment[] = [];

    for (const instrument of this.instruments) {
      const track = this.rests()[instrument.id];
      for (let sourceMeasure = 0; sourceMeasure < track.length; sourceMeasure++) {
        for (const rest of track[sourceMeasure]) {
          const eventStart = sourceMeasure * ticksPerMeasure + rest.start;
          const eventEnd = eventStart + this.ticksPerWholeNote() / rest.duration;
          const parts = splitIntoNotationParts(
            eventStart,
            eventEnd,
            ticksPerMeasure,
            this.ticksPerWholeNote(),
            this.noteValues,
          );

          for (const part of parts) {
            if (part.measureIndex !== measureIndex) {
              continue;
            }
            fragments.push({
              id: `${rest.id}:${part.start}`,
              eventId: rest.id,
              instrumentId: instrument.id,
              sourceMeasure,
              sourceStep: rest.start,
              measureStep: part.start,
              x: this.xForStep(part.start),
              y: this.instrumentY(instrument.id),
              duration: part.duration,
              label: `${instrument.name}, ${this.noteValuesForDuration(part.duration)} Pause, Takt ${measureIndex + 1}`,
            });
          }
        }
      }
    }

    return fragments.sort((left, right) => left.x - right.x || left.y - right.y);
  }

  protected annotationsForMeasure(
    measureIndex: number,
    noteFragments: readonly ScoreFragment[],
  ): RenderedAnnotation[] {
    const allAnnotations = this.annotations().flat();
    const freeAnnotations = (this.annotations()[measureIndex] ?? [])
      .filter((annotation) => !annotation.noteId)
      .map((annotation) => ({
        ...annotation,
        x: this.xForStep(annotation.step) + this.staffWidth() / this.stepsPerMeasure() / 2,
        kind: 'free',
      } satisfies RenderedAnnotation));
    const noteAnnotations = allAnnotations.flatMap((annotation) => {
      if (!annotation.noteId) {
        return [];
      }
      const note = noteFragments.find(
        (fragment) =>
          fragment.eventId === annotation.noteId && fragment.sourceMeasure === measureIndex,
      );
      return note
        ? [
            {
              ...annotation,
              x: note.x,
              y:
                annotation.y === NOTE_TEXT_ABOVE_Y || annotation.y === NOTE_TEXT_BELOW_Y
                  ? annotation.y
                  : this.noteTextPosition() === 'above'
                    ? NOTE_TEXT_ABOVE_Y
                    : NOTE_TEXT_BELOW_Y,
              step: note.sourceStep,
              kind: 'note' as const,
            },
          ]
        : [];
    });
    return [...freeAnnotations, ...noteAnnotations];
  }

  protected handlePlacementClick(
    event: Event,
    measureIndex: number,
    step: number,
    keyboardInstrument?: DrumId,
  ): void {
    if (this.fillMeasurePending()) {
      this.fillMeasureAt(measureIndex);
      return;
    }
    switch (this.toolMode()) {
      case 'select':
        if (this.pastePending()) {
          this.pasteAt(measureIndex, step, event);
        } else if (!(event instanceof MouseEvent && (event.ctrlKey || event.metaKey))) {
          this.clearNoteSelection();
        }
        return;
      case 'notes':
        if (this.tupletsEnabled()) {
          this.placeTupletNoteAt(
            measureIndex,
            step,
            this.instrumentForPlacement(event, keyboardInstrument),
            event,
          );
          return;
        }
        const snappedPosition = this.snapPlacementToNoteValue(measureIndex, step, event);
        this.placeNoteAt(
          snappedPosition.measureIndex,
          snappedPosition.step,
          this.instrumentForPlacement(event, keyboardInstrument),
        );
        return;
      case 'rests':
        const snappedRestPosition = this.snapPlacementToNoteValue(
          measureIndex,
          step,
          event,
          this.selectedRestValue(),
        );
        this.placeRestAt(
          snappedRestPosition.measureIndex,
          snappedRestPosition.step,
          this.instrumentForPlacement(event, keyboardInstrument),
        );
        return;
      case 'freeText':
        this.addFreeAnnotation(event, measureIndex, step);
        return;
      case 'noteText':
        this.message.set('Wähle eine Note aus, an die der Text angehängt werden soll.');
        return;
    }
  }

  protected setAnnotationInput(event: Event): void {
    this.annotationInput.set((event.target as HTMLInputElement).value.slice(0, 60));
  }

  protected setAutoBeaming(event: Event): void {
    this.autoBeaming.set((event.target as HTMLInputElement).checked);
  }

  protected setStemDirection(event: Event): void {
    this.stemDirection.set((event.target as HTMLInputElement).checked ? 'down' : 'up');
  }

  protected setSelectedInstrument(instrumentId: DrumId | null): void {
    this.selectedInstrumentId.set(instrumentId);
  }

  protected toggleFillMeasure(): void {
    if (this.selectedInstrumentId() === null) {
      this.message.set('Wähle zuerst ein Instrument aus, um einen Takt zu füllen.');
      return;
    }
    this.fillMeasurePending.update((pending) => !pending);
    this.message.set(
      this.fillMeasurePending()
        ? 'Taktfüllung aktiv. Klicke auf den gewünschten Takt.'
        : 'Taktfüllung abgebrochen.',
    );
  }

  protected toggleNoteSelection(noteId: string, additive: boolean): void {
    if (additive) {
      this.selectedNoteIds.update((selected) =>
        selected.includes(noteId)
          ? selected.filter((selectedId) => selectedId !== noteId)
          : [...selected, noteId],
      );
      return;
    }
    this.updateSelection([noteId], [], false);
  }

  protected updateSelection(
    noteIds: string[],
    annotationIds: string[],
    additive: boolean,
  ): void {
    this.selectedNoteIds.set(
      additive
        ? [...new Set([...this.selectedNoteIds(), ...noteIds])]
        : [...new Set(noteIds)],
    );
    this.selectedAnnotationIds.set(
      additive
        ? [...new Set([...this.selectedAnnotationIds(), ...annotationIds])]
        : [...new Set(annotationIds)],
    );
    this.editingSelection.set(false);
  }

  protected handleAnnotationClick(
    event: Event,
    measureIndex: number,
    annotationId: string,
  ): void {
    event.stopPropagation();
    if (this.fillMeasurePending()) {
      this.fillMeasureAt(measureIndex);
      return;
    }
    if (this.toolMode() === 'select' && this.pastePending()) {
      const annotation = this.annotations()[measureIndex].find(
        (item) => item.id === annotationId,
      );
      if (annotation) {
        this.pasteAt(measureIndex, annotation.step, event);
      }
      return;
    }
    if (this.toolMode() !== 'select') {
      this.removeAnnotation(event, measureIndex, annotationId);
      return;
    }
    const additive = event instanceof MouseEvent && (event.ctrlKey || event.metaKey);
    if (additive) {
      this.selectedAnnotationIds.update((selected) =>
        selected.includes(annotationId)
          ? selected.filter((selectedId) => selectedId !== annotationId)
          : [...selected, annotationId],
      );
      return;
    }
    this.updateSelection([], [annotationId], false);
  }

  protected toggleSelectionEditing(): void {
    this.editingSelection.update((editing) => !editing);
  }

  protected deleteSelectedObjects(): void {
    const selectedNoteIds = new Set(this.selectedNoteIds());
    const selectedAnnotationIds = new Set(this.selectedAnnotationIds());
    if (selectedNoteIds.size === 0 && selectedAnnotationIds.size === 0) {
      return;
    }
    const selectedTupletIds = new Set(
      this.instruments.flatMap((instrument) =>
        this.pattern()[instrument.id]
          .flat()
          .filter((note) => selectedNoteIds.has(note.id) && note.tuplet)
          .flatMap((note) => (note.tuplet ? [note.tuplet.id] : [])),
      ),
    );
    const allNoteIds = this.instruments.flatMap((instrument) =>
      this.pattern()[instrument.id]
        .flat()
        .filter(
          (note) =>
            selectedNoteIds.has(note.id) ||
            (note.tuplet && selectedTupletIds.has(note.tuplet.id)),
        )
        .map((note) => note.id),
    );
    this.clearActiveTupletIfRemoved(allNoteIds);
    this.recordUndo();
    this.pattern.update((pattern) => this.removeNotesFromPattern(pattern, allNoteIds));
    const removed = new Set([...allNoteIds, ...selectedAnnotationIds]);
    const removedNoteIdSet = new Set(allNoteIds);
    this.annotations.update((annotations) =>
      annotations.map((measure) =>
        measure.filter(
          (annotation) =>
            !removed.has(annotation.id) &&
            (!annotation.noteId || !removedNoteIdSet.has(annotation.noteId)),
        ),
      ),
    );
    this.clearNoteSelection();
  }

  protected copySelectedObjects(): void {
    const selectedNoteIds = new Set(this.selectedNoteIds());
    const selectedAnnotationIds = new Set(this.selectedAnnotationIds());
    const noteEntries: ClipboardNote[] = [];
    const notesById = new Map<string, DrumNote>();
    for (const instrument of this.instruments) {
      this.pattern()[instrument.id].forEach((measure, measureIndex) => {
        for (const note of measure) {
          if (selectedNoteIds.has(note.id)) {
            notesById.set(note.id, note);
            if (note.tuplet) {
              for (const relatedInstrument of this.instruments) {
                for (const relatedMeasure of this.pattern()[relatedInstrument.id]) {
                  for (const member of relatedMeasure) {
                    if (member.tuplet?.id === note.tuplet.id) {
                      notesById.set(member.id, member);
                    }
                  }
                }
              }
            }
          }
        }
      });
    }
    for (const instrument of this.instruments) {
      this.pattern()[instrument.id].forEach((measure, measureIndex) => {
        for (const note of measure) {
          if (!notesById.has(note.id)) {
            continue;
          }
          noteEntries.push({
            sourceId: note.id,
            instrumentId: instrument.id,
            absoluteStart: measureIndex * this.stepsPerMeasure() + note.start,
            duration: note.duration,
            stemDirection: note.stemDirection,
            tuplet: note.tuplet,
          });
        }
      });
    }

    const annotationEntries: ClipboardAnnotation[] = [];
    this.annotations().forEach((measure, measureIndex) => {
      for (const annotation of measure) {
        if (
          selectedAnnotationIds.has(annotation.id) ||
          (annotation.noteId !== undefined && notesById.has(annotation.noteId))
        ) {
          annotationEntries.push({
            annotation,
            absoluteStep: measureIndex * this.stepsPerMeasure() + annotation.step,
            sourceNoteId: annotation.noteId,
          });
        }
      }
    });
    const positions = [
      ...noteEntries.map((note) => note.absoluteStart),
      ...annotationEntries.map((annotation) => annotation.absoluteStep),
    ];
    if (positions.length === 0) {
      return;
    }
    this.clipboard.set({
      origin: Math.min(...positions),
      notes: noteEntries,
      annotations: annotationEntries,
    });
    this.pastePending.set(false);
  }

  protected requestPaste(): void {
    if (!this.clipboard()) {
      return;
    }
    this.toolMode.set('select');
    this.pastePending.set(true);
    this.message.set('Klicke im Notenblatt auf die gewünschte Einfügeposition.');
  }

  private pasteAt(measureIndex: number, step: number, event: Event): void {
    const clipboard = this.clipboard();
    if (!clipboard) {
      this.pastePending.set(false);
      return;
    }
    const eventForSnap =
      event.target instanceof Element && event.target.closest('.score-note') ? undefined : event;
    const target = this.snapPlacementToNoteValue(measureIndex, step, eventForSnap);
    const targetStart = target.measureIndex * this.stepsPerMeasure() + target.step;
    const notes = clipboard.notes.map((item) => {
      const absoluteStart = targetStart + item.absoluteStart - clipboard.origin;
      const destinationMeasure = Math.floor(absoluteStart / this.stepsPerMeasure());
      return {
        ...item,
        absoluteStart,
        destinationMeasure,
        localStart: absoluteStart - destinationMeasure * this.stepsPerMeasure(),
        id: this.createNoteId(),
      };
    });
    const noteEnd = Math.max(
      targetStart + 1,
      ...notes.map(
        (note) =>
          note.absoluteStart +
          (this.ticksPerWholeNote() / note.duration) *
            (note.tuplet ? note.tuplet.inTimeOf / note.tuplet.count : 1),
      ),
    );
    const annotationEnd = Math.max(
      targetStart + 1,
      ...clipboard.annotations.map(
        (annotation) => targetStart + annotation.absoluteStep - clipboard.origin + 1,
      ),
    );
    const end = Math.max(noteEnd, annotationEnd);
    if (end > 4 * this.stepsPerMeasure()) {
      this.message.set('Die Auswahl reicht über die maximal vier dargestellten Takte hinaus.');
      this.pastePending.set(false);
      return;
    }
    const requiredMeasures = Math.max(1, Math.ceil(end / this.stepsPerMeasure()));
    this.recordUndo();
    while (this.measureIndexes().length < requiredMeasures) {
      this.addMeasure(false);
    }

    const replacedNoteIds = new Set<string>();
    for (const note of notes) {
      const noteStart =
        note.absoluteStart;
      const noteDuration =
        (this.ticksPerWholeNote() / note.duration) *
        (note.tuplet ? note.tuplet.inTimeOf / note.tuplet.count : 1);
      for (const id of this.overlappingNoteIds(
        this.pattern(),
        note.instrumentId,
        noteStart,
        noteStart + noteDuration,
      )) {
        replacedNoteIds.add(id);
      }
    }
    const replacedIds = [...replacedNoteIds];
    this.clearActiveTupletIfRemoved(replacedIds);
    const newNoteIds = new Map<string, string>();
    const tupletIds = new Map<string, string>();
    for (const note of notes) {
      newNoteIds.set(note.sourceId, note.id);
      if (note.tuplet && !tupletIds.has(note.tuplet.id)) {
        tupletIds.set(note.tuplet.id, this.createTupletId());
      }
    }
    this.pattern.update((pattern) => {
      const updated = this.removeNotesFromPattern(pattern, replacedIds);
      const cloned = {} as Pattern;
      for (const instrument of this.instruments) {
        cloned[instrument.id] = updated[instrument.id].map((measure) => [...measure]);
      }
      for (const note of notes) {
        cloned[note.instrumentId][note.destinationMeasure].push({
          id: note.id,
          start: note.localStart,
          duration: note.duration,
          stemDirection: note.stemDirection ?? this.stemDirection(),
          tuplet: note.tuplet
            ? { ...note.tuplet, id: tupletIds.get(note.tuplet.id) ?? this.createTupletId() }
            : undefined,
        });
      }
      return cloned;
    });
    this.rests.update((rests) => {
      const updated = {} as RestPattern;
      for (const instrument of this.instruments) {
        updated[instrument.id] = rests[instrument.id].map((measure) => [...measure]);
      }
      for (const note of notes) {
        const end =
          note.absoluteStart +
          (this.ticksPerWholeNote() / note.duration) *
            (note.tuplet ? note.tuplet.inTimeOf / note.tuplet.count : 1);
        updated[note.instrumentId] = updated[note.instrumentId].map((measure, sourceMeasure) =>
          measure.filter((rest) => {
            const restStart = sourceMeasure * this.stepsPerMeasure() + rest.start;
            const restEnd = restStart + this.ticksPerWholeNote() / rest.duration;
            return !this.intervalsOverlap(note.absoluteStart, end, restStart, restEnd);
          }),
        );
      }
      return updated;
    });
    this.removeAnnotationsForNotes(replacedIds);
    const pastedAnnotationIds: string[] = [];
    this.annotations.update((annotations) => {
      const updated = annotations.map((measure) => [...measure]);
      for (const item of clipboard.annotations) {
        const absoluteStep = targetStart + item.absoluteStep - clipboard.origin;
        const annotationMeasure = newNoteIds.has(item.sourceNoteId ?? '')
          ? notes.find((note) => note.sourceId === item.sourceNoteId)?.destinationMeasure ??
            Math.floor(absoluteStep / this.stepsPerMeasure())
          : Math.floor(absoluteStep / this.stepsPerMeasure());
        const copiedNote = notes.find((note) => note.sourceId === item.sourceNoteId);
        const annotation: ScoreAnnotation = {
          ...item.annotation,
          id: this.createAnnotationId(),
          step: copiedNote?.localStart ?? absoluteStep - annotationMeasure * this.stepsPerMeasure(),
          noteId: copiedNote ? newNoteIds.get(copiedNote.sourceId) : undefined,
        };
        updated[annotationMeasure].push(annotation);
        pastedAnnotationIds.push(annotation.id);
      }
      return updated;
    });
    this.selectedNoteIds.set(notes.map((note) => note.id));
    this.selectedAnnotationIds.set(pastedAnnotationIds);
    this.editingSelection.set(false);
    this.pastePending.set(false);
    this.message.set('');
  }

  protected editSelectedNote(change: NoteEditChange): void {
    const selected = this.selectedNoteEdit();
    if (!selected) {
      return;
    }
    const existing = this.pattern()[selected.instrumentId][selected.measureIndex].find(
      (note) => note.id === selected.id,
    );
    if (!existing) {
      return;
    }
    if (existing.tuplet) {
      this.message.set('Tuplet-Noten können hier nicht einzeln bearbeitet werden.');
      return;
    }

    let instrumentId = selected.instrumentId;
    let duration = selected.duration;
    let measureIndex = selected.measureIndex;
    let start = selected.start;
    switch (change.field) {
      case 'instrumentId':
        if (!this.instruments.some((instrument) => instrument.id === change.value)) {
          this.message.set('Das ausgewählte Instrument ist ungültig.');
          return;
        }
        instrumentId = change.value as DrumId;
        break;
      case 'duration':
        if (!this.noteValues.some((value) => value.value === change.value)) {
          this.message.set('Der ausgewählte Notenwert ist ungültig.');
          return;
        }
        duration = change.value as NoteValue;
        break;
      case 'measureIndex':
        if (
          !Number.isInteger(change.value) ||
          Number(change.value) < 1 ||
          Number(change.value) > 4
        ) {
          this.message.set('Der Takt muss zwischen 1 und 4 liegen.');
          return;
        }
        measureIndex = Number(change.value) - 1;
        break;
      case 'start':
        if (
          !Number.isInteger(change.value) ||
          Number(change.value) < 1 ||
          Number(change.value) > this.stepsPerMeasure()
        ) {
          this.message.set('Der Schritt liegt außerhalb des Taktes.');
          return;
        }
        start = Number(change.value) - 1;
        break;
    }
    const globalStart = measureIndex * this.stepsPerMeasure() + start;
    const end = globalStart + this.ticksPerWholeNote() / duration;
    if (end > 4 * this.stepsPerMeasure()) {
      this.message.set('Diese Notenlänge reicht über die maximal vier dargestellten Takte hinaus.');
      return;
    }
    const conflictingNote = this.pattern()[instrumentId].some((measure, otherMeasureIndex) =>
      measure.some((note) => {
        if (note.id === existing.id) {
          return false;
        }
        const otherStart = otherMeasureIndex * this.stepsPerMeasure() + note.start;
        return this.intervalsOverlap(
          globalStart,
          end,
          otherStart,
          otherStart + this.noteDurationTicks(note),
        );
      }),
    );
    if (conflictingNote) {
      this.message.set('An dieser Stelle liegt bereits eine Note desselben Instruments.');
      return;
    }
    const conflictingRest = this.rests()[instrumentId].some((measure, otherMeasureIndex) =>
      measure.some((rest) => {
        const otherStart = otherMeasureIndex * this.stepsPerMeasure() + rest.start;
        return this.intervalsOverlap(
          globalStart,
          end,
          otherStart,
          otherStart + this.ticksPerWholeNote() / rest.duration,
        );
      }),
    );
    if (conflictingRest) {
      this.message.set('An dieser Stelle liegt eine Pause desselben Instruments.');
      return;
    }
    if (
      instrumentId === selected.instrumentId &&
      duration === existing.duration &&
      measureIndex === selected.measureIndex &&
      start === existing.start
    ) {
      this.message.set('');
      return;
    }
    this.recordUndo();
    while (this.measureIndexes().length <= measureIndex) {
      this.addMeasure(false);
    }
    this.pattern.update((pattern) => {
      const updated = {} as Pattern;
      for (const instrument of this.instruments) {
        updated[instrument.id] = pattern[instrument.id].map((measure) =>
          measure.filter((note) => note.id !== existing.id),
        );
      }
      updated[instrumentId][measureIndex].push({
        ...existing,
        start,
        duration,
      });
      return updated;
    });
    this.annotations.update((annotations) => {
      const updated = annotations.map((measure) =>
        measure.filter((annotation) => annotation.noteId !== existing.id),
      );
      const attached = annotations
        .flat()
        .filter((annotation) => annotation.noteId === existing.id)
        .map((annotation) => ({ ...annotation, step: start }));
      updated[measureIndex].push(...attached);
      return updated;
    });
    this.message.set('');
  }

  protected editSelectedAnnotationText(text: string): void {
    const annotationId = this.selectedAnnotationEdit()?.id;
    const annotation = this.annotations()
      .flat()
      .find((item) => item.id === annotationId);
    if (!annotationId || !annotation || annotation.text === text) {
      return;
    }
    this.recordUndo();
    this.annotations.update((annotations) =>
      annotations.map((measure) =>
        measure.map((annotation) =>
          annotation.id === annotationId ? { ...annotation, text } : annotation,
        ),
      ),
    );
  }

  protected handleGlobalKeydown(event: KeyboardEvent): void {
    const target = event.target;
    const isEditableTarget =
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      (target instanceof HTMLElement && target.isContentEditable);
    if (isEditableTarget) {
      return;
    }
    if (
      (event.ctrlKey || event.metaKey) &&
      event.key.toLowerCase() === 'z' &&
      this.undoAvailable()
    ) {
      event.preventDefault();
      this.undoLastEdit();
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') {
      if (this.selectedObjectCount() > 0) {
        event.preventDefault();
        this.copySelectedObjects();
      }
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') {
      if (this.clipboardAvailable()) {
        event.preventDefault();
        this.requestPaste();
      }
    } else if (event.key === 'Delete' && this.selectedObjectCount() > 0) {
      event.preventDefault();
      this.deleteSelectedObjects();
    } else if (event.key === 'Escape') {
      this.pastePending.set(false);
      this.editingSelection.set(false);
    }
  }

  protected setSelectedStemDirection(direction: StemDirection): void {
    const selected = new Set(this.selectedNoteIds());
    const hasChangedNote = this.instruments.some((instrument) =>
      this.pattern()[instrument.id]
        .flat()
        .some((note) => selected.has(note.id) && note.stemDirection !== direction),
    );
    if (!hasChangedNote) {
      return;
    }
    this.recordUndo();
    this.pattern.update((pattern) => {
      const updated = {} as Pattern;
      for (const instrument of this.instruments) {
        updated[instrument.id] = pattern[instrument.id].map((measure) =>
          measure.map((note) =>
            selected.has(note.id) ? { ...note, stemDirection: direction } : note,
          ),
        );
      }
      return updated;
    });
  }

  protected clearNoteSelection(): void {
    this.selectedNoteIds.set([]);
    this.selectedAnnotationIds.set([]);
    this.editingSelection.set(false);
    this.pastePending.set(false);
  }

  protected setTupletsEnabled(enabled: boolean): void {
    this.tupletsEnabled.set(enabled);
    this.activeTupletGroup.set(undefined);
    this.message.set('');
  }

  protected setTupletCount(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    if (Number.isInteger(value) && value >= 2 && value <= 32) {
      this.tupletCount.set(value);
      this.activeTupletGroup.set(undefined);
      this.message.set('');
    }
  }

  protected setTupletInTimeOf(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    if (Number.isInteger(value) && value >= 1 && value <= 32) {
      this.tupletInTimeOf.set(value);
      this.activeTupletGroup.set(undefined);
      this.message.set('');
    }
  }

  protected selectToolMode(mode: ToolMode): void {
    this.toolMode.set(mode);
    this.fillMeasurePending.set(false);
    if (mode !== 'select') {
      this.pastePending.set(false);
      this.clearNoteSelection();
    }
    this.message.set('');
  }

  protected removeAnnotation(event: Event, measureIndex: number, annotationId: string): void {
    event.stopPropagation();
    if (!this.annotations()[measureIndex]?.some((annotation) => annotation.id === annotationId)) {
      return;
    }
    this.recordUndo();
    this.annotations.update((annotations) => {
      const updated = annotations.map((measure) => [...measure]);
      updated[measureIndex] = updated[measureIndex].filter(
        (annotation) => annotation.id !== annotationId,
      );
      return updated;
    });
    this.selectedAnnotationIds.update((selected) =>
      selected.filter((selectedId) => selectedId !== annotationId),
    );
  }

  protected handleScoreNoteClick(
    event: Event,
    clickedMeasureIndex: number,
    instrumentId: DrumId,
    sourceMeasure: number,
    sourceStep: number,
    noteId: string,
  ): void {
    event.stopPropagation();
    if (this.fillMeasurePending()) {
      this.fillMeasureAt(clickedMeasureIndex);
      return;
    }
    switch (this.toolMode()) {
      case 'select':
        this.toggleNoteSelection(
          noteId,
          event instanceof MouseEvent && (event.ctrlKey || event.metaKey),
        );
        return;
      case 'notes':
        if (this.tupletsEnabled() && this.currentIncompleteTupletGroup(this.selectedNoteValue())) {
          this.placeTupletNoteAt(
            sourceMeasure,
            sourceStep,
            instrumentId,
            event,
          );
          return;
        }
        this.removeNoteById(instrumentId, sourceMeasure, noteId);
        return;
      case 'rests': {
        const snappedPosition = this.snapPlacementToNoteValue(sourceMeasure, sourceStep);
        this.placeRestAt(snappedPosition.measureIndex, snappedPosition.step, instrumentId);
        return;
      }
      case 'freeText':
        this.addFreeAnnotation(event, sourceMeasure, sourceStep);
        return;
      case 'noteText':
        this.attachTextToNote(sourceMeasure, sourceStep, noteId);
        return;
    }
  }

  protected placeNoteAt(measureIndex: number, step: number, instrumentId: DrumId): void {
    const duration = this.selectedNoteValue();
    const durationTicks = this.ticksPerWholeNote() / duration;
    const start = measureIndex * this.stepsPerMeasure() + step;
    const end = start + durationTicks;
    const requiredMeasures = Math.ceil(end / this.stepsPerMeasure());

    if (requiredMeasures > 4) {
      this.message.set('Diese Notenlänge reicht über die maximal vier dargestellten Takte hinaus.');
      return;
    }
    const existing = this.pattern()[instrumentId];
    const matchingNote = existing[measureIndex]?.find(
      (note) => note.start === step && note.duration === duration,
    );
    if (matchingNote) {
      this.removeNoteById(instrumentId, measureIndex, matchingNote.id);
      this.message.set('');
      return;
    }

    this.recordUndo();
    while (this.measureIndexes().length < requiredMeasures) {
      this.addMeasure(false);
    }

    const replacedNoteIds = this.overlappingNoteIds(this.pattern(), instrumentId, start, end);
    this.clearActiveTupletIfRemoved(replacedNoteIds);
    this.rests.update((rests) => {
      const updatedTrack = rests[instrumentId].map((measure, sourceMeasure) =>
        measure.filter((rest) => {
          const restStart = sourceMeasure * this.stepsPerMeasure() + rest.start;
          const restEnd = restStart + this.ticksPerWholeNote() / rest.duration;
          return !this.intervalsOverlap(start, end, restStart, restEnd);
        }),
      );
      return { ...rests, [instrumentId]: updatedTrack };
    });
    this.pattern.update((pattern) => {
      const updatedPattern = this.removeNotesFromPattern(pattern, replacedNoteIds);
      const updatedTrack = updatedPattern[instrumentId].map((measure) => [...measure]);
      updatedTrack[measureIndex].push({
        id: this.createNoteId(),
        start: step,
        duration,
        stemDirection: this.stemDirection(),
      });
      return { ...updatedPattern, [instrumentId]: updatedTrack };
    });
    this.discardSelectedNotes(replacedNoteIds);
    this.removeAnnotationsForNotes(replacedNoteIds);
    this.message.set('');
  }

  protected fillMeasureAt(measureIndex: number): void {
    this.fillMeasurePending.set(false);
    const instrumentId = this.selectedInstrumentId();
    if (instrumentId === null) {
      this.message.set('Wähle zuerst ein Instrument aus, um einen Takt zu füllen.');
      return;
    }

    const duration = this.selectedNoteValue();
    const noteTicks = this.ticksPerWholeNote() / duration;
    const measureSteps = this.stepsPerMeasure();
    if (!Number.isInteger(noteTicks) || noteTicks <= 0 || measureSteps % noteTicks !== 0) {
      this.message.set('Der gewählte Notenwert füllt diesen Takt nicht ohne Rest.');
      return;
    }

    const noteStarts = Array.from(
      { length: measureSteps / noteTicks },
      (_, index) => index * noteTicks,
    );
    const measureStart = measureIndex * measureSteps;
    const measureEnd = measureStart + measureSteps;
    const pattern = this.pattern();
    const replacedNoteIds = this.overlappingNoteIds(
      pattern,
      instrumentId,
      measureStart,
      measureEnd,
    );
    const currentMeasureNotes = pattern[instrumentId][measureIndex] ?? [];
    const hasExpectedNotes =
      replacedNoteIds.length === noteStarts.length &&
      currentMeasureNotes.length === noteStarts.length &&
      noteStarts.every((start) =>
        currentMeasureNotes.some(
          (note) =>
            note.start === start &&
            note.duration === duration &&
            note.tuplet === undefined &&
            (note.stemDirection ?? this.stemDirection()) === this.stemDirection(),
        ),
      );
    const replacedRestIds = this.rests()[instrumentId].flatMap((measure, sourceMeasure) =>
      measure
        .filter((rest) => {
          const restStart = sourceMeasure * measureSteps + rest.start;
          return this.intervalsOverlap(
            measureStart,
            measureEnd,
            restStart,
            restStart + this.ticksPerWholeNote() / rest.duration,
          );
        })
        .map((rest) => rest.id),
    );
    if (hasExpectedNotes && replacedRestIds.length === 0) {
      this.message.set('Der Takt ist bereits mit diesen Noten gefüllt.');
      return;
    }

    const replacedRestIdSet = new Set(replacedRestIds);
    this.clearActiveTupletIfRemoved(replacedNoteIds);
    this.recordUndo();
    this.pattern.update((current) => {
      const withoutReplacedNotes = this.removeNotesFromPattern(current, replacedNoteIds);
      const updatedTrack = withoutReplacedNotes[instrumentId].map((measure) => [...measure]);
      updatedTrack[measureIndex] = noteStarts.map((start) => this.createNote(start, duration));
      return { ...withoutReplacedNotes, [instrumentId]: updatedTrack };
    });
    this.rests.update((rests) => {
      const updatedTrack = rests[instrumentId].map((measure) =>
        measure.filter((rest) => !replacedRestIdSet.has(rest.id)),
      );
      return { ...rests, [instrumentId]: updatedTrack };
    });
    this.discardSelectedNotes(replacedNoteIds);
    this.removeAnnotationsForNotes(replacedNoteIds);
    const noteValueLabel = this.noteValues.find((note) => note.value === duration)?.label ?? '';
    this.message.set(`Takt ${measureIndex + 1} mit ${noteStarts.length} ${noteValueLabel}noten gefüllt.`);
  }

  protected placeTupletNoteAt(
    measureIndex: number,
    step: number,
    instrumentId: DrumId,
    event: Event,
  ): void {
    const duration = this.selectedNoteValue();
    let group = this.currentIncompleteTupletGroup(duration);
    if (!group) {
      const snappedPosition = this.snapPlacementToNoteValue(measureIndex, step, event);
      const groupStart = snappedPosition.measureIndex * this.stepsPerMeasure() + snappedPosition.step;
      const groupTicks =
        (this.ticksPerWholeNote() / duration) * this.tupletInTimeOf();
      const groupEnd = groupStart + groupTicks;

      if (
        groupTicks > this.stepsPerMeasure() ||
        groupEnd > (snappedPosition.measureIndex + 1) * this.stepsPerMeasure() + 1e-7
      ) {
        this.message.set('Die Tuplet-Gruppe muss vollständig in einen Takt passen. Wähle einen früheren Start oder kürzere Noten.');
        return;
      }
      if (snappedPosition.measureIndex >= 4) {
        this.message.set('Die Tuplet-Gruppe würde über die maximal vier dargestellten Takte hinausgehen.');
        return;
      }

      group = {
        id: this.createTupletId(),
        count: this.tupletCount(),
        inTimeOf: this.tupletInTimeOf(),
        duration,
        start: groupStart,
        measureIndex: snappedPosition.measureIndex,
        nextIndex: 0,
      };
    }

    this.recordUndo();
    while (this.measureIndexes().length <= group.measureIndex) {
      this.addMeasure(false);
    }

    const noteTicks = this.ticksPerWholeNote() / duration;
    const slotDuration = (noteTicks * group.inTimeOf) / group.count;
    const start = group.start + slotDuration * group.nextIndex;
    const end = start + slotDuration;
    const localStart = start - group.measureIndex * this.stepsPerMeasure();
    const replacedNoteIds = this.overlappingNoteIds(this.pattern(), instrumentId, start, end);
    this.clearActiveTupletIfRemoved(replacedNoteIds);
    this.rests.update((rests) => {
      const updatedTrack = rests[instrumentId].map((measure, sourceMeasure) =>
        measure.filter((rest) => {
          const restStart = sourceMeasure * this.stepsPerMeasure() + rest.start;
          const restEnd = restStart + this.ticksPerWholeNote() / rest.duration;
          return !this.intervalsOverlap(start, end, restStart, restEnd);
        }),
      );
      return { ...rests, [instrumentId]: updatedTrack };
    });
    const noteId = this.createNoteId();
    this.pattern.update((pattern) => {
      const updatedPattern = this.removeNotesFromPattern(pattern, replacedNoteIds);
      const updatedTrack = updatedPattern[instrumentId].map((measure) => [...measure]);
      updatedTrack[group.measureIndex].push({
        id: noteId,
        start: localStart,
        duration,
        stemDirection: this.stemDirection(),
        tuplet: {
          id: group.id,
          count: group.count,
          inTimeOf: group.inTimeOf,
          index: group.nextIndex,
        },
      });
      return { ...updatedPattern, [instrumentId]: updatedTrack };
    });
    this.discardSelectedNotes(replacedNoteIds);
    this.removeAnnotationsForNotes(replacedNoteIds);

    const nextIndex = group.nextIndex + 1;
    if (nextIndex === group.count) {
      this.activeTupletGroup.set(undefined);
      this.message.set(`Tuplet-Gruppe ${group.count}:${group.inTimeOf} vollständig gesetzt.`);
    } else {
      this.activeTupletGroup.set({ ...group, nextIndex });
      this.message.set(`Tuplet-Gruppe ${group.count}:${group.inTimeOf} — Note ${nextIndex + 1} von ${group.count} setzen.`);
    }
  }

  protected placeRestAt(measureIndex: number, step: number, instrumentId: DrumId): void {
    const duration = this.selectedRestValue();
    const durationTicks = this.ticksPerWholeNote() / duration;
    const start = measureIndex * this.stepsPerMeasure() + step;
    const end = start + durationTicks;
    const requiredMeasures = Math.ceil(end / this.stepsPerMeasure());

    if (requiredMeasures > 4) {
      this.message.set('Diese Pausenlänge reicht über die maximal vier dargestellten Takte hinaus.');
      return;
    }
    const existing = this.rests()[instrumentId];
    const matchingRest = existing[measureIndex]?.find(
      (rest) => rest.start === step && rest.duration === duration,
    );
    if (matchingRest) {
      this.recordUndo();
      this.rests.update((rests) => {
        const updatedTrack = rests[instrumentId].map((measure) => [...measure]);
        updatedTrack[measureIndex] = updatedTrack[measureIndex].filter(
          (rest) => rest.id !== matchingRest.id,
        );
        return { ...rests, [instrumentId]: updatedTrack };
      });
      this.message.set('');
      return;
    }

    this.recordUndo();
    while (this.measureIndexes().length < requiredMeasures) {
      this.addMeasure(false);
    }

    const replacedNoteIds = this.overlappingNoteIds(this.pattern(), instrumentId, start, end);
    this.clearActiveTupletIfRemoved(replacedNoteIds);
    this.pattern.update((pattern) => this.removeNotesFromPattern(pattern, replacedNoteIds));
    this.discardSelectedNotes(replacedNoteIds);
    this.rests.update((rests) => {
      const updatedTrack = rests[instrumentId].map((measure, sourceMeasure) =>
        measure.filter((rest) => {
          const restStart = sourceMeasure * this.stepsPerMeasure() + rest.start;
          const restEnd = restStart + this.ticksPerWholeNote() / rest.duration;
          return restStart >= end || restEnd <= start;
        }),
      );
      updatedTrack[measureIndex].push(this.createRest(step, duration));
      return { ...rests, [instrumentId]: updatedTrack };
    });
    this.removeAnnotationsForNotes(replacedNoteIds);
    this.message.set('');
  }

  protected removeNote(
    event: Event,
    instrumentId: DrumId,
    sourceMeasure: number,
    noteId: string,
  ): void {
    event.stopPropagation();
    this.removeNoteById(instrumentId, sourceMeasure, noteId);
  }

  protected addMeasure(recordHistory = true): void {
    if (this.measureIndexes().length >= 4) {
      return;
    }
    if (recordHistory) {
      this.recordUndo();
    }
    this.measureIndexes.update((measures) => [...measures, measures.length]);
    this.pattern.update((pattern) => {
      const expanded = {} as Pattern;
      for (const instrument of this.instruments) {
        expanded[instrument.id] = [...pattern[instrument.id], []];
      }
      return expanded;
    });
    this.rests.update((rests) => {
      const expanded = {} as RestPattern;
      for (const instrument of this.instruments) {
        expanded[instrument.id] = [...rests[instrument.id], []];
      }
      return expanded;
    });
    this.annotations.update((annotations) => [...annotations, []]);
  }

  protected removeMeasure(): void {
    const currentMeasures = this.measureIndexes().length;
    if (currentMeasures <= 1) {
      return;
    }
    this.recordUndo();
    const patternBeforeRemoval = this.pattern();
    const lastMeasureStart = (currentMeasures - 1) * this.stepsPerMeasure();
    const removedNoteIds = this.instruments.flatMap((instrument) =>
      patternBeforeRemoval[instrument.id].flatMap((measure, measureIndex) =>
        measure
          .filter(
            (note) =>
              measureIndex >= currentMeasures - 1 ||
              measureIndex * this.stepsPerMeasure() +
                note.start +
                this.noteDurationTicks(note) >
                lastMeasureStart,
          )
          .map((note) => note.id),
      ),
    );
    this.measureIndexes.update((measures) => measures.slice(0, -1));
    this.pattern.update((pattern) => {
      const reduced = {} as Pattern;
      for (const instrument of this.instruments) {
        reduced[instrument.id] = pattern[instrument.id].slice(0, -1);
        reduced[instrument.id] = reduced[instrument.id].map((measure, measureIndex) =>
          measure.filter(
            (note) =>
              measureIndex * this.stepsPerMeasure() +
                note.start +
                this.noteDurationTicks(note) <=
              (currentMeasures - 1) * this.stepsPerMeasure(),
          ),
        );
      }
      return reduced;
    });
    this.rests.update((rests) => {
      const reduced = {} as RestPattern;
      for (const instrument of this.instruments) {
        reduced[instrument.id] = rests[instrument.id].slice(0, -1).map((measure, measureIndex) =>
          measure.filter(
            (rest) =>
              measureIndex * this.stepsPerMeasure() +
                rest.start +
                this.ticksPerWholeNote() / rest.duration <=
              (currentMeasures - 1) * this.stepsPerMeasure(),
          ),
        );
      }
      return reduced;
    });
    this.annotations.update((annotations) => annotations.slice(0, -1));
    this.removeAnnotationsForNotes(removedNoteIds);
    this.discardSelectedNotes(removedNoteIds);
    this.activeTupletGroup.set(undefined);
    if (this.playingStep() >= this.totalSteps()) {
      this.playingStep.set(0);
    }
  }

  protected selectNoteValue(value: NoteValue): void {
    if (this.selectedNoteValue() !== value) {
      this.activeTupletGroup.set(undefined);
    }
    this.selectedNoteValue.set(value);
  }

  protected selectRestValue(value: NoteValue): void {
    this.selectedRestValue.set(value);
  }

  protected setTempo(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    if (Number.isFinite(value)) {
      this.tempo.set(Math.min(240, Math.max(40, Math.round(value))));
      if (this.isPlaying()) {
        this.stopPlayback();
        void this.startPlayback();
      }
    }
  }

  protected setTimeSignatureNumerator(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    if (Number.isInteger(value) && value >= 1 && value <= 32) {
      this.updateTimeSignature(value, this.timeSignatureDenominator());
    }
  }

  protected setTimeSignatureDenominator(event: Event): void {
    const value = Number((event.target as HTMLSelectElement).value);
    if (this.timeSignatureDenominators.includes(value)) {
      this.updateTimeSignature(this.timeSignatureNumerator(), value);
    }
  }

  protected async togglePlayback(): Promise<void> {
    if (this.isPlaying()) {
      this.stopPlayback();
      return;
    }
    await this.startPlayback();
  }

  protected savePattern(): void {
    try {
      this.patternStorage.save({
        tempo: this.tempo(),
        numerator: this.timeSignatureNumerator(),
        denominator: this.timeSignatureDenominator(),
        noteTextPosition: this.noteTextPosition(),
        autoBeaming: this.autoBeaming(),
        stemDirection: this.stemDirection(),
        measures: this.measureIndexes().length,
        pattern: this.pattern(),
        rests: this.rests(),
        annotations: this.annotations(),
      });
      this.message.set('Dein Rhythmus wurde in diesem Browser gespeichert.');
    } catch (error) {
      console.error('Rhythmus konnte nicht gespeichert werden.', error);
      this.message.set('Speichern nicht möglich. Bitte prüfe den verfügbaren Browser-Speicher.');
    }
  }

  protected exportPattern(): void {
    const data = {
      title: 'Mein Schlagzeug-Pattern',
      tempo: this.tempo(),
      numerator: this.timeSignatureNumerator(),
      denominator: this.timeSignatureDenominator(),
      timeSignature: `${this.timeSignatureNumerator()}/${this.timeSignatureDenominator()}`,
      measures: this.measureIndexes().length,
      subdivision: this.subdivisionLabel(),
      noteTextPosition: this.noteTextPosition(),
      autoBeaming: this.autoBeaming(),
      stemDirection: this.stemDirection(),
      pattern: this.pattern(),
      rests: this.rests(),
      annotations: this.annotations(),
    };
    const file = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'mein-schlagzeug-pattern.json';
    link.click();
    URL.revokeObjectURL(url);
    this.message.set('Das Pattern wurde als JSON-Datei exportiert.');
  }

  protected async importPattern(file: File): Promise<void> {
    try {
      const imported = this.patternStorage.importJson(
        await file.text(),
        this.instruments,
        this.noteValues,
        this.timeSignatureDenominators,
        () => this.createNoteId(),
      );
      if (this.isPlaying()) {
        this.stopPlayback();
      }
      this.recordUndo(true);
      this.applyPatternSnapshot(imported);
      this.message.set('Das Pattern wurde importiert.');
    } catch (error) {
      console.error('Pattern-Datei konnte nicht importiert werden.', error);
      this.message.set(
        'Die JSON-Datei konnte nicht importiert werden. Bitte wähle eine gültige Taktwerk-Pattern-Datei.',
      );
    }
  }

  protected async exportPdf(settings: PdfExportSettings): Promise<void> {
    const title = settings.title.trim();
    if (
      !title ||
      !Number.isInteger(settings.measuresPerRow) ||
      settings.measuresPerRow < 1 ||
      settings.measuresPerRow > 4
    ) {
      this.message.set('Die PDF-Einstellungen sind ungültig.');
      return;
    }

    const measures = Array.from(
      this.host.nativeElement.querySelectorAll<SVGSVGElement>('.score-system .measure-sheet'),
    );
    if (measures.length === 0) {
      this.message.set('Das Notenblatt enthält keine exportierbaren Takte.');
      return;
    }
    const scoreDetails =
      this.host.nativeElement
        .querySelector('.score-paper-header')
        ?.textContent?.replace(/\s+/g, ' ')
        .trim() ?? '';
    this.message.set('PDF wird erstellt …');
    try {
      await this.pdfExport.downloadScore(
        measures,
        { title, measuresPerRow: settings.measuresPerRow },
        scoreDetails,
      );
      this.message.set('PDF wurde heruntergeladen.');
    } catch (error) {
      console.error('PDF-Datei konnte nicht erstellt werden.', error);
      this.message.set('PDF konnte nicht heruntergeladen werden. Bitte versuche es erneut.');
    }
  }

  protected clearPattern(): void {
    this.recordUndo();
    this.pattern.set(this.createEmptyPattern(this.measureIndexes().length));
    this.rests.set(this.createEmptyRests(this.measureIndexes().length));
    this.annotations.set(this.createEmptyAnnotations(this.measureIndexes().length));
    this.clearNoteSelection();
    this.activeTupletGroup.set(undefined);
    this.message.set('Das Notenblatt ist jetzt leer.');
  }

  protected undoLastEdit(): void {
    const history = this.undoHistory();
    const entry = history.at(-1);
    if (!entry) {
      return;
    }
    const wasPlaying = this.isPlaying();
    if (wasPlaying) {
      this.stopPlayback();
    }
    this.measureIndexes.set(Array.from({ length: entry.measures }, (_, index) => index));
    this.timeSignatureNumerator.set(entry.numerator);
    this.timeSignatureDenominator.set(entry.denominator);
    if (entry.tempo !== undefined) {
      this.tempo.set(entry.tempo);
    }
    if (entry.noteTextPosition !== undefined) {
      this.noteTextPosition.set(entry.noteTextPosition);
    }
    if (entry.autoBeaming !== undefined) {
      this.autoBeaming.set(entry.autoBeaming);
    }
    if (entry.stemDirection !== undefined) {
      this.stemDirection.set(entry.stemDirection);
    }
    this.pattern.set(entry.pattern);
    this.rests.set(entry.rests);
    this.annotations.set(entry.annotations);
    this.undoHistory.set(history.slice(0, -1));
    this.activeTupletGroup.set(undefined);
    this.clearNoteSelection();
    this.message.set('Letzte Änderung wurde rückgängig gemacht.');
    if (wasPlaying) {
      void this.startPlayback();
    }
  }

  protected totalSteps(): number {
    return this.measureIndexes().length * this.stepsPerMeasure();
  }

  private recordUndo(includeSettings = false): void {
    const entry: UndoEntry = {
      measures: this.measureIndexes().length,
      numerator: this.timeSignatureNumerator(),
      denominator: this.timeSignatureDenominator(),
      pattern: this.pattern(),
      rests: this.rests(),
      annotations: this.annotations(),
      ...(includeSettings
        ? {
            tempo: this.tempo(),
            noteTextPosition: this.noteTextPosition(),
            autoBeaming: this.autoBeaming(),
            stemDirection: this.stemDirection(),
          }
        : {}),
    };
    this.undoHistory.update((history) => [
      ...history.slice(-(MAX_UNDO_ENTRIES - 1)),
      entry,
    ]);
  }

  private updateTimeSignature(numerator: number, denominator: number): void {
    if (
      numerator === this.timeSignatureNumerator() &&
      denominator === this.timeSignatureDenominator()
    ) {
      return;
    }
    this.recordUndo();
    const oldStepCount = this.stepsPerMeasure();
    const oldTicksPerWhole = this.ticksPerWholeNote();
    this.timeSignatureNumerator.set(numerator);
    this.timeSignatureDenominator.set(denominator);
    const newStepCount = this.stepsPerMeasure();
    if (oldStepCount !== newStepCount) {
      const removedTupletNoteIds = this.instruments.flatMap((instrument) =>
        this.pattern()[instrument.id]
          .flat()
          .filter(
            (note) =>
              note.tuplet &&
              this.tupletGroupStart(note) + this.tupletGroupTicks(note) > newStepCount + 1e-7,
          )
          .map((note) => note.id),
      );
      this.pattern.update((pattern) => {
        const resized = {} as Pattern;
        for (const instrument of this.instruments) {
          resized[instrument.id] = pattern[instrument.id].map((measure) =>
            measure.filter((note) => {
              if (!note.tuplet) {
                return note.start < newStepCount;
              }
              return this.tupletGroupStart(note) + this.tupletGroupTicks(note) <= newStepCount + 1e-7;
            }),
          );
        }
        return resized;
      });
      this.removeAnnotationsForNotes(removedTupletNoteIds);
      this.rests.update((rests) => {
        const resized = {} as RestPattern;
        for (const instrument of this.instruments) {
          resized[instrument.id] = rests[instrument.id].map((measure) =>
            measure.filter((rest) => rest.start < newStepCount),
          );
        }
        return resized;
      });
      this.annotations.update((annotations) =>
        annotations.map((measure) => measure.filter((annotation) => annotation.step < newStepCount)),
      );
    }
    this.activeTupletGroup.set(undefined);
    if (
      (oldTicksPerWhole !== this.ticksPerWholeNote() || oldStepCount !== newStepCount) &&
      this.isPlaying()
    ) {
      this.stopPlayback();
      void this.startPlayback();
    }
    this.message.set('');
  }

  private async startPlayback(): Promise<void> {
    try {
      const started = await this.playback.start({
        tempo: this.tempo(),
        ticksPerWholeNote: this.ticksPerWholeNote(),
        instruments: this.instruments,
        getScore: () => ({
          pattern: this.pattern(),
          stepsPerMeasure: this.stepsPerMeasure(),
          totalSteps: this.totalSteps(),
        }),
      });
      if (!started) {
        this.message.set('Dein Browser unterstützt keine Audio-Wiedergabe.');
        return;
      }
      this.message.set('');
    } catch (error) {
      console.error('Wiedergabe konnte nicht gestartet werden.', error);
      this.stopPlayback();
      this.message.set('Die Audio-Wiedergabe konnte nicht gestartet werden.');
    }
  }

  private stopPlayback(): void {
    this.playback.stop();
  }

  private restorePattern(): void {
    try {
      const restored = this.patternStorage.restore(
        this.instruments,
        this.noteValues,
        this.timeSignatureDenominators,
        () => this.createNoteId(),
      );
      if (!restored) {
        return;
      }

      this.applyPatternSnapshot(restored);
    } catch (error) {
      console.error('Gespeichertes Pattern konnte nicht geladen werden.', error);
      this.message.set('Das gespeicherte Pattern konnte nicht geladen werden. Es wird ein neues Blatt angezeigt.');
    }
  }

  private applyPatternSnapshot(snapshot: PatternSnapshot): void {
    this.tempo.set(snapshot.tempo);
    this.timeSignatureNumerator.set(snapshot.numerator);
    this.timeSignatureDenominator.set(snapshot.denominator);
    this.noteTextPosition.set(snapshot.noteTextPosition ?? 'above');
    this.autoBeaming.set(snapshot.autoBeaming ?? true);
    this.stemDirection.set(snapshot.stemDirection ?? 'up');
    this.measureIndexes.set(Array.from({ length: snapshot.measures }, (_, index) => index));
    this.pattern.set(this.withStemDirection(snapshot.pattern, snapshot.stemDirection ?? 'up'));
    this.rests.set(snapshot.rests ?? this.createEmptyRests(snapshot.measures));
    this.annotations.set(snapshot.annotations);
    this.noteIdCounter = Math.max(
      this.noteIdCounter,
      ...this.instruments.flatMap((instrument) =>
        this.pattern()[instrument.id]
          .flat()
          .map((note) => Number(note.id.match(/^note-(\d+)$/)?.[1] ?? 0)),
      ),
    );
    this.restIdCounter = Math.max(
      this.restIdCounter,
      ...this.instruments.flatMap((instrument) =>
        this.rests()[instrument.id]
          .flat()
          .map((rest) => Number(rest.id.match(/^rest-(\d+)$/)?.[1] ?? 0)),
      ),
    );
    this.tupletIdCounter = Math.max(
      this.tupletIdCounter,
      ...this.instruments.flatMap((instrument) =>
        this.pattern()[instrument.id]
          .flat()
          .flatMap((note) =>
            note.tuplet ? [Number(note.tuplet.id.match(/^tuplet-(\d+)$/)?.[1] ?? 0)] : [],
          ),
      ),
    );
    this.annotationIdCounter = Math.max(
      this.annotationIdCounter,
      ...this.annotations()
        .flat()
        .map((annotation) => Number(annotation.id.match(/^text-(\d+)$/)?.[1] ?? 0)),
    );
    this.activeTupletGroup.set(undefined);
    this.clearNoteSelection();
  }

  private removeNoteById(instrumentId: DrumId, sourceMeasure: number, noteId: string): void {
    const selected = this.pattern()[instrumentId][sourceMeasure]?.find((note) => note.id === noteId);
    if (!selected) {
      return;
    }
    const noteIds = selected.tuplet
      ? this.instruments.flatMap((instrument) =>
          this.pattern()[instrument.id]
            .flat()
            .filter((note) => note.tuplet?.id === selected.tuplet?.id)
            .map((note) => note.id),
        )
      : [noteId];
    this.clearActiveTupletIfRemoved(noteIds);
    this.recordUndo();
    this.pattern.update((pattern) => this.removeNotesFromPattern(pattern, noteIds));
    this.discardSelectedNotes(noteIds);
    this.removeAnnotationsForNotes(noteIds);
    if (this.activeTupletGroup()?.id === selected.tuplet?.id) {
      this.activeTupletGroup.set(undefined);
    }
    this.message.set('');
  }

  private clearActiveTupletIfRemoved(noteIds: readonly string[]): void {
    const active = this.activeTupletGroup();
    if (!active || noteIds.length === 0) {
      return;
    }
    const removed = new Set(noteIds);
    const activeMemberWillBeRemoved = this.instruments.some((instrument) =>
      this.pattern()[instrument.id]
        .flat()
        .some((note) => removed.has(note.id) && note.tuplet?.id === active.id),
    );
    if (activeMemberWillBeRemoved) {
      this.activeTupletGroup.set(undefined);
    }
  }

  private noteDurationTicks(note: DrumNote): number {
    const baseDuration = this.ticksPerWholeNote() / note.duration;
    return note.tuplet ? baseDuration * (note.tuplet.inTimeOf / note.tuplet.count) : baseDuration;
  }

  private tupletGroupTicks(note: DrumNote): number {
    return note.tuplet
      ? (this.ticksPerWholeNote() / note.duration) * note.tuplet.inTimeOf
      : this.noteDurationTicks(note);
  }

  private tupletGroupStart(note: DrumNote): number {
    if (!note.tuplet) {
      return note.start;
    }
    const slotDuration =
      (this.ticksPerWholeNote() / note.duration) *
      (note.tuplet.inTimeOf / note.tuplet.count);
    return note.start - slotDuration * note.tuplet.index;
  }

  private intervalsOverlap(start: number, end: number, otherStart: number, otherEnd: number): boolean {
    return start < otherEnd - 1e-7 && end > otherStart + 1e-7;
  }

  private overlappingNoteIds(
    pattern: Pattern,
    instrumentId: DrumId,
    start: number,
    end: number,
  ): string[] {
    const overlappingIds = pattern[instrumentId].flatMap((measure, measureIndex) =>
      measure
        .filter((note) => {
          const noteStart = measureIndex * this.stepsPerMeasure() + note.start;
          return this.intervalsOverlap(start, end, noteStart, noteStart + this.noteDurationTicks(note));
        })
        .map((note) => note.id),
    );
    const overlappingSet = new Set(overlappingIds);
    const groupIds = new Set(
      this.instruments.flatMap((instrument) =>
        pattern[instrument.id]
          .flat()
          .filter((note) => overlappingSet.has(note.id) && note.tuplet)
          .flatMap((note) => (note.tuplet ? [note.tuplet.id] : [])),
      ),
    );
    return this.instruments.flatMap((instrument) =>
      pattern[instrument.id]
        .flat()
        .filter((note) => overlappingSet.has(note.id) || (note.tuplet && groupIds.has(note.tuplet.id)))
        .map((note) => note.id),
    );
  }

  private removeNotesFromPattern(pattern: Pattern, noteIds: readonly string[]): Pattern {
    if (noteIds.length === 0) {
      return pattern;
    }
    const removedIds = new Set(noteIds);
    const updated = {} as Pattern;
    for (const instrument of this.instruments) {
      updated[instrument.id] = pattern[instrument.id].map((measure) =>
        measure.filter((note) => !removedIds.has(note.id)),
      );
    }
    return updated;
  }

  private currentIncompleteTupletGroup(duration: NoteValue): ActiveTupletGroup | undefined {
    const configMatches = (group: ActiveTupletGroup) =>
      group.count === this.tupletCount() &&
      group.inTimeOf === this.tupletInTimeOf() &&
      group.duration === duration;
    const active = this.activeTupletGroup();
    if (active && configMatches(active)) {
      return active;
    }

    const groups = new Map<
      string,
      Array<{ measureIndex: number; note: DrumNote }>
    >();
    for (const instrument of this.instruments) {
      this.pattern()[instrument.id].forEach((measure, measureIndex) => {
        for (const note of measure) {
          if (!note.tuplet) {
            continue;
          }
          const members = groups.get(note.tuplet.id) ?? [];
          members.push({ measureIndex, note });
          groups.set(note.tuplet.id, members);
        }
      });
    }

    const candidates = [...groups.entries()].flatMap(([id, members]) => {
      const first = members[0];
      const tuplet = first.note.tuplet;
      if (
        !tuplet ||
        members.length >= tuplet.count ||
        !configMatches({
          id,
          count: tuplet.count,
          inTimeOf: tuplet.inTimeOf,
          duration: first.note.duration,
          start: 0,
          measureIndex: first.measureIndex,
          nextIndex: 0,
        })
      ) {
        return [];
      }
      const ordered = [...members].sort(
        (left, right) =>
          (left.note.tuplet?.index ?? 0) - (right.note.tuplet?.index ?? 0),
      );
      if (
        ordered.some(
          ({ note }, index) =>
            note.tuplet?.index !== index ||
            note.duration !== first.note.duration ||
            members.some((member) => member.measureIndex !== first.measureIndex),
        )
      ) {
        return [];
      }
      const anchor = ordered[0].note;
      const group: ActiveTupletGroup = {
        id,
        count: tuplet.count,
        inTimeOf: tuplet.inTimeOf,
        duration: first.note.duration,
        start: first.measureIndex * this.stepsPerMeasure() + anchor.start,
        measureIndex: first.measureIndex,
        nextIndex: ordered.length,
      };
      return [group];
    });

    const resumed = candidates.sort((left, right) => right.start - left.start)[0];
    if (resumed) {
      this.activeTupletGroup.set(resumed);
    }
    return resumed;
  }

  private instrumentForPlacement(event: Event, keyboardInstrument?: DrumId): DrumId {
    if (keyboardInstrument) {
      return keyboardInstrument;
    }
    const selectedInstrumentId = this.selectedInstrumentId();
    if (selectedInstrumentId) {
      return selectedInstrumentId;
    }
    const mouseEvent = event instanceof MouseEvent ? event : undefined;
    const svg = (event.currentTarget as SVGGraphicsElement | null)?.ownerSVGElement;
    const bounds = svg?.getBoundingClientRect();
    const y =
      mouseEvent && bounds && bounds.height > 0
        ? ((mouseEvent.clientY - bounds.top) / bounds.height) * SCORE_SHEET_HEIGHT -
          SCORE_CONTENT_OFFSET_Y
        : mouseEvent?.clientY ?? this.instrumentY('closedHat');

    return this.instruments.reduce((closest, instrument) =>
      Math.abs(this.instrumentY(instrument.id) - y) <
      Math.abs(this.instrumentY(closest) - y)
        ? instrument.id
        : closest,
    this.instruments[0].id);
  }

  private snapPlacementToNoteValue(
    measureIndex: number,
    step: number,
    event?: Event,
    duration: NoteValue = this.selectedNoteValue(),
  ): { measureIndex: number; step: number } {
    const mouseEvent = event instanceof MouseEvent ? event : undefined;
    const targetBounds = event
      ? (event.currentTarget as SVGRectElement | null)?.getBoundingClientRect()
      : undefined;
    const fraction =
      mouseEvent && targetBounds && targetBounds.width > 0
        ? Math.min(1, Math.max(0, (mouseEvent.clientX - targetBounds.left) / targetBounds.width))
        : 0.5;
    const clickedStep = step + fraction;
    const stepCount = this.stepsPerMeasure();
    const gridInterval = this.ticksPerWholeNote() / duration;
    const lastGridIndex = Math.floor((stepCount - 1) / gridInterval);
    let snappedStep = 0;
    let closestDistance = Math.abs(clickedStep);

    for (let gridIndex = 1; gridIndex <= lastGridIndex; gridIndex++) {
      const candidate = gridIndex * gridInterval;
      const distance = Math.abs(candidate - clickedStep);
      if (distance <= closestDistance) {
        snappedStep = candidate;
        closestDistance = distance;
      }
    }

    if (stepCount - clickedStep <= closestDistance) {
      return { measureIndex: measureIndex + 1, step: 0 };
    }
    return { measureIndex, step: snappedStep };
  }

  private addFreeAnnotation(event: Event, measureIndex: number, step: number): void {
    const text = this.annotationInput().trim();
    if (!text) {
      this.message.set('Gib zuerst den Text ein, den du in die Partitur setzen möchtest.');
      return;
    }
    const mouseEvent = event as MouseEvent;
    const svg = (event.currentTarget as SVGGraphicsElement | null)?.ownerSVGElement;
    const bounds = svg?.getBoundingClientRect();
    const y =
      bounds && bounds.height > 0 && Number.isFinite(mouseEvent.clientY)
        ? Math.min(
            124,
            Math.max(
              33,
              ((mouseEvent.clientY - bounds.top) / bounds.height) * SCORE_SHEET_HEIGHT -
                SCORE_CONTENT_OFFSET_Y,
            ),
          )
        : 76;
    this.recordUndo();
    this.annotations.update((annotations) => {
      const updated = annotations.map((measure) => [...measure]);
      updated[measureIndex].push({
        id: this.createAnnotationId(),
        text,
        step,
        y,
      });
      return updated;
    });
    this.message.set('');
  }

  private attachTextToNote(
    measureIndex: number,
    step: number,
    noteId: string,
  ): void {
    const text = this.annotationInput().trim();
    if (!text) {
      this.message.set('Gib zuerst den Text ein, den du an die Note hängen möchtest.');
      return;
    }
    const annotation: ScoreAnnotation = {
      id: this.createAnnotationId(),
      text,
      step,
      y:
        this.noteTextPosition() === 'above'
          ? NOTE_TEXT_ABOVE_Y
          : NOTE_TEXT_BELOW_Y,
      noteId,
    };
    this.recordUndo();
    this.annotations.update((annotations) => {
      const updated = annotations.map((measure) =>
        measure.filter((item) => item.noteId !== noteId),
      );
      updated[measureIndex] = [...updated[measureIndex], annotation];
      return updated;
    });
    this.message.set('');
  }

  private removeAnnotationsForNotes(noteIds: string[]): void {
    if (noteIds.length === 0) {
      return;
    }
    const removed = new Set(noteIds);
    this.annotations.update((annotations) =>
      annotations.map((measure) => measure.filter((annotation) => !annotation.noteId || !removed.has(annotation.noteId))),
    );
  }

  private createStarterPattern(): Pattern {
    const pattern = this.createEmptyPattern(2);
    const beat = this.ticksPerWholeNote() / 4;
    for (let measure = 0; measure < 2; measure++) {
      pattern.kick[measure].push(
        this.createNote(0, 4),
        this.createNote(beat * 2, 4),
      );
      pattern.snare[measure].push(
        this.createNote(beat, 4),
        this.createNote(beat * 3, 4),
      );
      for (let step = 0; step < this.stepsPerMeasure(); step += beat / 2) {
        pattern.closedHat[measure].push(this.createNote(step, 8));
      }
    }
    return pattern;
  }

  private createEmptyPattern(measures: number): Pattern {
    const pattern = {} as Pattern;
    for (const instrument of this.instruments) {
      pattern[instrument.id] = Array.from({ length: measures }, () => []);
    }
    return pattern;
  }

  private createEmptyRests(measures: number): RestPattern {
    const rests = {} as RestPattern;
    for (const instrument of this.instruments) {
      rests[instrument.id] = Array.from({ length: measures }, () => []);
    }
    return rests;
  }

  private createEmptyAnnotations(measures: number): ScoreAnnotation[][] {
    return Array.from({ length: measures }, () => []);
  }

  private createNote(start: number, duration: NoteValue): DrumNote {
    return {
      id: this.createNoteId(),
      start,
      duration,
      stemDirection: this.stemDirection(),
    };
  }

  private withStemDirection(pattern: Pattern, direction: StemDirection): Pattern {
    const updated = {} as Pattern;
    for (const instrument of this.instruments) {
      updated[instrument.id] = pattern[instrument.id].map((measure) =>
        measure.map((note) =>
          note.stemDirection ? note : { ...note, stemDirection: direction },
        ),
      );
    }
    return updated;
  }

  private discardSelectedNotes(noteIds: readonly string[]): void {
    if (noteIds.length === 0) {
      return;
    }
    const removed = new Set(noteIds);
    this.selectedNoteIds.update((selected) => selected.filter((noteId) => !removed.has(noteId)));
  }

  private createRest(start: number, duration: NoteValue): DrumRest {
    const existingIds = new Set(
      this.instruments.flatMap((instrument) =>
        this.rests()[instrument.id].flat().map((rest) => rest.id),
      ),
    );
    let id: string;
    do {
      this.restIdCounter += 1;
      id = `rest-${this.restIdCounter}`;
    } while (existingIds.has(id));
    return { id, start, duration };
  }

  private createTupletId(): string {
    const existingIds = new Set(
      this.instruments.flatMap((instrument) =>
        this.pattern()[instrument.id]
          .flat()
          .flatMap((note) => (note.tuplet ? [note.tuplet.id] : [])),
      ),
    );
    let id: string;
    do {
      this.tupletIdCounter += 1;
      id = `tuplet-${this.tupletIdCounter}`;
    } while (existingIds.has(id));
    return id;
  }

  private createNoteId(): string {
    this.noteIdCounter += 1;
    return `note-${this.noteIdCounter}`;
  }

  private createAnnotationId(): string {
    const existingIds = new Set(this.annotations().flat().map((annotation) => annotation.id));
    let id: string;
    do {
      this.annotationIdCounter += 1;
      id = `text-${this.annotationIdCounter}`;
    } while (existingIds.has(id));
    return id;
  }
}
