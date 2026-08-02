export const STATUS_OPTIONS = ['Not Started', 'In Progress', 'Blocked', 'Done']

export const STATUS_COLORS: Record<string, string> = {
  'Not Started': 'var(--ns-ink-400)',
  'In Progress': 'var(--ns-netskope-blue)',
  Blocked: 'var(--ns-danger)',
  Done: 'var(--ns-success)',
}

export function statusColor(status: string): string {
  return STATUS_COLORS[status] || 'var(--ns-ink-400)'
}
