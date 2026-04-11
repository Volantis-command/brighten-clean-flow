export const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string; border: string; label: string }> = {
  pending_approval: {
    bg: 'bg-yellow-100',
    text: 'text-yellow-800',
    dot: 'bg-yellow-400',
    border: 'border-l-yellow-400',
    label: 'Pending Approval',
  },
  awaiting_schedule_approval: {
    bg: 'bg-yellow-100',
    text: 'text-yellow-800',
    dot: 'bg-yellow-400',
    border: 'border-l-yellow-400',
    label: 'Pending Approval',
  },
  awaiting_quote: {
    bg: 'bg-yellow-100',
    text: 'text-yellow-800',
    dot: 'bg-yellow-400',
    border: 'border-l-yellow-400',
    label: 'Awaiting Quote',
  },
  awaiting_approval: {
    bg: 'bg-yellow-100',
    text: 'text-yellow-800',
    dot: 'bg-yellow-400',
    border: 'border-l-yellow-400',
    label: 'Awaiting Approval',
  },
  confirmed: {
    bg: 'bg-emerald-100',
    text: 'text-emerald-800',
    dot: 'bg-emerald-500',
    border: 'border-l-emerald-500',
    label: 'Confirmed',
  },
  scheduled: {
    bg: 'bg-emerald-100',
    text: 'text-emerald-800',
    dot: 'bg-emerald-500',
    border: 'border-l-emerald-500',
    label: 'Scheduled',
  },
  in_progress: {
    bg: 'bg-blue-100',
    text: 'text-blue-800',
    dot: 'bg-blue-500',
    border: 'border-l-blue-500',
    label: 'In Progress',
  },
  completed: {
    bg: 'bg-gray-100',
    text: 'text-gray-600',
    dot: 'bg-gray-400',
    border: 'border-l-gray-400',
    label: 'Completed',
  },
  complete: {
    bg: 'bg-gray-100',
    text: 'text-gray-600',
    dot: 'bg-gray-400',
    border: 'border-l-gray-400',
    label: 'Completed',
  },
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
