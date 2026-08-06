import type { Task, Milestone } from './types';
import { computeBaseSchedules } from './scheduling';
import Papa from 'papaparse';
import { uid } from './seed';

export function escapeCSVField(v: unknown): string {
  const str = String(v == null ? '' : v);
  return /[",\n]/.test(str) ? '"' + str.replace(/"/g, '""') + '"' : str;
}

export function getCSVFilename(projectName: string): string {
  return (projectName || 'project').replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '.csv';
}

export function buildTasksCsvString(tasks: Task[], milestones: Milestone[]): string {
  const milestoneById: { [key: string]: Milestone } = {};
  (milestones || []).forEach(m => {
    milestoneById[m.id] = m;
  });

  const base = computeBaseSchedules(tasks || []);

  const headers = ['ID', 'Name', 'Milestone', 'Category', 'Assignee', 'Status', 'Start Date', 'Estimate (days)', 'Est. End Date', 'Progress %', 'Dependencies'];

  const rows = [headers].concat(
    (tasks || []).map(t => {
      const sched = base[t.id] || {};
      const depNames = (t.dependencies || []).join('; ');

      return [
        t.id,
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

export function parseTasksCsvString(csvText: string, existingMilestones: Milestone[]): { tasks: Task[], milestones: Milestone[] } {
  // Parse CSV with headers
  const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
  const rows = parsed.data as any[];

  // Build milestone name to ID map
  const nameToId = new Map<string, string>();
  existingMilestones.forEach((m) => {
    if (m.name && !nameToId.has(m.name)) nameToId.set(m.name, m.id);
  });
  const milestoneOrder: string[] = [];

  // Function to resolve milestone ID
  const resolveMilestoneId = (milestoneName: string): string | null => {
    const name = milestoneName.trim();
    if (!name) return null;
    if (!nameToId.has(name)) {
      nameToId.set(name, uid('m'));
    }
    if (!milestoneOrder.includes(name)) milestoneOrder.push(name);
    return nameToId.get(name)!;
  };

  // Parse tasks
  const tasks = rows.map((row: any) => {
    const deps = (row['Dependencies'] || '').split('; ').filter((d: string) => d.trim());

    return {
      id: row['ID'],
      name: row['Name'],
      milestoneId: resolveMilestoneId(row['Milestone']),
      parentId: null,
      category: row['Category'] || '',
      assignee: row['Assignee'] || '',
      status: row['Status'] || '',
      startDate: row['Start Date'] || '',
      estimate: parseInt(row['Estimate (days)']) || 0,
      progress: parseInt(row['Progress %']) || 0,
      order: 0,
      dependencies: deps,
      comments: [],
      notes: undefined
    } as Task;
  });

  // Build milestones
  const milestones = milestoneOrder.map(name => ({
    id: nameToId.get(name)!,
    name
  })) as Milestone[];

  return { tasks, milestones };
}
