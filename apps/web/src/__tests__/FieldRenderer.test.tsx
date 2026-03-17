import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FieldRenderer } from '../components/FieldRenderer.js';

describe('FieldRenderer', () => {
  // ─── Null / empty values ──────────────────────────────────────────────────

  it('renders em-dash for null value', () => {
    render(<FieldRenderer fieldType="text" value={null} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('renders em-dash for undefined value', () => {
    render(<FieldRenderer fieldType="text" value={undefined} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('renders em-dash for empty string value', () => {
    render(<FieldRenderer fieldType="text" value="" />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  // ─── text ─────────────────────────────────────────────────────────────────

  describe('text field type', () => {
    it('renders plain text', () => {
      render(<FieldRenderer fieldType="text" value="Hello World" />);
      expect(screen.getByText('Hello World')).toBeInTheDocument();
    });
  });

  // ─── textarea ─────────────────────────────────────────────────────────────

  describe('textarea field type', () => {
    it('renders paragraph text', () => {
      render(<FieldRenderer fieldType="textarea" value="Long description text" />);
      expect(screen.getByText('Long description text')).toBeInTheDocument();
    });
  });

  // ─── number ───────────────────────────────────────────────────────────────

  describe('number field type', () => {
    it('renders a formatted number', () => {
      render(<FieldRenderer fieldType="number" value={1234} />);
      // toLocaleString will format this — just check it's rendered
      expect(screen.getByText(/1.*234/)).toBeInTheDocument();
    });

    it('renders zero', () => {
      render(<FieldRenderer fieldType="number" value={0} />);
      expect(screen.getByText('0')).toBeInTheDocument();
    });
  });

  // ─── currency ─────────────────────────────────────────────────────────────

  describe('currency field type', () => {
    it('renders a formatted currency value with two decimals', () => {
      render(<FieldRenderer fieldType="currency" value={1234.5} />);
      // toLocaleString with 2 fraction digits
      expect(screen.getByText(/1.*234\.50/)).toBeInTheDocument();
    });

    it('renders zero as 0.00', () => {
      render(<FieldRenderer fieldType="currency" value={0} />);
      expect(screen.getByText('0.00')).toBeInTheDocument();
    });
  });

  // ─── date ─────────────────────────────────────────────────────────────────

  describe('date field type', () => {
    it('renders a formatted date', () => {
      render(<FieldRenderer fieldType="date" value="2025-06-15" />);
      // Should contain "Jun" and "2025" and "15" in some locale-specific format
      const el = screen.getByText(/2025/);
      expect(el).toBeInTheDocument();
    });
  });

  // ─── datetime ─────────────────────────────────────────────────────────────

  describe('datetime field type', () => {
    it('renders a formatted date and time', () => {
      render(<FieldRenderer fieldType="datetime" value="2025-06-15T14:30:00Z" />);
      // Should contain year
      const el = screen.getByText(/2025/);
      expect(el).toBeInTheDocument();
    });
  });

  // ─── email ────────────────────────────────────────────────────────────────

  describe('email field type', () => {
    it('renders a clickable mailto link', () => {
      render(<FieldRenderer fieldType="email" value="test@example.com" />);
      const link = screen.getByRole('link', { name: 'test@example.com' });
      expect(link).toHaveAttribute('href', 'mailto:test@example.com');
    });
  });

  // ─── phone ────────────────────────────────────────────────────────────────

  describe('phone field type', () => {
    it('renders a clickable tel link', () => {
      render(<FieldRenderer fieldType="phone" value="+1234567890" />);
      const link = screen.getByRole('link', { name: '+1234567890' });
      expect(link).toHaveAttribute('href', 'tel:+1234567890');
    });
  });

  // ─── url ──────────────────────────────────────────────────────────────────

  describe('url field type', () => {
    it('renders a clickable link for http URLs', () => {
      render(<FieldRenderer fieldType="url" value="https://example.com" />);
      const link = screen.getByRole('link', { name: 'https://example.com' });
      expect(link).toHaveAttribute('href', 'https://example.com');
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('renders plain text for non-http URLs', () => {
      render(<FieldRenderer fieldType="url" value="ftp://example.com" />);
      expect(screen.getByText('ftp://example.com')).toBeInTheDocument();
      expect(screen.queryByRole('link')).not.toBeInTheDocument();
    });
  });

  // ─── boolean ──────────────────────────────────────────────────────────────

  describe('boolean field type', () => {
    it('renders "Yes" for true', () => {
      render(<FieldRenderer fieldType="boolean" value={true} />);
      expect(screen.getByText('Yes')).toBeInTheDocument();
    });

    it('renders "No" for false', () => {
      render(<FieldRenderer fieldType="boolean" value={false} />);
      expect(screen.getByText('No')).toBeInTheDocument();
    });
  });

  // ─── dropdown ─────────────────────────────────────────────────────────────

  describe('dropdown field type', () => {
    it('renders the selected value', () => {
      render(<FieldRenderer fieldType="dropdown" value="Active" />);
      expect(screen.getByText('Active')).toBeInTheDocument();
    });
  });

  // ─── multi_select ─────────────────────────────────────────────────────────

  describe('multi_select field type', () => {
    it('renders array values joined with commas', () => {
      render(<FieldRenderer fieldType="multi_select" value={['Red', 'Blue', 'Green']} />);
      expect(screen.getByText('Red, Blue, Green')).toBeInTheDocument();
    });

    it('renders a single string value', () => {
      render(<FieldRenderer fieldType="multi_select" value="Red" />);
      expect(screen.getByText('Red')).toBeInTheDocument();
    });
  });

  // ─── unknown field type ───────────────────────────────────────────────────

  describe('unknown field type', () => {
    it('renders the value as a string', () => {
      render(<FieldRenderer fieldType="custom_unknown" value="Fallback value" />);
      expect(screen.getByText('Fallback value')).toBeInTheDocument();
    });
  });
});
