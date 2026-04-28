import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AiPromptModal } from '../components/AiPromptModal.js';

describe('AiPromptModal', () => {
  it('renders dialog with autofocused textarea', () => {
    render(<AiPromptModal onSubmit={vi.fn()} onClose={vi.fn()} />);

    const dialog = screen.getByTestId('ai-prompt-modal');
    expect(dialog).toHaveAttribute('role', 'dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');

    const textarea = screen.getByTestId('ai-prompt-textarea');
    expect(textarea).toHaveFocus();
  });

  it('disables submit until prompt is non-empty', async () => {
    const user = userEvent.setup();
    render(<AiPromptModal onSubmit={vi.fn()} onClose={vi.fn()} />);

    const submit = screen.getByTestId('ai-prompt-submit');
    expect(submit).toBeDisabled();

    await user.type(screen.getByTestId('ai-prompt-textarea'), 'Move Notes');
    expect(submit).not.toBeDisabled();
  });

  it('calls onSubmit with the trimmed prompt', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<AiPromptModal onSubmit={onSubmit} onClose={vi.fn()} />);

    await user.type(
      screen.getByTestId('ai-prompt-textarea'),
      '  Replace my opportunities  ',
    );
    await user.click(screen.getByTestId('ai-prompt-submit'));

    expect(onSubmit).toHaveBeenCalledWith('Replace my opportunities');
  });

  it('clicking an example pill fills the textarea', async () => {
    const user = userEvent.setup();
    render(<AiPromptModal onSubmit={vi.fn()} onClose={vi.fn()} />);

    await user.click(
      screen.getByTestId('ai-prompt-example-move-notes-under-opportunities'),
    );

    expect(screen.getByTestId('ai-prompt-textarea')).toHaveValue(
      'Move Notes under Opportunities',
    );
  });

  it('calls onClose when Cancel is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<AiPromptModal onSubmit={vi.fn()} onClose={onClose} />);

    await user.click(screen.getByTestId('ai-prompt-cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when the close button is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<AiPromptModal onSubmit={vi.fn()} onClose={onClose} />);

    await user.click(screen.getByTestId('ai-prompt-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when Escape is pressed', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<AiPromptModal onSubmit={vi.fn()} onClose={onClose} />);

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('focus trap wraps from the last enabled control even when submit is disabled', async () => {
    const user = userEvent.setup();
    render(<AiPromptModal onSubmit={vi.fn()} onClose={vi.fn()} />);

    // Submit is disabled with empty prompt — make sure Tab from the last
    // *enabled* control (Cancel) wraps back to the close button rather than
    // landing on the disabled submit and letting focus escape.
    expect(screen.getByTestId('ai-prompt-submit')).toBeDisabled();

    screen.getByTestId('ai-prompt-cancel').focus();
    expect(screen.getByTestId('ai-prompt-cancel')).toHaveFocus();

    await user.tab();
    expect(screen.getByTestId('ai-prompt-close')).toHaveFocus();
  });

  it('does not submit when prompt is whitespace only', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<AiPromptModal onSubmit={onSubmit} onClose={vi.fn()} />);

    await user.type(screen.getByTestId('ai-prompt-textarea'), '   ');
    expect(screen.getByTestId('ai-prompt-submit')).toBeDisabled();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
