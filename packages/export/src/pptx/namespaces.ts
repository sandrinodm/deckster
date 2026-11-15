/**
 * The XML namespaces a PresentationML part declares on its root element.
 */
export const PML_NAMESPACES = {
  /**
   * DrawingML main.
   */
  'xmlns:a': 'http://schemas.openxmlformats.org/drawingml/2006/main',

  /**
   * Relationships, for `r:id` and `r:embed`.
   */
  'xmlns:r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',

  /**
   * PresentationML main.
   */
  'xmlns:p': 'http://schemas.openxmlformats.org/presentationml/2006/main',
} as const;

/**
 * The PowerPoint 2010 namespace, for embedded media (`p14:media`).
 */
export const P14_NAMESPACE = 'http://schemas.microsoft.com/office/powerpoint/2010/main';

/**
 * The Office 2016 SVG namespace, for `asvg:svgBlip`.
 */
export const SVG_BLIP_NAMESPACE = 'http://schemas.microsoft.com/office/drawing/2016/SVG/main';

/**
 * The extension URI under which a picture carries its SVG original.
 */
export const SVG_BLIP_EXTENSION = '{96DAC541-7B7A-43D3-8B79-37D633B846F1}';

/**
 * The extension URI of PowerPoint 2010 embedded media on a picture.
 */
export const MEDIA_EXTENSION = '{DAA4B4D4-6D71-4841-9C94-3DE7FCFB9230}';

/**
 * The DrawingML chart namespace.
 */
export const CHART_NAMESPACE = 'http://schemas.openxmlformats.org/drawingml/2006/chart';

/**
 * The DrawingML table graphic data URI.
 */
export const TABLE_URI = 'http://schemas.openxmlformats.org/drawingml/2006/table';

/**
 * Relationship type URIs.
 */
export const REL = {
  /**
   * Package to the main presentation part.
   */
  officeDocument:
    'http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument',

  /**
   * Package to core properties.
   */
  coreProperties:
    'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties',

  /**
   * Package to extended properties.
   */
  extendedProperties:
    'http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties',

  /**
   * Presentation to a slide master.
   */
  slideMaster: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster',

  /**
   * Master or slide to a layout.
   */
  slideLayout: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout',

  /**
   * Presentation to a slide; also a slide-jump hyperlink target.
   */
  slide: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide',

  /**
   * Master to its theme.
   */
  theme: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme',

  /**
   * Presentation to the notes master.
   */
  notesMaster: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesMaster',

  /**
   * Slide to its notes.
   */
  notesSlide: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide',

  /**
   * Presentation properties.
   */
  presProps: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/presProps',

  /**
   * View properties.
   */
  viewProps: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/viewProps',

  /**
   * Table styles.
   */
  tableStyles: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/tableStyles',

  /**
   * A picture.
   */
  image: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image',

  /**
   * A hyperlink.
   */
  hyperlink: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink',

  /**
   * A chart part.
   */
  chart: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart',

  /**
   * A chart's embedded workbook.
   */
  package: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/package',

  /**
   * A video, the classic relationship.
   */
  video: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/video',

  /**
   * A media file, the PowerPoint 2010 relationship.
   */
  media: 'http://schemas.microsoft.com/office/2007/relationships/media',

  /**
   * An embedded font.
   */
  font: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/font',
} as const;

/**
 * Content types of the PresentationML parts.
 */
export const CONTENT_TYPE = {
  /**
   * The main presentation part.
   */
  presentation:
    'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml',

  /**
   * A slide.
   */
  slide: 'application/vnd.openxmlformats-officedocument.presentationml.slide+xml',

  /**
   * A slide layout.
   */
  slideLayout: 'application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml',

  /**
   * A slide master.
   */
  slideMaster: 'application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml',

  /**
   * A theme.
   */
  theme: 'application/vnd.openxmlformats-officedocument.theme+xml',

  /**
   * The notes master.
   */
  notesMaster: 'application/vnd.openxmlformats-officedocument.presentationml.notesMaster+xml',

  /**
   * A notes slide.
   */
  notesSlide: 'application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml',

  /**
   * Presentation properties.
   */
  presProps: 'application/vnd.openxmlformats-officedocument.presentationml.presProps+xml',

  /**
   * View properties.
   */
  viewProps: 'application/vnd.openxmlformats-officedocument.presentationml.viewProps+xml',

  /**
   * Table styles.
   */
  tableStyles: 'application/vnd.openxmlformats-officedocument.presentationml.tableStyles+xml',

  /**
   * Core properties.
   */
  coreProperties: 'application/vnd.openxmlformats-package.core-properties+xml',

  /**
   * Extended properties.
   */
  extendedProperties: 'application/vnd.openxmlformats-officedocument.extended-properties+xml',

  /**
   * A chart.
   */
  chart: 'application/vnd.openxmlformats-officedocument.drawingml.chart+xml',
} as const;
