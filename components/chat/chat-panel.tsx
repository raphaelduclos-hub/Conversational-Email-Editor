'use client';

import { useChat } from '@ai-sdk/react';
import { useEffect, useRef } from 'react';
import { EmailSection } from '@/components/preview/email-preview';
import { SelectedSectionCard } from './selected-section-card';
import { mergeSectionHtml } from '@/lib/merge-section';
import { Button } from '@/components/ui/button';

interface ChatPanelProps {
  currentHtml: string;
  selectedSection?: EmailSection | null;
  onHtmlUpdate: (html: string) => void;
  onSectionDeselect?: () => void;
}

export function ChatPanel({ currentHtml, selectedSection, onHtmlUpdate, onSectionDeselect }: ChatPanelProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    api: '/api/chat',
    body: {
      html: currentHtml,
      selectedSectionId: selectedSection?.id,
      selectedSectionHtml: selectedSection?.html,
    },
    onFinish: (message) => {
      // Extract HTML from the AI response
      const content = message.content;

      // Check if response starts with HTML
      if (content.trim().startsWith('<!DOCTYPE') ||
          content.trim().startsWith('<html') ||
          content.trim().startsWith('<table') ||
          content.trim().startsWith('<tr')) {

        // If a section is selected, merge the section HTML back into the full email
        if (selectedSection) {
          const mergedHtml = mergeSectionHtml(
            currentHtml,
            selectedSection.id,
            content
          );
          onHtmlUpdate(mergedHtml);
        } else {
          // Full email update
          onHtmlUpdate(content);
        }
      } else if (content.trim().startsWith('{') && content.includes('error')) {
        // Error response - will be displayed in chat
        console.error('AI returned error:', content);
      }
      // Otherwise it's a conversational response, just display in chat
    },
  });

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="flex flex-col h-full bg-white border-r border-gray-200">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Selected section card */}
        {selectedSection && onSectionDeselect && (
          <SelectedSectionCard
            section={selectedSection}
            onDeselect={onSectionDeselect}
          />
        )}
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-center">
            <div className="max-w-sm">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Welcome to the Email Editor
              </h3>
              <p className="text-sm text-gray-600">
                Type instructions to modify your email. For example:
              </p>
              <ul className="mt-3 text-xs text-gray-500 space-y-1 text-left">
                <li>• "Make the hero section dark blue"</li>
                <li>• "Change the heading to 'Winter Sale'"</li>
                <li>• "Add a discount code to the footer"</li>
              </ul>
            </div>
          </div>
        ) : (
          <>
            {messages.map((message, index) => (
              <div
                key={index}
                className={`flex ${
                  message.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                <div
                  className={`max-w-[85%] rounded-lg px-4 py-2 ${
                    message.role === 'user'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-100 text-gray-900'
                  }`}
                >
                  <div className="text-sm whitespace-pre-wrap break-words">
                    {/* Don't display raw HTML in chat, just confirmation */}
                    {message.content.trim().startsWith('<!DOCTYPE') ||
                    message.content.trim().startsWith('<html') ||
                    message.content.trim().startsWith('<table') ? (
                      <span className="italic text-gray-600">
                        ✓ Email updated
                      </span>
                    ) : (
                      message.content
                    )}
                  </div>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input area */}
      <div className="border-t border-gray-200 p-4 bg-gray-50">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={handleInputChange}
            placeholder="Type an instruction..."
            disabled={isLoading}
            className="flex-1 px-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
          />
          <Button
            type="submit"
            disabled={isLoading || !input.trim()}
            size="sm"
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <svg
                  className="animate-spin h-4 w-4"
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
                Sending...
              </span>
            ) : (
              'Send'
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
