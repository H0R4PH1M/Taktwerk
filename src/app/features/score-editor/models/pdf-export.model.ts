export type PdfMeasuresPerRow = 1 | 2 | 3 | 4;

export interface PdfExportSettings {
  title: string;
  measuresPerRow: PdfMeasuresPerRow;
}
