/**
 * Canonical calendar color mapping for job.status values.
 *
 * State machine (see src/lib/jobAssignment.ts):
 *   pending_cleaner              🟡  quote accepted, no cleaner assigned
 *   awaiting_cleaner_acceptance  🟡  cleaner assigned, awaiting accept/decline
 *   awaiting_quote               🟡  no price set yet
 *   confirmed                    🟢  all cleaners accepted
 *   scheduled                    🟢  legacy pre-fix jobs, treated as green
 *   in_progress                  🔵  cleaner clocked in
 *   completed                    ⚪️  finished
 *   cancelled                    🔴  cancelled
 *   flagged                      🔴  issue
 *   declined (acceptance only)   ⚪️  cleaner declined, awaits reassignment
 */
export const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string; border: string; label: string }> = {
  // ── Yellow: waiting on someone ──
  pending_cleaner: {
    bg: 'bg-yellow-100',
    text: 'text-yellow-800',
    dot: 'bg-yellow-400',
    border: 'border-l-yellow-400',
    label: 'Needs Cleaner',
  },
  awaiting_cleaner_acceptance: {
    bg: 'bg-yellow-100',
    text: 'text-yellow-800',
    dot: 'bg-yellow-400',
    border: 'border-l-yellow-400',
    label: 'Awaiting Cleaner',
  },
  awaiting_quote: {
    bg: 'bg-yellow-100',
    text: 'text-yellow-800',
    dot: 'bg-yellow-400',
    border: 'border-l-yellow-400',
    label: 'Awaiting Quote',
  },

  // ── Green: locked in ──
  confirmed: {
    bg: 'bg-emerald-100',
    text: 'text-[#4ADE80]',
    dot: 'bg-emerald-500',
    border: 'border-l-emerald-500',
    label: 'Confirmed',
  },
  scheduled: {
    // Legacy: treated as green for pre-state-machine jobs
    bg: 'bg-emerald-100',
    text: 'text-[#4ADE80]',
    dot: 'bg-emerald-500',
    border: 'border-l-emerald-500',
    label: 'Scheduled',
  },

  // ── Blue: in flight ──
  in_progress: {
    bg: 'bg-blue-100',
    text: 'text-blue-800',
    dot: 'bg-blue-500',
    border: 'border-l-blue-500',
    label: 'In Progress',
  },

  // ── Gray: done ──
  completed: {
    bg: 'bg-gray-100',
    text: 'text-gray-600',
    dot: 'bg-gray-400',
    border: 'border-l-gray-400',
    label: 'Completed',
  },

  // ── Red: problems ──
  cancelled: {
    bg: 'bg-red-100',
    text: 'text-red-700 line-through',
    dot: 'bg-red-500',
    border: 'border-l-red-500',
    label: 'Cancelled',
  },
  flagged: {
    bg: 'bg-red-100',
    text: 'text-red-700',
    dot: 'bg-red-500',
    border: 'border-l-red-500',
    label: 'Flagged',
  },

  // ── Acceptance-only visual (not a job.status value, used by AcceptanceBadge) ──
  declined: {
    bg: 'bg-gray-200',
    text: 'text-gray-500 line-through',
    dot: 'bg-gray-400',
    border: 'border-l-gray-400',
    label: 'Declined',
  },
};

export function getStatusColor(status: string) {
  return STATUS_COLORS[status] || STATUS_COLORS.scheduled;
}

export function getAcceptanceIcon(status: string) {
  switch (status) {
    case 'accepted': return '✅';
    case 'declined': return '❌';
    case 'pending': return '⏳';
    default: return '📵';
  }
}
