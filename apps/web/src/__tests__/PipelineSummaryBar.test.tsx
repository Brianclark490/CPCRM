import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PipelineSummaryBar } from '../components/PipelineSummaryBar.js';
import type { PipelineSummaryData } from '../components/PipelineSummaryBar.js';

const mockData: PipelineSummaryData = {
  totals: {
    openDeals: 12,
    totalOpenValue: 1500000,
    totalWeightedValue: 750000,
    avgDealSize: 125000,
    wonThisMonth: 3,
    wonValueThisMonth: 400000,
    lostThisMonth: 1,
  },
  avgDaysToClose: 22,
};

function renderBar(data: PipelineSummaryData = mockData) {
  return render(<PipelineSummaryBar data={data} />);
}

describe('PipelineSummaryBar', () => {
  it('renders the summary bar container', () => {
    renderBar();
    expect(screen.getByTestId('pipeline-summary-bar')).toBeInTheDocument();
  });

  it('renders all six stat card labels', () => {
    renderBar();
    expect(screen.getByText('Total Open Value')).toBeInTheDocument();
    expect(screen.getByText('Weighted Pipeline')).toBeInTheDocument();
    expect(screen.getByText('Open Deals')).toBeInTheDocument();
    expect(screen.getByText('Avg Deal Size')).toBeInTheDocument();
    expect(screen.getByText('Won This Month')).toBeInTheDocument();
    expect(screen.getByText('Avg Days to Close')).toBeInTheDocument();
  });

  it('displays formatted currency values', () => {
    renderBar();
    // £1.5M for total open value
    expect(screen.getByText('£1.5M')).toBeInTheDocument();
    // £750K for weighted pipeline
    expect(screen.getByText('£750K')).toBeInTheDocument();
  });

  it('displays open deals count', () => {
    renderBar();
    expect(screen.getByText('12')).toBeInTheDocument();
  });

  it('displays won this month count', () => {
    renderBar();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('displays avg days to close with d suffix', () => {
    renderBar();
    expect(screen.getByText('22d')).toBeInTheDocument();
  });

  it('handles zero values gracefully', () => {
    renderBar({
      totals: {
        openDeals: 0,
        totalOpenValue: 0,
        totalWeightedValue: 0,
        avgDealSize: 0,
        wonThisMonth: 0,
        wonValueThisMonth: 0,
        lostThisMonth: 0,
      },
      avgDaysToClose: 0,
    });
    expect(screen.getByText('Total Open Value')).toBeInTheDocument();
    expect(screen.getByText('0d')).toBeInTheDocument();
  });
});
