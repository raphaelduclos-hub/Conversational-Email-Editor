'use client';

import { useState, useRef } from 'react';
import { ChatPanel } from '@/components/chat/chat-panel-with-assistant-ui';
import { PropertyPanel } from '@/components/properties/property-panel';
import { DesignEmptyState } from '@/components/design/design-empty-state';
import { EmailPreview, EmailSection, EmailElement } from '@/components/preview/email-preview';
import { SAMPLE_EMAIL } from '@/lib/sample-email';
import { Button } from '@/components/ui/button';
import { Undo2, Redo2 } from 'lucide-react';
import Image from 'next/image';

export default function Home() {
  const [currentHtml, setCurrentHtml] = useState(SAMPLE_EMAIL);
  const currentHtmlRef = useRef(SAMPLE_EMAIL);
  const [selectedSection, setSelectedSection] = useState<EmailSection | null>(null);
  const [selectedElement, setSelectedElement] = useState<EmailElement | null>(null);
  const [selectedSectionIds, setSelectedSectionIds] = useState<string[]>([]);
  const [selectedElementIds, setSelectedElementIds] = useState<string[]>([]);
  const [mode, setMode] = useState<'chat' | 'design'>('chat');
  const [showBlur, setShowBlur] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  // Undo/Redo state (max 5 snapshots)
  const [history, setHistory] = useState<string[]>([SAMPLE_EMAIL]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const handleHtmlUpdate = (newHtml: string, skipHistory = false) => {
    setCurrentHtml(newHtml);
    currentHtmlRef.current = newHtml;

    // Skip history push during streaming
    if (skipHistory) return;

    // Push to history (FIFO - keep max 5)
    setHistory((prevHistory) => {
      // If we're not at the latest state, discard future states
      const newHistory = prevHistory.slice(0, historyIndex + 1);

      // Add new snapshot
      newHistory.push(newHtml);

      // Keep only last 5
      if (newHistory.length > 5) {
        const sliced = newHistory.slice(-5);
        // Adjust index since we removed the oldest item
        setHistoryIndex(4); // Last index in a 5-item array
        return sliced;
      }

      // Update index to point to the new item
      setHistoryIndex(newHistory.length - 1);
      return newHistory;
    });
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setCurrentHtml(history[newIndex]);
      console.log('Undo to index:', newIndex);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setCurrentHtml(history[newIndex]);
      console.log('Redo to index:', newIndex);
    }
  };

  const handleSectionSelect = (section: EmailSection | null, newSectionIds: string[], newElementIds: string[]) => {
    setSelectedSection(section);
    setSelectedSectionIds(newSectionIds);
    setSelectedElement(null);
    setSelectedElementIds(newElementIds);
  };

  const handleElementSelect = (element: EmailElement | null, newSectionIds: string[], newElementIds: string[]) => {
    setSelectedElement(element);
    setSelectedElementIds(newElementIds);
    setSelectedSection(null);
    setSelectedSectionIds(newSectionIds);
  };

  const handleSectionDeselect = () => {
    setSelectedSection(null);
    setSelectedSectionIds([]);
    setSelectedElement(null);
    setSelectedElementIds([]);
  };

  const getMovableAncestor = (el: Element, sectionEl: Element): Element | null => {
    let current: Element | null = el;
    while (current && current !== sectionEl) {
      if (current.previousElementSibling || current.nextElementSibling) {
        return current;
      }
      current = current.parentElement;
    }
    return null;
  };

  const handleToolbarAction = (action: 'delete' | 'move-up' | 'move-down', sectionId: string, elementId?: string | null, allSectionIds?: string[], allElementIds?: string[]) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(currentHtmlRef.current, 'text/html');
    const el = doc.querySelector(`[data-section-id="${sectionId}"]`);
    if (!el) return;

    if (action === 'delete') {
      // Multi-select delete: remove all selected items
      const sidsToDelete = allSectionIds && allSectionIds.length > 0 ? allSectionIds : (elementId ? [] : [sectionId]);
      const eidsToDelete = allElementIds && allElementIds.length > 0 ? allElementIds : (elementId ? [elementId] : []);

      eidsToDelete.forEach((eid) => {
        const elementEl = doc.querySelector(`[data-element-id="${eid}"]`);
        elementEl?.remove();
      });

      sidsToDelete.forEach((sid) => {
        const sectionEl = doc.querySelector(`[data-section-id="${sid}"]`);
        sectionEl?.remove();
      });

      setSelectedSection(null);
      setSelectedSectionIds([]);
      setSelectedElement(null);
      setSelectedElementIds([]);
    } else if (action === 'move-up') {
      if (elementId) {
        // Element-level: walk up to find a movable ancestor within the section
        const elementEl = doc.querySelector(`[data-element-id="${elementId}"]`);
        if (elementEl) {
          const movable = getMovableAncestor(elementEl, el);
          if (movable) {
            const prev = movable.previousElementSibling;
            if (prev) movable.parentNode?.insertBefore(movable, prev);
          }
        }
        // Keep selectedElement — element IDs are now preserved after re-parse
      } else {
        // Section-level
        const prev = el.previousElementSibling;
        if (prev) {
          el.parentNode?.insertBefore(el, prev);
          const currentIndex = parseInt(sectionId.replace('section-', ''), 10);
          const newSectionId = `section-${currentIndex - 1}`;
          if (selectedSection) {
            setSelectedSection({ ...selectedSection, id: newSectionId, index: currentIndex - 1 });
            setSelectedSectionIds([newSectionId]);
          } else if (selectedElement) {
            setSelectedElement({ ...selectedElement, sectionId: newSectionId });
          }
        }
      }
    } else if (action === 'move-down') {
      if (elementId) {
        // Element-level: walk up to find a movable ancestor within the section
        const elementEl = doc.querySelector(`[data-element-id="${elementId}"]`);
        if (elementEl) {
          const movable = getMovableAncestor(elementEl, el);
          if (movable) {
            const next = movable.nextElementSibling;
            if (next) movable.parentNode?.insertBefore(next, movable);
          }
        }
        // Keep selectedElement — element IDs are now preserved after re-parse
      } else {
        // Section-level
        const next = el.nextElementSibling;
        if (next) {
          el.parentNode?.insertBefore(next, el);
          const currentIndex = parseInt(sectionId.replace('section-', ''), 10);
          const newSectionId = `section-${currentIndex + 1}`;
          if (selectedSection) {
            setSelectedSection({ ...selectedSection, id: newSectionId, index: currentIndex + 1 });
            setSelectedSectionIds([newSectionId]);
          } else if (selectedElement) {
            setSelectedElement({ ...selectedElement, sectionId: newSectionId });
          }
        }
      }
    }

    handleHtmlUpdate(doc.body.innerHTML);
  };

  const handleAnnotatedHtmlReady = (annotatedHtml: string) => {
    // Always sync to the re-indexed annotated HTML so currentHtml/currentHtmlRef
    // always have up-to-date data-section-id attributes that match the iframe.
    // Use the ref for comparison to avoid stale closures.
    if (annotatedHtml !== currentHtmlRef.current) {
      currentHtmlRef.current = annotatedHtml;
      setCurrentHtml(annotatedHtml);
    }
  };

  const handleExport = () => {
    // Copy HTML to clipboard
    navigator.clipboard.writeText(currentHtml).then(() => {
      alert('HTML copied to clipboard!');
    }).catch((err) => {
      console.error('Failed to copy:', err);
      // Fallback: download as file
      const blob = new Blob([currentHtml], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'email.html';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  };

  const fetchSuggestions = async () => {
    try {
      const response = await fetch('/api/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html: currentHtml }),
      });

      if (!response.ok) {
        console.error('Failed to fetch suggestions');
        return;
      }

      const data = await response.json();
      setSuggestions(data.suggestions || []);
    } catch (error) {
      console.error('Error fetching suggestions:', error);
      setSuggestions([]);
    }
  };

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col">
        {/* Top bar */}
        <header className="h-12 border-b border-border bg-background flex items-center justify-between px-6 flex-shrink-0">
          {/* Left side: Title + Undo/Redo */}
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-semibold text-foreground">
              Salomon XT-6 GORE-TEX Launch
            </h1>

            {/* Undo/Redo buttons */}
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={handleUndo}
                disabled={historyIndex === 0}
                className="h-8 w-8"
              >
                <Undo2 className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleRedo}
                disabled={historyIndex === history.length - 1}
                className="h-8 w-8"
              >
                <Redo2 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Center: Mode toggle */}
          <div className="absolute left-1/2 -translate-x-1/2">
            <div className="flex items-center gap-1 bg-muted rounded-full p-1">
              <button
                onClick={() => setMode('chat')}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  mode === 'chat'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Image
                  src="/icons/aura-icon.svg"
                  alt="AI"
                  width={14}
                  height={14}
                  className={mode === 'chat' ? '' : 'opacity-50'}
                />
                AI mode
              </button>
              <button
                onClick={() => setMode('design')}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  mode === 'design'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Image
                  src="/icons/design-icon.svg"
                  alt="Design"
                  width={14}
                  height={14}
                  className={mode === 'design' ? '' : 'opacity-50'}
                />
                Design mode
              </button>
            </div>
          </div>

          {/* Right side: Export button */}
          <Button onClick={handleExport} size="sm">
            Export
          </Button>
        </header>

        {/* Main content layout */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left panel - Chat or Design */}
          <div className="w-[420px] flex-shrink-0">
            {/* Chat panel - always mounted to preserve messages */}
            <div className={mode === 'chat' ? 'block h-full' : 'hidden'}>
              <ChatPanel
                currentHtml={currentHtml}
                selectedSection={selectedSection}
                selectedElement={selectedElement}
                selectedElementIds={selectedElementIds}
                onHtmlUpdate={handleHtmlUpdate}
                onSectionDeselect={handleSectionDeselect}
                suggestions={suggestions}
                onGenerationComplete={() => {
                  // Show blur for 3 seconds after AI generation completes
                  setShowBlur(true);
                  setTimeout(() => setShowBlur(false), 3000);

                  // Fetch suggestions after generation
                  fetchSuggestions();
                }}
              />
            </div>

            {/* Design mode panels */}
            {mode === 'design' && (
              selectedSection || selectedElement ? (
                <PropertyPanel
                  selectedSection={selectedSection}
                  selectedElement={selectedElement}
                  selectedElementIds={selectedElementIds}
                  currentHtml={currentHtml}
                  onHtmlUpdate={handleHtmlUpdate}
                  onClose={handleSectionDeselect}
                />
              ) : (
                <DesignEmptyState onClose={() => setMode('chat')} />
              )
            )}
          </div>

          {/* Preview panel - takes remaining space with scroll */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden">
            <EmailPreview
              html={currentHtml}
              selectedSectionIds={selectedSectionIds}
              selectedElementIds={selectedElementIds}
              onSectionSelect={handleSectionSelect}
              onElementSelect={handleElementSelect}
              onAnnotatedHtmlReady={handleAnnotatedHtmlReady}
              onToolbarAction={handleToolbarAction}
              isLoading={showBlur}
            />
          </div>
        </div>
      </div>
  );
}
