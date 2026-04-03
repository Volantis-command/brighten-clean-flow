export const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string; border: string; label: string }> = {
  awaiting_quote: {
    bg: 'bg-amber-100',
    text: 'text-amber-800',
    dot: 'bg-amber-400',
    border: 'border-l-amber-400',
    label: 'Awaiting Quote',
  },
  confirmed: {
    bg: 'bg-primary/10',
    text: 'text-primary',
    dot: 'bg-primary',
    border: 'border-l-primary',
    label: 'Confirmed',
  },
  scheduled: {
    bg: 'bg-primary/10',
    text: 'text-primary',
    dot: 'bg-primary',
    border: 'border-l-primary',
    label: 'Scheduled',
  },
  in_progress: {
    bg: 'bg-amber-100',
    text: 'text-amber-800',
    dot: 'bg-amber-400',
    border: 'border-l-amber-500',
    label: 'In Progress',
  },
  completed: {
    bg: 'bg-green-100',
    text: 'text-green-800',
    dot: 'bg-green-500',
    border: 'border-l-green-500',
    label: 'Completed',
  },
  complete: {
    bg: 'bg-green-100',
    text: 'text-green-800',
    dot: 'bg-green-500',
    border: 'border-l-green-500',
    label: 'Completed',
  },
  cancelled: {
    bg: 'bg-gray-100',
    text: 'text-destructive line-through',
    dot: 'bg-gray-400',
    border: 'border-l-gray-400',
    label: 'Cancelled',
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
