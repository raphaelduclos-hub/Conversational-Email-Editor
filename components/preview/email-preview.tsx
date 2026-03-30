'use client';

import { useEffect, useState, useRef } from 'react';

export interface EmailSection {
  id: string;
  html: string;
  label: string;
  index: number;
}

export type ElementType = 'heading' | 'button' | 'image' | 'text' | 'link';

export interface EmailElement {
  id: string;
  sectionId: string;
  type: ElementType;
  tag: string;
  label: string;
  preview: string;
}

interface EmailPreviewProps {
  html: string;
  selectedSectionIds?: string[];
  selectedElementIds?: string[];
  onSectionSelect?: (section: EmailSection | null, newSectionIds: string[], newElementIds: string[]) => void;
  onElementSelect?: (element: EmailElement | null, newSectionIds: string[], newElementIds: string[]) => void;
  onAnnotatedHtmlReady?: (annotatedHtml: string) => void;
  onToolbarAction?: (action: 'delete' | 'move-up' | 'move-down', sectionId: string, elementId?: string | null, selectedSectionIds?: string[], selectedElementIds?: string[]) => void;
  isLoading?: boolean;
}

export function EmailPreview({
  html,
  selectedSectionIds,
  selectedElementIds,
  onSectionSelect,
  onElementSelect,
  onAnnotatedHtmlReady,
  onToolbarAction,
  isLoading
}: EmailPreviewProps) {
  const [sections, setSections] = useState<EmailSection[]>([]);
  const [elements, setElements] = useState<EmailElement[]>([]);
  const [enhancedHtml, setEnhancedHtml] = useState(html);
  const [iframeHeight, setIframeHeight] = useState<number>(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const selectionRef = useRef({ selectedSectionIds: selectedSectionIds || [], selectedElementIds: selectedElementIds || [] });

  // Parse sections when HTML changes
  useEffect(() => {
    let stale = false;

    const parseSections = async () => {
      try {
        const response = await fetch('/api/parse-sections', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ html }),
        });

        if (stale) return;

        if (!response.ok) {
          console.error('Failed to parse sections');
          setSections([]);
          setEnhancedHtml(html);
          return;
        }

        const data = await response.json();
        if (stale) return;

        setSections(data.sections || []);
        setElements(data.elements || []);

        const htmlWithIds = data.annotatedHtml || html;

        if (onAnnotatedHtmlReady && data.annotatedHtml && data.annotatedHtml !== html) {
          onAnnotatedHtmlReady(data.annotatedHtml);
        }

        const scriptInjectedHtml = injectInteractionScript(htmlWithIds, data.sections || [], data.elements || []);
        setEnhancedHtml(scriptInjectedHtml);
      } catch (error) {
        if (stale) return;
        console.error('Error parsing sections:', error);
        setSections([]);
        setEnhancedHtml(html);
      }
    };

    parseSections();
    return () => { stale = true; };
  }, [html]);

  // Listen for messages from iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'section-click') {
        const sectionId = event.data.sectionId;
        const section = sectionId ? sections.find(s => s.id === sectionId) : null;
        const newSectionIds: string[] = event.data.selectedSectionIds || [];
        const newElementIds: string[] = event.data.selectedElementIds || [];
        if (onSectionSelect) {
          onSectionSelect(section || null, newSectionIds, newElementIds);
        }
      } else if (event.data?.type === 'element-click') {
        const elementId = event.data.elementId;
        const element = elementId ? elements.find(e => e.id === elementId) : null;
        const newSectionIds: string[] = event.data.selectedSectionIds || [];
        const newElementIds: string[] = event.data.selectedElementIds || [];
        if (onElementSelect) {
          onElementSelect(element || null, newSectionIds, newElementIds);
        }
      } else if (event.data?.type === 'toolbar-action') {
        const { action, sectionId, elementId, selectedSectionIds: allSids, selectedElementIds: allEids } = event.data;
        if (onToolbarAction && sectionId) {
          onToolbarAction(action, sectionId, elementId, allSids, allEids);
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [sections, elements, onSectionSelect, onElementSelect, onToolbarAction]);

  // Update highlight when selection arrays change
  useEffect(() => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage(
        {
          type: 'update-selection',
          selectedSectionIds: selectedSectionIds || [],
          selectedElementIds: selectedElementIds || [],
        },
        '*'
      );
    }
  }, [selectedSectionIds, selectedElementIds]);

  // Keep ref in sync so onLoad can read the latest selection
  selectionRef.current = { selectedSectionIds: selectedSectionIds || [], selectedElementIds: selectedElementIds || [] };

  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Only deselect when clicking directly on the grey background (not the email)
    if (e.target === e.currentTarget) {
      if (onSectionSelect) onSectionSelect(null, [], []);
      if (onElementSelect) onElementSelect(null, [], []);
    }
  };

  return (
    <div className="min-h-full w-full bg-zinc-100 flex items-start justify-center py-16" onClick={handleCanvasClick}>
      <div
        className={`w-[800px] bg-white shadow-xl transition-all duration-500 ${
          isLoading ? 'blur-sm opacity-60 animate-pulse-slow' : 'blur-0 opacity-100'
        }`}
      >
        <iframe
          ref={iframeRef}
          srcDoc={enhancedHtml}
          sandbox="allow-same-origin allow-scripts"
          title="Email Preview"
          className="w-full border-0 block"
          style={{
            colorScheme: 'normal',
            height: iframeHeight > 0 ? `${iframeHeight}px` : 'auto',
          }}
          onLoad={(e) => {
            const iframe = e.currentTarget;
            if (iframe.contentWindow) {
              const height = iframe.contentWindow.document.body.scrollHeight;
              setIframeHeight(height);
              // Re-apply selection after iframe reloads (e.g. after move/delete)
              const { selectedSectionIds: sids, selectedElementIds: eids } = selectionRef.current;
              if (sids.length > 0 || eids.length > 0) {
                iframe.contentWindow.postMessage(
                  { type: 'update-selection', selectedSectionIds: sids, selectedElementIds: eids },
                  '*'
                );
              }
            }
          }}
        />
      </div>
    </div>
  );
}

function injectInteractionScript(html: string, sections: EmailSection[], elements: EmailElement[]): string {
  const sectionLabels = Object.fromEntries(sections.map(s => [s.id, s.label]));
  const elementLabels = Object.fromEntries(elements.map(e => [e.id, e.label]));
  const elementToSection = Object.fromEntries(elements.map(e => [e.id, e.sectionId]));

  const script = `
    <style>
      /* Remove all scrollbars from iframe - parent page handles scrolling */
      html, body {
        overflow: hidden !important;
        margin: 0 !important;
        padding: 0 !important;
        display: flex !important;
        justify-content: center !important;
        background: transparent !important;
      }
      /* Force email to stay at 600px max and center it */
      body > table {
        max-width: 600px !important;
        width: 600px !important;
        margin: 0 auto !important;
      }
      #interaction-label {
        position: fixed;
        z-index: 9999;
        background: #818cf8;
        color: white;
        font-size: 11px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-weight: 500;
        padding: 2px 8px;
        border-radius: 4px;
        pointer-events: none;
        white-space: nowrap;
        display: none;
        box-shadow: 0 1px 3px rgba(0,0,0,0.2);
      }
      #elem-toolbar {
        position: fixed;
        z-index: 10000;
        display: none;
        align-items: center;
        gap: 2px;
        background: white;
        border: 1px solid #e4e4e7;
        border-radius: 12px;
        padding: 5px 8px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.12);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }
      #elem-toolbar button {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        border: none;
        background: transparent;
        border-radius: 6px;
        cursor: pointer;
        color: #3f3f46;
        transition: background 0.1s;
      }
      #elem-toolbar button:hover { background: #f4f4f5; }
      #elem-toolbar .tb-sep {
        width: 1px;
        height: 18px;
        background: #e4e4e7;
        margin: 0 2px;
        flex-shrink: 0;
      }
      #elem-toolbar #tb-similar { color: #3f3f46; }
      #elem-toolbar #tb-del { color: #ef4444; }
      #elem-toolbar #tb-del:hover { background: #fef2f2; }
      #elem-toolbar button:disabled { opacity: 0.3; cursor: default; }
      #elem-toolbar button:disabled:hover { background: transparent; }
      #elem-toolbar #tb-count {
        display: none;
        font-size: 11px;
        color: #71717a;
        padding: 0 6px;
        white-space: nowrap;
      }
      #tb-tooltip {
        position: fixed;
        z-index: 10001;
        background: #18181b;
        color: #fafafa;
        font-size: 11px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        padding: 4px 8px;
        border-radius: 6px;
        pointer-events: none;
        white-space: nowrap;
        opacity: 0;
        transition: opacity 0.12s ease;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      }
      #tb-tooltip::after {
        content: '';
        position: absolute;
        top: 100%;
        left: 50%;
        transform: translateX(-50%);
        border: 4px solid transparent;
        border-top-color: #18181b;
      }
    </style>
    <script>
      (function() {
        let hoveredSectionId = null;
        let hoveredElementId = null;
        let selectedSectionIds = [];
        let selectedElementIds = [];

        const sectionLabels = ${JSON.stringify(sectionLabels)};
        const elementLabels = ${JSON.stringify(elementLabels)};
        const elementToSection = ${JSON.stringify(elementToSection)};
        const elementTags = ${JSON.stringify(Object.fromEntries(elements.map(e => [e.id, e.tag])))};
        const elementTypes = ${JSON.stringify(Object.fromEntries(elements.map(e => [e.id, e.type])))};

        let toolbarSectionId = null;
        let toolbarElementId = null;
        const sectionIds = ${JSON.stringify(sections.map(s => s.id))};
        const elementIds = ${JSON.stringify(elements.map(e => e.id))};

        // Built lazily on first tb-similar click (needs DOM to be ready)
        var elementStyleSigs = null;
        function buildStyleSigs() {
          if (elementStyleSigs) return;
          elementStyleSigs = {};
          elementIds.forEach(function(eid) {
            var el = document.querySelector('[data-element-id="' + eid + '"]');
            if (!el) return;
            // Images: distinguish by size bucket (icon/logo/hero)
            if (elementTypes[eid] === 'image') {
              var rect = el.getBoundingClientRect();
              var w = rect.width;
              var sizeBucket = w < 80 ? 'icon' : w < 250 ? 'logo' : 'hero';
              elementStyleSigs[eid] = 'image|' + sizeBucket;
              return;
            }
            var cs = window.getComputedStyle(el);
            elementStyleSigs[eid] = [
              cs.fontSize,
              cs.fontWeight,
              cs.fontStyle,
              cs.color,
              cs.textTransform,
              cs.fontFamily.split(',')[0].trim()
            ].join('|');
          });
        }

        function clearAllHighlights() {
          sectionIds.forEach(function(sid) {
            var el = document.querySelector('[data-section-id="' + sid + '"]');
            if (el) {
              el.style.outline = '';
              el.style.outlineOffset = '';
            }
          });
          elementIds.forEach(function(eid) {
            var el = document.querySelector('[data-element-id="' + eid + '"]');
            if (el) {
              el.style.outline = '';
              el.style.outlineOffset = '';
            }
          });
        }

        function applyHighlight(id, isElement) {
          var el;
          if (isElement) {
            el = document.querySelector('[data-element-id="' + id + '"]');
            if (el) {
              el.style.outline = '3px solid #818cf8';
              el.style.outlineOffset = el.tagName === 'IMG' ? '-3px' : '2px';
            }
          } else {
            el = document.querySelector('[data-section-id="' + id + '"]');
            if (el) {
              el.style.outline = '3px solid #818cf8';
              el.style.outlineOffset = '-3px';
            }
          }
        }

        function applyAllHighlights() {
          selectedSectionIds.forEach(function(sid) { applyHighlight(sid, false); });
          selectedElementIds.forEach(function(eid) { applyHighlight(eid, true); });
        }

        function createToolbar() {
          var t = document.createElement('div');
          t.id = 'elem-toolbar';
          t.innerHTML =
            '<span id="tb-count"></span>' +
            '<button id="tb-up" data-tip="Move up"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg></button>' +
            '<button id="tb-down" data-tip="Move down"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></button>' +
            '<button id="tb-similar" data-tip="Select similar"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg></button>' +
            '<div class="tb-sep"></div>' +
            '<button id="tb-del" data-tip="Delete"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>';
          document.body.appendChild(t);

          // Tooltip
          var tip = document.createElement('div');
          tip.id = 'tb-tooltip';
          document.body.appendChild(tip);
          var tipTimer = null;
          t.querySelectorAll('button[data-tip]').forEach(function(btn) {
            btn.addEventListener('mouseenter', function() {
              if (btn.disabled) return;
              tipTimer = setTimeout(function() {
                tip.textContent = btn.getAttribute('data-tip');
                var br = btn.getBoundingClientRect();
                tip.style.opacity = '0';
                tip.style.display = 'block';
                var tw = tip.offsetWidth;
                tip.style.left = (br.left + br.width / 2 - tw / 2) + 'px';
                tip.style.top = (br.top - tip.offsetHeight - 6) + 'px';
                tip.style.opacity = '1';
              }, 400);
            });
            btn.addEventListener('mouseleave', function() {
              clearTimeout(tipTimer);
              tip.style.opacity = '0';
            });
          });
          document.getElementById('tb-up').addEventListener('click', function(e) {
            e.stopPropagation();
            if (toolbarSectionId) window.parent.postMessage({ type: 'toolbar-action', action: 'move-up', sectionId: toolbarSectionId, elementId: toolbarElementId }, '*');
          });
          document.getElementById('tb-down').addEventListener('click', function(e) {
            e.stopPropagation();
            if (toolbarSectionId) window.parent.postMessage({ type: 'toolbar-action', action: 'move-down', sectionId: toolbarSectionId, elementId: toolbarElementId }, '*');
          });
          document.getElementById('tb-del').addEventListener('click', function(e) {
            e.stopPropagation();
            if (toolbarSectionId) window.parent.postMessage({
              type: 'toolbar-action',
              action: 'delete',
              sectionId: toolbarSectionId,
              elementId: toolbarElementId,
              selectedSectionIds: selectedSectionIds.slice(),
              selectedElementIds: selectedElementIds.slice()
            }, '*');
          });
          document.getElementById('tb-similar').addEventListener('click', function(e) {
            e.stopPropagation();
            if (!toolbarElementId) return;
            var targetType = elementTypes[toolbarElementId];
            if (!targetType) return;

            buildStyleSigs();
            var targetSig = elementStyleSigs[toolbarElementId];

            var similarIds = elementIds.filter(function(eid) {
              return elementTypes[eid] === targetType && elementStyleSigs[eid] === targetSig;
            });

            selectedSectionIds = [];
            selectedElementIds = similarIds.slice();

            clearAllHighlights();
            applyAllHighlights();

            var tb = document.getElementById('elem-toolbar');
            var primaryEl = document.querySelector('[data-element-id="' + toolbarElementId + '"]');
            if (primaryEl && tb) positionToolbar(tb, primaryEl, similarIds.length);

            window.parent.postMessage({
              type: 'element-click',
              elementId: toolbarElementId,
              multiSelect: true,
              selectedSectionIds: [],
              selectedElementIds: similarIds.slice()
            }, '*');
          });
          return t;
        }

        function getMovableAncestor(el, sectionEl) {
          var current = el;
          while (current && current !== sectionEl) {
            if (current.previousElementSibling || current.nextElementSibling) {
              return current;
            }
            current = current.parentElement;
          }
          return null;
        }

        function positionToolbar(toolbar, targetEl, totalSelected) {
          var rect = targetEl.getBoundingClientRect();
          var tw = 140;
          var left = rect.left + rect.width / 2 - tw / 2;
          left = Math.max(4, Math.min(left, window.innerWidth - tw - 4));
          toolbar.style.top = (rect.bottom + 8) + 'px';
          toolbar.style.left = left + 'px';
          toolbar.style.display = 'flex';

          var upBtn = document.getElementById('tb-up');
          var downBtn = document.getElementById('tb-down');
          var countSpan = document.getElementById('tb-count');

          var similarBtn = document.getElementById('tb-similar');
          if (totalSelected > 1) {
            // Multi-select: disable move buttons, show count
            if (upBtn) upBtn.disabled = true;
            if (downBtn) downBtn.disabled = true;
            if (similarBtn) similarBtn.disabled = true;
            if (countSpan) {
              countSpan.textContent = totalSelected + ' selected';
              countSpan.style.display = 'inline';
            }
          } else {
            // Single select: existing logic
            if (countSpan) countSpan.style.display = 'none';
            if (similarBtn) similarBtn.disabled = !toolbarElementId;
            if (toolbarElementId) {
              var el = document.querySelector('[data-element-id="' + toolbarElementId + '"]');
              var sectionEl = toolbarSectionId ? document.querySelector('[data-section-id="' + toolbarSectionId + '"]') : null;
              var movable = el ? getMovableAncestor(el, sectionEl) : null;
              if (upBtn) upBtn.disabled = !movable || !movable.previousElementSibling;
              if (downBtn) downBtn.disabled = !movable || !movable.nextElementSibling;
            } else {
              var idx = sectionIds.indexOf(toolbarSectionId);
              if (upBtn) upBtn.disabled = idx <= 0;
              if (downBtn) downBtn.disabled = idx < 0 || idx >= sectionIds.length - 1;
            }
          }
        }

        function hideToolbar(toolbar) {
          toolbar.style.display = 'none';
          toolbarSectionId = null;
          toolbarElementId = null;
          var tip = document.getElementById('tb-tooltip');
          if (tip) tip.style.opacity = '0';
        }

        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', init);
        } else {
          init();
        }

        function createLabel() {
          var label = document.createElement('div');
          label.id = 'interaction-label';
          document.body.appendChild(label);
          return label;
        }

        function showLabel(labelEl, text, targetEl, isElement) {
          var rect = targetEl.getBoundingClientRect();
          labelEl.textContent = text;
          labelEl.style.display = 'block';
          var outlineExtra = isElement ? 4 : 0;
          var top = Math.max(0, rect.top - 22 - outlineExtra);
          var left = isElement ? rect.left - 2 : rect.left;
          labelEl.style.top = top + 'px';
          labelEl.style.left = left + 'px';
        }

        function hideLabel(labelEl) {
          labelEl.style.display = 'none';
        }

        function updateLabel(labelEl) {
          var totalSelected = selectedSectionIds.length + selectedElementIds.length;
          if (totalSelected > 1) {
            // Multi-select: show count on the last selected item
            var lastId, el, isElem;
            if (selectedElementIds.length > 0) {
              lastId = selectedElementIds[selectedElementIds.length - 1];
              el = document.querySelector('[data-element-id="' + lastId + '"]');
              isElem = true;
            } else {
              lastId = selectedSectionIds[selectedSectionIds.length - 1];
              el = document.querySelector('[data-section-id="' + lastId + '"]');
              isElem = false;
            }
            if (el) {
              showLabel(labelEl, totalSelected + ' selected', el, isElem);
            } else {
              hideLabel(labelEl);
            }
            return;
          }
          // Single selection or hover
          if (selectedElementIds.length === 1) {
            var eid = selectedElementIds[0];
            var elE = document.querySelector('[data-element-id="' + eid + '"]');
            if (elE) { showLabel(labelEl, elementLabels[eid] || eid, elE, true); return; }
          }
          if (selectedSectionIds.length === 1) {
            var sid = selectedSectionIds[0];
            var elS = document.querySelector('[data-section-id="' + sid + '"]');
            if (elS) { showLabel(labelEl, sectionLabels[sid] || sid, elS, false); return; }
          }
          if (hoveredElementId) {
            var elH = document.querySelector('[data-element-id="' + hoveredElementId + '"]');
            if (elH) { showLabel(labelEl, elementLabels[hoveredElementId] || hoveredElementId, elH, true); return; }
          }
          if (hoveredSectionId) {
            var elHs = document.querySelector('[data-section-id="' + hoveredSectionId + '"]');
            if (elHs) { showLabel(labelEl, sectionLabels[hoveredSectionId] || hoveredSectionId, elHs, false); return; }
          }
          hideLabel(labelEl);
        }

        function init() {
          // Force remove all scrolling - parent page handles it
          document.documentElement.style.overflow = 'hidden';
          document.body.style.overflow = 'hidden';

          var labelEl = createLabel();
          var toolbar = createToolbar();

          sectionIds.forEach(function(sectionId) {
            var element = document.querySelector('[data-section-id="' + sectionId + '"]');
            if (!element) return;

            // Add hover styles
            element.addEventListener('mouseenter', function() {
              if (selectedSectionIds.indexOf(sectionId) === -1) {
                hoveredSectionId = sectionId;
                element.style.outline = '2px dashed #818cf8';
                element.style.outlineOffset = '-2px';
                element.style.cursor = 'pointer';
                updateLabel(labelEl);
              }
            });

            element.addEventListener('mouseleave', function() {
              if (selectedSectionIds.indexOf(sectionId) === -1) {
                hoveredSectionId = null;
                element.style.outline = '';
                element.style.outlineOffset = '';
                element.style.cursor = '';
                updateLabel(labelEl);
              }
            });

            // Handle click
            element.addEventListener('click', function(e) {
              e.preventDefault();
              e.stopPropagation();

              var isMulti = e.shiftKey || e.metaKey || e.ctrlKey;

              if (isMulti) {
                // Multi-select: toggle this section in the list, clear elements
                selectedElementIds = [];
                var idx = selectedSectionIds.indexOf(sectionId);
                if (idx !== -1) {
                  // Remove from selection
                  selectedSectionIds.splice(idx, 1);
                } else {
                  selectedSectionIds.push(sectionId);
                }

                clearAllHighlights();
                applyAllHighlights();

                var primarySid = selectedSectionIds.length > 0 ? selectedSectionIds[selectedSectionIds.length - 1] : null;

                if (selectedSectionIds.length > 0) {
                  toolbarSectionId = primarySid;
                  toolbarElementId = null;
                  var primaryEl = document.querySelector('[data-section-id="' + primarySid + '"]');
                  if (primaryEl) positionToolbar(toolbar, primaryEl, selectedSectionIds.length);
                } else {
                  hideToolbar(toolbar);
                }

                window.parent.postMessage({
                  type: 'section-click',
                  sectionId: primarySid,
                  multiSelect: true,
                  selectedSectionIds: selectedSectionIds.slice(),
                  selectedElementIds: []
                }, '*');
              } else {
                // Single click: replace selection
                if (selectedSectionIds.length === 1 && selectedSectionIds[0] === sectionId && selectedElementIds.length === 0) {
                  // Deselect
                  clearAllHighlights();
                  selectedSectionIds = [];
                  selectedElementIds = [];
                  hideToolbar(toolbar);
                  window.parent.postMessage({
                    type: 'section-click',
                    sectionId: null,
                    multiSelect: false,
                    selectedSectionIds: [],
                    selectedElementIds: []
                  }, '*');
                } else {
                  clearAllHighlights();
                  selectedSectionIds = [sectionId];
                  selectedElementIds = [];

                  element.style.outline = '3px solid #818cf8';
                  element.style.outlineOffset = '-3px';
                  toolbarSectionId = sectionId;
                  toolbarElementId = null;
                  positionToolbar(toolbar, element, 1);

                  window.parent.postMessage({
                    type: 'section-click',
                    sectionId: sectionId,
                    multiSelect: false,
                    selectedSectionIds: [sectionId],
                    selectedElementIds: []
                  }, '*');
                }
              }
              updateLabel(labelEl);
            });
          });

          // Handle element interactions (higher priority than sections)
          elementIds.forEach(function(elementId) {
            var element = document.querySelector('[data-element-id="' + elementId + '"]');
            if (!element) return;

            // Add hover styles for elements
            element.addEventListener('mouseenter', function() {
              if (selectedElementIds.indexOf(elementId) === -1) {
                hoveredElementId = elementId;
                element.style.outline = '2px dashed #818cf8';
                element.style.outlineOffset = element.tagName === 'IMG' ? '-2px' : '2px';
                element.style.cursor = 'pointer';
                updateLabel(labelEl);
              }
            });

            element.addEventListener('mouseleave', function() {
              if (selectedElementIds.indexOf(elementId) === -1) {
                hoveredElementId = null;
                element.style.outline = '';
                element.style.outlineOffset = '';
                element.style.cursor = '';
                updateLabel(labelEl);
              }
            });

            // Handle element click (prevent section click from triggering)
            element.addEventListener('click', function(e) {
              e.preventDefault();
              e.stopPropagation();

              var isMulti = e.shiftKey || e.metaKey || e.ctrlKey;

              if (isMulti) {
                // Multi-select: toggle this element in the list, clear sections
                selectedSectionIds = [];
                var idx = selectedElementIds.indexOf(elementId);
                if (idx !== -1) {
                  selectedElementIds.splice(idx, 1);
                } else {
                  selectedElementIds.push(elementId);
                }

                clearAllHighlights();
                applyAllHighlights();

                var primaryEid = selectedElementIds.length > 0 ? selectedElementIds[selectedElementIds.length - 1] : null;

                if (selectedElementIds.length > 0) {
                  toolbarSectionId = elementToSection[primaryEid] || null;
                  toolbarElementId = primaryEid;
                  var primaryEl = document.querySelector('[data-element-id="' + primaryEid + '"]');
                  if (primaryEl) positionToolbar(toolbar, primaryEl, selectedElementIds.length);
                } else {
                  hideToolbar(toolbar);
                }

                window.parent.postMessage({
                  type: 'element-click',
                  elementId: primaryEid,
                  multiSelect: true,
                  selectedSectionIds: [],
                  selectedElementIds: selectedElementIds.slice()
                }, '*');
              } else {
                // Single click: replace selection
                if (selectedElementIds.length === 1 && selectedElementIds[0] === elementId && selectedSectionIds.length === 0) {
                  // Deselect
                  clearAllHighlights();
                  selectedElementIds = [];
                  selectedSectionIds = [];
                  hideToolbar(toolbar);
                  window.parent.postMessage({
                    type: 'element-click',
                    elementId: null,
                    multiSelect: false,
                    selectedSectionIds: [],
                    selectedElementIds: []
                  }, '*');
                } else {
                  clearAllHighlights();
                  selectedElementIds = [elementId];
                  selectedSectionIds = [];

                  element.style.outline = '3px solid #818cf8';
                  element.style.outlineOffset = element.tagName === 'IMG' ? '-3px' : '2px';
                  toolbarSectionId = elementToSection[elementId] || null;
                  toolbarElementId = elementId;
                  positionToolbar(toolbar, element, 1);

                  window.parent.postMessage({
                    type: 'element-click',
                    elementId: elementId,
                    multiSelect: false,
                    selectedSectionIds: [],
                    selectedElementIds: [elementId]
                  }, '*');
                }
              }
              updateLabel(labelEl);
            });
          });

          // Deselect when clicking on the background (outside email content)
          document.addEventListener('click', function(e) {
            var target = e.target;
            var isInsideEmail = false;
            while (target && target !== document.body) {
              if (target.hasAttribute && (target.hasAttribute('data-section-id') || target.hasAttribute('data-element-id'))) {
                isInsideEmail = true;
                break;
              }
              target = target.parentElement;
            }
            if (!isInsideEmail && (selectedSectionIds.length > 0 || selectedElementIds.length > 0)) {
              clearAllHighlights();
              selectedSectionIds = [];
              selectedElementIds = [];
              toolbarSectionId = null;
              toolbarElementId = null;
              hideToolbar(toolbar);
              updateLabel(labelEl);
              window.parent.postMessage({
                type: 'section-click',
                sectionId: null,
                multiSelect: false,
                selectedSectionIds: [],
                selectedElementIds: []
              }, '*');
            }
          });

          // Listen for selection updates from parent
          window.addEventListener('message', function(event) {
            if (event.data && event.data.type === 'update-selection') {
              var newSectionIds = event.data.selectedSectionIds || [];
              var newElementIds = event.data.selectedElementIds || [];

              // Clear all highlights first
              clearAllHighlights();

              // Update state
              selectedSectionIds = newSectionIds.slice();
              selectedElementIds = newElementIds.slice();

              // Apply new highlights
              applyAllHighlights();

              var totalSelected = selectedSectionIds.length + selectedElementIds.length;

              if (totalSelected > 0) {
                // Position toolbar on the last selected item
                var targetEl = null;
                if (selectedElementIds.length > 0) {
                  var lastEid = selectedElementIds[selectedElementIds.length - 1];
                  toolbarSectionId = elementToSection[lastEid] || null;
                  toolbarElementId = lastEid;
                  targetEl = document.querySelector('[data-element-id="' + lastEid + '"]');
                } else {
                  var lastSid = selectedSectionIds[selectedSectionIds.length - 1];
                  toolbarSectionId = lastSid;
                  toolbarElementId = null;
                  targetEl = document.querySelector('[data-section-id="' + lastSid + '"]');
                }
                if (targetEl) positionToolbar(toolbar, targetEl, totalSelected);
              } else {
                hideToolbar(toolbar);
              }

              updateLabel(labelEl);
            }
          });
        }
      })();
    </script>
  `;

  // Inject script before closing </body> tag
  if (html.includes('</body>')) {
    return html.replace('</body>', script + '</body>');
  }

  // Fallback: append to end
  return html + script;
}
