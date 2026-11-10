import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

interface FixtureNote {
  id: string;
  duration: number;
}

interface FixtureRest {
  id: string;
  duration: number;
}

interface FixtureAnnotation {
  id: string;
  text: string;
  noteId?: string;
}

interface FeatureShowcase {
  tempo: number;
  numerator: number;
  denominator: number;
  measures: number;
  pattern: Record<string, FixtureNote[][]>;
  rests: Record<string, FixtureRest[][]>;
  annotations: FixtureAnnotation[][];
}

const showcasePath = resolve(process.cwd(), 'public', 'examples', 'feature-showcase.json');
const showcase = JSON.parse(readFileSync(showcasePath, 'utf8')) as FeatureShowcase;

function noteIds(pattern: FeatureShowcase['pattern']): string[] {
  return Object.values(pattern)
    .flatMap((track) => track.flatMap((measure) => measure.map(({ id }) => id)))
    .sort();
}

function restIds(rests: FeatureShowcase['rests']): string[] {
  return Object.values(rests)
    .flatMap((track) => track.flatMap((measure) => measure.map(({ id }) => id)))
    .sort();
}

async function importShowcase(page: Page): Promise<void> {
  await page.goto('/');
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'JSON importieren' }).click();
  await (await fileChooserPromise).setFiles(showcasePath);
  await expect(page.getByRole('status')).toHaveText('Das Pattern wurde importiert.');
}

test.describe('Feature-Showcase-Export', () => {
  test.beforeEach(async ({ page }) => {
    await importShowcase(page);
  });

  test('importiert vier Takte mit allen Noten- und Pausenwerten', async ({ page }) => {
    await expect(page.locator('.measure-sheet')).toHaveCount(showcase.measures);
    await expect(page.locator('.score-paper-header')).toContainText(
      `${showcase.numerator}/${showcase.denominator}`,
    );
    await expect(page.locator('.score-paper-header')).toContainText(`${showcase.tempo} BPM`);

    const expectedNoteIds = noteIds(showcase.pattern);
    const renderedNoteIds = await page.locator('.score-note').evaluateAll((nodes) =>
      [...new Set(nodes.map((node) => node.getAttribute('data-event-id') ?? ''))].sort(),
    );
    expect(renderedNoteIds).toEqual(expectedNoteIds);

    for (const instrumentId of Object.keys(showcase.pattern)) {
      await expect(page.locator(`.score-note[data-instrument="${instrumentId}"]`)).not.toHaveCount(
        0,
      );
    }

    const noteDurations = [
      ...new Set(
        Object.values(showcase.pattern).flatMap((track) =>
          track.flatMap((measure) => measure.map(({ duration }) => duration)),
        ),
      ),
    ].sort((left, right) => left - right);
    expect(noteDurations).toEqual([1, 2, 4, 8, 16, 32, 64]);
    for (const duration of noteDurations) {
      await expect(page.locator(`.score-note[data-duration="${duration}"]`)).not.toHaveCount(0);
    }

    const expectedRestIds = restIds(showcase.rests);
    const renderedRestIds = await page.locator('.score-rest').evaluateAll((nodes) =>
      [...new Set(nodes.map((node) => node.getAttribute('data-rest-id') ?? ''))].sort(),
    );
    expect(renderedRestIds).toEqual(expectedRestIds);

    const expectedRestDurations = [
      ...new Set(
        Object.values(showcase.rests).flatMap((track) =>
          track.flatMap((measure) => measure.map(({ duration }) => duration)),
        ),
      ),
    ].sort((left, right) => left - right);
    expect(expectedRestDurations).toEqual([1, 2, 4, 8, 16, 32, 64]);
    for (const duration of expectedRestDurations) {
      await expect(page.locator(`.score-rest[data-duration="${duration}"]`)).not.toHaveCount(0);
    }

    const expectedAnnotationIds = showcase.annotations
      .flatMap((measure) => measure.map(({ id }) => id))
      .sort();
    const renderedAnnotationIds = await page.locator('.score-annotation').evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('data-annotation-id') ?? '').sort(),
    );
    expect(renderedAnnotationIds).toEqual(expectedAnnotationIds);
    await expect(page.locator('.score-annotation[data-kind="free"]')).not.toHaveCount(0);
    await expect(page.locator('.score-annotation[data-kind="note"]')).not.toHaveCount(0);

    await expect(page.locator('.score-tuplet')).toHaveCount(1);
    await expect(
      page.locator(
        '.score-beam[data-beam-id="manual-beam-kick-manual-m2"][data-collision-side="below"]',
      ),
    ).toHaveCount(1);
    await expect(page.locator('.score-beam[data-direction="down"]')).not.toHaveCount(0);
    await expect(page.locator('.score-beam[data-levels="4"]')).not.toHaveCount(0);
    await expect(
      page.locator('.measure-sheet[aria-label="Takt 3"] .tie-arc-out[data-instrument="kick"]'),
    ).toHaveCount(1);
    await expect(
      page.locator('.measure-sheet[aria-label="Takt 4"] .tie-arc-in[data-instrument="kick"]'),
    ).toHaveCount(1);
  });

  test('exportiert und speichert das importierte Pattern vollständig', async ({ page }) => {
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'JSON exportieren' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('mein-schlagzeug-pattern.json');

    const downloadedPath = await download.path();
    if (!downloadedPath) {
      throw new Error('Der JSON-Export wurde nicht heruntergeladen.');
    }
    const exported = JSON.parse(await readFile(downloadedPath, 'utf8')) as FeatureShowcase;
    expect(exported).toMatchObject({
      tempo: showcase.tempo,
      numerator: showcase.numerator,
      denominator: showcase.denominator,
      measures: showcase.measures,
    });
    expect(noteIds(exported.pattern)).toEqual(noteIds(showcase.pattern));
    expect(restIds(exported.rests)).toEqual(restIds(showcase.rests));
    expect(exported.annotations).toEqual(showcase.annotations);

    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByRole('status')).toHaveText(
      'Dein Rhythmus wurde in diesem Browser gespeichert.',
    );
    await page.reload();
    await expect(page.locator('.measure-sheet')).toHaveCount(showcase.measures);
    await expect(page.locator('.score-tuplet')).toHaveCount(1);
    await expect(page.locator('.score-annotation[data-kind="note"]')).toHaveCount(
      showcase.annotations.flat().filter(({ noteId }) => noteId !== undefined).length,
    );
  });

  test('erstellt aus dem Showcase eine PDF mit den gewählten Einstellungen', async ({ page }) => {
    test.setTimeout(60_000);
    await page.getByRole('button', { name: 'PDF Einstellungen' }).click();
    const dialog = page.getByRole('dialog', { name: 'PDF-Export einstellen' });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('PDF Titel').fill('Feature-Showcase');
    await dialog.getByLabel('Takte pro Zeile').selectOption('2');

    const downloadPromise = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'PDF herunterladen' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('Feature-Showcase.pdf');

    const downloadedPath = await download.path();
    if (!downloadedPath) {
      throw new Error('Der PDF-Export wurde nicht heruntergeladen.');
    }
    const pdf = await readFile(downloadedPath);
    expect(pdf.subarray(0, 4).toString('ascii')).toBe('%PDF');
    await expect(page.getByRole('status')).toHaveText('PDF wurde heruntergeladen.');
  });
});
