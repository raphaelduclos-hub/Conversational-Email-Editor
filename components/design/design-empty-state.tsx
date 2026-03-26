'use client';

import Image from 'next/image';
import { X } from 'lucide-react';

interface DesignEmptyStateProps {
  onClose?: () => void;
}

export function DesignEmptyState({ onClose }: DesignEmptyStateProps) {
  return (
    <div className="flex flex-col h-full bg-background border-r border-border">
      {/* Header - close button only */}
      {onClose && (
        <div className="px-4 py-3 flex items-center justify-end">
          <button
            onClick={onClose}
            className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Empty state */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="flex flex-col items-center text-center max-w-sm">
          {/* Icon */}
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-6">
            <Image src="/icons/design-icon.svg" alt="Design" width={28} height={28} className="opacity-50" />
          </div>

          {/* Title */}
          <h3 className="text-lg font-semibold text-foreground mb-3">
            Ready to Edit
          </h3>

          {/* Description */}
          <p className="text-sm text-muted-foreground leading-relaxed">
            Select any element in the preview to edit its properties, styles, and content directly.
          </p>
        </div>
      </div>
    </div>
  );
}
