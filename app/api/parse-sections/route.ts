import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

export interface EmailSection {
  id: string; // e.g. "section-0", "section-1"
  html: string; // the full <tr>...</tr> HTML
  label: string; // human-readable description
  index: number; // position in the email
}

export type ElementType = 'heading' | 'button' | 'image' | 'text' | 'link';

export interface EmailElement {
  id: string; // e.g. "element-section-0-h1-0"
  sectionId: string; // parent section ID
  type: ElementType; // type of element
  tag: string; // HTML tag name (h1, img, a, p, etc.)
  label: string; // human-readable description
  preview: string; // text content or alt text preview
}

export async function POST(req: NextRequest) {
  try {
    const { html } = await req.json();

    if (!html || typeof html !== 'string') {
      return NextResponse.json(
        { error: 'Invalid HTML provided' },
        { status: 400 }
      );
    }

    const { sections, elements, annotatedHtml } = parseEmailSections(html);

    return NextResponse.json({ sections, elements, annotatedHtml });
  } catch (error) {
    console.error('Error parsing sections:', error);
    return NextResponse.json(
      { error: 'Failed to parse email sections' },
      { status: 500 }
    );
  }
}

function parseEmailSections(html: string): { sections: EmailSection[]; elements: EmailElement[]; annotatedHtml: string } {
  const $ = cheerio.load(html);
  const sections: EmailSection[] = [];
  const elements: EmailElement[] = [];

  // Find the main 600px email table
  // Strategy: find table with width="600" or style containing "width: 600"
  const mainTable = $('table[width="600"]').first();

  if (mainTable.length === 0) {
    // Fallback: try to find table with inline style width: 600px
    const fallbackTable = $('table').filter((_, el) => {
      const style = $(el).attr('style') || '';
      return style.includes('width: 600') || style.includes('width:600');
    }).first();

    if (fallbackTable.length === 0) {
      console.warn('Could not find main email table (width="600")');
      return { sections: [], elements: [], annotatedHtml: html };
    }

    const { sections: extractedSections, elements: extractedElements } = extractSectionsFromTable(fallbackTable, $);
    return { sections: extractedSections, elements: extractedElements, annotatedHtml: $.html() };
  }

  const { sections: extractedSections, elements: extractedElements } = extractSectionsFromTable(mainTable, $);
  return { sections: extractedSections, elements: extractedElements, annotatedHtml: $.html() };
}

function extractSectionsFromTable(
  table: cheerio.Cheerio<any>,
  $: cheerio.CheerioAPI
): { sections: EmailSection[]; elements: EmailElement[] } {
  const sections: EmailSection[] = [];
  const elements: EmailElement[] = [];

  // Get direct <tr> children of the main table
  // Try direct <tr> first, then look in <tbody>
  let rows = table.find('> tr');
  if (rows.length === 0) {
    rows = table.find('> tbody > tr');
  }

  rows.each((index, row) => {
    const $row = $(row);

    // Add data-section-id attribute for later reference
    const sectionId = `section-${index}`;
    $row.attr('data-section-id', sectionId);

    // Extract sub-elements from this section
    const sectionElements = extractElementsFromSection($row, $, sectionId);
    elements.push(...sectionElements);

    // Extract HTML for this section (after adding element IDs)
    const sectionHtml = $.html($row);

    // Generate a human-readable label based on content
    const label = generateSectionLabel($row, $, index);

    sections.push({
      id: sectionId,
      html: sectionHtml,
      label,
      index,
    });
  });

  // Deduplicate labels: append " #2", " #3"... when the same label appears multiple times
  const labelCounts: Record<string, number> = {};
  const labelSeen: Record<string, number> = {};
  sections.forEach(s => { labelCounts[s.label] = (labelCounts[s.label] || 0) + 1; });
  sections.forEach(s => {
    if (labelCounts[s.label] > 1) {
      labelSeen[s.label] = (labelSeen[s.label] || 0) + 1;
      s.label = `${s.label} #${labelSeen[s.label]}`;
    }
  });

  return { sections, elements };
}

function extractElementsFromSection(
  row: cheerio.Cheerio<any>,
  $: cheerio.CheerioAPI,
  sectionId: string
): EmailElement[] {
  const elements: EmailElement[] = [];
  let elementCounter = 0;

  // Helper: get or create a stable element ID
  const getOrCreateId = ($el: cheerio.Cheerio<any>, tag: string): string => {
    const existing = $el.attr('data-element-id');
    if (existing) return existing;
    const newId = `element-${sectionId}-${tag}-${elementCounter++}`;
    $el.attr('data-element-id', newId);
    return newId;
  };

  // Extract headings (h1, h2, h3, h4, h5, h6)
  row.find('h1, h2, h3, h4, h5, h6').each((_, el) => {
    const $el = $(el);
    const tag = el.name;
    const text = $el.text().trim();

    if (text.length > 0) {
      const elementId = getOrCreateId($el, tag);
      $el.attr('data-element-type', 'heading');

      elements.push({
        id: elementId,
        sectionId,
        type: 'heading',
        tag,
        label: `${tag.toUpperCase()}: ${text.substring(0, 30)}${text.length > 30 ? '...' : ''}`,
        preview: text,
      });
    }
  });

  // Extract images
  row.find('img').each((_, el) => {
    const $el = $(el);
    const alt = $el.attr('alt') || 'Image';

    const elementId = getOrCreateId($el, 'img');
    $el.attr('data-element-type', 'image');

    const shortAlt = alt.length > 30 ? alt.substring(0, 30) + '...' : alt;

    elements.push({
      id: elementId,
      sectionId,
      type: 'image',
      tag: 'img',
      label: `Image: ${shortAlt}`,
      preview: alt,
    });
  });

  // Extract buttons (links with button-like styles)
  row.find('a').each((_, el) => {
    const $el = $(el);
    const style = $el.attr('style') || '';
    const text = $el.text().trim();

    const isButton = style.includes('background-color') ||
                     style.includes('background:') ||
                     $el.attr('role') === 'button';

    if (isButton && text.length > 0) {
      const elementId = getOrCreateId($el, 'button');
      $el.attr('data-element-type', 'button');

      elements.push({
        id: elementId,
        sectionId,
        type: 'button',
        tag: 'a',
        label: `Button: ${text.substring(0, 30)}${text.length > 30 ? '...' : ''}`,
        preview: text,
      });
    } else if (text.length > 0) {
      const elementId = getOrCreateId($el, 'link');
      $el.attr('data-element-type', 'link');

      elements.push({
        id: elementId,
        sectionId,
        type: 'link',
        tag: 'a',
        label: `Link: ${text.substring(0, 30)}${text.length > 30 ? '...' : ''}`,
        preview: text,
      });
    }
  });

  // Extract text blocks (p, span, div, td with substantial text content)
  row.find('p, span, div, td').each((_, el) => {
    const $el = $(el);
    const text = $el.text().trim();

    const hasStructuredChildren = $el.find('a, img, h1, h2, h3, h4, h5, h6, p, div, table').length > 0;
    const isInsideButton = $el.closest('[data-element-type="button"]').length > 0;

    if (text.length >= 3 && !hasStructuredChildren && !isInsideButton) {
      const elementId = getOrCreateId($el, 'text');
      $el.attr('data-element-type', 'text');

      elements.push({
        id: elementId,
        sectionId,
        type: 'text',
        tag: el.name,
        label: `Text: ${text.substring(0, 30)}${text.length > 30 ? '...' : ''}`,
        preview: text,
      });
    }
  });

  return elements;
}

function generateSectionLabel(
  row: cheerio.Cheerio<any>,
  $: cheerio.CheerioAPI,
  index: number
): string {
  const text = row.text().trim().toLowerCase();
  const images = row.find('img');
  const headings = row.find('h1, h2, h3');
  const links = row.find('a');
  const buttons = row.find('a[style*="background-color"]');

  // Helper: get first heading text, truncated
  const firstHeadingText = headings.length > 0
    ? headings.first().text().trim().replace(/\s+/g, ' ')
    : '';
  const headingSuffix = firstHeadingText
    ? ` — ${firstHeadingText.length > 25 ? firstHeadingText.substring(0, 25) + '…' : firstHeadingText}`
    : '';

  // Check for HR separator
  const hr = row.find('hr');
  if (hr.length > 0 && text.length < 10) {
    return 'Section: Divider';
  }

  // Check for footer (unsubscribe, copyright, legal text)
  if (text.includes('unsubscribe') || text.includes('©') || text.includes('copyright') ||
      text.includes('all rights reserved') || text.includes('manage your preferences')) {
    return 'Section: Footer';
  }

  // Check for header (logo + navigation)
  const hasLogo = images.filter((_, img) => {
    const src = $(img).attr('src') || '';
    const alt = $(img).attr('alt') || '';
    return src.includes('logo') || alt.toLowerCase().includes('logo');
  }).length > 0;

  const hasNav = links.length >= 3 && links.filter((_, a) => {
    const href = $(a).attr('href') || '';
    return href.includes('/') && !href.includes('instagram') && !href.includes('facebook');
  }).length >= 3;

  if (hasLogo && hasNav) {
    return 'Section: Header';
  }

  // Check for features grid (multiple feature boxes)
  const featureBoxes = row.find('table[style*="background-color:#f8f9fa"]');
  if (featureBoxes.length >= 2 || (headings.length > 0 && text.includes('engineered'))) {
    return `Section: Features${headingSuffix}`;
  }

  // Check for quote section (italic text, centered, no images)
  const hasItalic = row.find('p[style*="font-style:italic"]').length > 0;
  if (hasItalic && images.length === 0 && text.length > 50 && text.length < 300) {
    return 'Section: Quote';
  }

  // Check for product section (heading + price + button)
  const hasPrice = text.includes('eur') || text.includes('$') || /\d+[,.]00/.test(text);
  if (headings.length > 0 && hasPrice && buttons.length > 0) {
    return `Section: Product details${headingSuffix}`;
  }

  // Check for CTA section (button + large heading)
  if (buttons.length > 0 && headings.length > 0 && text.includes('?')) {
    return `Section: Call to action${headingSuffix}`;
  }

  // Check for text + image sections (zigzag layouts)
  if (images.length > 0 && headings.length > 0 && text.length > 100) {
    return `Section: Text + Image${headingSuffix}`;
  }

  // Check for image-only sections (just an image, minimal text)
  if (images.length > 0 && text.length < 50) {
    return 'Section: Image';
  }

  // Check for hero sections (large image at top)
  if (images.length > 0 && index < 3) {
    return `Section: Hero${headingSuffix}`;
  }

  // Check for image section
  if (images.length > 0) {
    return `Section: Image${headingSuffix}`;
  }

  // Text-only sections
  if (headings.length > 0) {
    return `Section: Text${headingSuffix}`;
  }

  // Last resort
  return `Section: ${index + 1}`;
}
