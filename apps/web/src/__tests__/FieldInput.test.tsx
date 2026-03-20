import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FieldInput } from '../components/FieldInput.js';

describe('FieldInput', () => {
  // ─── text ─────────────────────────────────────────────────────────────────

  describe('text field type', () => {
    it('renders a text input', () => {
      render(<FieldInput fieldType="text" value="hello" onChange={vi.fn()} />);
      const input = screen.getByRole('textbox');
      expect(input).toBeInTheDocument();
      expect(input).toHaveValue('hello');
    });

    it('calls onChange when the user types', async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();
      render(<FieldInput fieldType="text" value="" onChange={onChange} id="test-text" />);

      await user.type(screen.getByRole('textbox'), 'a');
      expect(onChange).toHaveBeenCalledWith('a');
    });

    it('respects maxLength from options', () => {
      render(
        <FieldInput fieldType="text" value="" onChange={vi.fn()} options={{ max_length: 50 }} />,
      );
      expect(screen.getByRole('textbox')).toHaveAttribute('maxLength', '50');
    });

    it('disables the input when disabled is true', () => {
      render(<FieldInput fieldType="text" value="" onChange={vi.fn()} disabled />);
      expect(screen.getByRole('textbox')).toBeDisabled();
    });
  });

  // ─── textarea ─────────────────────────────────────────────────────────────

  describe('textarea field type', () => {
    it('renders a textarea', () => {
      render(<FieldInput fieldType="textarea" value="long text" onChange={vi.fn()} />);
      const textarea = screen.getByRole('textbox');
      expect(textarea).toBeInTheDocument();
      expect(textarea.tagName).toBe('TEXTAREA');
      expect(textarea).toHaveValue('long text');
    });

    it('calls onChange when the user types', async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();
      render(<FieldInput fieldType="textarea" value="" onChange={onChange} />);

      await user.type(screen.getByRole('textbox'), 'x');
      expect(onChange).toHaveBeenCalledWith('x');
    });
  });

  // ─── number ───────────────────────────────────────────────────────────────

  describe('number field type', () => {
    it('renders a number input', () => {
      render(<FieldInput fieldType="number" value={42} onChange={vi.fn()} />);
      const input = screen.getByRole('spinbutton');
      expect(input).toBeInTheDocument();
      expect(input).toHaveValue(42);
    });

    it('calls onChange with a number when the user types', async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();
      render(<FieldInput fieldType="number" value="" onChange={onChange} />);

      await user.type(screen.getByRole('spinbutton'), '5');
      expect(onChange).toHaveBeenCalledWith(5);
    });

    it('calls onChange with null when cleared', async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();
      render(<FieldInput fieldType="number" value={42} onChange={onChange} />);

      await user.clear(screen.getByRole('spinbutton'));
      expect(onChange).toHaveBeenCalledWith(null);
    });

    it('sets min and max from options', () => {
      render(
        <FieldInput fieldType="number" value="" onChange={vi.fn()} options={{ min: 0, max: 100 }} />,
      );
      const input = screen.getByRole('spinbutton');
      expect(input).toHaveAttribute('min', '0');
      expect(input).toHaveAttribute('max', '100');
    });
  });

  // ─── currency ─────────────────────────────────────────────────────────────

  describe('currency field type', () => {
    it('renders a number input with step 0.01', () => {
      render(<FieldInput fieldType="currency" value={99.99} onChange={vi.fn()} />);
      const input = screen.getByRole('spinbutton');
      expect(input).toBeInTheDocument();
      expect(input).toHaveAttribute('step', '0.01');
    });

    it('calls onChange with a number', async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();
      render(<FieldInput fieldType="currency" value="" onChange={onChange} />);

      await user.type(screen.getByRole('spinbutton'), '5');
      expect(onChange).toHaveBeenCalledWith(5);
    });
  });

  // ─── date ─────────────────────────────────────────────────────────────────

  describe('date field type', () => {
    it('renders a date input', () => {
      render(<FieldInput fieldType="date" value="2025-06-15" onChange={vi.fn()} />);
      const input = document.querySelector('input[type="date"]');
      expect(input).toBeInTheDocument();
      expect(input).toHaveValue('2025-06-15');
    });

    it('handles empty value', () => {
      render(<FieldInput fieldType="date" value="" onChange={vi.fn()} />);
      const input = document.querySelector('input[type="date"]');
      expect(input).toHaveValue('');
    });
  });

  // ─── datetime ─────────────────────────────────────────────────────────────

  describe('datetime field type', () => {
    it('renders a datetime-local input', () => {
      render(<FieldInput fieldType="datetime" value="2025-06-15T14:30:00Z" onChange={vi.fn()} />);
      const input = document.querySelector('input[type="datetime-local"]');
      expect(input).toBeInTheDocument();
    });
  });

  // ─── email ────────────────────────────────────────────────────────────────

  describe('email field type', () => {
    it('renders an email input', () => {
      render(<FieldInput fieldType="email" value="test@example.com" onChange={vi.fn()} />);
      const input = document.querySelector('input[type="email"]');
      expect(input).toBeInTheDocument();
      expect(input).toHaveValue('test@example.com');
    });

    it('calls onChange when user types', async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();
      render(<FieldInput fieldType="email" value="" onChange={onChange} />);

      const input = document.querySelector('input[type="email"]') as HTMLInputElement;
      await user.type(input, 'a');
      expect(onChange).toHaveBeenCalledWith('a');
    });
  });

  // ─── phone ────────────────────────────────────────────────────────────────

  describe('phone field type', () => {
    it('renders a tel input', () => {
      render(<FieldInput fieldType="phone" value="+44123456" onChange={vi.fn()} />);
      const input = document.querySelector('input[type="tel"]');
      expect(input).toBeInTheDocument();
      expect(input).toHaveValue('+44123456');
    });
  });

  // ─── url ──────────────────────────────────────────────────────────────────

  describe('url field type', () => {
    it('renders a url input', () => {
      render(<FieldInput fieldType="url" value="https://example.com" onChange={vi.fn()} />);
      const input = document.querySelector('input[type="url"]');
      expect(input).toBeInTheDocument();
      expect(input).toHaveValue('https://example.com');
    });
  });

  // ─── boolean ──────────────────────────────────────────────────────────────

  describe('boolean field type', () => {
    it('renders a checkbox (toggle)', () => {
      render(<FieldInput fieldType="boolean" value={true} onChange={vi.fn()} />);
      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).toBeInTheDocument();
      expect(checkbox).toBeChecked();
    });

    it('renders "Yes" label for true', () => {
      render(<FieldInput fieldType="boolean" value={true} onChange={vi.fn()} />);
      expect(screen.getByText('Yes')).toBeInTheDocument();
    });

    it('renders "No" label for false', () => {
      render(<FieldInput fieldType="boolean" value={false} onChange={vi.fn()} />);
      expect(screen.getByText('No')).toBeInTheDocument();
    });

    it('calls onChange with boolean when toggled', async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();
      render(<FieldInput fieldType="boolean" value={false} onChange={onChange} />);

      await user.click(screen.getByRole('checkbox'));
      expect(onChange).toHaveBeenCalledWith(true);
    });
  });

  // ─── dropdown ─────────────────────────────────────────────────────────────

  describe('dropdown field type', () => {
    it('renders a select with choices from options', () => {
      render(
        <FieldInput
          fieldType="dropdown"
          value="Active"
          onChange={vi.fn()}
          options={{ choices: ['Active', 'Inactive', 'Pending'] }}
        />,
      );
      const select = screen.getByRole('combobox');
      expect(select).toBeInTheDocument();
      expect(select).toHaveValue('Active');
    });

    it('renders a default empty option', () => {
      render(
        <FieldInput
          fieldType="dropdown"
          value=""
          onChange={vi.fn()}
          options={{ choices: ['A', 'B'] }}
        />,
      );
      expect(screen.getByText('Select option')).toBeInTheDocument();
    });

    it('calls onChange when a new option is selected', async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();
      render(
        <FieldInput
          fieldType="dropdown"
          value=""
          onChange={onChange}
          options={{ choices: ['Active', 'Inactive'] }}
        />,
      );

      await user.selectOptions(screen.getByRole('combobox'), 'Active');
      expect(onChange).toHaveBeenCalledWith('Active');
    });

    it('renders with empty choices when none provided', () => {
      render(<FieldInput fieldType="dropdown" value="" onChange={vi.fn()} />);
      const select = screen.getByRole('combobox');
      expect(select).toBeInTheDocument();
      // Only the default "Select option" option
      expect(select.querySelectorAll('option')).toHaveLength(1);
    });

    it('uses label prop in the default option text', () => {
      render(
        <FieldInput
          fieldType="dropdown"
          value=""
          onChange={vi.fn()}
          options={{ choices: ['A', 'B'] }}
          label="Industry"
        />,
      );
      expect(screen.getByText('Select Industry')).toBeInTheDocument();
    });
  });

  // ─── multi_select ─────────────────────────────────────────────────────────

  describe('multi_select field type', () => {
    it('renders checkboxes for each choice', () => {
      render(
        <FieldInput
          fieldType="multi_select"
          value={['Red']}
          onChange={vi.fn()}
          options={{ choices: ['Red', 'Blue', 'Green'] }}
        />,
      );
      const checkboxes = screen.getAllByRole('checkbox');
      expect(checkboxes).toHaveLength(3);
    });

    it('marks selected items as checked', () => {
      render(
        <FieldInput
          fieldType="multi_select"
          value={['Red', 'Green']}
          onChange={vi.fn()}
          options={{ choices: ['Red', 'Blue', 'Green'] }}
        />,
      );
      const checkboxes = screen.getAllByRole('checkbox');
      expect(checkboxes[0]).toBeChecked(); // Red
      expect(checkboxes[1]).not.toBeChecked(); // Blue
      expect(checkboxes[2]).toBeChecked(); // Green
    });

    it('calls onChange with updated array when a checkbox is toggled on', async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();
      render(
        <FieldInput
          fieldType="multi_select"
          value={['Red']}
          onChange={onChange}
          options={{ choices: ['Red', 'Blue', 'Green'] }}
        />,
      );

      // Click Blue
      await user.click(screen.getAllByRole('checkbox')[1]);
      expect(onChange).toHaveBeenCalledWith(['Red', 'Blue']);
    });

    it('calls onChange with updated array when a checkbox is toggled off', async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();
      render(
        <FieldInput
          fieldType="multi_select"
          value={['Red', 'Blue']}
          onChange={onChange}
          options={{ choices: ['Red', 'Blue', 'Green'] }}
        />,
      );

      // Uncheck Red
      await user.click(screen.getAllByRole('checkbox')[0]);
      expect(onChange).toHaveBeenCalledWith(['Blue']);
    });
  });

  // ─── unknown field type ───────────────────────────────────────────────────

  describe('unknown field type', () => {
    it('falls back to a text input', () => {
      render(<FieldInput fieldType="custom_unknown" value="test" onChange={vi.fn()} />);
      const input = screen.getByRole('textbox');
      expect(input).toBeInTheDocument();
      expect(input).toHaveValue('test');
    });
  });

  // ─── formula ──────────────────────────────────────────────────────────────

  describe('formula field type', () => {
    it('renders a disabled read-only input', () => {
      render(<FieldInput fieldType="formula" value={42} onChange={vi.fn()} />);
      const input = screen.getByRole('textbox');
      expect(input).toBeInTheDocument();
      expect(input).toBeDisabled();
      expect(input).toHaveValue('42');
    });

    it('shows a dash for null value', () => {
      render(<FieldInput fieldType="formula" value={null} onChange={vi.fn()} />);
      const input = screen.getByRole('textbox');
      expect(input).toHaveValue('—');
    });

    it('has a title attribute explaining it is calculated', () => {
      render(<FieldInput fieldType="formula" value={10} onChange={vi.fn()} />);
      const input = screen.getByRole('textbox');
      expect(input).toHaveAttribute('title', 'This field is calculated automatically');
    });
  });

  // ─── Null / undefined values ──────────────────────────────────────────────

  describe('null and undefined values', () => {
    it('renders empty string for null value', () => {
      render(<FieldInput fieldType="text" value={null} onChange={vi.fn()} />);
      expect(screen.getByRole('textbox')).toHaveValue('');
    });

    it('renders empty string for undefined value', () => {
      render(<FieldInput fieldType="text" value={undefined} onChange={vi.fn()} />);
      expect(screen.getByRole('textbox')).toHaveValue('');
    });
  });

  // ─── Required / disabled props ────────────────────────────────────────────

  describe('required and disabled props', () => {
    it('sets required attribute when required is true', () => {
      render(<FieldInput fieldType="text" value="" onChange={vi.fn()} required />);
      expect(screen.getByRole('textbox')).toBeRequired();
    });

    it('sets disabled attribute when disabled is true', () => {
      render(<FieldInput fieldType="email" value="" onChange={vi.fn()} disabled />);
      const input = document.querySelector('input[type="email"]');
      expect(input).toBeDisabled();
    });
  });

  // ─── id and name props ────────────────────────────────────────────────────

  describe('id and name props', () => {
    it('passes id to the input', () => {
      render(<FieldInput fieldType="text" value="" onChange={vi.fn()} id="my-id" />);
      expect(screen.getByRole('textbox')).toHaveAttribute('id', 'my-id');
    });

    it('passes name to the input', () => {
      render(<FieldInput fieldType="text" value="" onChange={vi.fn()} name="my-name" />);
      expect(screen.getByRole('textbox')).toHaveAttribute('name', 'my-name');
    });
  });
});
