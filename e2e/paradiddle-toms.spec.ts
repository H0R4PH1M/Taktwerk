import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

const patternPath = resolve(process.cwd(), 'public', 'examples', 'paradiddle-toms.json');

test('importiert das Paradiddle-Pattern mit Handbeschriftung, Akzenten und Viertel-Bassdrum', async ({
  page,
}) => {
  await page.goto('/');
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'JSON importieren' }).click();
  await (await fileChooserPromise).setFiles(patternPath);
  await expect(page.getByRole('status')).toHaveText('Das Pattern wurde importiert.');

  const measures = page.locator('.measure-sheet');
  await expect(measures).toHaveCount(4);
  const expectedHands = ['R', 'L', 'R', 'R', 'L', 'R', 'L', 'L', 'R', 'L', 'R', 'R', 'L', 'R', 'L', 'L'];

  for (let measureNumber = 1; measureNumber <= 4; measureNumber += 1) {
    const measure = page.locator(`.measure-sheet[aria-label="Takt ${measureNumber}"]`);
    await expect(measure.locator('.score-note[data-instrument="kick"][data-duration="4"]')).toHaveCount(
      4,
    );
    await expect(measure.locator('.score-annotation[data-kind="free"]')).toHaveCount(0);

    const noteAnnotations = measure
      .locator('.score-annotation[data-kind="note"]')
      .evaluateAll((nodes) =>
      nodes
        .map((node) => ({
          step: Number(node.getAttribute('data-step')),
          noteId: node.getAttribute('data-note-id') ?? '',
          text: node.textContent?.trim() ?? '',
          y: Number(node.getAttribute('y')),
        }))
    );
    const annotations = await noteAnnotations;
    expect(annotations).toHaveLength(18);

    const handLabels = annotations
      .filter(({ text }) => text === 'R' || text === 'L')
      .sort((left, right) => left.step - right.step);
    expect(handLabels.map(({ text }) => text)).toEqual(expectedHands);
    expect(handLabels.map(({ step }) => step)).toEqual(
      Array.from({ length: 16 }, (_, index) => index * 4),
    );
    expect(handLabels.every(({ y }) => y === 148)).toBe(true);

    const accents = annotations
      .filter(({ text }) => text === '>')
      .sort((left, right) => left.step - right.step);
    expect(accents.map(({ step }) => step)).toEqual([0, 32]);
    expect(accents.every(({ y }) => y === 13)).toBe(true);

    for (const { step, noteId } of [...handLabels, ...accents]) {
      await expect(
        measure.locator(
          `.score-note[data-event-id="${noteId}"][data-step="${step}"][data-duration="16"]`,
        ),
      ).toHaveCount(1);
    }
  }

  await expect(page.locator('.score-note[data-duration="16"]')).toHaveCount(64);
  await expect(
    page.locator('.score-note[data-duration="16"]:not([data-beam-group-id])'),
  ).toHaveCount(0);
  const sixteenthStemEnds = await page
    .locator('.score-note[data-duration="16"] .note-stem')
    .evaluateAll((stems) => stems.map((stem) => Number(stem.getAttribute('y2'))));
  expect(sixteenthStemEnds.every((endY) => endY < 0)).toBe(true);

  await expect(page.locator('.score-note[data-instrument="kick"]')).toHaveCount(16);
  await expect(
    page.locator('.score-note[data-instrument="kick"][data-beam-group-id]'),
  ).toHaveCount(0);
  const kickStemEnds = await page
    .locator('.score-note[data-instrument="kick"] .note-stem')
    .evaluateAll((stems) => stems.map((stem) => Number(stem.getAttribute('y2'))));
  expect(kickStemEnds).toHaveLength(16);
  expect(kickStemEnds.every((endY) => endY > 0)).toBe(true);

  await expect(
    page.locator('.measure-sheet[aria-label="Takt 1"] .score-note[data-instrument="snare"]'),
  ).toHaveCount(16);

  await expect(
    page.locator('.measure-sheet[aria-label="Takt 2"] .score-note[data-instrument="tom1"]'),
  ).toHaveCount(8);
  await expect(
    page.locator('.measure-sheet[aria-label="Takt 2"] .score-note[data-instrument="tom2"]'),
  ).toHaveCount(8);
  await expect(
    page.locator('.measure-sheet[aria-label="Takt 3"] .score-note[data-instrument="tom2"]'),
  ).toHaveCount(8);
  await expect(
    page.locator('.measure-sheet[aria-label="Takt 3"] .score-note[data-instrument="floorTom"]'),
  ).toHaveCount(8);
  await expect(
    page.locator('.measure-sheet[aria-label="Takt 4"] .score-note[data-instrument="tom1"]'),
  ).toHaveCount(6);
  await expect(
    page.locator('.measure-sheet[aria-label="Takt 4"] .score-note[data-instrument="tom2"]'),
  ).toHaveCount(6);
  await expect(
    page.locator('.measure-sheet[aria-label="Takt 4"] .score-note[data-instrument="floorTom"]'),
  ).toHaveCount(4);
});
