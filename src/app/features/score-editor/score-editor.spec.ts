import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { jsPDF } from 'jspdf';
import { vi } from 'vitest';
import 'svg2pdf.js';
import { ScoreEditorComponent } from './score-editor.component';
import { DRUM_INSTRUMENTS } from './score-editor.constants';
import { BUILD_INFO } from '../../build-info.generated';
import { DrumAudioService } from './services/drum-audio.service';

function openDurationMenu(
  fixture: ComponentFixture<ScoreEditorComponent>,
  kind: 'notes' | 'rests',
): HTMLElement {
  const compiled = fixture.nativeElement as HTMLElement;
  const mode = compiled.querySelector<HTMLButtonElement>(
    `[aria-label="Werkzeug ${kind === 'notes' ? 'Note' : 'Pause'}"]`,
  );
  if (mode?.getAttribute('aria-pressed') !== 'true') {
    mode?.click();
    fixture.detectChanges();
  }
  const trigger = compiled.querySelector<HTMLButtonElement>(
    `[aria-label="${kind === 'notes' ? 'Notenwert' : 'Pausenwert'} auswählen"]`,
  );
  if (!trigger) {
    throw new Error(`${kind === 'notes' ? 'Notenwert' : 'Pausenwert'}-Auswahl wurde nicht angezeigt.`);
  }
  if (trigger.getAttribute('aria-expanded') !== 'true') {
    trigger.click();
    fixture.detectChanges();
  }
  return compiled;
}

function selectDuration(
  fixture: ComponentFixture<ScoreEditorComponent>,
  kind: 'notes' | 'rests',
  name: string,
): void {
  const compiled = openDurationMenu(fixture, kind);
  const option = compiled.querySelector<HTMLButtonElement>(
    `[aria-label="${kind === 'notes' ? 'Notenwert' : 'Pausenwert'} ${name}"]`,
  );
  if (!option) {
    throw new Error(`${kind === 'notes' ? 'Notenwert' : 'Pausenwert'} ${name} wurde nicht angezeigt.`);
  }
  option.click();
  fixture.detectChanges();
}

function selectNoteValue(fixture: ComponentFixture<ScoreEditorComponent>, name: string): void {
  selectDuration(fixture, 'notes', name);
}

function selectRestValue(fixture: ComponentFixture<ScoreEditorComponent>, name: string): void {
  selectDuration(fixture, 'rests', name);
}

function selectTextTool(fixture: ComponentFixture<ScoreEditorComponent>): void {
  const compiled = fixture.nativeElement as HTMLElement;
  const button = compiled.querySelector<HTMLButtonElement>('[aria-label="Werkzeug Text"]');
  if (!button) {
    throw new Error('Textwerkzeug wurde nicht angezeigt.');
  }
  if (button.getAttribute('aria-pressed') !== 'true') {
    button.click();
    fixture.detectChanges();
  }
}

function selectSelectionTool(fixture: ComponentFixture<ScoreEditorComponent>): void {
  const compiled = fixture.nativeElement as HTMLElement;
  const button = compiled.querySelector<HTMLButtonElement>('[aria-label="Werkzeug Auswahl"]');
  if (!button) {
    throw new Error('Auswahlwerkzeug wurde nicht angezeigt.');
  }
  if (button.getAttribute('aria-pressed') !== 'true') {
    button.click();
    fixture.detectChanges();
  }
}

function mockCanvasRendering(): () => void {
  const context = {
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    fillStyle: '#000',
    globalAlpha: 1,
    measureText: (text: string) => ({
      width: text.length * 8,
      actualBoundingBoxAscent: 10,
      actualBoundingBoxDescent: 2,
    }),
    scale: () => {},
    fillText: () => {},
  };
  const getContextDescriptor = Object.getOwnPropertyDescriptor(
    HTMLCanvasElement.prototype,
    'getContext',
  );
  const toDataUrlDescriptor = Object.getOwnPropertyDescriptor(
    HTMLCanvasElement.prototype,
    'toDataURL',
  );
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: () => context,
  });
  Object.defineProperty(HTMLCanvasElement.prototype, 'toDataURL', {
    configurable: true,
    value: () => 'data:image/png;base64,ZmFrZQ==',
  });

  return () => {
    if (getContextDescriptor) {
      Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', getContextDescriptor);
    } else {
      Reflect.deleteProperty(HTMLCanvasElement.prototype, 'getContext');
    }
    if (toDataUrlDescriptor) {
      Object.defineProperty(HTMLCanvasElement.prototype, 'toDataURL', toDataUrlDescriptor);
    } else {
      Reflect.deleteProperty(HTMLCanvasElement.prototype, 'toDataURL');
    }
  };
}

describe('ScoreEditorComponent', () => {
  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [ScoreEditorComponent],
    }).compileComponents();
  });

  it('renders a percussion score with a starter rhythm', async () => {
    const fixture = TestBed.createComponent(ScoreEditorComponent);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('h1')?.textContent).toContain('Mach den Beat sichtbar');
    expect(compiled.querySelectorAll('.measure-sheet')).toHaveLength(2);
    expect(compiled.querySelectorAll('.staff-line')).toHaveLength(10);
    expect(compiled.querySelectorAll('.score-note')).toHaveLength(24);
  });

  it('shows the build commit and timestamp in the footer', async () => {
    const fixture = TestBed.createComponent(ScoreEditorComponent);
    await fixture.whenStable();
    const footer = (fixture.nativeElement as HTMLElement).querySelector('footer.footer');

    expect(footer?.textContent).toContain(BUILD_INFO.commit);
    expect(footer?.textContent).toContain(BUILD_INFO.builtAtLabel);
    expect(footer?.querySelector('a[href="https://github.com/H0R4PH1M/Taktwerk"]')?.textContent).toBe(
      'GitHub',
    );
  });

  it('chooses a note or pause value from a compact dropdown', async () => {
    const fixture = TestBed.createComponent(ScoreEditorComponent);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;

    const menu = openDurationMenu(fixture, 'notes');
    expect(menu.querySelectorAll('[role="menuitemradio"]')).toHaveLength(7);
    expect(
      menu.querySelector<HTMLButtonElement>('[aria-label="Notenwert Viertelnote"]')
        ?.getAttribute('aria-checked'),
    ).toBe('true');

    selectNoteValue(fixture, 'Achtelnote');

    const trigger = compiled.querySelector<HTMLButtonElement>('[aria-label="Notenwert auswählen"]');
    expect(trigger?.getAttribute('aria-expanded')).toBe('false');
    expect(trigger?.textContent).toContain('Achtel');

    selectRestValue(fixture, 'Halbe Note');
    expect(
      compiled.querySelector('[aria-label="Pausenwert auswählen"]')?.textContent,
    ).toContain('Halbe');
    openDurationMenu(fixture, 'notes');
    expect(
      compiled.querySelector('[aria-label="Notenwert Achtelnote"]')?.getAttribute('aria-checked'),
    ).toBe('true');
  });

  it('shows the active tool mode and only its matching note or pause value', async () => {
    const fixture = TestBed.createComponent(ScoreEditorComponent);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;

    const noteTool = compiled.querySelector<HTMLButtonElement>('[aria-label="Werkzeug Note"]');
    const pauseTool = compiled.querySelector<HTMLButtonElement>('[aria-label="Werkzeug Pause"]');
    const selectionTool =
      compiled.querySelector<HTMLButtonElement>('[aria-label="Werkzeug Auswahl"]');

    expect(noteTool?.getAttribute('aria-pressed')).toBe('true');
    expect(pauseTool?.getAttribute('aria-pressed')).toBe('false');
    expect(compiled.querySelector('[aria-label="Notenwert auswählen"]')).toBeTruthy();
    expect(compiled.querySelector('[aria-label="Pausenwert auswählen"]')).toBeNull();

    pauseTool?.click();
    fixture.detectChanges();

    expect(pauseTool?.getAttribute('aria-pressed')).toBe('true');
    expect(compiled.querySelector('[aria-label="Notenwert auswählen"]')).toBeNull();
    expect(compiled.querySelector('[aria-label="Pausenwert auswählen"]')).toBeTruthy();

    selectionTool?.click();
    fixture.detectChanges();

    expect(selectionTool?.getAttribute('aria-pressed')).toBe('true');
    expect(compiled.querySelector('[aria-label="Pausenwert auswählen"]')).toBeNull();
  });

  it('shows text entry controls only while a text tool is selected', async () => {
    const fixture = TestBed.createComponent(ScoreEditorComponent);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    const textInput = () => compiled.querySelector('[aria-label="Partiturtext"]');

    expect(textInput()).toBeNull();
    compiled.querySelector<HTMLButtonElement>('[aria-label="Werkzeug Pause"]')?.click();
    fixture.detectChanges();
    expect(textInput()).toBeNull();

    compiled.querySelector<HTMLButtonElement>('[aria-label="Werkzeug Auswahl"]')?.click();
    fixture.detectChanges();
    expect(textInput()).toBeNull();

    compiled.querySelector<HTMLButtonElement>('[aria-label="Werkzeug Text"]')?.click();
    fixture.detectChanges();
    expect(textInput()).toBeTruthy();
    expect(compiled.querySelector('.annotation-tools')?.closest('.duration-tools')).toBeTruthy();
    expect(compiled.querySelector('[aria-label="Textmodus Freitext"]')).toBeTruthy();
    expect(compiled.querySelector('[aria-label="Notenwert auswählen"]')).toBeNull();
    expect(compiled.querySelector('[aria-label="Pausenwert auswählen"]')).toBeNull();

    compiled.querySelector<HTMLButtonElement>('[aria-label="Textmodus An Note"]')?.click();
    fixture.detectChanges();
    expect(textInput()).toBeTruthy();
    expect(compiled.querySelector('[aria-label="Nächster Notentext über allen Noten"]')).toBeTruthy();
  });

  it('shows instructions for the active tool and text submode', async () => {
    const fixture = TestBed.createComponent(ScoreEditorComponent);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    const help = compiled.querySelector('[aria-label="Hilfe zum Werkzeug"]');

    expect(help?.textContent).toContain('Notenwert');

    compiled.querySelector<HTMLButtonElement>('[aria-label="Werkzeug Pause"]')?.click();
    fixture.detectChanges();
    expect(help?.textContent).toContain('Pause');

    compiled.querySelector<HTMLButtonElement>('[aria-label="Werkzeug Auswahl"]')?.click();
    fixture.detectChanges();
    expect(help?.textContent).toContain('Auswahlrahmen');

    compiled.querySelector<HTMLButtonElement>('[aria-label="Werkzeug Text"]')?.click();
    fixture.detectChanges();
    compiled.querySelector<HTMLButtonElement>('[aria-label="Textmodus An Note"]')?.click();
    fixture.detectChanges();
    expect(help?.textContent).toContain('Note');

    compiled.querySelector<HTMLButtonElement>('[aria-label="Textmodus Freitext"]')?.click();
    fixture.detectChanges();
    expect(help?.textContent).toContain('freien Text');
    expect(compiled.querySelector('.notation-hint')).toBeNull();
  });

  it('keeps advanced settings collapsed and hides empty-selection actions', async () => {
    const fixture = TestBed.createComponent(ScoreEditorComponent);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('[aria-label="Auswahl löschen"]')).toBeNull();

    const advanced = compiled.querySelector<HTMLDetailsElement>(
      'details[aria-label="Erweiterte Werkzeuge"]',
    );
    if (!advanced) {
      throw new Error('Erweiterte Werkzeuge wurden nicht angezeigt.');
    }
    expect(advanced.open).toBe(false);

    advanced.querySelector('summary')?.click();
    fixture.detectChanges();

    expect(advanced.open).toBe(true);
    expect(advanced.querySelector('[aria-label="Noten automatisch verbinden"]')).toBeTruthy();
    expect(advanced.querySelector('[aria-label="Tuplets aktivieren"]')).toBeTruthy();

    compiled.querySelector<HTMLButtonElement>('[aria-label="Werkzeug Auswahl"]')?.click();
    compiled.querySelector<SVGGElement>('.score-note')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );
    fixture.detectChanges();

    expect(compiled.querySelector('[aria-label="Auswahl löschen"]')).toBeTruthy();
  });

  it('migrates saved step-grid rhythms into percussion notes', async () => {
    const emptyMeasure = Array<boolean>(16).fill(false);
    const kickMeasure = [...emptyMeasure];
    kickMeasure[0] = true;
    localStorage.setItem(
      'taktwerk-pattern-v1',
      JSON.stringify({
        tempo: 92,
        numerator: 4,
        denominator: 4,
        measures: 1,
        pattern: {
          kick: [kickMeasure],
          snare: [[...emptyMeasure]],
          closedHat: [[...emptyMeasure]],
          openHat: [[...emptyMeasure]],
          crash: [[...emptyMeasure]],
        },
      }),
    );

    const fixture = TestBed.createComponent(ScoreEditorComponent);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    const migratedKick = compiled.querySelector(
      '.measure-sheet[aria-label="Takt 1"] .score-note[data-instrument="kick"]',
    );

    expect(compiled.querySelectorAll('.measure-sheet')).toHaveLength(1);
    expect(migratedKick?.getAttribute('data-duration')).toBe('16');
  });

  it('loads saved note patterns that predate the tom instruments', async () => {
    localStorage.setItem(
      'taktwerk-pattern-v1',
      JSON.stringify({
        schemaVersion: 2,
        tempo: 92,
        numerator: 4,
        denominator: 4,
        measures: 1,
        pattern: {
          kick: [[{ id: 'saved-kick', start: 7, duration: 4 }]],
          snare: [[]],
          closedHat: [[]],
          openHat: [[]],
          crash: [[]],
        },
        rests: {
          kick: [[]],
          snare: [[]],
          closedHat: [[]],
          openHat: [[]],
          crash: [[]],
        },
        annotations: [[]],
      }),
    );

    const fixture = TestBed.createComponent(ScoreEditorComponent);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(
      compiled.querySelector(
        '.measure-sheet[aria-label="Takt 1"] .score-note[data-instrument="kick"][data-step="7"]',
      ),
    ).toBeTruthy();

    const floorTomPicker = compiled.querySelector<HTMLButtonElement>(
      '[aria-label="Instrument Floortom auswählen"]',
    );
    expect(floorTomPicker).toBeTruthy();
    floorTomPicker?.click();
    fixture.detectChanges();

    const placement = compiled.querySelector<SVGRectElement>(
      '.measure-sheet[aria-label="Takt 1"] .placement-target[data-step="8"]',
    );
    placement?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();

    expect(
      compiled.querySelector(
        '.measure-sheet[aria-label="Takt 1"] .score-note[data-instrument="floorTom"]',
      ),
    ).toBeTruthy();
  });

  it('places and removes notes on the score using the clicked height', async () => {
    const fixture = TestBed.createComponent(ScoreEditorComponent);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    const placement = compiled.querySelector<SVGRectElement>(
      '.measure-sheet[aria-label="Takt 1"] .placement-target[data-step="8"]',
    );

    if (!placement) {
      throw new Error('Notenblatt-Ziel wurde nicht angezeigt.');
    }
    placement.dispatchEvent(new MouseEvent('click', { bubbles: true, clientY: 34 }));
    fixture.detectChanges();

    const crashNote = compiled.querySelector<SVGGElement>(
      '.measure-sheet[aria-label="Takt 1"] .score-note[data-instrument="crash"]',
    );
    expect(crashNote).toBeTruthy();

    crashNote?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();

    expect(
      compiled.querySelectorAll('.measure-sheet[aria-label="Takt 1"] .score-note[data-instrument="crash"]'),
    ).toHaveLength(0);
  });

  it('chooses each drum instrument from the height of the placement click', async () => {
    const fixture = TestBed.createComponent(ScoreEditorComponent);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    selectNoteValue(fixture, 'Vierundsechzigstelnote');

    const instrumentHeights = [
      { y: 34, id: 'crash' },
      { y: 44, id: 'openHat' },
      { y: 52, id: 'closedHat' },
      { y: 64, id: 'tom1' },
      { y: 76, id: 'snare' },
      { y: 88, id: 'tom2' },
      { y: 100, id: 'floorTom' },
      { y: 112, id: 'kick' },
    ] as const;
    for (const { y, id } of instrumentHeights) {
      const placement = compiled.querySelector<SVGRectElement>(
        '.measure-sheet[aria-label="Takt 1"] .placement-target[data-step="60"]',
      );
      if (!placement) {
        throw new Error('Notenblatt-Ziel wurde nicht angezeigt.');
      }
      placement.dispatchEvent(new MouseEvent('click', { bubbles: true, clientY: y }));
      fixture.detectChanges();
      expect(
        compiled.querySelector(
          `.measure-sheet[aria-label="Takt 1"] .score-note[data-instrument="${id}"][data-duration="64"]`,
        ),
      ).toBeTruthy();
    }
  });

  it('fills the clicked measure with selected notes and replaces that instrument track', async () => {
    localStorage.setItem(
      'taktwerk-pattern-v1',
      JSON.stringify({
        schemaVersion: 2,
        tempo: 92,
        numerator: 4,
        denominator: 4,
        measures: 1,
        pattern: {
          kick: [[{ id: 'saved-kick', start: 0, duration: 4 }]],
          snare: [[]],
          closedHat: [
            [
              { id: 'old-hat', start: 0, duration: 4 },
              { id: 'later-hat', start: 40, duration: 8 },
            ],
          ],
          openHat: [[]],
          crash: [[]],
          tom1: [[]],
          tom2: [[]],
          floorTom: [[]],
        },
        rests: {
          kick: [[]],
          snare: [[]],
          closedHat: [[{ id: 'old-rest', start: 24, duration: 8 }]],
          openHat: [[]],
          crash: [[]],
          tom1: [[]],
          tom2: [[]],
          floorTom: [[]],
        },
        annotations: [[{ id: 'old-label', text: 'alt', step: 0, y: 13, noteId: 'old-hat' }]],
      }),
    );

    const fixture = TestBed.createComponent(ScoreEditorComponent);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    selectNoteValue(fixture, 'Achtelnote');
    compiled
      .querySelector<HTMLButtonElement>('[aria-label="Instrument Hi-Hat geschlossen auswählen"]')
      ?.click();
    fixture.detectChanges();
    compiled.querySelector<HTMLButtonElement>('[aria-label="Takt füllen aktivieren"]')?.click();
    fixture.detectChanges();

    compiled
      .querySelector<SVGGElement>('.score-note[data-event-id="old-hat"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();

    const filledNotes = [
      ...compiled.querySelectorAll<SVGGElement>(
        '.measure-sheet[aria-label="Takt 1"] .score-note[data-instrument="closedHat"]',
      ),
    ];
    expect(filledNotes).toHaveLength(8);
    expect(filledNotes.map((note) => Number(note.getAttribute('data-step')))).toEqual([
      0, 8, 16, 24, 32, 40, 48, 56,
    ]);
    expect(filledNotes.every((note) => note.getAttribute('data-duration') === '8')).toBe(true);
    expect(
      compiled.querySelector(
        '.measure-sheet[aria-label="Takt 1"] .score-note[data-instrument="kick"][data-event-id="saved-kick"]',
      ),
    ).toBeTruthy();
    expect(
      compiled.querySelector(
        '.measure-sheet[aria-label="Takt 1"] .score-rest[data-instrument="closedHat"]',
      ),
    ).toBeNull();
    expect(compiled.querySelector('[data-note-id="old-hat"]')).toBeNull();

    compiled.querySelector<HTMLButtonElement>('[aria-label="Rückgängig"]')?.click();
    fixture.detectChanges();

    expect(
      compiled.querySelector('.score-note[data-event-id="old-hat"][data-duration="4"]'),
    ).toBeTruthy();
    expect(compiled.querySelector('.score-rest[data-rest-id="old-rest"]')).toBeTruthy();
    expect(compiled.querySelector('[data-note-id="old-hat"]')).toBeTruthy();
  });

  it('allows selecting an instrument directly or by score height', async () => {
    const fixture = TestBed.createComponent(ScoreEditorComponent);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    const crashPicker = compiled.querySelector<HTMLButtonElement>(
      '[aria-label="Instrument Crash-Becken auswählen"]',
    );

    expect(crashPicker).toBeTruthy();
    crashPicker?.click();
    fixture.detectChanges();

    const placement = compiled.querySelector<SVGRectElement>(
      '.measure-sheet[aria-label="Takt 1"] .placement-target[data-step="8"]',
    );
    if (!placement) {
      throw new Error('Notenblatt-Ziel wurde nicht angezeigt.');
    }
    placement.dispatchEvent(new MouseEvent('click', { bubbles: true, clientY: 112 }));
    fixture.detectChanges();

    expect(compiled.querySelector('.score-note[data-instrument="crash"]')).toBeTruthy();
    expect(
      compiled.querySelector('[aria-label="Instrument per Klickhöhe wählen"]'),
    ).toBeTruthy();

    const heightMode = compiled.querySelector<HTMLButtonElement>(
      '[aria-label="Instrument per Klickhöhe wählen"]',
    );
    heightMode?.click();
    fixture.detectChanges();
    const heightPlacement = compiled.querySelector<SVGRectElement>(
      '.measure-sheet[aria-label="Takt 1"] .placement-target[data-step="16"]',
    );
    if (!heightPlacement) {
      throw new Error('Notenblatt-Ziel wurde nicht angezeigt.');
    }
    heightPlacement.dispatchEvent(new MouseEvent('click', { bubbles: true, clientY: 112 }));
    fixture.detectChanges();

    expect(
      compiled.querySelector('.score-note[data-instrument="kick"][data-step="16"]'),
    ).toBeTruthy();
  });

  it('undoes a note deletion from the score', async () => {
    const fixture = TestBed.createComponent(ScoreEditorComponent);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    const undoButton = compiled.querySelector<HTMLButtonElement>('[aria-label="Rückgängig"]');
    const originalNoteCount = compiled.querySelectorAll('.score-note').length;
    const firstNote = compiled.querySelector<SVGGElement>('.score-note');

    expect(undoButton?.disabled).toBe(true);
    if (!firstNote) {
      throw new Error('Startnote wurde nicht angezeigt.');
    }
    firstNote.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();

    expect(compiled.querySelectorAll('.score-note').length).toBeLessThan(originalNoteCount);
    expect(undoButton?.disabled).toBe(false);
    undoButton?.click();
    fixture.detectChanges();

    expect(compiled.querySelectorAll('.score-note')).toHaveLength(originalNoteCount);
    expect(undoButton?.disabled).toBe(true);
  });

  it('restores the partiture after clearing it', async () => {
    const fixture = TestBed.createComponent(ScoreEditorComponent);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    const originalNoteCount = compiled.querySelectorAll('.score-note').length;
    const undoButton = compiled.querySelector<HTMLButtonElement>('[aria-label="Rückgängig"]');
    const clearButton = [...compiled.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent?.trim() === 'Leeren',
    );

    clearButton?.click();
    fixture.detectChanges();

    expect(compiled.querySelectorAll('.score-note')).toHaveLength(0);
    expect(undoButton?.disabled).toBe(false);
    undoButton?.click();
    fixture.detectChanges();

    expect(compiled.querySelectorAll('.score-note')).toHaveLength(originalNoteCount);
  });

  it('undoes note placement with the keyboard shortcut', async () => {
    const fixture = TestBed.createComponent(ScoreEditorComponent);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    const shell = compiled.querySelector<HTMLElement>('.app-shell');
    const originalNoteCount = compiled.querySelectorAll('.score-note').length;
    const placement = compiled.querySelector<SVGRectElement>(
      '.measure-sheet[aria-label="Takt 1"] .placement-target[data-step="2"]',
    );

    if (!shell || !placement) {
      throw new Error('Notenblatt oder Editor wurde nicht angezeigt.');
    }
    compiled.querySelector<HTMLButtonElement>(
      '[aria-label="Instrument Crash-Becken auswählen"]',
    )?.click();
    fixture.detectChanges();
    placement.dispatchEvent(new MouseEvent('click', { bubbles: true, clientY: 112 }));
    fixture.detectChanges();
    expect(compiled.querySelectorAll('.score-note').length).toBe(originalNoteCount + 1);

    shell.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }),
    );
    fixture.detectChanges();

    expect(compiled.querySelectorAll('.score-note')).toHaveLength(originalNoteCount);
  });

  it('undoes adding and removing a measure', async () => {
    const fixture = TestBed.createComponent(ScoreEditorComponent);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    const addMeasure = [...compiled.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent?.trim() === '+ Takt',
    );
    const removeMeasure = [...compiled.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent?.trim() === '− Takt',
    );

    expect(compiled.querySelectorAll('.measure-sheet')).toHaveLength(2);
    addMeasure?.click();
    fixture.detectChanges();
    expect(compiled.querySelectorAll('.measure-sheet')).toHaveLength(3);

    compiled.querySelector<HTMLButtonElement>('[aria-label="Rückgängig"]')?.click();
    fixture.detectChanges();
    expect(compiled.querySelectorAll('.measure-sheet')).toHaveLength(2);

    addMeasure?.click();
    fixture.detectChanges();
    removeMeasure?.click();
    fixture.detectChanges();
    expect(compiled.querySelectorAll('.measure-sheet')).toHaveLength(2);

    compiled.querySelector<HTMLButtonElement>('[aria-label="Rückgängig"]')?.click();
    fixture.detectChanges();
    expect(compiled.querySelectorAll('.measure-sheet')).toHaveLength(3);
  });

  it('downloads the configured PDF without opening the print dialog', async () => {
    const fixture = TestBed.createComponent(ScoreEditorComponent);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    const openSettings = compiled.querySelector<HTMLButtonElement>(
      '[aria-label="PDF Einstellungen"]',
    );
    if (!openSettings) {
      throw new Error('PDF-Export wurde nicht angezeigt.');
    }
    openSettings.click();
    fixture.detectChanges();
    const title = compiled.querySelector<HTMLInputElement>('[aria-label="PDF Titel"]');
    const measuresPerRow = compiled.querySelector<HTMLSelectElement>(
      '[aria-label="Takte pro Zeile"]',
    );
    const downloadButton = compiled.querySelector<HTMLButtonElement>(
      '[aria-label="PDF herunterladen"]',
    );
    if (!title || !measuresPerRow || !downloadButton) {
      throw new Error('PDF-Einstellungen wurden nicht angezeigt.');
    }
    expect(measuresPerRow.value).toBe('2');

    title.value = 'Probe-PDF';
    title.dispatchEvent(new Event('input', { bubbles: true }));
    measuresPerRow.value = '3';
    measuresPerRow.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();

    const createObjectUrl = vi.fn<(blob: Blob) => string>(() => 'blob:score.pdf');
    const revokeObjectUrl = vi.fn<(url: string) => void>();
    const createObjectUrlDescriptor = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
    const revokeObjectUrlDescriptor = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectUrl,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectUrl,
    });
    const svgRenderer = vi
      .spyOn(jsPDF.API, 'svg')
      .mockImplementation(async function (this: jsPDF) {
        return this;
      });
    const restoreCanvas = mockCanvasRendering();
    const downloadedLinks: HTMLAnchorElement[] = [];
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        downloadedLinks.push(this);
      });
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
    try {
      downloadButton.click();
      fixture.detectChanges();
      await fixture.whenStable();
      await vi.waitFor(() => expect(createObjectUrl).toHaveBeenCalledOnce());
      fixture.detectChanges();

      expect(printSpy).not.toHaveBeenCalled();
      expect(svgRenderer).toHaveBeenCalled();
      expect(compiled.querySelector('[role="status"]')?.textContent).toContain(
        'PDF wurde heruntergeladen',
      );
      expect(createObjectUrl).toHaveBeenCalledOnce();
      expect(downloadedLinks).toHaveLength(1);
      expect(downloadedLinks[0]?.download).toBe('Probe-PDF.pdf');
      expect(createObjectUrl.mock.calls[0]?.[0]?.type).toBe('application/pdf');
      expect(compiled.querySelector('[role="status"]')?.textContent).toContain(
        'PDF wurde heruntergeladen',
      );
    } finally {
      printSpy.mockRestore();
      clickSpy.mockRestore();
      svgRenderer.mockRestore();
      restoreCanvas();
      if (createObjectUrlDescriptor) {
        Object.defineProperty(URL, 'createObjectURL', createObjectUrlDescriptor);
      } else {
        Reflect.deleteProperty(URL, 'createObjectURL');
      }
      if (revokeObjectUrlDescriptor) {
        Object.defineProperty(URL, 'revokeObjectURL', revokeObjectUrlDescriptor);
      } else {
        Reflect.deleteProperty(URL, 'revokeObjectURL');
      }
      fixture.destroy();
    }
  });

  it('imports a pattern from a selected JSON file', async () => {
    const fixture = TestBed.createComponent(ScoreEditorComponent);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    const importButton = compiled.querySelector<HTMLButtonElement>(
      '[aria-label="JSON importieren"]',
    );
    const fileInput = compiled.querySelector<HTMLInputElement>('input[type="file"]');
    if (!importButton || !fileInput) {
      throw new Error('JSON-Import wurde nicht angezeigt.');
    }

    const pattern = Object.fromEntries(
      DRUM_INSTRUMENTS.map(({ id }) => [
        id,
        [id === 'kick' ? [{ id: 'note-imported', start: 0, duration: 4 }] : []],
      ]),
    );
    const tracks = Object.fromEntries(DRUM_INSTRUMENTS.map(({ id }) => [id, [[]]]));
    const fileContents = JSON.stringify({
      tempo: 112,
      timeSignature: '6/8',
      measures: 1,
      pattern,
      rests: tracks,
      annotations: [[]],
    });
    const file = new File([fileContents], 'pattern.json', { type: 'application/json' });
    Object.defineProperty(file, 'text', {
      configurable: true,
      value: () => Promise.resolve(fileContents),
    });
    Object.defineProperty(fileInput, 'files', {
      configurable: true,
      value: [file],
    });

    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(compiled.querySelectorAll('.measure-sheet')).toHaveLength(1);
    expect(
      compiled.querySelector(
        '.measure-sheet[aria-label="Takt 1"] .score-note[data-instrument="kick"]',
      ),
    ).toBeTruthy();
    expect(compiled.querySelector('[role="status"]')?.textContent).toContain(
      'Pattern wurde importiert',
    );
    fixture.destroy();
  });

  it('undoes deleting selected notes', async () => {
    const fixture = TestBed.createComponent(ScoreEditorComponent);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    const originalNoteCount = compiled.querySelectorAll('.score-note').length;
    compiled.querySelector<HTMLButtonElement>('[aria-label="Werkzeug Auswahl"]')?.click();
    compiled.querySelector<SVGGElement>('.score-note')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );
    fixture.detectChanges();
    compiled.querySelector<HTMLButtonElement>('[aria-label="Auswahl löschen"]')?.click();
    fixture.detectChanges();

    expect(compiled.querySelectorAll('.score-note')).toHaveLength(originalNoteCount - 1);
    compiled.querySelector<HTMLButtonElement>('[aria-label="Rückgängig"]')?.click();
    fixture.detectChanges();

    expect(compiled.querySelectorAll('.score-note')).toHaveLength(originalNoteCount);
  });

  it('undoes replacing a note with a pause', async () => {
    const fixture = TestBed.createComponent(ScoreEditorComponent);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    const originalKickCount = compiled.querySelectorAll(
      '.score-note[data-instrument="kick"]',
    ).length;
    const undoButton = compiled.querySelector<HTMLButtonElement>('[aria-label="Rückgängig"]');
    selectRestValue(fixture, 'Viertelnote');
    const placement = compiled.querySelector<SVGRectElement>(
      '.measure-sheet[aria-label="Takt 1"] .placement-target[data-step="0"]',
    );
    if (!placement) {
      throw new Error('Notenblatt-Ziel wurde nicht angezeigt.');
    }
    placement.dispatchEvent(new MouseEvent('click', { bubbles: true, clientY: 112 }));
    fixture.detectChanges();

    expect(compiled.querySelectorAll('.score-note[data-instrument="kick"]')).toHaveLength(
      originalKickCount - 1,
    );
    expect(compiled.querySelector('.score-rest[data-instrument="kick"]')).toBeTruthy();
    undoButton?.click();
    fixture.detectChanges();

    expect(compiled.querySelectorAll('.score-note[data-instrument="kick"]')).toHaveLength(
      originalKickCount,
    );
    expect(compiled.querySelector('.score-rest[data-instrument="kick"]')).toBeNull();
  });

  it('supports choosing the instrument height with keyboard arrow keys', async () => {
    const fixture = TestBed.createComponent(ScoreEditorComponent);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    const placement = compiled.querySelector<SVGRectElement>(
      '.measure-sheet[aria-label="Takt 1"] .placement-target[data-step="4"]',
    );

    if (!placement) {
      throw new Error('Notenblatt-Ziel wurde nicht angezeigt.');
    }
    placement.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    fixture.detectChanges();
    expect(placement.getAttribute('aria-label')).toContain('Tastatur-Instrument: Hi-Hat offen');

    placement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    fixture.detectChanges();
    expect(
      compiled.querySelector(
        '.measure-sheet[aria-label="Takt 1"] .score-note[data-instrument="openHat"]',
      ),
    ).toBeTruthy();
  });

  it('snaps note starts to the nearest grid interval for the selected note value', async () => {
    const fixture = TestBed.createComponent(ScoreEditorComponent);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    selectNoteValue(fixture, 'Viertelnote');
    compiled
      .querySelector<SVGRectElement>('.placement-target[data-step="9"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true, clientY: 34 }));
    fixture.detectChanges();
    expect(
      compiled.querySelector(
        '.measure-sheet[aria-label="Takt 1"] .score-note[data-instrument="crash"][data-duration="4"]',
      )?.getAttribute('data-step'),
    ).toBe('16');

    selectNoteValue(fixture, 'Sechzehntelnote');
    compiled
      .querySelector<SVGRectElement>('.placement-target[data-step="10"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true, clientY: 34 }));
    fixture.detectChanges();
    expect(
      compiled.querySelector(
        '.measure-sheet[aria-label="Takt 1"] .score-note[data-instrument="crash"][data-duration="16"]',
      )?.getAttribute('data-step'),
    ).toBe('12');
  });

  it('automatically beams eighth and sixteenth notes and persists the off setting', async () => {
    const fixture = TestBed.createComponent(ScoreEditorComponent);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    const autoBeaming = compiled.querySelector<HTMLInputElement>(
      '[aria-label="Noten automatisch verbinden"]',
    );
    if (!autoBeaming) {
      throw new Error('Notenverbindungs- oder Notenwert-Werkzeuge wurden nicht angezeigt.');
    }
    expect(autoBeaming.checked).toBe(true);

    const placeCrashNote = (step: number) => {
      const target = compiled.querySelector<SVGRectElement>(
        `.measure-sheet[aria-label="Takt 1"] .placement-target[data-step="${step}"]`,
      );
      if (!target) {
        throw new Error('Notenblatt-Ziel wurde nicht angezeigt.');
      }
      target.dispatchEvent(new MouseEvent('click', { bubbles: true, clientY: 34 }));
      fixture.detectChanges();
    };

    selectNoteValue(fixture, 'Achtelnote');
    fixture.detectChanges();
    placeCrashNote(0);
    placeCrashNote(8);
    selectNoteValue(fixture, 'Sechzehntelnote');
    fixture.detectChanges();
    for (const step of [16, 20, 24, 28]) {
      placeCrashNote(step);
    }

    const crashBeams = compiled.querySelectorAll(
      '.measure-sheet[aria-label="Takt 1"] .score-beam[data-instrument="crash"]',
    );
    expect(crashBeams).toHaveLength(2);
    expect(
      compiled.querySelectorAll(
        '.measure-sheet[aria-label="Takt 1"] .score-beam[data-instrument="crash"][data-levels="1"] .note-beam',
      ),
    ).toHaveLength(1);
    expect(
      compiled.querySelectorAll(
        '.measure-sheet[aria-label="Takt 1"] .score-beam[data-instrument="crash"][data-levels="2"] .note-beam',
      ),
    ).toHaveLength(2);

    autoBeaming.checked = false;
    autoBeaming.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();
    expect(
      compiled.querySelectorAll(
        '.measure-sheet[aria-label="Takt 1"] .score-beam[data-instrument="crash"]',
      ),
    ).toHaveLength(0);
    expect(
      compiled.querySelectorAll(
        '.measure-sheet[aria-label="Takt 1"] .score-note[data-instrument="crash"] .note-flag',
      ),
    ).toHaveLength(10);

    compiled.querySelector<HTMLButtonElement>('.save-button')?.click();
    fixture.destroy();

    const restoredFixture = TestBed.createComponent(ScoreEditorComponent);
    await restoredFixture.whenStable();
    const restored = restoredFixture.nativeElement as HTMLElement;
    expect(
      restored.querySelector<HTMLInputElement>('[aria-label="Noten automatisch verbinden"]')
        ?.checked,
    ).toBe(false);
  });

      it('manually connects and disconnects adjacent notes on the same instrument', async () => {
        const fixture = TestBed.createComponent(ScoreEditorComponent);
        await fixture.whenStable();
        const compiled = fixture.nativeElement as HTMLElement;
        compiled.querySelector<HTMLButtonElement>('.clear-button')?.click();
        fixture.detectChanges();

        const advancedTools = compiled.querySelector<HTMLDetailsElement>('.advanced-tools');
        if (!advancedTools) {
          throw new Error('Erweiterte Werkzeuge wurden nicht angezeigt.');
        }
        advancedTools.open = true;
        fixture.detectChanges();
        const autoBeaming = compiled.querySelector<HTMLInputElement>(
          '[aria-label="Noten automatisch verbinden"]',
        );
        const floorTomPicker = compiled.querySelector<HTMLButtonElement>(
          '[aria-label="Instrument Floortom auswählen"]',
        );
        if (!autoBeaming || !floorTomPicker) {
          throw new Error('Notenverbindung oder Instrumentauswahl wurde nicht angezeigt.');
        }
        autoBeaming.checked = false;
        autoBeaming.dispatchEvent(new Event('change', { bubbles: true }));
        floorTomPicker.click();
        selectNoteValue(fixture, 'Achtelnote');
        for (const step of [0, 8]) {
          compiled
            .querySelector<SVGRectElement>(`.placement-target[data-step="${step}"]`)
            ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
          fixture.detectChanges();
        }

        selectSelectionTool(fixture);
        const notes = compiled.querySelectorAll<SVGGElement>(
          '.measure-sheet[aria-label="Takt 1"] .score-note[data-instrument="floorTom"]',
        );
        if (notes.length !== 2) {
          throw new Error('Die beiden Floortom-Noten wurden nicht angezeigt.');
        }
        notes[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
        notes[1].dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }));
        fixture.detectChanges();

        const connectButton = compiled.querySelector<HTMLButtonElement>(
          '[aria-label="Noten manuell verbinden"]',
        );
        expect(connectButton).toBeTruthy();
        connectButton?.click();
        fixture.detectChanges();
        const groupIds = Array.from(
          compiled.querySelectorAll<SVGGElement>(
            '.measure-sheet[aria-label="Takt 1"] .score-note[data-instrument="floorTom"]',
          ),
        ).map((note) => note.getAttribute('data-beam-group-id'));
        expect(groupIds[0]).toBeTruthy();
        expect(groupIds[0]).toBe(groupIds[1]);
        expect(compiled.querySelectorAll('.score-beam[data-instrument="floorTom"]')).toHaveLength(1);

        compiled.querySelector<HTMLButtonElement>(
          '[aria-label="Manuelle Notenverbindung lösen"]',
        )?.click();
        fixture.detectChanges();
        expect(compiled.querySelectorAll('.score-beam[data-instrument="floorTom"]')).toHaveLength(0);
      });

  it('draws note stems and beams downward and persists the direction', async () => {
    const fixture = TestBed.createComponent(ScoreEditorComponent);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    const directionToggle = compiled.querySelector<HTMLInputElement>(
      '[aria-label="Neue Noten nach unten"]',
    );
    if (!directionToggle) {
      throw new Error('Richtungs- oder Notenwert-Werkzeuge wurden nicht angezeigt.');
    }

    directionToggle.click();
    selectNoteValue(fixture, 'Achtelnote');
    fixture.detectChanges();

    const placeCrashNote = (step: number) => {
      const target = compiled.querySelector<SVGRectElement>(
        `.measure-sheet[aria-label="Takt 1"] .placement-target[data-step="${step}"]`,
      );
      if (!target) {
        throw new Error('Notenblatt-Ziel wurde nicht angezeigt.');
      }
      target.dispatchEvent(new MouseEvent('click', { bubbles: true, clientY: 34 }));
      fixture.detectChanges();
    };

    placeCrashNote(0);
    placeCrashNote(8);
    selectNoteValue(fixture, 'Sechzehntelnote');
    fixture.detectChanges();
    placeCrashNote(16);

    const beam = compiled.querySelector<SVGGElement>(
      '.measure-sheet[aria-label="Takt 1"] .score-beam[data-instrument="crash"]',
    );
    const beamedNote = compiled.querySelector<SVGGElement>(
      '.measure-sheet[aria-label="Takt 1"] .score-note[data-instrument="crash"][data-beam-group-id]',
    );
    const ungroupedNote = compiled.querySelector<SVGGElement>(
      '.measure-sheet[aria-label="Takt 1"] .score-note[data-instrument="crash"][data-step="16"]',
    );
    expect(beam?.getAttribute('data-direction')).toBe('down');
    expect(Number(beam?.getAttribute('data-y'))).toBeGreaterThan(34);
    expect(beam?.querySelector('.note-beam')?.getAttribute('d')).toContain('L');
    const beamStartX = Number(
      beam?.querySelector('.note-beam')?.getAttribute('d')?.match(/^M ([\d.]+)/)?.[1],
    );
    const firstNoteX = Number(
      beamedNote?.getAttribute('transform')?.match(/^translate\(([\d.]+)/)?.[1],
    );
    expect(beamStartX).toBe(firstNoteX - 5);
    expect(ungroupedNote?.querySelector('.note-stem')?.getAttribute('x1')).toBe('-5');
    expect(ungroupedNote?.querySelector('.note-stem')?.getAttribute('y2')).toBe('34');
    expect(ungroupedNote?.querySelector('.note-flag')?.getAttribute('d')).toContain('-5 34');

    compiled.querySelector<HTMLButtonElement>('.save-button')?.click();
    fixture.destroy();

    const restoredFixture = TestBed.createComponent(ScoreEditorComponent);
    await restoredFixture.whenStable();
    const restored = restoredFixture.nativeElement as HTMLElement;
    expect(
      restored.querySelector<HTMLInputElement>(
        '[aria-label="Neue Noten nach unten"]',
      )?.checked,
    ).toBe(true);
  });

  it('selects notes with Ctrl-click and applies direction only to the selection', async () => {
    const fixture = TestBed.createComponent(ScoreEditorComponent);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    const notes = compiled.querySelectorAll<SVGGElement>(
      '.measure-sheet[aria-label="Takt 1"] .score-note',
    );
    const selectedNote = compiled.querySelector<SVGGElement>(
      '.measure-sheet[aria-label="Takt 1"] .score-note[data-instrument="kick"]',
    );
    const unchangedNote = compiled.querySelector<SVGGElement>(
      '.measure-sheet[aria-label="Takt 1"] .score-note[data-instrument="snare"]',
    );
    if (!selectedNote || !unchangedNote || notes.length === 0) {
      throw new Error('Auswählbare Noten wurden nicht angezeigt.');
    }

    selectSelectionTool(fixture);
    selectedNote.dispatchEvent(
      new MouseEvent('click', { bubbles: true, ctrlKey: true }),
    );
    fixture.detectChanges();
    expect(selectedNote.classList.contains('selected')).toBe(true);
    expect(compiled.querySelector('.selection-count')?.textContent).toContain('1 Note ausgewählt');

    compiled.querySelector<HTMLButtonElement>(
      '[aria-label="Auswahl nach unten ausrichten"]',
    )?.click();
    fixture.detectChanges();
    expect(selectedNote.querySelector('.note-stem')?.getAttribute('x1')).toBe('-5');
    expect(unchangedNote.querySelector('.note-stem')?.getAttribute('x1')).toBe('5');

    compiled.querySelector<HTMLButtonElement>('.save-button')?.click();
    fixture.destroy();

    const restoredFixture = TestBed.createComponent(ScoreEditorComponent);
    await restoredFixture.whenStable();
    const restored = restoredFixture.nativeElement as HTMLElement;
    expect(
      restored.querySelector(
        `.score-note[data-event-id="${selectedNote.getAttribute('data-event-id')}"] .note-stem`,
      )?.getAttribute('x1'),
    ).toBe('-5');
    expect(
      restored.querySelector(
        `.score-note[data-event-id="${unchangedNote.getAttribute('data-event-id')}"] .note-stem`,
      )?.getAttribute('x1'),
    ).toBe('5');
  });

  it('keeps note placement available outside selection mode', async () => {
    const fixture = TestBed.createComponent(ScoreEditorComponent);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    const initialCount = compiled.querySelectorAll('.score-note').length;
    selectSelectionTool(fixture);
    compiled
      .querySelector<SVGRectElement>(
        '.measure-sheet[aria-label="Takt 1"] .placement-target[data-step="4"]',
      )
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true, clientY: 34 }));
    fixture.detectChanges();
    expect(compiled.querySelectorAll('.score-note')).toHaveLength(initialCount);

    openDurationMenu(fixture, 'notes');
    compiled
      .querySelector<SVGRectElement>(
        '.measure-sheet[aria-label="Takt 1"] .placement-target[data-step="4"]',
      )
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true, clientY: 34 }));
    fixture.detectChanges();
    expect(compiled.querySelectorAll('.score-note')).toHaveLength(initialCount + 1);
  });

  it('edits and deletes a selected note and pastes a copy at a clicked position', async () => {
    const fixture = TestBed.createComponent(ScoreEditorComponent);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    selectSelectionTool(fixture);

    const original = compiled.querySelector<SVGGElement>(
      '.measure-sheet[aria-label="Takt 1"] .score-note[data-instrument="kick"][data-step="0"]',
    );
    if (!original) {
      throw new Error('Ausgangsnote wurde nicht angezeigt.');
    }
    original.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();
    compiled.querySelector<HTMLButtonElement>('[aria-label="Auswahl bearbeiten"]')?.click();
    fixture.detectChanges();
    const duration = compiled.querySelector<HTMLSelectElement>(
      '[aria-label="Notenwert der ausgewählten Note"]',
    );
    if (!duration) {
      throw new Error('Notenbearbeitung wurde nicht angezeigt.');
    }
    duration.value = '8';
    duration.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();
    const instrument = compiled.querySelector<HTMLSelectElement>(
      '[aria-label="Instrument der ausgewählten Note"]',
    );
    if (!instrument) {
      throw new Error('Instrumentbearbeitung wurde nicht angezeigt.');
    }
    instrument.value = 'snare';
    instrument.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();
    const step = compiled.querySelector<HTMLInputElement>(
      '[aria-label="Schritt der ausgewählten Note"]',
    );
    if (!step) {
      throw new Error('Positionsbearbeitung wurde nicht angezeigt.');
    }
    step.value = '3';
    step.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();
    const editedNoteSelector = `.score-note[data-event-id="${original.getAttribute('data-event-id')}"]`;
    expect(
      compiled.querySelector(editedNoteSelector)?.getAttribute('data-duration'),
    ).toBe('8');
    expect(compiled.querySelector(editedNoteSelector)?.getAttribute('data-instrument')).toBe('snare');
    expect(compiled.querySelector(editedNoteSelector)?.getAttribute('data-step')).toBe('2');

    compiled.querySelector<HTMLButtonElement>('[aria-label="Auswahl kopieren"]')?.click();
    fixture.detectChanges();
    compiled.querySelector<HTMLButtonElement>('[aria-label="Einfügen"]')?.click();
    fixture.detectChanges();
    compiled
      .querySelector<SVGRectElement>(
        '.measure-sheet[aria-label="Takt 1"] .placement-target[data-step="8"]',
      )
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true, clientY: 34 }));
    fixture.detectChanges();
    expect(
      compiled.querySelectorAll(
        '.measure-sheet[aria-label="Takt 1"] .score-note[data-instrument="snare"][data-duration="8"]',
      ),
    ).toHaveLength(2);
    expect(
      compiled.querySelector(
        '.measure-sheet[aria-label="Takt 1"] .score-note[data-instrument="snare"][data-duration="8"][data-step="16"]',
      ),
    ).toBeTruthy();

    compiled.querySelector<HTMLButtonElement>('[aria-label="Auswahl löschen"]')?.click();
    fixture.detectChanges();
    expect(
      compiled.querySelector(
        '.measure-sheet[aria-label="Takt 1"] .score-note[data-instrument="snare"][data-step="16"]',
      ),
    ).toBeNull();
  });

  it('edits and deletes selected score text', async () => {
    const fixture = TestBed.createComponent(ScoreEditorComponent);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    selectTextTool(fixture);
    const textInput = compiled.querySelector<HTMLInputElement>('[aria-label="Partiturtext"]');
    if (!textInput) {
      throw new Error('Partiturtext-Werkzeug wurde nicht angezeigt.');
    }
    textInput.value = 'Intro';
    textInput.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    compiled.querySelector<HTMLButtonElement>('[aria-label="Textmodus Freitext"]')?.click();
    fixture.detectChanges();
    compiled
      .querySelector<SVGRectElement>(
        '.measure-sheet[aria-label="Takt 1"] .placement-target[data-step="4"]',
      )
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true, clientY: 60 }));
    fixture.detectChanges();

    selectSelectionTool(fixture);
    const annotation = compiled.querySelector<SVGTextElement>('.score-annotation');
    if (!annotation) {
      throw new Error('Partiturtext wurde nicht angezeigt.');
    }
    annotation.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();
    compiled.querySelector<HTMLButtonElement>('[aria-label="Auswahl bearbeiten"]')?.click();
    fixture.detectChanges();
    const editInput = compiled.querySelector<HTMLInputElement>(
      '[aria-label="Ausgewählten Text bearbeiten"]',
    );
    if (!editInput) {
      throw new Error('Textbearbeitung wurde nicht angezeigt.');
    }
    editInput.value = 'Strophe';
    editInput.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    expect(compiled.querySelector('.score-annotation')?.textContent).toContain('Strophe');

    compiled.querySelector<HTMLButtonElement>('[aria-label="Auswahl kopieren"]')?.click();
    fixture.detectChanges();
    compiled.querySelector<HTMLButtonElement>('[aria-label="Einfügen"]')?.click();
    fixture.detectChanges();
    compiled
      .querySelector<SVGRectElement>(
        '.measure-sheet[aria-label="Takt 1"] .placement-target[data-step="16"]',
      )
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true, clientY: 60 }));
    fixture.detectChanges();
    expect(compiled.querySelectorAll('.score-annotation')).toHaveLength(2);

    compiled.querySelector<HTMLButtonElement>('[aria-label="Auswahl löschen"]')?.click();
    fixture.detectChanges();
    expect(compiled.querySelectorAll('.score-annotation')).toHaveLength(1);
    const remainingAnnotation = compiled.querySelector<SVGTextElement>('.score-annotation');
    remainingAnnotation?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();
    compiled.querySelector<HTMLButtonElement>('[aria-label="Auswahl löschen"]')?.click();
    fixture.detectChanges();
    expect(compiled.querySelector('.score-annotation')).toBeNull();
  });

  it('beams tuplet eighth notes automatically', async () => {
    const fixture = TestBed.createComponent(ScoreEditorComponent);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    const tupletsToggle = compiled.querySelector<HTMLButtonElement>(
      '[aria-label="Tuplets aktivieren"]',
    );
    if (!tupletsToggle) {
      throw new Error('Tuplet- oder Achtel-Werkzeug wurde nicht angezeigt.');
    }
    selectNoteValue(fixture, 'Achtelnote');
    tupletsToggle.click();
    fixture.detectChanges();

    for (let index = 0; index < 3; index++) {
      const target = compiled.querySelector<SVGRectElement>(
        '.measure-sheet[aria-label="Takt 1"] .placement-target[data-step="0"]',
      );
      if (!target) {
        throw new Error('Notenblatt-Ziel wurde nicht angezeigt.');
      }
      target.dispatchEvent(new MouseEvent('click', { bubbles: true, clientY: 34 }));
      fixture.detectChanges();
    }

    expect(
      compiled.querySelectorAll(
        '.measure-sheet[aria-label="Takt 1"] .score-note[data-instrument="crash"][data-tuplet-id]',
      ),
    ).toHaveLength(3);
    const tupletBeam = compiled.querySelector<SVGGElement>(
      '.measure-sheet[aria-label="Takt 1"] .score-beam[data-instrument="crash"][data-tuplet-id="tuplet-1"][data-tuplet-index-start="0"]',
    );
    expect(tupletBeam?.querySelectorAll('.note-beam')).toHaveLength(1);
    expect(tupletBeam?.querySelector('.tuplet-beam-label')?.textContent?.trim()).toBe('3');
    expect(tupletBeam?.querySelector('.tuplet-label-background')).toBeNull();
    expect(Number(tupletBeam?.querySelector('.tuplet-beam-label')?.getAttribute('y'))).toBe(
      Number(tupletBeam?.getAttribute('data-y')) - 4,
    );
    expect(
      compiled.querySelector('.score-tuplet[data-tuplet-id="tuplet-1"] .tuplet-bracket'),
    ).toBeNull();
    expect(
      compiled.querySelectorAll(
        '.measure-sheet[aria-label="Takt 1"] .score-note[data-instrument="crash"][data-tuplet-id] .note-flag',
      ),
    ).toHaveLength(0);
  });

  it('separates overlapping beams for different note values in the same beat', async () => {
    const fixture = TestBed.createComponent(ScoreEditorComponent);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    const placeNote = (step: number, instrumentY: number) => {
      const target = compiled.querySelector<SVGRectElement>(
        `.measure-sheet[aria-label="Takt 1"] .placement-target[data-step="${step}"]`,
      );
      if (!target) {
        throw new Error('Notenblatt-Ziel wurde nicht angezeigt.');
      }
      target.dispatchEvent(new MouseEvent('click', { bubbles: true, clientY: instrumentY }));
      fixture.detectChanges();
    };

    selectNoteValue(fixture, 'Zweiunddreißigstelnote');
    fixture.detectChanges();
    for (const step of [0, 2, 4, 6]) {
      placeNote(step, 34);
    }
    selectNoteValue(fixture, 'Achtelnote');
    fixture.detectChanges();
    placeNote(0, 44);
    placeNote(8, 44);

    const crashBeam = compiled.querySelector<SVGGElement>(
      '.measure-sheet[aria-label="Takt 1"] .score-beam[data-instrument="crash"]',
    );
    const openHatBeam = compiled.querySelector<SVGGElement>(
      '.measure-sheet[aria-label="Takt 1"] .score-beam[data-instrument="openHat"]',
    );
    if (!crashBeam || !openHatBeam) {
      throw new Error('Erwartete Notenverbindungen wurden nicht gezeichnet.');
    }
    const crashTop = Number(crashBeam.getAttribute('data-y'));
    const crashBottom = crashTop + (Number(crashBeam.getAttribute('data-levels')) - 1) * 5 + 3;
    expect(Number(openHatBeam.getAttribute('data-y'))).toBeGreaterThanOrEqual(crashBottom + 2);
    expect(
      compiled.querySelector(
        '.measure-sheet[aria-label="Takt 1"] .score-note[data-instrument="openHat"] .note-stem',
      )?.getAttribute('y2'),
    ).toBe('-29');
    expect(
      compiled.querySelector(
        '.measure-sheet[aria-label="Takt 1"] .score-note[data-instrument="openHat"]',
      )?.getAttribute('data-beam-stem-offset'),
    ).toBe('5');
  });

  it('places a configurable 5:4 tuplet at consecutive proportional positions', async () => {
    const fixture = TestBed.createComponent(ScoreEditorComponent);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    const tupletsToggle = compiled.querySelector<HTMLButtonElement>(
      '[aria-label="Tuplets aktivieren"]',
    );
    if (!tupletsToggle) {
      throw new Error('Tuplet-Werkzeug wurde nicht angezeigt.');
    }
    tupletsToggle.click();
    fixture.detectChanges();

    const countInput = compiled.querySelector<HTMLInputElement>('[aria-label="Tuplet Anzahl"]');
    const baseCountInput = compiled.querySelector<HTMLInputElement>(
      '[aria-label="Tuplet Grundnotenwerte"]',
    );
    if (!countInput || !baseCountInput) {
      throw new Error('Tuplet-Verhältnis wurde nicht angezeigt.');
    }
    countInput.value = '5';
    countInput.dispatchEvent(new Event('change', { bubbles: true }));
    baseCountInput.value = '4';
    baseCountInput.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();

    const positions = [
      { targetStep: 0, instrumentY: 34 },
      { targetStep: 12, instrumentY: 44 },
      { targetStep: 24, instrumentY: 52 },
      { targetStep: 36, instrumentY: 76 },
      { targetStep: 48, instrumentY: 112 },
    ];
    for (const position of positions) {
      const target = compiled.querySelector<SVGRectElement>(
        `.measure-sheet[aria-label="Takt 1"] .placement-target[data-step="${position.targetStep}"]`,
      );
      if (!target) {
        throw new Error('Notenblatt-Ziel wurde nicht angezeigt.');
      }
      target.dispatchEvent(
        new MouseEvent('click', { bubbles: true, clientY: position.instrumentY }),
      );
      fixture.detectChanges();
    }

    const tupletNotes = Array.from(
      compiled.querySelectorAll<SVGGElement>('.score-note[data-tuplet-id="tuplet-1"]'),
    );
    expect(tupletNotes).toHaveLength(5);
    expect(
      tupletNotes.map((note) => Number(note.getAttribute('data-step'))),
    ).toHaveLength(5);
    [0, 12.8, 25.6, 38.4, 51.2].forEach((position, index) => {
      expect(Number(tupletNotes[index].getAttribute('data-step'))).toBeCloseTo(position, 7);
    });
    const tupletMarker = compiled.querySelector<SVGGElement>(
      '.score-tuplet[aria-label="5 Noten im Wert von 4 Grundnoten"]',
    );
    expect(tupletMarker).toBeTruthy();
    expect(tupletMarker?.querySelector('.tuplet-bracket')?.getAttribute('d')).toContain(' 7 V 11 ');
    expect(tupletMarker?.querySelector('.score-tuplet text')?.textContent?.trim()).toBe('5:4');
    expect(tupletMarker?.querySelector('.tuplet-label-background')).toBeNull();
    expect(compiled.querySelector('[role="status"]')?.textContent).toContain(
      'vollständig gesetzt',
    );
  });

  it('restores an unfinished 3:2 tuplet and lets the next click complete it', async () => {
    const fixture = TestBed.createComponent(ScoreEditorComponent);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    const tupletsToggle = compiled.querySelector<HTMLButtonElement>(
      '[aria-label="Tuplets aktivieren"]',
    );
    if (!tupletsToggle) {
      throw new Error('Tuplet-Werkzeug wurde nicht angezeigt.');
    }
    tupletsToggle.click();
    fixture.detectChanges();

    for (const { step, y } of [
      { step: 0, y: 34 },
      { step: 32, y: 44 },
    ]) {
      const target = compiled.querySelector<SVGRectElement>(
        `.measure-sheet[aria-label="Takt 1"] .placement-target[data-step="${step}"]`,
      );
      if (!target) {
        throw new Error('Notenblatt-Ziel wurde nicht angezeigt.');
      }
      target.dispatchEvent(new MouseEvent('click', { bubbles: true, clientY: y }));
      fixture.detectChanges();
    }
    compiled.querySelector<HTMLButtonElement>('.save-button')?.click();

    const restoredFixture = TestBed.createComponent(ScoreEditorComponent);
    await restoredFixture.whenStable();
    const restored = restoredFixture.nativeElement as HTMLElement;
    expect(restored.querySelectorAll('.score-note[data-tuplet-id="tuplet-1"]')).toHaveLength(2);

    restored
      .querySelector<HTMLButtonElement>('[aria-label="Tuplets aktivieren"]')
      ?.click();
    restoredFixture.detectChanges();
    const lastTarget = restored.querySelector<SVGRectElement>(
      '.measure-sheet[aria-label="Takt 1"] .placement-target[data-step="56"]',
    );
    if (!lastTarget) {
      throw new Error('Notenblatt-Ziel wurde nicht angezeigt.');
    }
    lastTarget.dispatchEvent(new MouseEvent('click', { bubbles: true, clientY: 76 }));
    restoredFixture.detectChanges();

    const notes = Array.from(
      restored.querySelectorAll<SVGGElement>('.score-note[data-tuplet-id="tuplet-1"]'),
    );
    expect(notes).toHaveLength(3);
    expect(notes).toHaveLength(3);
    [0, 10.666666666666666, 21.333333333333332].forEach((position, index) => {
      expect(Number(notes[index].getAttribute('data-step'))).toBeCloseTo(position, 7);
    });
    expect(
      restored.querySelector('.score-tuplet[aria-label="3 Noten im Wert von 2 Grundnoten"]'),
    ).toBeTruthy();

    selectTextTool(restoredFixture);
    const textInput = restored.querySelector<HTMLInputElement>('[aria-label="Partiturtext"]');
    const noteTextMode = restored.querySelector<HTMLButtonElement>(
      '[aria-label="Textmodus An Note"]',
    );
    const middleTupletNote = restored.querySelector<SVGGElement>(
      '.score-note[data-tuplet-id="tuplet-1"][data-tuplet-index="1"]',
    );
    if (!textInput || !noteTextMode || !middleTupletNote) {
      throw new Error('Notentext-Werkzeug oder Tuplet-Note wurde nicht angezeigt.');
    }
    textInput.value = 'Triol';
    textInput.dispatchEvent(new Event('input', { bubbles: true }));
    noteTextMode.click();
    middleTupletNote.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    restoredFixture.detectChanges();
    restored.querySelector<HTMLButtonElement>('.save-button')?.click();

    const annotatedFixture = TestBed.createComponent(ScoreEditorComponent);
    await annotatedFixture.whenStable();
    expect(
      (annotatedFixture.nativeElement as HTMLElement).querySelector(
        '.score-annotation[data-kind="note"]',
      )?.textContent,
    ).toBe('Triol');
  });

  it('adds more than four measures to the score', async () => {
    const fixture = TestBed.createComponent(ScoreEditorComponent);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    const addMeasureButton = Array.from(compiled.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('+ Takt'),
    );

    for (let index = 0; index < 4; index++) {
      addMeasureButton?.click();
      fixture.detectChanges();
    }

    expect(compiled.querySelectorAll('.measure-sheet')).toHaveLength(6);
    expect(compiled.querySelector('.measure-controls')?.textContent).toContain('6 Takte');
  });

  it('adapts the score and restores a saved time signature', async () => {
    const fixture = TestBed.createComponent(ScoreEditorComponent);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    const numerator = compiled.querySelector<HTMLInputElement>('[aria-label="Taktart-Zähler"]');
    const denominator = compiled.querySelector<HTMLSelectElement>('[aria-label="Taktart-Nenner"]');

    expect(numerator?.value).toBe('4');
    expect(denominator?.value).toBe('4');
    if (!numerator || !denominator) {
      throw new Error('Taktart-Auswahl wurde nicht angezeigt.');
    }

    numerator.value = '3';
    numerator.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(compiled.querySelector('.editor-heading p')?.textContent).toContain('3/4-Takt');
    expect(
      compiled.querySelectorAll('.measure-sheet[aria-label="Takt 1"] .placement-target'),
    ).toHaveLength(48);
    expect(
      compiled.querySelectorAll('.measure-sheet[aria-label="Takt 1"] .score-note[data-instrument="snare"]'),
    ).toHaveLength(1);

    denominator.value = '8';
    denominator.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(compiled.querySelector('.editor-heading p')?.textContent).toContain('3/8-Takt');
    expect(
      compiled.querySelectorAll('.measure-sheet[aria-label="Takt 1"] .placement-target'),
    ).toHaveLength(24);

    numerator.value = '6';
    numerator.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(
      compiled.querySelectorAll('.measure-sheet[aria-label="Takt 1"] .placement-target'),
    ).toHaveLength(48);

    Array.from(compiled.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('Speichern'))
      ?.click();
    fixture.detectChanges();
    fixture.destroy();

    const restoredFixture = TestBed.createComponent(ScoreEditorComponent);
    await restoredFixture.whenStable();
    const restored = restoredFixture.nativeElement as HTMLElement;
    expect(restored.querySelector<HTMLInputElement>('[aria-label="Taktart-Zähler"]')?.value).toBe(
      '6',
    );
    expect(restored.querySelector<HTMLSelectElement>('[aria-label="Taktart-Nenner"]')?.value).toBe(
      '8',
    );
    expect(restored.querySelector('.editor-heading p')?.textContent).toContain('6/8-Takt');
  });

  it('uses a 64th-note grid for signatures with a denominator of 32', async () => {
    const fixture = TestBed.createComponent(ScoreEditorComponent);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    const denominator = compiled.querySelector<HTMLSelectElement>('[aria-label="Taktart-Nenner"]');

    if (!denominator) {
      throw new Error('Taktart-Auswahl wurde nicht angezeigt.');
    }
    denominator.value = '32';
    denominator.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(compiled.querySelector('.editor-heading p')?.textContent).toContain('4/32-Takt');
    openDurationMenu(fixture, 'notes');
    expect(
      compiled.querySelector('[aria-label="Notenwert Vierundsechzigstelnote"]')?.textContent,
    ).toContain('64tel');
    expect(
      compiled.querySelectorAll('.measure-sheet[aria-label="Takt 1"] .placement-target'),
    ).toHaveLength(8);
  });

  it('binds a snapped note across the barline', async () => {
    const fixture = TestBed.createComponent(ScoreEditorComponent);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    const numerator = compiled.querySelector<HTMLInputElement>(
      '[aria-label="Taktart-Zähler"]',
    );
    if (!numerator) {
      throw new Error('Notenwerkzeug oder Notenblatt-Ziel wurde nicht angezeigt.');
    }
    numerator.value = '3';
    numerator.dispatchEvent(new Event('change'));
    selectNoteValue(fixture, 'Halbe Note');
    fixture.detectChanges();
    const placement = compiled.querySelector<SVGRectElement>(
      '.measure-sheet[aria-label="Takt 1"] .placement-target[data-step="32"]',
    );
    if (!placement) {
      throw new Error('Notenblatt-Ziel wurde nicht angezeigt.');
    }
    placement.dispatchEvent(new MouseEvent('click', { bubbles: true, clientY: 34 }));
    fixture.detectChanges();

    expect(
      compiled.querySelectorAll(
        '.measure-sheet[aria-label="Takt 1"] .score-note[data-instrument="crash"]',
      ),
    ).toHaveLength(1);
    expect(
      compiled.querySelectorAll(
        '.measure-sheet[aria-label="Takt 1"] .tie-arc-out[data-instrument="crash"]',
      ),
    ).toHaveLength(1);
    expect(
      compiled.querySelectorAll(
        '.measure-sheet[aria-label="Takt 2"] .score-note[data-instrument="crash"]',
      ),
    ).toHaveLength(1);
    expect(
      compiled.querySelectorAll(
        '.measure-sheet[aria-label="Takt 2"] .tie-arc-in[data-instrument="crash"]',
      ),
    ).toHaveLength(1);
  });

  it('replaces an overlapping note at the clicked height with the selected note value', async () => {
    const fixture = TestBed.createComponent(ScoreEditorComponent);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    const firstPlacement = compiled.querySelector<SVGRectElement>(
      '.measure-sheet[aria-label="Takt 1"] .placement-target[data-step="0"]',
    );
    const overlapPlacement = compiled.querySelector<SVGRectElement>(
      '.measure-sheet[aria-label="Takt 1"] .placement-target[data-step="8"]',
    );

    if (!firstPlacement || !overlapPlacement) {
      throw new Error('Notenwerkzeuge oder Notenblatt-Ziele wurden nicht angezeigt.');
    }
    selectNoteValue(fixture, 'Viertelnote');
    firstPlacement.dispatchEvent(new MouseEvent('click', { bubbles: true, clientY: 34 }));
    fixture.detectChanges();
    selectNoteValue(fixture, 'Sechzehntelnote');
    overlapPlacement.dispatchEvent(new MouseEvent('click', { bubbles: true, clientY: 34 }));
    fixture.detectChanges();

    const crashNotes = compiled.querySelectorAll(
      '.measure-sheet .score-note[data-instrument="crash"]',
    );
    expect(crashNotes).toHaveLength(1);
    expect(crashNotes[0].getAttribute('data-duration')).toBe('16');
  });

  it('places and restores every supported pause value', async () => {
    const fixture = TestBed.createComponent(ScoreEditorComponent);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    openDurationMenu(fixture, 'rests');
    expect(compiled.querySelectorAll('#rest-duration-menu .mini-rest')).toHaveLength(7);

    const placements = [
      { duration: 1, name: 'Ganze Note', instrument: 'crash', measure: 'Takt 1', y: 34 },
      { duration: 2, name: 'Halbe Note', instrument: 'openHat', measure: 'Takt 1', y: 44 },
      { duration: 4, name: 'Viertelnote', instrument: 'closedHat', measure: 'Takt 1', y: 52 },
      { duration: 8, name: 'Achtelnote', instrument: 'snare', measure: 'Takt 1', y: 76 },
      { duration: 16, name: 'Sechzehntelnote', instrument: 'kick', measure: 'Takt 1', y: 112 },
      {
        duration: 32,
        name: 'Zweiunddreißigstelnote',
        instrument: 'crash',
        measure: 'Takt 2',
        y: 34,
      },
      {
        duration: 64,
        name: 'Vierundsechzigstelnote',
        instrument: 'openHat',
        measure: 'Takt 2',
        y: 44,
      },
    ] as const;

    for (const placementDetails of placements) {
      const target = compiled.querySelector<SVGRectElement>(
        `.measure-sheet[aria-label="${placementDetails.measure}"] .placement-target[data-step="0"]`,
      );
      if (!target) {
        throw new Error('Pausenwert oder Notenblatt-Ziel wurde nicht angezeigt.');
      }
      selectRestValue(fixture, placementDetails.name);
      target.dispatchEvent(
        new MouseEvent('click', { bubbles: true, clientY: placementDetails.y }),
      );
      fixture.detectChanges();
      expect(
        compiled.querySelector(
          `.measure-sheet[aria-label="${placementDetails.measure}"] .score-rest[data-instrument="${placementDetails.instrument}"][data-duration="${placementDetails.duration}"]`,
        ),
      ).toBeTruthy();
    }

    compiled.querySelector<HTMLButtonElement>('.save-button')?.click();
    const restoredFixture = TestBed.createComponent(ScoreEditorComponent);
    await restoredFixture.whenStable();
    const restored = restoredFixture.nativeElement as HTMLElement;
    expect(restored.querySelectorAll('.score-rest')).toHaveLength(placements.length);
  });

  it('replaces only overlapping notes of the selected instrument with a pause', async () => {
    const fixture = TestBed.createComponent(ScoreEditorComponent);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    selectTextTool(fixture);
    const textInput = compiled.querySelector<HTMLInputElement>('[aria-label="Partiturtext"]');
    const noteTextMode = compiled.querySelector<HTMLButtonElement>(
      '[aria-label="Textmodus An Note"]',
    );
    const kickNote = compiled.querySelector<SVGGElement>(
      '.measure-sheet[aria-label="Takt 1"] .score-note[data-instrument="kick"][data-step="0"]',
    );
    const placement = compiled.querySelector<SVGRectElement>(
      '.measure-sheet[aria-label="Takt 1"] .placement-target[data-step="0"]',
    );

    if (!textInput || !noteTextMode || !kickNote || !placement) {
      throw new Error('Noten- oder Pausenwerkzeug wurde nicht angezeigt.');
    }
    textInput.value = 'Bass';
    textInput.dispatchEvent(new Event('input', { bubbles: true }));
    noteTextMode.click();
    kickNote.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();

    openDurationMenu(fixture, 'rests');
    placement.dispatchEvent(new MouseEvent('click', { bubbles: true, clientY: 112 }));
    fixture.detectChanges();

    expect(
      compiled.querySelector(
        '.measure-sheet[aria-label="Takt 1"] .score-note[data-instrument="kick"][data-step="0"]',
      ),
    ).toBeNull();
    expect(
      compiled.querySelector(
        '.measure-sheet[aria-label="Takt 1"] .score-note[data-instrument="kick"][data-step="32"]',
      ),
    ).toBeTruthy();
    expect(
      compiled.querySelector(
        '.measure-sheet[aria-label="Takt 1"] .score-note[data-instrument="snare"]',
      ),
    ).toBeTruthy();
    expect(compiled.querySelector('.score-annotation[data-kind="note"]')).toBeNull();
    expect(
      compiled.querySelector(
        '.measure-sheet[aria-label="Takt 1"] .score-rest[data-instrument="kick"][data-step="0"]',
      ),
    ).toBeTruthy();
  });

  it('does not trigger an instrument sound for a placed pause', async () => {
    const fixture = TestBed.createComponent(ScoreEditorComponent);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    const audio = TestBed.inject(DrumAudioService);
    const startSpy = vi.spyOn(audio, 'start').mockResolvedValue(true);
    const playSpy = vi.spyOn(audio, 'play');
    const placement = compiled.querySelector<SVGRectElement>(
      '.measure-sheet[aria-label="Takt 1"] .placement-target[data-step="0"]',
    );
    const playbackButton = compiled.querySelector<HTMLButtonElement>('.button-play');

    if (!placement || !playbackButton) {
      throw new Error('Pausen- oder Wiedergabewerkzeug wurde nicht angezeigt.');
    }
    openDurationMenu(fixture, 'rests');
    placement.dispatchEvent(new MouseEvent('click', { bubbles: true, clientY: 112 }));
    fixture.detectChanges();
    playbackButton.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(playSpy).not.toHaveBeenCalledWith('kick');
    expect(playSpy).toHaveBeenCalledWith('closedHat');

    fixture.destroy();
    startSpy.mockRestore();
    playSpy.mockRestore();
  });

  it('plays tuplet notes that fall between regular 64th-note ticks', async () => {
    const fixture = TestBed.createComponent(ScoreEditorComponent);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    const tupletsToggle = compiled.querySelector<HTMLButtonElement>(
      '[aria-label="Tuplets aktivieren"]',
    );
    const audio = TestBed.inject(DrumAudioService);
    const startSpy = vi.spyOn(audio, 'start').mockResolvedValue(true);
    const playSpy = vi.spyOn(audio, 'play');
    if (!tupletsToggle) {
      throw new Error('Tuplet-Werkzeug wurde nicht angezeigt.');
    }
    tupletsToggle.click();
    fixture.detectChanges();

    for (const { step, y } of [
      { step: 0, y: 34 },
      { step: 32, y: 44 },
    ]) {
      const target = compiled.querySelector<SVGRectElement>(
        `.measure-sheet[aria-label="Takt 1"] .placement-target[data-step="${step}"]`,
      );
      if (!target) {
        throw new Error('Notenblatt-Ziel wurde nicht angezeigt.');
      }
      target.dispatchEvent(new MouseEvent('click', { bubbles: true, clientY: y }));
      fixture.detectChanges();
    }

    vi.useFakeTimers();
    try {
      compiled.querySelector<HTMLButtonElement>('.button-play')?.click();
      await Promise.resolve();
      await Promise.resolve();
      expect(playSpy).toHaveBeenCalledWith('crash');

      await vi.advanceTimersByTimeAsync(450);
      expect(playSpy).toHaveBeenCalledWith('openHat');
    } finally {
      fixture.destroy();
      vi.useRealTimers();
      startSpy.mockRestore();
      playSpy.mockRestore();
    }
  });

  it('places free text at the clicked position in the score', async () => {
    const fixture = TestBed.createComponent(ScoreEditorComponent);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    selectTextTool(fixture);
    const textInput = compiled.querySelector<HTMLInputElement>('[aria-label="Partiturtext"]');
    const freeTextMode = compiled.querySelector<HTMLButtonElement>(
      '[aria-label="Textmodus Freitext"]',
    );
    const placement = compiled.querySelector<SVGRectElement>(
      '.measure-sheet[aria-label="Takt 1"] .placement-target[data-step="10"]',
    );

    if (!textInput || !freeTextMode || !placement) {
      throw new Error('Partiturtext-Werkzeug oder Notenblatt-Ziel wurde nicht angezeigt.');
    }
    textInput.value = 'Intro';
    textInput.dispatchEvent(new Event('input', { bubbles: true }));
    freeTextMode.click();
    placement.dispatchEvent(new MouseEvent('click', { bubbles: true, clientY: 68 }));
    fixture.detectChanges();

    const annotation = compiled.querySelector<SVGTextElement>(
      '.measure-sheet[aria-label="Takt 1"] .score-annotation[data-kind="free"]',
    );
    expect(annotation?.textContent).toBe('Intro');
    expect(annotation?.getAttribute('data-step')).toBe('10');

    compiled.querySelector<HTMLButtonElement>('.save-button')?.click();
    const restoredFixture = TestBed.createComponent(ScoreEditorComponent);
    await restoredFixture.whenStable();
    expect(
      (restoredFixture.nativeElement as HTMLElement).querySelector(
        '.measure-sheet[aria-label="Takt 1"] .score-annotation[data-kind="free"]',
      )?.textContent,
    ).toBe('Intro');
  });

  it('attaches text to a note without removing the note', async () => {
    const fixture = TestBed.createComponent(ScoreEditorComponent);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    selectTextTool(fixture);
    const textInput = compiled.querySelector<HTMLInputElement>('[aria-label="Partiturtext"]');
    const noteTextMode = compiled.querySelector<HTMLButtonElement>(
      '[aria-label="Textmodus An Note"]',
    );
    const note = compiled.querySelector<SVGGElement>(
      '.measure-sheet[aria-label="Takt 1"] .score-note[data-instrument="kick"]',
    );

    if (!textInput || !noteTextMode || !note) {
      throw new Error('Notentext-Werkzeug oder Schlagzeugnote wurde nicht angezeigt.');
    }
    textInput.value = 'R L';
    textInput.dispatchEvent(new Event('input', { bubbles: true }));
    noteTextMode.click();
    note.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();

    expect(
      compiled.querySelectorAll(
        `.measure-sheet .score-note[data-event-id="${note.getAttribute('data-event-id')}"]`,
      ),
    ).not.toHaveLength(0);
    const annotation = compiled.querySelector<SVGTextElement>(
      '.measure-sheet[aria-label="Takt 1"] .score-annotation[data-kind="note"]',
    );
    expect(annotation?.textContent).toBe('R L');
    expect(annotation?.getAttribute('data-note-id')).toBe(note.getAttribute('data-event-id'));

    openDurationMenu(fixture, 'notes');
    compiled
      .querySelector<SVGGElement>(
        `.score-note[data-event-id="${note.getAttribute('data-event-id')}"]`,
      )
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();
    expect(
      compiled.querySelector(`.score-note[data-event-id="${note.getAttribute('data-event-id')}"]`),
    ).toBeNull();
    expect(
      compiled.querySelector('.score-annotation[data-kind="note"]'),
    ).toBeNull();
  });

  it('positions each note annotation independently without overlapping the notes', async () => {
    const fixture = TestBed.createComponent(ScoreEditorComponent);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    selectTextTool(fixture);
    const textInput = compiled.querySelector<HTMLInputElement>('[aria-label="Partiturtext"]');
    const noteTextMode = compiled.querySelector<HTMLButtonElement>(
      '[aria-label="Textmodus An Note"]',
    );
    const kickNote = compiled.querySelector<SVGGElement>(
      '.score-note[data-instrument="kick"]',
    );
    const snareNote = compiled.querySelector<SVGGElement>(
      '.score-note[data-instrument="snare"]',
    );

    if (!textInput || !noteTextMode || !kickNote || !snareNote) {
      throw new Error('Notentext-Werkzeug oder Schlagzeugnoten wurden nicht angezeigt.');
    }
    textInput.value = 'R';
    textInput.dispatchEvent(new Event('input', { bubbles: true }));
    noteTextMode.click();
    kickNote.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();
    expect(
      compiled
        .querySelector('.score-annotation[data-kind="note"]')
        ?.getAttribute('y'),
    ).toBe('13');

    compiled
      .querySelector<HTMLButtonElement>('[aria-label="Nächster Notentext unter allen Noten"]')
      ?.click();
    fixture.detectChanges();
    compiled
      .querySelector<SVGGElement>('.score-note[data-instrument="snare"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();

    const annotationYValues = () =>
      Array.from(compiled.querySelectorAll<SVGTextElement>('.score-annotation[data-kind="note"]'))
        .map((annotation) => annotation.getAttribute('y'));
    expect(annotationYValues()).toEqual(['13', '148']);

    compiled.querySelector<HTMLButtonElement>('.save-button')?.click();
    fixture.destroy();

    const restoredFixture = TestBed.createComponent(ScoreEditorComponent);
    await restoredFixture.whenStable();
    const restored = restoredFixture.nativeElement as HTMLElement;
    selectTextTool(restoredFixture);
    restored.querySelector<HTMLButtonElement>('[aria-label="Textmodus An Note"]')?.click();
    restoredFixture.detectChanges();
    expect(
      Array.from(
        restored.querySelectorAll<SVGTextElement>('.score-annotation[data-kind="note"]'),
      ).map((annotation) => annotation.getAttribute('y')),
    ).toEqual(['13', '148']);
    expect(
      restored.querySelector<HTMLButtonElement>(
        '[aria-label="Nächster Notentext unter allen Noten"]',
      )
        ?.getAttribute('aria-pressed'),
    ).toBe('true');
  });
});
