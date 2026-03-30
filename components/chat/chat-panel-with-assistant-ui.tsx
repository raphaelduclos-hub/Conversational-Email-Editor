'use client';

import { useChat } from '@ai-sdk/react';
import { useEffect, useRef, useState } from 'react';
import { EmailSection, EmailElement } from '@/components/preview/email-preview';
import { SelectedSectionCard } from './selected-section-card';
import { mergeSectionHtml } from '@/lib/merge-section';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { X } from 'lucide-react';

interface ChatPanelProps {
  currentHtml: string;
  selectedSection?: EmailSection | null;
  selectedElement?: EmailElement | null;
  selectedElementIds?: string[];
  onHtmlUpdate: (html: string, skipHistory?: boolean) => void;
  onSectionDeselect?: () => void;
  onGenerationComplete?: () => void;
  suggestions?: string[];
}

// Helper function to format AI messages and handle error responses
function formatAIMessage(content: string): string {
  // Check if content looks like a JSON error
  const trimmed = content.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed.error) {
        // Transform error into conversational message
        return `I'm sorry, but ${parsed.error.charAt(0).toLowerCase()}${parsed.error.slice(1)}

Could you try being more specific or selecting a section first?`;
      }
    } catch (e) {
      // Not valid JSON, return as is
    }
  }
  return content;
}

function parseInlineStyles(style: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!style) return result;
  style.split(';').forEach(rule => {
    const colonIdx = rule.indexOf(':');
    if (colonIdx === -1) return;
    const prop = rule.slice(0, colonIdx).trim();
    const val = rule.slice(colonIdx + 1).trim();
    if (prop && val) result[prop] = val;
  });
  return result;
}

export function ChatPanel({
  currentHtml,
  selectedSection,
  selectedElement,
  selectedElementIds,
  onHtmlUpdate,
  onSectionDeselect,
  onGenerationComplete,
  suggestions = [],
}: ChatPanelProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [thinkingTime, setThinkingTime] = useState(0);
  const thinkingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Use ref to track the section or element being edited (to avoid stale closure in onFinish)
  const editingSectionRef = useRef<EmailSection | null>(null);
  const editingElementRef = useRef<EmailElement | null>(null);

  // Throttle streaming updates
  const lastStreamUpdateRef = useRef<number>(0);

  // AI SDK: Manage input state manually
  const [input, setInput] = useState('');

  // Manual message management for better control
  const [messages, setMessages] = useState<any[]>([
    {
      id: 'initial-user',
      role: 'user',
      content: `Create a product launch email for this Salomon sneaker: https://www.salomon.com/fr-fr/product/xt-6-gore-tex-lg9333

TONE: Premium outdoor brand with urban edge. Confident and technical but accessible. Focus on "heritage meets innovation" — trail performance adapted for city life. Aspirational but grounded, avoid hype. High-end technical apparel vibe (Arc'teryx level).

Clean layout with dramatic hero, product details + CTA, tech close-up, 4-feature grid with icons, alternating lifestyle sections, and footer.`
    },
    {
      id: 'initial-assistant',
      role: 'assistant',
      content: `I've created a product launch email for the Salomon XT-6 GORE-TEX sneaker that balances technical authority with urban appeal.

**What I included:**
• Hero section with dramatic product imagery and clean headline
• Product details with price, CTA, and technical callouts
• Close-up view highlighting the GORE-TEX waterproofing technology
• 4-feature grid with icons (Trail Heritage, All-Weather Protection, Urban Ready, Premium Build)
• Alternating lifestyle sections showing versatility (trail to city)
• Footer with unsubscribe, copyright, and social links

**Key decision:** I emphasized the heritage-meets-innovation positioning by pairing technical language ("GORE-TEX waterproofing", "Sensifit construction") with lifestyle photography. The layout is clean and premium, avoiding hype-driven copy in favor of confident, specification-driven messaging that mirrors Arc'teryx's approach.`
    }
  ]);
  const [isLoading, setIsLoading] = useState(false);

  // AI SDK: Handle message completion in useEffect
  useEffect(() => {
    if (!isLoading && messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.role === 'assistant') {
        handleMessageCompletion(lastMessage);
      }
    }
  }, [messages, isLoading]);

  const handleMessageCompletion = (message: any) => {
      console.log('✅ Generation complete');

      let content = message.content;
      let summary: string | null = null;

      // Extract SUMMARY if present
      if (content.startsWith('SUMMARY:')) {
        const lines = content.split('\n');
        const summaryLine = lines[0];
        summary = summaryLine.replace('SUMMARY:', '').trim();
        content = lines.slice(1).join('\n').trim();
        console.log('📝 Edit summary:', summary);
      }

      // Remove markdown code fences if present (```html, ```json, ``` ... ```)
      content = content.replace(/^```(?:html|json)?\s*/i, '').replace(/\s*```$/, '').trim();

      // Check for single-edit or multi-edit JSON response
      const trimmedContent = content.trim();
      if (trimmedContent.startsWith('{') && (trimmedContent.includes('"single-edit"') || trimmedContent.includes('"multi-edit"'))) {
        try {
          const instruction = JSON.parse(trimmedContent);

          // Normalize both shapes to a changes array
          const changes: { elementId: string; style?: Record<string, string>; text?: string }[] =
            instruction.action === 'single-edit'
              ? [{ elementId: instruction.elementId, style: instruction.style, text: instruction.text }]
              : Array.isArray(instruction.changes) ? instruction.changes : [];

          if (changes.length > 0) {
            const parser = new DOMParser();
            const doc = parser.parseFromString(currentHtml, 'text/html');

            changes.forEach((change) => {
              const el = doc.querySelector(`[data-element-id="${change.elementId}"]`);
              if (!el) return;

              if (change.style) {
                const existing = parseInlineStyles(el.getAttribute('style') || '');
                Object.entries(change.style).forEach(([prop, val]) => {
                  if (val) existing[prop] = val;
                  else delete existing[prop];
                });
                el.setAttribute('style', Object.entries(existing).map(([k, v]) => `${k}:${v}`).join(';'));
              }

              if (change.text !== undefined) {
                el.textContent = change.text;
              }
            });

            onHtmlUpdate(doc.body.innerHTML);
            const editSummary = instruction.summary ||
              (instruction.action === 'single-edit' ? 'Updated element' : `Updated ${changes.length} elements`);
            // Replace raw JSON in messages with the summary so each message shows its own text
            setMessages(prev => prev.map((m, i) =>
              i === prev.length - 1 ? { ...m, content: editSummary, _thinkingTime: thinkingTime } : m
            ));
            editingSectionRef.current = null;
            editingElementRef.current = null;

            if (onSectionDeselect) onSectionDeselect();
            if (onGenerationComplete) onGenerationComplete();
            return;
          }
        } catch {
          // Not valid JSON, fall through to normal handling
        }
      }

      // Check if response is HTML (more robust)
      const isHtml = content.includes('<table') ||
        content.includes('<tr') ||
        content.includes('<!DOCTYPE') ||
        content.includes('<html>');

      if (isHtml) {
        // Use the ref to get the section or element that was being edited
        const editingSection = editingSectionRef.current;
        const editingElement = editingElementRef.current;

        // Validation: Check if AI response is suspiciously short (might have lost sections)
        if (!editingSection && !editingElement) {
          // Full email editing - check for content loss
          const inputSections = (currentHtml.match(/data-section-id=/g) || []).length;
          const outputSections = (content.match(/data-section-id=/g) || []).length;
          const inputImages = (currentHtml.match(/<img/g) || []).length;
          const outputImages = (content.match(/<img/g) || []).length;

          if (outputSections < inputSections || outputImages < inputImages) {
            console.error('⚠️ AI response lost content!', {
              inputSections,
              outputSections,
              inputImages,
              outputImages
            });

            // Show error to user
            const lostSections = inputSections - outputSections;
            const lostImages = inputImages - outputImages;
            const errorMsg = `⚠️ The AI's response lost some content (${lostSections} section(s), ${lostImages} image(s)). Please try again or rephrase your request.`;
            setValidationError(errorMsg);

            // Don't apply the update
            console.error('Response rejected - content loss detected');
            return;
          }

          // Clear any previous validation error
          setValidationError(null);
        }

        // If element is selected, merge using the parent section
        // If section is selected, merge using section
        // Otherwise full replace
        const displaySummary = summary ||
          (editingElement ? `✓ Updated "${editingElement.label}"` :
           editingSection ? `✓ Updated "${editingSection.label}" section` :
           '✓ Updated email');

        if (editingElement) {
          const merged = mergeSectionHtml(currentHtml, editingElement.sectionId, content);
          onHtmlUpdate(merged);
        } else if (editingSection) {
          const merged = mergeSectionHtml(currentHtml, editingSection.id, content);
          onHtmlUpdate(merged);
        } else {
          onHtmlUpdate(content);
        }

        // Replace raw HTML in messages with the summary so each message shows its own text
        setMessages(prev => prev.map((m, i) =>
          i === prev.length - 1 ? { ...m, content: displaySummary, _thinkingTime: thinkingTime } : m
        ));

        // Deselect section/element after successful edit
        if ((editingSection || editingElement) && onSectionDeselect) {
          onSectionDeselect();
        }

        // Notify parent that generation completed
        if (onGenerationComplete) {
          onGenerationComplete();
        }

        // Clear the editing refs
        editingSectionRef.current = null;
        editingElementRef.current = null;
      } else if (content.trim().startsWith('{') && content.includes('error')) {
        console.error('AI returned error:', content);
      }
  };

  // AI SDK: Manual input handlers
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
  };

  // Auto-scroll to bottom only if user is already near bottom
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const lastMessage = messages[messages.length - 1];
    // Always scroll when user sends a message or when loading starts
    const isUserMessage = lastMessage?.role === 'user';
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;

    if (isUserMessage || isNearBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);


  // Timer for thinking animation
  useEffect(() => {
    if (isLoading) {
      setThinkingTime(0);
      thinkingIntervalRef.current = setInterval(() => {
        setThinkingTime(prev => prev + 1);
      }, 1000);
    } else {
      if (thinkingIntervalRef.current) {
        clearInterval(thinkingIntervalRef.current);
        thinkingIntervalRef.current = null;
      }
    }

    return () => {
      if (thinkingIntervalRef.current) {
        clearInterval(thinkingIntervalRef.current);
      }
    };
  }, [isLoading]);

  // Auto-resize textarea as user types
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // Reset height to auto to get the correct scrollHeight
    textarea.style.height = 'auto';

    // Set height based on content, max 3 lines (~72px for 3 lines with text-sm)
    const maxHeight = 72; // Approx 3 lines
    const newHeight = Math.min(textarea.scrollHeight, maxHeight);
    textarea.style.height = `${newHeight}px`;
  }, [input]);

  // Streaming preview disabled for cleaner UX - only show final result
  // The blur animation will handle the loading state visually

  // Custom handleSubmit using fetch directly
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!input.trim() || isLoading) return;

    const userMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: input,
    };

    // Add user message immediately
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    // Clear any previous validation error
    setValidationError(null);

    // Store the section or element being edited in ref
    editingSectionRef.current = selectedSection || null;
    editingElementRef.current = selectedElement || null;


    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMessage],
          html: currentHtml,
          selectedSectionId: selectedSection?.id,
          selectedSectionHtml: selectedSection?.html,
          selectedElementId: selectedElement?.id,
          selectedElementType: selectedElement?.type,
          selectedElementTag: selectedElement?.tag,
          multiSelectElementIds: selectedElementIds && selectedElementIds.length > 1 ? selectedElementIds : undefined,
        }),
      });

      if (!response.ok) {
        throw new Error('API request failed');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let accumulatedContent = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          accumulatedContent += chunk;
        }
      }

      // Add assistant message
      const assistantMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: accumulatedContent,
      };

      setMessages(prev => [...prev, assistantMessage]);
      setIsLoading(false);

    } catch (error) {
      console.error('Chat error:', error);
      setIsLoading(false);
      setValidationError('Failed to get response. Please try again.');
    }
  };

  return (
    <div className="flex flex-col h-full bg-background border-r border-border">
      {/* Messages area */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-center">
            <div className="max-w-sm">
              <h3 className="text-lg font-semibold text-foreground mb-2">
                Welcome to the Email Editor
              </h3>
              <p className="text-sm text-muted-foreground mb-3">
                Type instructions to modify your email. For example:
              </p>
              <div className="space-y-2">
                <button
                  onClick={() => handleInputChange({ target: { value: 'Make the hero section dark blue' } } as any)}
                  className="w-full text-left px-3 py-2 text-sm rounded-lg border border-border hover:bg-muted transition-colors"
                >
                  • "Make the hero section dark blue"
                </button>
                <button
                  onClick={() => handleInputChange({ target: { value: 'Change the heading to Winter Sale' } } as any)}
                  className="w-full text-left px-3 py-2 text-sm rounded-lg border border-border hover:bg-muted transition-colors"
                >
                  • "Change the heading to 'Winter Sale'"
                </button>
                <button
                  onClick={() => handleInputChange({ target: { value: 'Add a discount code to the footer' } } as any)}
                  className="w-full text-left px-3 py-2 text-sm rounded-lg border border-border hover:bg-muted transition-colors"
                >
                  • "Add a discount code to the footer"
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            {messages.map((message, index) => {
              // Don't show the last assistant message if we're loading (avoid showing partial streaming)
              if (message.role === 'assistant' && isLoading && index === messages.length - 1) {
                return null;
              }

              // Edit summary messages have _thinkingTime stored on them
              if (message.role === 'assistant' && message._thinkingTime !== undefined) {
                return (
                  <div key={index} className="flex justify-start">
                    <div className="w-full text-sm text-foreground whitespace-pre-wrap">
                      {message._thinkingTime > 0 && (
                        <div className="text-xs text-muted-foreground mb-1">
                          Thought for {message._thinkingTime}s
                        </div>
                      )}
                      {message.content}
                    </div>
                  </div>
                );
              }

              // Show normal messages
              return (
                <div
                  key={index}
                  className={`flex ${
                    message.role === 'user' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  {message.role === 'user' ? (
                    <div className="max-w-[90%] rounded-lg px-4 py-2 bg-muted text-foreground">
                      <div className="text-sm whitespace-pre-wrap break-words">
                        {message.content}
                      </div>
                    </div>
                  ) : (
                    <div className="w-full text-sm text-foreground prose prose-sm max-w-none prose-p:my-2 prose-ul:my-2 prose-strong:font-semibold prose-strong:text-foreground">
                      {formatAIMessage(message.content).split('\n').map((line, i) => {
                        // Handle bold text with **
                        const parts = line.split(/(\*\*.*?\*\*)/g);
                        return (
                          <div key={i} className={i > 0 ? 'mt-2' : ''}>
                            {parts.map((part, j) => {
                              if (part.startsWith('**') && part.endsWith('**')) {
                                return <strong key={j}>{part.slice(2, -2)}</strong>;
                              }
                              return <span key={j}>{part}</span>;
                            })}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Validation error */}
            {validationError && (
              <div className="flex justify-start">
                <div className="px-4 py-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                  {validationError}
                </div>
              </div>
            )}

            {/* Thinking loader */}
            {isLoading && (
              <div className="flex justify-start">
                <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-muted/50">
                  <div className="relative">
                    <svg
                      className="animate-spin h-5 w-5 text-primary"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                  </div>
                  <span className="text-sm text-foreground">
                    Thinking... {thinkingTime}s
                  </span>
                </div>
              </div>
            )}

            {/* Suggestion chips - inside scrollable area */}
            {suggestions.length > 0 && (
              <div className="px-4 mb-4">
                <div className="flex flex-wrap gap-2">
                  {suggestions.map((suggestion, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => handleInputChange({ target: { value: suggestion } } as any)}
                      className="px-3 py-1.5 text-xs rounded-full border border-border bg-background hover:bg-muted transition-colors text-foreground"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input area */}
      <div className="p-4 bg-background">
        <form onSubmit={handleSubmit} className="relative border border-border rounded-[24px] bg-background focus-within:ring-2 focus-within:ring-ring transition-shadow">
          {/* Selected section or element chip - shown inside the input area */}
          {(selectedSection || selectedElement) && onSectionDeselect && (
            <div className="px-3 pt-2 pb-1">
              <Badge
                variant="secondary"
                className="gap-1 pr-1 text-xs font-normal border border-primary/20"
              >
                {selectedElement && selectedElementIds && selectedElementIds.length > 1
                  ? `${selectedElementIds.length} × ${selectedElement.tag.toUpperCase()} selected`
                  : selectedElement ? selectedElement.label : selectedSection?.label}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-4 w-4 p-0 hover:bg-transparent"
                  onClick={onSectionDeselect}
                >
                  <X className="h-3 w-3" />
                </Button>
              </Badge>
            </div>
          )}

          <div className="px-3 pt-2">
            {/* Textarea - auto-expanding */}
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={(e) => {
                // Submit on Enter (without Shift)
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (input.trim() && !isLoading) {
                    handleSubmit(e as any);
                  }
                }
              }}
              placeholder="Ask for edits, add sections, refine the tone..."
              disabled={isLoading}
              rows={1}
              className="w-full border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 shadow-none px-2 py-1 text-sm resize-none outline-none min-h-[24px] max-h-[72px] overflow-y-auto scrollbar-hide"
              style={{ height: '24px' }}
            />
          </div>

          {/* Bottom row: Send button (right) */}
          <div className="flex items-center justify-end px-3 py-2">
            {/* Send button - circular with arrow */}
            <Button
              type="submit"
              disabled={isLoading || !input.trim()}
              size="icon"
              className="flex-shrink-0 h-9 w-9 rounded-full bg-muted hover:bg-muted/80 text-foreground disabled:opacity-50"
            >
              {isLoading ? (
                <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M8 12V4M8 4L4 8M8 4l4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
