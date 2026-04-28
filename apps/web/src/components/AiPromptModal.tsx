import { useCallback, useEffect, useRef, useState } from 'react';
import { PrimaryButton } from './PrimaryButton.js';
import styles from './AiPromptModal.module.css';

const EXAMPLE_PROMPTS = [
  'Move Notes under Opportunities',
  'Add a KPI for days since last call',
  'Replace my opportunities section with recent calls',
];

interface AiPromptModalProps {
  onSubmit: (prompt: string) => void;
  onClose: () => void;
}

export function AiPromptModal({ onSubmit, onClose }: AiPromptModalProps) {
  const [prompt, setPrompt] = useState('');
  const modalRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === 'Tab' && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'input, select, textarea, button, [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    },
    [onClose],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
  };

  return (
    <div
      className={styles.overlay}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-prompt-modal-title"
      data-testid="ai-prompt-modal"
    >
      <div className={styles.modal} ref={modalRef} tabIndex={-1}>
        <div className={styles.header}>
          <h2 id="ai-prompt-modal-title" className={styles.title}>
            <span className={styles.titleSparkle} aria-hidden="true">✨</span>
            Ask AI to edit this page
          </h2>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close AI prompt"
            data-testid="ai-prompt-close"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className={styles.body}>
            <label className={styles.label} htmlFor="ai-prompt-textarea">
              Describe the change you want
            </label>
            <textarea
              id="ai-prompt-textarea"
              ref={textareaRef}
              className={styles.textarea}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Replace my opportunities section with recent calls"
              data-testid="ai-prompt-textarea"
            />

            <div className={styles.examples}>
              <span className={styles.examplesLabel}>Try one of these</span>
              <div className={styles.pillRow}>
                {EXAMPLE_PROMPTS.map((example) => (
                  <button
                    key={example}
                    type="button"
                    className={styles.pill}
                    onClick={() => setPrompt(example)}
                    data-testid={`ai-prompt-example-${example
                      .toLowerCase()
                      .replace(/[^a-z0-9]+/g, '-')
                      .replace(/^-|-$/g, '')}`}
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className={styles.footer}>
            <PrimaryButton
              variant="ghost"
              size="sm"
              onClick={onClose}
              type="button"
              data-testid="ai-prompt-cancel"
            >
              Cancel
            </PrimaryButton>
            <PrimaryButton
              size="sm"
              type="submit"
              disabled={prompt.trim().length === 0}
              data-testid="ai-prompt-submit"
            >
              Ask AI
            </PrimaryButton>
          </div>
        </form>
      </div>
    </div>
  );
}
