import type { Task } from './types';
import { TODAY, addDays, addWorkingDays, nextWorkingDay } from './dates';

export function computeBaseSchedules(tasks: Task[]) {
  const byId: { [taskId: string]: Task } = {};
  tasks.forEach(t => { byId[t.id] = t; });
  const memo: { [taskId: string]: { start: string; end: string } } = {};
  function get(id: string, stack: Set<string>) {
    if (memo[id]) return memo[id];
    const t = byId[id];
    if (!t) return { start: TODAY, end: TODAY };
    if (stack.has(id)) return { start: t.startDate, end: t.startDate };
    stack.add(id);
    let start = nextWorkingDay(t.startDate);
    (t.dependencies || []).forEach(depId => {
      const ds = get(depId, stack);
      const candidate = nextWorkingDay(addDays(ds.end, 1));
      if (candidate > start) start = candidate;
    });
    const end = addWorkingDays(start, t.estimate || 0);
    stack.delete(id);
    const sched = { start, end };
    memo[id] = sched;
    return sched;
  }
  tasks.forEach(t => get(t.id, new Set()));
  return memo;
}

export function computeDisplaySchedules(tasks: Task[], base: { [taskId: string]: { start: string; end: string } }) {
  const byParent: { [parentId: string]: string[] } = {};
  tasks.forEach(t => { if (t.parentId) (byParent[t.parentId] = byParent[t.parentId] || []).push(t.id); });
  const display: { [taskId: string]: { start: string; end: string } } = {};
  tasks.forEach(t => { if (!byParent[t.id] || !byParent[t.id].length) display[t.id] = base[t.id]; });
  tasks.forEach(t => {
    const kids = byParent[t.id];
    if (kids && kids.length) {
      let start: string | null = null, end: string | null = null;
      kids.forEach(k => {
        const s = display[k] || base[k];
        if (!start || s.start < start) start = s.start;
        if (!end || s.end > end) end = s.end;
      });
      display[t.id] = { start: start!, end: end! };
    }
  });
  return display;
}

export function computeProgressMap(tasks: Task[]) {
  const byParent: { [parentId: string]: string[] } = {};
  tasks.forEach(t => { if (t.parentId) (byParent[t.parentId] = byParent[t.parentId] || []).push(t.id); });
  const prog: { [taskId: string]: number } = {};
  tasks.forEach(t => { if (!byParent[t.id] || !byParent[t.id].length) prog[t.id] = t.progress || 0; });
  tasks.forEach(t => {
    const kids = byParent[t.id];
    if (kids && kids.length) prog[t.id] = Math.round(kids.reduce((s, k) => s + (prog[k] || 0), 0) / kids.length);
  });
  return prog;
}

export function computeCriticalSet(tasks: Task[], base: { [taskId: string]: { start: string; end: string } }) {
  const byId: { [taskId: string]: Task } = {};
  tasks.forEach(t => byId[t.id] = t);
  const leaves = tasks.filter(t => !tasks.some(o => o.parentId === t.id));
  let endTask: Task | null = null, maxEnd: string | null = null;
  leaves.forEach(t => { const s = base[t.id]; if (s && (!maxEnd || s.end > maxEnd)) { maxEnd = s.end; endTask = t; } });
  const crit = new Set<string>();
  let cur: Task | null = endTask;
  const guard = new Set<string>();
  while (cur) {
    const curTask = cur as Task;
    if (guard.has(curTask.id)) break;
    crit.add(curTask.id);
    guard.add(curTask.id);
    if (curTask.parentId) crit.add(curTask.parentId);
    const deps = curTask.dependencies || [];
    if (!deps.length) break;
    let next: Task | null = null
    let nextEnd: string | null = null
    deps.forEach((depId: string) => {
      const dt = byId[depId];
      if (!dt) return;
      const s = base[depId];
      if (s && (!nextEnd || s.end > nextEnd)) { nextEnd = s.end; next = dt; }
    });
    cur = next;
  }
  return crit;
}

export function isDependentOn(tasks: Task[], aId: string, bId: string): boolean {
  const byId: { [taskId: string]: Task } = {};
  tasks.forEach(t => byId[t.id] = t);
  const seen = new Set<string>();
  function walk(id: string): boolean {
    if (id === bId) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    const t = byId[id];
    if (!t) return false;
    return (t.dependencies || []).some(walk);
  }
  return walk(aId);
}
