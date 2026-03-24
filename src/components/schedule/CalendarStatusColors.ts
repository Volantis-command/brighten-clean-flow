export const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string; border: string; label: string }> = {
  awaiting_quote: {
    bg: 'bg-amber-100',
    text: 'text-amber-800',
    dot: 'bg-amber-400',
    border: 'border-l-amber-400',
    label: 'Awaiting Quote',
  },
  scheduled: {
    bg: 'bg-primary/10',
    text: 'text-primary',
    dot: 'bg-primary',
    border: 'border-l-primary',
    label: 'Scheduled',
  },
  in_progress: {
    bg: 'bg-orange-100',
    text: 'text-orange-800',
    dot: 'bg-orange-400',
    border: 'border-l-orange-400',
    label: 'In Progress',
  },
  complete: {
    bg: 'bg-emerald-100',
    text: 'text-emerald-700',
    dot: 'bg-emerald-400',
    border: 'border-l-emerald-400',
    label: 'Complete',
  },
  flagged: {
    bg: 'bg-red-100',
    text: 'text-red-700',
    dot: 'bg-red-500',
    border: 'border-l-red-500',
    label: 'Flagged',
  },
  declined: {
    bg: 'bg-gray-200',
    text: 'text-gray-500 line-through',
    dot: 'bg-gray-400',
    border: 'border-l-gray-400',
    label: 'Declined',
  },
  awaiting_schedule_approval: {
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    dot: 'bg-amber-500',
    border: 'border-l-amber-500',
    label: 'Pending Approval',
  },
  awaiting_approval: {
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    dot: 'bg-amber-500',
    border: 'border-l-amber-500',
    label: 'Awaiting Approval',
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
