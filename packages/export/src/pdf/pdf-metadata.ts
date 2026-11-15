import { PDFHexString, PDFName, PDFNumber, type PDFDocument, type PDFObject } from 'pdf-lib';

import { escapeXml } from '#ooxml/xml.ts';

/**
 * Matches the milliseconds of an ISO 8601 timestamp, which XMP dates leave out.
 */
const FRACTIONAL_SECONDS_PATTERN = /\.\d{3}Z$/;

/**
 * The application named as the document's creator.
 */
export const PDF_CREATOR = 'deck';

/**
 * The tool named as the document's producer.
 */
export const PDF_PRODUCER = 'deck export (Chromium, pdf-lib)';

/**
 * The document information a PDF carries in its Info dictionary and, identically, in its XMP
 * metadata stream.
 */
export type PdfInfo = {
  /**
   * The document title: the deck title.
   */
  title: string;

  /**
   * The author, or `null` when the deck names none.
   */
  author: string | null;

  /**
   * The document language as a BCP 47 tag, such as `en-US`.
   */
  language: string;

  /**
   * When the document was made; written as both the creation and the modification date.
   */
  date: Date;
};

/**
 * Writes the document information: the Info dictionary (title shown in the viewer's title bar,
 * author, creator, producer, dates), the catalog's `/Lang`, and an XMP metadata stream with the
 * same values (ISO 32000-1 §14.3.2), which PDF/A and PDF/UA checkers read.
 *
 * @param document - The document; changed in place.
 * @param info - The values.
 */
export function writeMetadata(document: PDFDocument, info: PdfInfo): void {
  document.setTitle(info.title, { showInWindowTitleBar: true });
  if (info.author !== null) {
    document.setAuthor(info.author);
  }

  document.setCreator(PDF_CREATOR);
  document.setProducer(PDF_PRODUCER);
  document.setCreationDate(info.date);
  document.setModificationDate(info.date);
  document.setLanguage(info.language);
  const stream = document.context.stream(new TextEncoder().encode(xmpPacket(info)), {
    Type: 'Metadata',
    Subtype: 'XML',
  });
  document.catalog.set(PDFName.of('Metadata'), document.context.register(stream));
}

/**
 * The XMP packet for a document: Dublin Core title, creator, language and format, the XMP dates and
 * creator tool, and the PDF producer.
 *
 * @param info - The values.
 */
export function xmpPacket(info: PdfInfo): string {
  const date = info.date.toISOString().replace(FRACTIONAL_SECONDS_PATTERN, 'Z');
  const creator =
    info.author === null
      ? ''
      : `<dc:creator><rdf:Seq><rdf:li>${escapeXml(info.author)}</rdf:li></rdf:Seq></dc:creator>`;
  return [
    '<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>',
    '<x:xmpmeta xmlns:x="adobe:ns:meta/">',
    '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">',
    '<rdf:Description rdf:about=""',
    ' xmlns:dc="http://purl.org/dc/elements/1.1/"',
    ' xmlns:xmp="http://ns.adobe.com/xap/1.0/"',
    ' xmlns:pdf="http://ns.adobe.com/pdf/1.3/">',
    '<dc:format>application/pdf</dc:format>',
    `<dc:title><rdf:Alt><rdf:li xml:lang="x-default">${escapeXml(info.title)}</rdf:li></rdf:Alt>` +
      '</dc:title>',
    creator,
    `<dc:language><rdf:Bag><rdf:li>${escapeXml(info.language)}</rdf:li></rdf:Bag></dc:language>`,
    `<xmp:CreateDate>${date}</xmp:CreateDate>`,
    `<xmp:ModifyDate>${date}</xmp:ModifyDate>`,
    `<xmp:MetadataDate>${date}</xmp:MetadataDate>`,
    `<xmp:CreatorTool>${PDF_CREATOR}</xmp:CreatorTool>`,
    `<pdf:Producer>${escapeXml(PDF_PRODUCER)}</pdf:Producer>`,
    '</rdf:Description>',
    '</rdf:RDF>',
    '</x:xmpmeta>',
    '<?xpacket end="w"?>',
  ]
    .filter((line) => line !== '')
    .join('\n');
}

/**
 * Writes page labels (ISO 32000-1 §12.4.2): each page shows its own label in the viewer's page box
 * and thumbnails, such as `3`, `3.2` for a step, or `Notes 3`. Runs of pages whose labels count up
 * from 1 without a prefix share one decimal range.
 *
 * @param document - The document; changed in place.
 * @param labels - One label per page, in order.
 */
export function writePageLabels(document: PDFDocument, labels: readonly string[]): void {
  if (labels.length === 0) {
    return;
  }

  const { context } = document;
  const nums: PDFObject[] = [];
  labels.forEach((label, index) => {
    const counts = label === String(index + 1);
    const continuesRun = index > 0 && labels[index - 1] === String(index) && counts;
    if (continuesRun) {
      return;
    }

    nums.push(PDFNumber.of(index));
    nums.push(
      counts
        ? context.obj({ S: 'D', St: PDFNumber.of(index + 1) })
        : context.obj({ P: PDFHexString.fromText(label) }),
    );
  });
  const tree = context.obj({ Nums: nums });
  document.catalog.set(PDFName.of('PageLabels'), context.register(tree));
}
