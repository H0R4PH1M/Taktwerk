import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  output,
  signal,
} from '@angular/core';
import type { PdfExportSettings, PdfMeasuresPerRow } from '../../models/pdf-export.model';

@Component({
  selector: 'app-pattern-actions',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pattern-actions.component.html',
  styleUrl: './pattern-actions.component.css',
})
export class PatternActionsComponent {
  protected readonly pdfMeasuresPerRowOptions: readonly PdfMeasuresPerRow[] = [1, 2, 3, 4];
  protected readonly pdfSettingsOpen = signal(false);
  protected readonly pdfTitle = signal('Mein Schlagzeug-Pattern');
  protected readonly measuresPerRow = signal<PdfMeasuresPerRow>(2);
  protected readonly validationMessage = signal('');
  readonly cleared = output<void>();
  readonly exported = output<void>();
  readonly importRequested = output<File>();
  readonly pdfExported = output<PdfExportSettings>();

  protected requestImport(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      throw new Error('Ungültiges Import-Dateifeld.');
    }
    const file = target.files?.[0];
    target.value = '';
    if (file) {
      this.importRequested.emit(file);
    }
  }

  protected openPdfSettings(): void {
    this.validationMessage.set('');
    this.pdfSettingsOpen.set(true);
  }

  protected closePdfSettings(): void {
    this.pdfSettingsOpen.set(false);
    this.validationMessage.set('');
  }

  protected setPdfTitle(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      throw new Error('Ungültiges PDF-Titelfeld.');
    }
    this.pdfTitle.set(target.value);
    this.validationMessage.set('');
  }

  protected setMeasuresPerRow(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) {
      throw new Error('Ungültige Takte-pro-Zeile-Auswahl.');
    }
    const value = Number(target.value);
    const option = this.pdfMeasuresPerRowOptions.find((item) => item === value);
    if (option === undefined) {
      throw new Error('Ungültige Anzahl Takte pro Zeile.');
    }
    this.measuresPerRow.set(option);
  }

  protected requestPdfExport(event: SubmitEvent): void {
    event.preventDefault();
    const title = this.pdfTitle().trim();
    if (!title) {
      this.validationMessage.set('Bitte gib einen Titel für die PDF ein.');
      return;
    }
    this.pdfExported.emit({ title, measuresPerRow: this.measuresPerRow() });
    this.closePdfSettings();
  }

  @HostListener('document:keydown.escape')
  protected closePdfSettingsOnEscape(): void {
    if (this.pdfSettingsOpen()) {
      this.closePdfSettings();
    }
  }
}
