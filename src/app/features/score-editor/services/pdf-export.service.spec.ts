import { jsPDF } from 'jspdf';
import 'svg2pdf.js';
import { PdfExportService } from './pdf-export.service';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const PDF_FOOTER = 'Noten erstellt mit Taktwerk von Lorenz';

function createMeasure(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NAMESPACE, 'svg');
  svg.setAttribute('width', '680');
  svg.setAttribute('height', '183');
  svg.setAttribute('viewBox', '0 0 680 183');

  const staffLine = document.createElementNS(SVG_NAMESPACE, 'line');
  staffLine.setAttribute('x1', '112');
  staffLine.setAttribute('x2', '656');
  staffLine.setAttribute('y1', '52');
  staffLine.setAttribute('y2', '52');
  staffLine.setAttribute('stroke', '#62645e');
  svg.append(staffLine);
  document.body.append(svg);

  return svg;
}

function readBlobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(String(reader.result)));
    reader.addEventListener('error', () => reject(reader.error));
    reader.readAsText(blob);
  });
}

describe('PdfExportService', () => {
  it('downloads a multi-page PDF with the footer on every page', async () => {
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
    const downloadedLinks: HTMLAnchorElement[] = [];
    const svgRenderer = vi
      .spyOn(jsPDF.API, 'svg')
      .mockImplementation(async function (this: jsPDF) {
        return this;
      });
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        downloadedLinks.push(this);
      });
    const measures = Array.from({ length: 12 }, createMeasure);

    try {
      const service = new PdfExportService();
      await service.downloadScore(measures, {
        title: 'Probe PDF',
        measuresPerRow: 1,
      });

      const pdf = createObjectUrl.mock.calls[0]?.[0];
      expect(downloadedLinks).toHaveLength(1);
      expect(downloadedLinks[0]?.download).toBe('Probe PDF.pdf');
      expect(pdf?.type).toBe('application/pdf');
      if (!pdf) {
        throw new Error('PDF-Datei wurde nicht erzeugt.');
      }

      const contents = await readBlobText(pdf);
      const pageCount = contents.match(/\/Type\s*\/Page\b/g)?.length ?? 0;
      const footerCount = contents.match(new RegExp(PDF_FOOTER, 'g'))?.length ?? 0;
      expect(pageCount).toBeGreaterThan(1);
      expect(footerCount).toBe(pageCount);
    } finally {
      for (const measure of measures) {
        measure.remove();
      }
      clickSpy.mockRestore();
      svgRenderer.mockRestore();
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
    }
  });
});
