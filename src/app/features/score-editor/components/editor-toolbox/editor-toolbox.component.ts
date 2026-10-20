import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  input,
  output,
  signal,
} from '@angular/core';
import type {
  DrumId,
  DrumInstrument,
  BeamCollisionSide,
  NoteTextPosition,
  NoteValue,
  StemDirection,
  ToolMode,
} from '../../models/score.model';
import { restSymbolForDuration } from '../../score-notation';

interface NoteValueOption {
  value: NoteValue;
  name: string;
  label: string;
}

type DurationPickerKind = 'notes' | 'rests';

export interface SelectionNoteEdit {
  id: string;
  instrumentId: DrumId;
  measureIndex: number;
  start: number;
  duration: NoteValue;
  isTuplet: boolean;
}

export interface SelectionNotesEdit {
  count: number;
  instrumentId: DrumId;
  duration: NoteValue;
  containsTuplets: boolean;
}

export interface SelectionAnnotationEdit {
  id: string;
  text: string;
}

export interface NoteEditChange {
  field: 'duration' | 'instrumentId' | 'measureIndex' | 'start';
  value: number | string;
}

@Component({
  selector: 'app-editor-toolbox',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './editor-toolbox.component.html',
  styleUrl: './editor-toolbox.component.css',
})
export class EditorToolboxComponent {
  protected readonly durationMenuKind = signal<DurationPickerKind | null>(null);
  protected readonly durationPickers = [
    {
      kind: 'notes',
      label: 'NOTENWERT',
      triggerLabel: 'Notenwert auswählen',
      menuId: 'note-duration-menu',
      optionLabel: 'Notenwert',
    },
    {
      kind: 'rests',
      label: 'PAUSENWERT',
      triggerLabel: 'Pausenwert auswählen',
      menuId: 'rest-duration-menu',
      optionLabel: 'Pausenwert',
    },
  ] as const;
  readonly instruments = input.required<readonly DrumInstrument[]>();
  readonly selectedInstrumentId = input<DrumId | null>(null);
  readonly noteValues = input.required<readonly NoteValueOption[]>();
  readonly selectedNoteValue = input.required<NoteValue>();
  readonly selectedRestValue = input.required<NoteValue>();
  readonly stepsPerMeasure = input.required<number>();
  readonly autoBeaming = input.required<boolean>();
  readonly stemDirection = input.required<StemDirection>();
  readonly selectedNoteCount = input.required<number>();
  readonly selectedObjectCount = input.required<number>();
  readonly editingSelection = input.required<boolean>();
  readonly canManuallyConnectNotes = input.required<boolean>();
  readonly canManuallyDisconnectNotes = input.required<boolean>();
  readonly canOffsetSelectedBeams = input.required<boolean>();
  readonly selectedBeamsOffset = input.required<boolean>();
  readonly selectedBeamCollisionSide = input.required<BeamCollisionSide | null>();
  readonly clipboardAvailable = input.required<boolean>();
  readonly pastePending = input.required<boolean>();
  readonly selectedNoteEdit = input<SelectionNoteEdit | null>(null);
  readonly selectedNotesEdit = input<SelectionNotesEdit | null>(null);
  readonly selectedAnnotationEdit = input<SelectionAnnotationEdit | null>(null);
  readonly tupletsEnabled = input.required<boolean>();
  readonly tupletCount = input.required<number>();
  readonly tupletInTimeOf = input.required<number>();
  readonly annotationInput = input.required<string>();
  readonly toolMode = input.required<ToolMode>();
  readonly noteTextPosition = input.required<NoteTextPosition>();
  readonly fillMeasurePending = input.required<boolean>();

  readonly noteValueSelected = output<NoteValue>();
  readonly restValueSelected = output<NoteValue>();
  readonly autoBeamingChanged = output<Event>();
  readonly stemDirectionChanged = output<Event>();
  readonly selectedStemDirectionChanged = output<StemDirection>();
  readonly selectionCleared = output<void>();
  readonly selectionEditToggled = output<void>();
  readonly selectedObjectsDeleted = output<void>();
  readonly selectedObjectsCopied = output<void>();
  readonly manualBeamConnectRequested = output<void>();
  readonly manualBeamDisconnectRequested = output<void>();
  readonly beamOffsetToggled = output<void>();
  readonly beamCollisionSideChanged = output<BeamCollisionSide>();
  readonly pasteRequested = output<void>();
  readonly noteEditChanged = output<NoteEditChange>();
  readonly annotationTextChanged = output<string>();
  readonly tupletsEnabledChanged = output<boolean>();
  readonly tupletCountChanged = output<Event>();
  readonly tupletInTimeOfChanged = output<Event>();
  readonly annotationInputChanged = output<Event>();
  readonly toolModeSelected = output<ToolMode>();
  readonly noteTextPositionSelected = output<NoteTextPosition>();
  readonly instrumentSelected = output<DrumId | null>();
  readonly fillMeasureToggled = output<void>();

  selectedValue(kind: DurationPickerKind): NoteValue {
    return kind === 'notes' ? this.selectedNoteValue() : this.selectedRestValue();
  }

  selectedValueLabel(kind: DurationPickerKind): string {
    return (
      this.noteValues().find((note) => note.value === this.selectedValue(kind))?.label ??
      'Wert wählen'
    );
  }

  toggleDurationMenu(kind: DurationPickerKind): void {
    this.durationMenuKind.update((openKind) => (openKind === kind ? null : kind));
  }

  chooseDuration(kind: DurationPickerKind, value: NoteValue): void {
    if (kind === 'notes') {
      this.noteValueSelected.emit(value);
    } else {
      this.restValueSelected.emit(value);
    }
    this.durationMenuKind.set(null);
  }

  toolHelpText(): string {
    switch (this.toolMode()) {
      case 'notes':
        if (this.fillMeasurePending()) {
          return 'Taktfüllung aktiv: Klicke auf den gewünschten Takt. Die Spur des ausgewählten Instruments wird mit dem gewählten Notenwert gefüllt.';
        }
        return 'Notenwert wählen und Rasterpunkt anklicken. Das Instrument bestimmst du über die Notenzeile oder die Instrumentauswahl; eine vorhandene Note kannst du per Klick entfernen.';
      case 'rests':
        return 'Pausenwert wählen und Rasterpunkt anklicken. Eine vorhandene Pause am Rasterpunkt kannst du per erneutem Klick entfernen.';
      case 'select':
        return this.pastePending()
          ? 'Einfügen aktiv: Klicke auf das Notenblatt, um die Kopie zu platzieren. Esc bricht ab.'
          : 'Klick wählt Note oder Text; Ziehen öffnet einen Auswahlrahmen. Strg/Cmd-Klick ergänzt die Auswahl, Entf löscht und Strg/Cmd+Z macht rückgängig.';
      case 'noteText':
        return 'Text eingeben, „An Note“ wählen und die gewünschte Note anklicken. Die Position über oder unter den Noten legst du daneben fest.';
      case 'freeText':
        return 'Text eingeben, „Freitext platzieren“ wählen und freien Text an der gewünschten Stelle im Notenblatt anklicken.';
    }
  }

  @HostListener('document:click')
  closeDurationMenu(): void {
    this.durationMenuKind.set(null);
  }

  @HostListener('document:keydown.escape')
  closeDurationMenuOnEscape(): void {
    this.durationMenuKind.set(null);
  }

  emitNoteEdit(field: NoteEditChange['field'], event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) {
      throw new Error('Ungültiges Noten-Bearbeitungsfeld.');
    }
    this.noteEditChanged.emit({
      field,
      value: field === 'instrumentId' ? target.value : Number(target.value),
    });
  }

  emitAnnotationText(event: Event): void {
    if (!(event.target instanceof HTMLInputElement)) {
      throw new Error('Ungültiges Text-Bearbeitungsfeld.');
    }
    this.annotationTextChanged.emit(event.target.value.slice(0, 60));
  }

  noteFlags(value: NoteValue): number[] {
    return Array.from({ length: Math.max(0, Math.log2(value) - 2) }, (_, index) => index);
  }

  restSymbol(duration: NoteValue): string {
    return restSymbolForDuration(duration);
  }
}
