import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { JobFeedbackItem } from '@/lib/clientFeedback';

const fetchJobFeedback = vi.fn();
const recordFeedbackCheck = vi.fn();
vi.mock('@/lib/clientFeedback', async (orig) => ({
  ...(await orig<typeof import('@/lib/clientFeedback')>()),
  fetchJobFeedback: (...a: unknown[]) => fetchJobFeedback(...a),
  recordFeedbackCheck: (...a: unknown[]) => recordFeedbackCheck(...a),
}));

import ClientNotesPanel from '@/components/clean-workflow/ClientNotesPanel';

const item = (over: Partial<JobFeedbackItem>): JobFeedbackItem => ({
  id: 'a', category: 'missed', room: 'Kitchen', message: 'Oven glass streaky', status: 'open',
  created_at: '2026-11-20T00:00:00Z', source_job_id: 'j0', source_job_date: '2026-11-13',
  this_job_outcome: null, this_job_note: null, this_job_checked_by: null,
  times_not_done: 0, last_not_done_note: null, last_not_done_date: null, last_not_done_by: null, ...over,
});

function renderPanel(interactive: boolean) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}><ClientNotesPanel jobId="job-1" interactive={interactive} /></QueryClientProvider>,
  );
}

describe('ClientNotesPanel', () => {
  beforeEach(() => { fetchJobFeedback.mockReset(); recordFeedbackCheck.mockReset(); });

  it('shows nothing when the client has left no notes', async () => {
    fetchJobFeedback.mockResolvedValue([]);
    const { container } = renderPanel(true);
    await waitFor(() => expect(fetchJobFeedback).toHaveBeenCalledWith('job-1'));
    expect(container.textContent).toBe('');
  });

  it('shows the note, where it came from, and why it was not done last time', async () => {
    fetchJobFeedback.mockResolvedValue([
      item({ times_not_done: 1, last_not_done_note: 'Oven still hot', last_not_done_date: '2026-11-20', last_not_done_by: 'Jess' }),
      item({ id: 'b', category: 'every_clean', room: null, message: 'Lock the balcony door', source_job_date: null }),
    ]);
    renderPanel(true);
    expect(await screen.findByText('Oven glass streaky')).toBeTruthy();
    expect(screen.getByText('Lock the balcony door')).toBeTruthy();
    expect(screen.getByText(/from the 13 Nov clean/)).toBeTruthy();
    expect(screen.getByText(/Jess\): Oven still hot/)).toBeTruthy();
    expect(screen.getByText('2 to tick')).toBeTruthy();
  });

  it('read-only before clock on: no tick buttons', async () => {
    fetchJobFeedback.mockResolvedValue([item({})]);
    renderPanel(false);
    await screen.findByText('Oven glass streaky');
    expect(screen.queryByText('Done')).toBeNull();
  });

  it('Done saves straight away; Couldn\'t do demands a reason', async () => {
    fetchJobFeedback.mockResolvedValue([item({})]);
    recordFeedbackCheck.mockResolvedValue(undefined);
    renderPanel(true);
    fireEvent.click(await screen.findByText('Done'));
    await waitFor(() => expect(recordFeedbackCheck).toHaveBeenCalledWith('a', 'job-1', 'done', undefined));

    fireEvent.click(screen.getByText("Couldn't do"));
    fireEvent.click(screen.getByText('Save'));
    expect(recordFeedbackCheck).toHaveBeenCalledTimes(1); // blocked: no reason
    fireEvent.change(screen.getByPlaceholderText(/Why not/), { target: { value: 'No key to the shed' } });
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => expect(recordFeedbackCheck).toHaveBeenLastCalledWith('a', 'job-1', 'not_done', 'No key to the shed'));
  });
});
