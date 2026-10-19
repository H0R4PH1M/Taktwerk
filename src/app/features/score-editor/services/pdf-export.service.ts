import { Injectable } from '@angular/core';
import type { jsPDF as JsPdfDocument } from 'jspdf';
import type { PdfExportSettings } from '../models/pdf-export.model';

const PAGE_MARGIN = 12;
const COLUMN_GAP = 4;
const ROW_GAP = 5;
const FOOTER_TEXT = 'Noten erstellt mit Taktwerk von Lorenz';
const SVG_STYLE_PROPERTIES = [
  'fill',
  'fill-rule',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'text-anchor',
  'dominant-baseline',
  'opacity',
  'paint-order',
] as const;
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const XLINK_NAMESPACE = 'http://www.w3.org/1999/xlink';
const TEXT_RASTER_SCALE = 6;

interface SvgDimensions {
  width: number;
  height: number;
}

@Injectable({ providedIn: 'root' })
export class PdfExportService {
  async downloadScore(
    measures: readonly SVGSVGElement[],
    settings: PdfExportSettings,
    scoreDetails = '',
  ): Promise<void> {
    const title = settings.title.trim();
    if (
      !title ||
      !Number.isInteger(settings.measuresPerRow) ||
      settings.measuresPerRow < 1 ||
      settings.measuresPerRow > 4
    ) {
      throw new Error('Die PDF-Einstellungen sind ungültig.');
    }
    if (measures.length === 0) {
      throw new Error('Das Notenblatt enthält keine Takte.');
    }

    const [pdfModule] = await Promise.all([import('jspdf'), import('svg2pdf.js')]);
    const { jsPDF } = pdfModule;
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const contentWidth = pageWidth - PAGE_MARGIN * 2;
    const columns = settings.measuresPerRow;
    const columnWidth = (contentWidth - COLUMN_GAP * (columns - 1)) / columns;
    const contentBottom = pageHeight - 21;
    const rowStart = this.addPageHeader(pdf, title, scoreDetails, contentWidth);
    let cursorY = rowStart;
    let pageHasMeasures = false;

    for (let index = 0; index < measures.length; index += columns) {
      const row = measures.slice(index, index + columns);
      const dimensions = row.map((measure) => this.svgDimensions(measure));
      const rowHeight = Math.max(
        ...dimensions.map((size) => (size.height / size.width) * columnWidth),
      );

      if (cursorY + rowHeight > contentBottom && pageHasMeasures) {
        pdf.addPage();
        cursorY = this.addPageHeader(pdf, title, scoreDetails, contentWidth);
        pageHasMeasures = false;
      }

      const availableHeight = contentBottom - cursorY;
      const scale = Math.min(1, availableHeight / rowHeight);
      for (const [column, measure] of row.entries()) {
        const size = dimensions[column];
        if (!size) {
          throw new Error('Ein Takt konnte nicht für den PDF-Export vorbereitet werden.');
        }
        const width = columnWidth * scale;
        const height = (size.height / size.width) * width;
        const svg = this.clonePrintableMeasure(measure);
        try {
          await pdf.svg(svg, {
            x: PAGE_MARGIN + column * (columnWidth + COLUMN_GAP) * scale,
            y: cursorY,
            width,
            height,
          });
        } finally {
          svg.remove();
        }
      }

      cursorY += rowHeight * scale + ROW_GAP;
      pageHasMeasures = true;
    }

    for (let page = 1; page <= pdf.getNumberOfPages(); page += 1) {
      pdf.setPage(page);
      this.addPageFooter(pdf, pageWidth, pageHeight);
    }

    this.download(pdf.output('blob'), title);
  }

  private svgDimensions(svg: SVGSVGElement): SvgDimensions {
    const viewBox = svg
      .getAttribute('viewBox')
      ?.trim()
      .split(/[,\s]+/)
      .map(Number);
    const width =
      viewBox?.length === 4
        ? viewBox[2]
        : Number.parseFloat(svg.getAttribute('width') ?? '');
    const height =
      viewBox?.length === 4 ? viewBox[3] : Number.parseFloat(svg.getAttribute('height') ?? '');
    if (!width || !height || !Number.isFinite(width) || !Number.isFinite(height)) {
      throw new Error('Die Größe eines Takts konnte nicht gelesen werden.');
    }
    return { width, height };
  }

  private clonePrintableMeasure(source: SVGSVGElement): SVGSVGElement {
    const clone = source.cloneNode(true) as SVGSVGElement;
    clone.classList.remove('note-text-mode', 'selection-mode', 'paste-pending');
    clone
      .querySelectorAll<SVGElement>('.placement-target, .note-hit-area, .selection-marquee')
      .forEach((element) => element.remove());
    clone.querySelectorAll<SVGElement>('.selected, .playhead').forEach((element) => {
      element.classList.remove('selected', 'playhead');
    });

    clone.style.position = 'fixed';
    clone.style.left = '-10000px';
    clone.style.top = '0';
    document.body.append(clone);
    try {
      const elements = [clone, ...clone.querySelectorAll<SVGElement>('*')];
      for (const element of elements) {
        const computedStyle = window.getComputedStyle(element);
        for (const property of SVG_STYLE_PROPERTIES) {
          const value = computedStyle.getPropertyValue(property);
          if (value) {
            const pdfValue =
              property === 'font-weight' ? this.pdfFontWeight(value) : value;
            element.style.setProperty(property, pdfValue);
          }
        }
      }

      clone.querySelectorAll<SVGTextElement>('text').forEach((text) => {
        this.replaceTextWithImage(text, window.getComputedStyle(text));
      });
      return clone;
    } catch (error) {
      clone.remove();
      throw error;
    }
  }

  private pdfFontWeight(value: string): 'bold' | 'normal' {
    const weight = Number(value);
    return value === 'bold' || value === 'bolder' || (Number.isFinite(weight) && weight >= 600)
      ? 'bold'
      : 'normal';
  }

  private replaceTextWithImage(
    text: SVGTextElement,
    style: CSSStyleDeclaration,
  ): void {
    const content = text.textContent ?? '';
    if (!content) {
      text.remove();
      return;
    }

    const fontSize = Number.parseFloat(style.getPropertyValue('font-size')) || 16;
    const fontWeight = style.getPropertyValue('font-weight') || 'normal';
    const fontStyle = style.getPropertyValue('font-style') || 'normal';
    const fontFamily = style.getPropertyValue('font-family') || 'sans-serif';
    const padding = Math.max(1, fontSize * 0.15);
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('SVG-Text konnte nicht für den PDF-Export gerendert werden.');
    }

    context.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`;
    const metrics = context.measureText(content);
    const textWidth = Math.max(metrics.width, fontSize * 0.5);
    const ascent = metrics.actualBoundingBoxAscent || fontSize * 0.8;
    const descent = metrics.actualBoundingBoxDescent || fontSize * 0.2;
    canvas.width = Math.ceil((textWidth + padding * 2) * TEXT_RASTER_SCALE);
    canvas.height = Math.ceil((ascent + descent + padding * 2) * TEXT_RASTER_SCALE);

    context.scale(TEXT_RASTER_SCALE, TEXT_RASTER_SCALE);
    context.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`;
    context.textAlign = 'left';
    context.textBaseline = 'alphabetic';
    context.fillStyle = style.getPropertyValue('fill') || '#252b26';
    context.globalAlpha = Number.parseFloat(style.getPropertyValue('opacity')) || 1;
    context.fillText(content, padding, padding + ascent);

    const anchorX = Number.parseFloat(text.getAttribute('x') ?? '0') || 0;
    const anchorY = Number.parseFloat(text.getAttribute('y') ?? '0') || 0;
    const textAnchor = style.getPropertyValue('text-anchor');
    const image = document.createElementNS(SVG_NAMESPACE, 'image');
    const imageWidth = canvas.width / TEXT_RASTER_SCALE;
    const imageHeight = canvas.height / TEXT_RASTER_SCALE;
    const imageX =
      anchorX -
      (textAnchor === 'middle' ? textWidth / 2 : textAnchor === 'end' ? textWidth : 0) -
      padding;
    const centered = ['central', 'middle'].includes(
      style.getPropertyValue('dominant-baseline'),
    );
    const imageY = centered
      ? anchorY - imageHeight / 2
      : anchorY - padding - ascent;
    const png = canvas.toDataURL('image/png');
    image.setAttribute('x', String(imageX));
    image.setAttribute('y', String(imageY));
    image.setAttribute('width', String(imageWidth));
    image.setAttribute('height', String(imageHeight));
    image.setAttribute('preserveAspectRatio', 'none');
    image.setAttribute('href', png);
    image.setAttributeNS(XLINK_NAMESPACE, 'xlink:href', png);
    image.setAttribute('aria-hidden', 'true');
    text.replaceWith(image);
  }

  private addPageHeader(
    pdf: JsPdfDocument,
    title: string,
    scoreDetails: string,
    contentWidth: number,
  ): number {
    const titleLines = pdf.splitTextToSize(title, contentWidth) as string[];
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(18);
    pdf.setTextColor(37, 55, 42);
    pdf.text(titleLines, PAGE_MARGIN, 17);

    let nextY = 17 + titleLines.length * 8;
    const details = scoreDetails.replace(/\s+/g, ' ').trim();
    if (details) {
      const detailLines = pdf.splitTextToSize(details, contentWidth) as string[];
      nextY += 1;
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.setTextColor(98, 107, 98);
      pdf.text(detailLines, PAGE_MARGIN, nextY);
      nextY += detailLines.length * 4;
    }

    const dividerY = nextY + 2;
    pdf.setDrawColor(220, 224, 216);
    pdf.setLineWidth(0.25);
    pdf.line(PAGE_MARGIN, dividerY, PAGE_MARGIN + contentWidth, dividerY);
    return dividerY + 5;
  }

  private addPageFooter(pdf: JsPdfDocument, pageWidth: number, pageHeight: number): void {
    const dividerY = pageHeight - 15;
    pdf.setDrawColor(220, 224, 216);
    pdf.setLineWidth(0.25);
    pdf.line(PAGE_MARGIN, dividerY, pageWidth - PAGE_MARGIN, dividerY);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(98, 107, 98);
    pdf.text(FOOTER_TEXT, pageWidth / 2, pageHeight - 8, { align: 'center' });
  }

  private download(pdf: Blob, title: string): void {
    const safeTitle =
      title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').replace(/[. ]+$/g, '').trim() ||
      'Taktwerk';
    const url = URL.createObjectURL(pdf);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${safeTitle}.pdf`;
    link.style.display = 'none';
    document.body.append(link);
    try {
      link.click();
    } finally {
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }
}
