import type { Task, Milestone } from './types';
import { computeBaseSchedules } from './scheduling';

export function escapeCSVField(v: unknown): string {
  const str = String(v == null ? '' : v);
  return /[",\n]/.test(str) ? '"' + str.replace(/"/g, '""') + '"' : str;
}

export function getCSVFilename(projectName: string): string {
  return (projectName || 'project').replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '-tasks.csv';
}

export function buildTasksCsvString(tasks: Task[], milestones: Milestone[]): string {
  const milestoneById: { [key: string]: Milestone } = {};
  (milestones || []).forEach(m => {
    milestoneById[m.id] = m;
  });

  const base = computeBaseSchedules(tasks || []);

  const headers = ['Name', 'Milestone', 'Category', 'Assignee', 'Status', 'Start Date', 'Estimate (days)', 'Est. End Date', 'Progress %', 'Dependencies'];

  const rows = [headers].concat(
    (tasks || []).map(t => {
      const sched = base[t.id] || {};
      const depNames = (t.dependencies || [])
        .map(id => {
          const d = (tasks || []).find(x => x.id === id);
          return d ? d.name : id;
        })
        .join('; ');

      return [
        t.name,
        (milestoneById[t.milestoneId!] && milestoneById[t.milestoneId!].name) || '',
        t.category || '',
        t.assignee || '',
        t.status || '',
        t.startDate || '',
        String(t.estimate || 0),
        sched.end || '',
        String(t.progress || 0),
        depNames
      ];
    })
  );

  return rows.map(r => r.map(escapeCSVField).join(',')).join('\n');
}

export function exportTasksCsv(tasks: Task[], milestones: Milestone[], projectName: string): void {
  const csv = buildTasksCsvString(tasks, milestones);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = getCSVFilename(projectName);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
