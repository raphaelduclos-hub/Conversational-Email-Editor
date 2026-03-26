'use client';

import { useState, useEffect, useRef } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { AlignLeft, AlignCenter, AlignRight, Upload, X, Bold, Italic, ArrowUpDown, ArrowLeftRight } from 'lucide-react';
import { EmailSection, EmailElement } from '@/components/preview/email-preview';

interface PropertyPanelProps {
  selectedSection: EmailSection | null;
  selectedElement: EmailElement | null;
  selectedElementIds?: string[];
  currentHtml: string;
  onHtmlUpdate: (html: string) => void;
  onClose?: () => void;
}

interface SectionProperties {
  backgroundColor: string;
  paddingV: string;
  paddingH: string;
  textAlign: string;
}

interface ImageProperties {
  src: string;
  alt: string;
  width: string;
  height: string;
  widthValue: string;
  widthUnit: 'px' | '%';
  borderRadius: string;
}

interface TextProperties {
  content: string;
  fontSize: string;
  fontWeight: string;
  fontStyle: string;
  textAlign: string;
  color: string;
  backgroundColor: string;
  paddingV: string;
  paddingH: string;
  borderRadius: string;
}

export function PropertyPanel({
  selectedSection,
  selectedElement,
  selectedElementIds,
  currentHtml,
  onHtmlUpdate,
  onClose
}: PropertyPanelProps) {
  const [properties, setProperties] = useState<SectionProperties>({
    backgroundColor: '',
    paddingV: '',
    paddingH: '',
    textAlign: ''
  });

  const [imageProperties, setImageProperties] = useState<ImageProperties>({
    src: '',
    alt: '',
    width: '',
    height: '',
    widthValue: '',
    widthUnit: 'px',
    borderRadius: ''
  });

  const [textProperties, setTextProperties] = useState<TextProperties>({
    content: '',
    fontSize: '',
    fontWeight: '',
    fontStyle: '',
    textAlign: '',
    color: '',
    backgroundColor: '',
    paddingV: '',
    paddingH: '',
    borderRadius: ''
  });

  // Store original HTML to support Discard
  const originalHtmlRef = useRef<string>(currentHtml);
  useEffect(() => {
    originalHtmlRef.current = currentHtml;
  // Only capture on mount / when selection changes, not on every update
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSection?.id, selectedElement?.id]);

  const hasChanges = currentHtml !== originalHtmlRef.current;

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSave = () => onClose?.();
  const handleDiscard = () => {
    onHtmlUpdate(originalHtmlRef.current);
    onClose?.();
  };
  // Extract properties from section HTML when section changes
  useEffect(() => {
    if (selectedSection) {
      const extracted = extractPropertiesFromHtml(selectedSection.html);
      setProperties(extracted);
    }
  }, [selectedSection]);

  // Extract image properties when element changes
  useEffect(() => {
    if (selectedElement && selectedElement.type === 'image') {
      const extracted = extractImageProperties(currentHtml, selectedElement.id);
      setImageProperties(extracted);
    }
  }, [selectedElement, currentHtml]);

  // Extract text properties when element changes
  useEffect(() => {
    if (selectedElement && ['text', 'heading', 'button', 'link'].includes(selectedElement.type)) {
      const extracted = extractTextProperties(currentHtml, selectedElement.id);
      setTextProperties(extracted);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedElement?.id]);

  // Handler functions (must be before JSX)
  const handleImagePropertyChange = (property: keyof ImageProperties, value: string) => {
    if (!selectedElement) return;

    setImageProperties(prev => ({ ...prev, [property]: value }));

    // Update HTML immediately
    const updatedHtml = updateImageProperties(
      currentHtml,
      selectedElement.id,
      { ...imageProperties, [property]: value }
    );

    onHtmlUpdate(updatedHtml);
  };

  const handleTextPropertyChange = (property: keyof TextProperties, value: string) => {
    if (!selectedElement) return;

    setTextProperties(prev => ({ ...prev, [property]: value }));

    // Update HTML immediately
    const updatedHtml = updateTextProperties(
      currentHtml,
      selectedElement.id,
      { ...textProperties, [property]: value }
    );

    onHtmlUpdate(updatedHtml);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedElement) return;

    // Check file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    // Check file size (max 2MB for base64)
    if (file.size > 2 * 1024 * 1024) {
      alert('Image is too large (max 2MB). Please use a smaller image or paste a URL.');
      return;
    }

    // Read file and convert to data URL
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) {
        // Update image src with data URL
        handleImagePropertyChange('src', dataUrl);
      }
    };
    reader.onerror = () => {
      alert('Failed to read image file');
    };
    reader.readAsDataURL(file);

    // Reset input
    e.target.value = '';
  };

  const handleWidthChange = (value: string, unit: 'px' | '%') => {
    if (!selectedElement) return;

    const newWidth = value ? `${value}${unit}` : '';
    console.log('Width change:', { value, unit, newWidth, elementId: selectedElement.id });

    setImageProperties(prev => ({
      ...prev,
      widthValue: value,
      widthUnit: unit,
      width: newWidth
    }));

    // Update HTML immediately with new properties
    const updatedHtml = updateImageProperties(
      currentHtml,
      selectedElement.id,
      {
        ...imageProperties,
        width: newWidth,
        widthValue: value,
        widthUnit: unit
      }
    );

    console.log('HTML updated:', updatedHtml !== currentHtml);
    onHtmlUpdate(updatedHtml);
  };

  const handleBulkStyleUpdate = (cssProp: string, value: string) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(currentHtml, 'text/html');
    const ids = selectedElementIds || [];
    ids.forEach(eid => {
      const el = doc.querySelector(`[data-element-id="${eid}"]`);
      if (!el) return;
      const styles = parseInlineStyles(el.getAttribute('style') || '');
      if (value) {
        styles[cssProp] = value;
      } else {
        delete styles[cssProp];
      }
      el.setAttribute('style', Object.entries(styles).map(([k, v]) => `${k}:${v}`).join(';'));
    });
    onHtmlUpdate(doc.body.innerHTML);
  };

  // Guard: require either section or element
  if (!selectedSection && !selectedElement) {
    return null;
  }

  // Bulk edit mode
  if (selectedElement && selectedElementIds && selectedElementIds.length > 1) {
    const isBulkImage = selectedElement.type === 'image';
    const isBulkText = ['text', 'heading', 'button', 'link'].includes(selectedElement.type);
    const count = selectedElementIds.length;

    return (
      <div className="flex flex-col h-full bg-background border-r border-border">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-medium text-foreground">
            {count} {selectedElement.tag.toUpperCase()} selected
          </h2>
          {onClose && (
            <button onClick={onClose} className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex-shrink-0">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <p className="text-xs text-muted-foreground">Changes apply to all {count} selected elements.</p>

          {isBulkText && (
            <>
              <div className="flex items-center justify-between">
                <Label className="text-base font-normal">Typography</Label>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleBulkStyleUpdate('font-weight', textProperties.fontWeight === 'bold' ? '' : 'bold')}
                    className={`h-9 w-9 flex items-center justify-center rounded-md border border-input transition-colors ${textProperties.fontWeight === 'bold' ? 'bg-muted' : 'bg-background hover:bg-muted/50'}`}
                  >
                    <Bold className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleBulkStyleUpdate('font-style', textProperties.fontStyle === 'italic' ? '' : 'italic')}
                    className={`h-9 w-9 flex items-center justify-center rounded-md border border-input transition-colors ${textProperties.fontStyle === 'italic' ? 'bg-muted' : 'bg-background hover:bg-muted/50'}`}
                  >
                    <Italic className="h-4 w-4" />
                  </button>
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      placeholder="px"
                      className="w-16 h-9 text-right"
                      min="0"
                      onChange={(e) => handleBulkStyleUpdate('font-size', e.target.value ? `${e.target.value}px` : '')}
                    />
                    <span className="text-sm text-muted-foreground">px</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <Label className="text-base font-normal">Text color</Label>
                <input
                  type="color"
                  defaultValue="#000000"
                  onChange={(e) => handleBulkStyleUpdate('color', e.target.value)}
                  className="w-16 h-10 p-1 rounded-lg cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-between">
                <Label className="text-base font-normal">Alignment</Label>
                <ToggleGroup type="single" onValueChange={(value) => value && handleBulkStyleUpdate('text-align', value)}>
                  <ToggleGroupItem value="left"><AlignLeft className="h-4 w-4" /></ToggleGroupItem>
                  <ToggleGroupItem value="center"><AlignCenter className="h-4 w-4" /></ToggleGroupItem>
                  <ToggleGroupItem value="right"><AlignRight className="h-4 w-4" /></ToggleGroupItem>
                </ToggleGroup>
              </div>
            </>
          )}

          {isBulkImage && (
            <div className="flex items-center justify-between">
              <Label className="text-base font-normal">Rounded corners</Label>
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  placeholder="0"
                  className="w-16 h-9 text-right"
                  min="0"
                  onChange={(e) => handleBulkStyleUpdate('border-radius', e.target.value ? `${e.target.value}px` : '')}
                />
                <span className="text-sm text-muted-foreground">px</span>
              </div>
            </div>
          )}
        </div>

        <ActionBar onDiscard={handleDiscard} hasChanges={hasChanges} />
      </div>
    );
  }

  // Handle image element
  if (selectedElement && selectedElement.type === 'image') {
    return (
      <div className="flex flex-col h-full bg-background border-r border-border">
        {/* Header */}
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-medium text-foreground truncate pr-2">
            {selectedElement.label}
          </h2>
          {onClose && (
            <button onClick={onClose} className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex-shrink-0">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Properties form */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Image preview */}
          <div className="rounded-lg overflow-hidden bg-gray-100 border border-border">
            {imageProperties.src ? (
              <img src={imageProperties.src} alt={imageProperties.alt} className="w-full h-auto object-contain" style={{ maxHeight: '200px' }} />
            ) : (
              <div className="w-full h-32 flex items-center justify-center text-muted-foreground text-sm">No image</div>
            )}
          </div>
          {imageProperties.width && imageProperties.height && (
            <p className="text-xs text-muted-foreground text-center -mt-2">
              {imageProperties.width} × {imageProperties.height} px
            </p>
          )}

          <div className="space-y-2">
            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} className="w-full">
              <Upload className="h-4 w-4 mr-2" />
              Replace
            </Button>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload(e)} />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="width" className="text-base font-normal">Width</Label>
            <div className="flex items-center gap-2">
              <Input id="width" type="number" value={imageProperties.widthValue} onChange={(e) => handleWidthChange(e.target.value, imageProperties.widthUnit)} placeholder="600" className="w-24 text-right" min="0" />
              <select value={imageProperties.widthUnit} onChange={(e) => handleWidthChange(imageProperties.widthValue, e.target.value as 'px' | '%')} className="h-10 px-3 rounded-md border border-input bg-background text-sm">
                <option value="px">px</option>
                <option value="%">%</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <Label className="text-base font-normal">Rounded corners</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={imageProperties.borderRadius.replace('px', '')}
                onChange={(e) => handleImagePropertyChange('borderRadius', e.target.value ? `${e.target.value}px` : '')}
                placeholder="0"
                className="w-24 text-right"
                min="0"
              />
              <span className="text-sm text-muted-foreground w-6">px</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="image-url" className="text-sm font-medium">Image URL</Label>
            <Input id="image-url" type="url" value={imageProperties.src} onChange={(e) => handleImagePropertyChange('src', e.target.value)} placeholder="https://..." />
          </div>

          <div className="space-y-2">
            <Label htmlFor="alt-text" className="text-sm font-medium">Alt text</Label>
            <Input id="alt-text" type="text" value={imageProperties.alt} onChange={(e) => handleImagePropertyChange('alt', e.target.value)} placeholder="Describe the image..." />
          </div>
        </div>

        {/* Action bar */}
        <ActionBar onDiscard={handleDiscard} hasChanges={hasChanges} />
      </div>
    );
  }

  // Handle text element types
  if (selectedElement && ['text', 'heading', 'button', 'link'].includes(selectedElement.type)) {
    return (
      <div className="flex flex-col h-full bg-background border-r border-border">
        {/* Header */}
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-medium text-foreground truncate pr-2">
            {selectedElement.label}
          </h2>
          {onClose && (
            <button onClick={onClose} className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex-shrink-0">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Content textarea */}
        <div className="p-4 border-b border-border">
          <Label htmlFor="text-content" className="text-sm font-medium">Content</Label>
          <textarea
            id="text-content"
            rows={4}
            value={textProperties.content}
            onChange={(e) => handleTextPropertyChange('content', e.target.value)}
            className="mt-1.5 w-full resize-none text-sm rounded-md border border-input bg-background px-3 py-2 ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        </div>

        {/* Properties form */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-base font-normal">Typography</Label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleTextPropertyChange('fontWeight', textProperties.fontWeight === 'bold' ? '' : 'bold')}
                className={`h-9 w-9 flex items-center justify-center rounded-md border border-input transition-colors ${textProperties.fontWeight === 'bold' ? 'bg-muted' : 'bg-background hover:bg-muted/50'}`}
                aria-label="Toggle bold"
              >
                <Bold className="h-4 w-4" />
              </button>
              <button
                onClick={() => handleTextPropertyChange('fontStyle', textProperties.fontStyle === 'italic' ? '' : 'italic')}
                className={`h-9 w-9 flex items-center justify-center rounded-md border border-input transition-colors ${textProperties.fontStyle === 'italic' ? 'bg-muted' : 'bg-background hover:bg-muted/50'}`}
                aria-label="Toggle italic"
              >
                <Italic className="h-4 w-4" />
              </button>
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  value={textProperties.fontSize}
                  onChange={(e) => handleTextPropertyChange('fontSize', e.target.value)}
                  placeholder="16"
                  className="w-16 h-9 text-right"
                  min="0"
                />
                <span className="text-sm text-muted-foreground">px</span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="text-color" className="text-base font-normal">Text color</Label>
            <input
              id="text-color"
              type="color"
              value={textProperties.color || '#000000'}
              onChange={(e) => handleTextPropertyChange('color', e.target.value)}
              className="w-16 h-10 p-1 rounded-lg cursor-pointer"
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="text-bg-color" className="text-base font-normal">Background color</Label>
            <input
              id="text-bg-color"
              type="color"
              value={textProperties.backgroundColor || '#ffffff'}
              onChange={(e) => handleTextPropertyChange('backgroundColor', e.target.value)}
              className="w-16 h-10 p-1 rounded-lg cursor-pointer"
            />
          </div>

          <div className="flex items-center justify-between">
            <Label className="text-base font-normal">Alignment</Label>
            <ToggleGroup type="single" value={textProperties.textAlign} onValueChange={(value) => value && handleTextPropertyChange('textAlign', value)}>
              <ToggleGroupItem value="left" aria-label="Align left"><AlignLeft className="h-4 w-4" /></ToggleGroupItem>
              <ToggleGroupItem value="center" aria-label="Align center"><AlignCenter className="h-4 w-4" /></ToggleGroupItem>
              <ToggleGroupItem value="right" aria-label="Align right"><AlignRight className="h-4 w-4" /></ToggleGroupItem>
            </ToggleGroup>
          </div>

          {selectedElement.type === 'button' && (
            <div className="flex items-center justify-between">
              <Label htmlFor="border-radius" className="text-base font-normal">Rounded corners</Label>
              <div className="flex items-center gap-1">
                <Input id="border-radius" type="number" value={textProperties.borderRadius.replace('px', '')} onChange={(e) => handleTextPropertyChange('borderRadius', e.target.value ? `${e.target.value}px` : '')} placeholder="4" className="w-16 h-9 text-right" min="0" />
                <span className="text-sm text-muted-foreground">px</span>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <Label className="text-base font-normal">Padding</Label>
            <div className="flex items-center gap-2">
              <ArrowUpDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <Input type="number" value={textProperties.paddingV} onChange={(e) => handleTextPropertyChange('paddingV', e.target.value)} placeholder="0" className="w-16 h-9 text-right" min="0" />
              <span className="text-sm text-muted-foreground">px</span>
              <ArrowLeftRight className="h-4 w-4 text-muted-foreground flex-shrink-0 ml-1" />
              <Input type="number" value={textProperties.paddingH} onChange={(e) => handleTextPropertyChange('paddingH', e.target.value)} placeholder="0" className="w-16 h-9 text-right" min="0" />
              <span className="text-sm text-muted-foreground">px</span>
            </div>
          </div>
        </div>

        {/* Action bar */}
        <ActionBar onDiscard={handleDiscard} hasChanges={hasChanges} />
      </div>
    );
  }

  // Handle other element types (not yet implemented)
  if (!selectedSection) {
    return (
      <div className="flex flex-col h-full bg-background border-r border-border p-4">
        <p className="text-sm text-muted-foreground">
          Element properties coming soon...
        </p>
      </div>
    );
  }

  const handlePropertyChange = (property: keyof SectionProperties, value: string) => {
    console.log('=== PROPERTY CHANGE ===');
    console.log('Property:', property);
    console.log('Value:', value);
    console.log('Section ID:', selectedSection?.id);

    setProperties(prev => ({ ...prev, [property]: value }));

    // Update HTML immediately
    if (selectedSection) {
      const updatedHtml = updateSectionProperties(
        currentHtml,
        selectedSection.id,
        { ...properties, [property]: value }
      );

      console.log('Updated HTML length:', updatedHtml.length);
      console.log('HTML changed:', updatedHtml !== currentHtml);

      onHtmlUpdate(updatedHtml);
    }
  };

  return (
    <div className="flex flex-col h-full bg-background border-r border-border">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <h2 className="text-sm font-medium text-foreground truncate pr-2">
          {selectedSection.label}
        </h2>
        {onClose && (
          <button onClick={onClose} className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex-shrink-0">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Properties form */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="flex items-center justify-between">
          <Label htmlFor="bg-color" className="text-base font-normal">Background color</Label>
          <Input id="bg-color" type="color" value={properties.backgroundColor || '#ffffff'} onChange={(e) => handlePropertyChange('backgroundColor', e.target.value)} className="w-16 h-10 p-1 cursor-pointer rounded-lg" />
        </div>

        <div className="flex items-center justify-between">
          <Label className="text-base font-normal">Alignment</Label>
          <ToggleGroup type="single" value={properties.textAlign} onValueChange={(value) => value && handlePropertyChange('textAlign', value)}>
            <ToggleGroupItem value="left" aria-label="Align left"><AlignLeft className="h-4 w-4" /></ToggleGroupItem>
            <ToggleGroupItem value="center" aria-label="Align center"><AlignCenter className="h-4 w-4" /></ToggleGroupItem>
            <ToggleGroupItem value="right" aria-label="Align right"><AlignRight className="h-4 w-4" /></ToggleGroupItem>
          </ToggleGroup>
        </div>

        <div className="flex items-center justify-between">
          <Label className="text-base font-normal">Padding</Label>
          <div className="flex items-center gap-2">
            <ArrowUpDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <Input type="number" value={properties.paddingV} onChange={(e) => handlePropertyChange('paddingV', e.target.value)} placeholder="0" className="w-16 h-9 text-right" min="0" />
            <span className="text-sm text-muted-foreground">px</span>
            <ArrowLeftRight className="h-4 w-4 text-muted-foreground flex-shrink-0 ml-1" />
            <Input type="number" value={properties.paddingH} onChange={(e) => handlePropertyChange('paddingH', e.target.value)} placeholder="0" className="w-16 h-9 text-right" min="0" />
            <span className="text-sm text-muted-foreground">px</span>
          </div>
        </div>
      </div>

      {/* Action bar */}
      <ActionBar onDiscard={handleDiscard} hasChanges={hasChanges} />
    </div>
  );
}

function ActionBar({ onDiscard, hasChanges }: {
  onDiscard: () => void;
  hasChanges: boolean;
}) {
  return (
    <div className="px-4 py-3 border-t border-border flex items-center justify-end bg-background">
      <Button variant="outline" size="sm" onClick={onDiscard} disabled={!hasChanges}>
        Discard changes
      </Button>
    </div>
  );
}

// Helper to split a CSS padding shorthand into vertical and horizontal values (numbers only)
function parsePaddingVH(padding: string): { v: string; h: string } {
  if (!padding) return { v: '', h: '' };
  const parts = padding.trim().split(/\s+/);
  const toNum = (s: string) => s.replace('px', '').trim();
  if (parts.length === 1) {
    const v = toNum(parts[0]);
    return { v, h: v };
  }
  return { v: toNum(parts[0]), h: toNum(parts[1]) };
}

// Helper function to extract properties from section HTML
function extractPropertiesFromHtml(html: string): SectionProperties {
  const properties: SectionProperties = {
    backgroundColor: '',
    paddingV: '',
    paddingH: '',
    textAlign: ''
  };

  // Parse inline styles from the <tr> or <td> elements
  const bgColorMatch = html.match(/background-color:\s*([^;}"]+)/i) ||
                       html.match(/bgcolor=["']([^"']+)["']/i);
  if (bgColorMatch) {
    properties.backgroundColor = bgColorMatch[1].trim();
  }

  const paddingMatch = html.match(/padding:\s*([^;}"]+)/i);
  if (paddingMatch) {
    const { v, h } = parsePaddingVH(paddingMatch[1].trim());
    properties.paddingV = v;
    properties.paddingH = h;
  }

  const textAlignMatch = html.match(/text-align:\s*([^;}"]+)/i);
  if (textAlignMatch) {
    properties.textAlign = textAlignMatch[1].trim();
  }

  return properties;
}

// Helper function to update section properties in full HTML
function updateSectionProperties(
  fullHtml: string,
  sectionId: string,
  properties: SectionProperties
): string {
  console.log('updateSectionProperties called');
  console.log('Section ID:', sectionId);
  console.log('Properties:', properties);

  // Use DOMParser for client-side HTML parsing
  const parser = new DOMParser();
  const doc = parser.parseFromString(fullHtml, 'text/html');

  // Find the section row
  const sectionRow = doc.querySelector(`[data-section-id="${sectionId}"]`);

  if (!sectionRow) {
    console.warn('Section not found:', sectionId);
    return fullHtml;
  }

  console.log('Section found!');

  // Strategy: Find the main content table (width="600" is standard for email sections)
  // Apply styles to the first <td> inside that table
  const mainTable = sectionRow.querySelector('table[width="600"]') ||
                    sectionRow.querySelector('table[width="100%"]') ||
                    sectionRow.querySelector('table');

  if (mainTable) {
    // Find the first <td> in the main table - this is typically the content container
    const contentCell = mainTable.querySelector('td');

    if (contentCell) {
      const existingStyle = contentCell.getAttribute('style') || '';
      const styles = parseInlineStyles(existingStyle);

      // Only update properties that have values
      if (properties.backgroundColor) {
        styles['background-color'] = properties.backgroundColor;
      }
      if (properties.paddingV || properties.paddingH) {
        styles['padding'] = `${properties.paddingV || 0}px ${properties.paddingH || 0}px`;
      }

      const newStyle = Object.entries(styles)
        .map(([key, value]) => `${key}:${value}`)
        .join(';');
      contentCell.setAttribute('style', newStyle);
    }
  }

  // Update text alignment on all text elements
  if (properties.textAlign) {
    // Apply to all text containers within the section
    const textElements = sectionRow.querySelectorAll('p, h1, h2, h3, h4, h5, h6, td');
    textElements.forEach((el) => {
      const existingStyle = el.getAttribute('style') || '';
      const styles = parseInlineStyles(existingStyle);
      styles['text-align'] = properties.textAlign;
      const newStyle = Object.entries(styles)
        .map(([key, value]) => `${key}:${value}`)
        .join(';');
      el.setAttribute('style', newStyle);
    });
  }

  console.log('Properties applied successfully');

  // Return the full HTML (body content)
  return doc.body.innerHTML;
}

// Helper to parse inline styles string into object
function parseInlineStyles(styleString: string): Record<string, string> {
  const styles: Record<string, string> = {};
  if (!styleString) return styles;

  styleString.split(';').forEach(rule => {
    const [key, value] = rule.split(':').map(s => s.trim());
    if (key && value) {
      styles[key] = value;
    }
  });

  return styles;
}

// Helper function to extract image properties from HTML
function extractImageProperties(fullHtml: string, elementId: string): ImageProperties {
  const parser = new DOMParser();
  const doc = parser.parseFromString(fullHtml, 'text/html');

  const img = doc.querySelector(`img[data-element-id="${elementId}"]`);

  if (!img) {
    return { src: '', alt: '', width: '', height: '', widthValue: '', widthUnit: 'px', borderRadius: '' };
  }

  const width = img.getAttribute('width') || '';

  // Parse width to extract value and unit
  let widthValue = '';
  let widthUnit: 'px' | '%' = 'px';

  if (width) {
    const match = width.match(/^(\d+)(px|%)?$/);
    if (match) {
      widthValue = match[1];
      widthUnit = (match[2] as 'px' | '%') || 'px';
    }
  }

  const imgStyle = parseInlineStyles(img.getAttribute('style') || '');

  return {
    src: img.getAttribute('src') || '',
    alt: img.getAttribute('alt') || '',
    width: width,
    height: img.getAttribute('height') || '',
    widthValue,
    widthUnit,
    borderRadius: imgStyle['border-radius'] || ''
  };
}

// Helper function to update image properties in full HTML
function updateImageProperties(
  fullHtml: string,
  elementId: string,
  properties: ImageProperties
): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(fullHtml, 'text/html');

  const img = doc.querySelector(`img[data-element-id="${elementId}"]`);

  if (!img) {
    console.warn('Image not found:', elementId);
    return fullHtml;
  }

  // Update image attributes
  if (properties.src) {
    img.setAttribute('src', properties.src);
  }
  if (properties.alt !== undefined) {
    img.setAttribute('alt', properties.alt);
  }
  if (properties.width !== undefined) {
    // Get existing inline styles
    const existingStyle = img.getAttribute('style') || '';
    const styles = parseInlineStyles(existingStyle);

    if (properties.width) {
      // Update width in INLINE STYLE (not attribute) - this is what actually works in emails
      styles['width'] = properties.width;
      styles['height'] = 'auto';

      // Center the image to avoid grey zones when resizing
      styles['display'] = 'block';
      styles['margin-left'] = 'auto';
      styles['margin-right'] = 'auto';

      // Also update the attribute for compatibility
      const widthValue = properties.width.replace(/px$/, '');
      img.setAttribute('width', widthValue);
      img.removeAttribute('height');
    } else {
      // Remove width from style
      delete styles['width'];
      img.removeAttribute('width');
    }

    // Apply border-radius
    if (properties.borderRadius) {
      styles['border-radius'] = properties.borderRadius;
    } else {
      delete styles['border-radius'];
    }

    // Apply all styles
    const newStyle = Object.entries(styles)
      .map(([key, value]) => `${key}:${value}`)
      .join(';');
    img.setAttribute('style', newStyle);
  }

  return doc.body.innerHTML;
}

// Helper function to extract text properties from HTML
function extractTextProperties(fullHtml: string, elementId: string): TextProperties {
  const parser = new DOMParser();
  const doc = parser.parseFromString(fullHtml, 'text/html');

  const el = doc.querySelector(`[data-element-id="${elementId}"]`);

  if (!el) {
    return {
      content: '',
      fontSize: '',
      fontWeight: '',
      fontStyle: '',
      textAlign: '',
      color: '',
      backgroundColor: '',
      paddingV: '',
      paddingH: '',
      borderRadius: ''
    };
  }

  const existingStyle = el.getAttribute('style') || '';
  const styles = parseInlineStyles(existingStyle);

  // Extract font-size and strip 'px'
  let fontSize = styles['font-size'] || '';
  if (fontSize.endsWith('px')) {
    fontSize = fontSize.replace('px', '');
  }

  return {
    content: (el.textContent || '').replace(/\s+/g, ' ').trim(),
    fontSize,
    fontWeight: styles['font-weight'] || '',
    fontStyle: styles['font-style'] || '',
    textAlign: styles['text-align'] || '',
    color: styles['color'] || '',
    backgroundColor: styles['background-color'] || '',
    paddingV: parsePaddingVH(styles['padding'] || '').v,
    paddingH: parsePaddingVH(styles['padding'] || '').h,
    borderRadius: styles['border-radius'] || ''
  };
}

// Helper function to update text properties in full HTML
function updateTextProperties(
  fullHtml: string,
  elementId: string,
  properties: TextProperties
): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(fullHtml, 'text/html');

  const el = doc.querySelector(`[data-element-id="${elementId}"]`);

  if (!el) {
    console.warn('Text element not found:', elementId);
    return fullHtml;
  }

  // Update text content — preserve child element structure (e.g. <span> inside buttons)
  const normalizedCurrent = (el.textContent || '').replace(/\s+/g, ' ').trim();
  if (normalizedCurrent !== properties.content) {
    if (el.children.length === 0) {
      // No child elements: safe to replace textContent directly
      el.textContent = properties.content;
    } else {
      // Has child elements: update text nodes in place to preserve structure
      const walker = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      const textNodes: Node[] = [];
      let node: Node | null;
      while ((node = walker.nextNode())) {
        if ((node.textContent || '').trim()) textNodes.push(node);
      }
      if (textNodes.length === 1) {
        textNodes[0].textContent = properties.content;
      } else if (textNodes.length === 0) {
        el.textContent = properties.content;
      }
      // multiple text nodes: ambiguous, skip content update
    }
  }

  // Build styles from existing
  const existingStyle = el.getAttribute('style') || '';
  const styles = parseInlineStyles(existingStyle);

  // Set or remove each property
  if (properties.fontSize) {
    styles['font-size'] = `${properties.fontSize}px`;
  } else {
    delete styles['font-size'];
  }

  if (properties.fontWeight) {
    styles['font-weight'] = properties.fontWeight;
  } else {
    delete styles['font-weight'];
  }

  if (properties.fontStyle) {
    styles['font-style'] = properties.fontStyle;
  } else {
    delete styles['font-style'];
  }

  if (properties.textAlign) {
    styles['text-align'] = properties.textAlign;
  } else {
    delete styles['text-align'];
  }

  if (properties.color) {
    styles['color'] = properties.color;
  } else {
    delete styles['color'];
  }

  if (properties.backgroundColor) {
    styles['background-color'] = properties.backgroundColor;
  } else {
    delete styles['background-color'];
  }

  if (properties.paddingV || properties.paddingH) {
    styles['padding'] = `${properties.paddingV || 0}px ${properties.paddingH || 0}px`;
  } else {
    delete styles['padding'];
  }

  if (properties.borderRadius) {
    styles['border-radius'] = properties.borderRadius;
  } else {
    delete styles['border-radius'];
  }

  // Serialize back
  const newStyle = Object.entries(styles)
    .map(([key, value]) => `${key}:${value}`)
    .join(';');

  if (newStyle) {
    el.setAttribute('style', newStyle);
  } else {
    el.removeAttribute('style');
  }

  return doc.body.innerHTML;
}
