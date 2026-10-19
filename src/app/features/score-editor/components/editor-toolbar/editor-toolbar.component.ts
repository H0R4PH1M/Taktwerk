import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
  selector: 'app-editor-toolbar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './editor-toolbar.component.html',
  styleUrl: './editor-toolbar.component.css',
})
export class EditorToolbarComponent {
  readonly numerator = input.required<number>();
  readonly denominator = input.required<number>();
  readonly denominators = input.required<readonly number[]>();
  readonly subdivisionLabel = input.required<string>();
  readonly tempo = input.required<number>();
  readonly isPlaying = input.required<boolean>();
  readonly canUndo = input.required<boolean>();

  readonly numeratorChanged = output<Event>();
  readonly denominatorChanged = output<Event>();
  readonly tempoChanged = output<Event>();
  readonly playbackToggled = output<void>();
  readonly undoRequested = output<void>();
}
