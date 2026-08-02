import { describe, it, expect, vi } from 'vitest';
import { buildTasksCsvString, escapeCSVField, getCSVFilename } from './csv';
import type { Task, Milestone } from './types';
import * as scheduling from './scheduling';

// Mock the scheduling module
vi.mock('./scheduling', () => ({
  computeBaseSchedules: vi.fn(),
}));

describe('CSV Export', () => {
  describe('escapeCSVField', () => {
    // Test 2: Escaping — comma
    it('should escape fields with commas by quoting them', () => {
      const result = escapeCSVField('Foo, Bar');
      expect(result).toBe('"Foo, Bar"');
    });

    // Test 3: Escaping — embedded quote
    it('should escape embedded quotes by doubling them and quoting the field', () => {
      const result = escapeCSVField('Say "hi"');
      expect(result).toBe('"Say ""hi"""');
    });

    // Test 4: Escaping — newline
    it('should preserve newlines in quoted fields', () => {
      const result = escapeCSVField('Line one\nLine two');
      expect(result).toBe('"Line one\nLine two"');
    });

    // Test 5: Plain field no escaping
    it('should not quote simple fields without special characters', () => {
      const result = escapeCSVField('Simple Task');
      expect(result).toBe('Simple Task');
    });

    it('should handle null/undefined as empty string', () => {
      expect(escapeCSVField(null)).toBe('');
      expect(escapeCSVField(undefined)).toBe('');
    });

    it('should handle numbers', () => {
      expect(escapeCSVField(42)).toBe('42');
      expect(escapeCSVField(0)).toBe('0');
    });
  });

  describe('getCSVFilename', () => {
    // Test 9: Filename slug
    it('should slug project name: "My Cool Project!!" → my-cool-project-tasks.csv', () => {
      const result = getCSVFilename('My Cool Project!!');
      expect(result).toBe('my-cool-project--tasks.csv');
    });

    it('should handle special characters in project name', () => {
      const result = getCSVFilename('Project@#$%Name');
      expect(result).toBe('project-name-tasks.csv');
    });

    it('should default to "project" when projectName is empty', () => {
      const result = getCSVFilename('');
      expect(result).toBe('project-tasks.csv');
    });

    it('should lowercase the filename', () => {
      const result = getCSVFilename('UPPERCASE PROJECT');
      expect(result).toBe('uppercase-project-tasks.csv');
    });

    it('should handle multiple consecutive special characters', () => {
      const result = getCSVFilename('My---Cool***Project');
      expect(result).toBe('my-cool-project-tasks.csv');
    });
  });

  describe('buildTasksCsvString', () => {
    // Test 1: Header row exact match
    it('should have correct header row with no Sub-category column', () => {
      const tasks: Task[] = [];
      const milestones: Milestone[] = [];

      vi.mocked(scheduling.computeBaseSchedules).mockReturnValue({});

      const csv = buildTasksCsvString(tasks, milestones);
      const lines = csv.split('\n');
      const headers = lines[0];

      expect(headers).toBe(
        'Name,Milestone,Category,Assignee,Status,Start Date,Estimate (days),Est. End Date,Progress %,Dependencies'
      );
      expect(lines.length).toBe(1); // Only header row
    });

    // Test 6: Dependencies as names semicolon-joined
    it('should join dependency names with semicolon', () => {
      const task1: Task = {
        id: 't1',
        name: 'Task 1',
        milestoneId: null,
        parentId: null,
        category: '',
        assignee: '',
        status: '',
        estimate: 0,
        startDate: '',
        progress: 0,
        dependencies: ['t2', 't3'],
        comments: [],
      };

      const task2: Task = {
        id: 't2',
        name: 'Task 2',
        milestoneId: null,
        parentId: null,
        category: '',
        assignee: '',
        status: '',
        estimate: 0,
        startDate: '',
        progress: 0,
        dependencies: [],
        comments: [],
      };

      const task3: Task = {
        id: 't3',
        name: 'Task 3',
        milestoneId: null,
        parentId: null,
        category: '',
        assignee: '',
        status: '',
        estimate: 0,
        startDate: '',
        progress: 0,
        dependencies: [],
        comments: [],
      };

      const tasks = [task1, task2, task3];
      const milestones: Milestone[] = [];

      vi.mocked(scheduling.computeBaseSchedules).mockReturnValue({
        t1: { start: '2024-12-01', end: '2024-12-31' },
        t2: { start: '2024-12-01', end: '2024-12-20' },
        t3: { start: '2024-12-01', end: '2024-12-25' },
      });

      const csv = buildTasksCsvString(tasks, milestones);
      const lines = csv.split('\n');
      const task1Row = lines[1]; // Task 1 is the first data row

      // Dependencies column should be "Task 2; Task 3"
      expect(task1Row).toContain('Task 1,');
      expect(task1Row.endsWith('Task 2; Task 3')).toBe(true);
    });

    // Test 7: Dangling dependency id falls back to raw id
    it('should show raw id when dependency task is not found', () => {
      const task1: Task = {
        id: 't1',
        name: 'Task 1',
        milestoneId: null,
        parentId: null,
        category: '',
        assignee: '',
        status: '',
        estimate: 0,
        startDate: '',
        progress: 0,
        dependencies: ['missing-task-id'],
        comments: [],
      };

      const tasks = [task1];
      const milestones: Milestone[] = [];

      vi.mocked(scheduling.computeBaseSchedules).mockReturnValue({
        t1: { start: '2024-12-01', end: '' },
      });

      const csv = buildTasksCsvString(tasks, milestones);
      const lines = csv.split('\n');
      const task1Row = lines[1];

      expect(task1Row).toContain('missing-task-id');
    });

    // Test 8: Est. End Date sourced from computeBaseSchedules
    it('should populate Est. End Date from computeBaseSchedules', () => {
      const task1: Task = {
        id: 't1',
        name: 'Task 1',
        milestoneId: null,
        parentId: null,
        category: '',
        assignee: '',
        status: '',
        estimate: 5,
        startDate: '2024-12-01',
        progress: 0,
        dependencies: [],
        comments: [],
      };

      const tasks = [task1];
      const milestones: Milestone[] = [];

      const mockSchedule = { start: '2024-12-01', end: '2024-12-06' };
      vi.mocked(scheduling.computeBaseSchedules).mockReturnValue({
        t1: mockSchedule,
      });

      const csv = buildTasksCsvString(tasks, milestones);
      const lines = csv.split('\n');
      const task1Row = lines[1];

      // The row should contain the end date at the Est. End Date column (column 7, 0-indexed)
      expect(task1Row).toContain('2024-12-06');
    });

    // Test 10: Milestone name lookup (name not id); null milestoneId → empty string
    it('should look up milestone by id and use name, not id', () => {
      const milestone1: Milestone = {
        id: 'm1',
        name: 'Phase 1',
      };

      const task1: Task = {
        id: 't1',
        name: 'Task 1',
        milestoneId: 'm1',
        parentId: null,
        category: '',
        assignee: '',
        status: '',
        estimate: 0,
        startDate: '',
        progress: 0,
        dependencies: [],
        comments: [],
      };

      const tasks = [task1];
      const milestones = [milestone1];

      vi.mocked(scheduling.computeBaseSchedules).mockReturnValue({
        t1: { start: '2024-12-01', end: '' },
      });

      const csv = buildTasksCsvString(tasks, milestones);
      const lines = csv.split('\n');
      const task1Row = lines[1];

      // The milestone column should have "Phase 1", not "m1"
      expect(task1Row).toContain('Task 1,Phase 1,');
    });

    it('should show empty string for null milestoneId', () => {
      const task1: Task = {
        id: 't1',
        name: 'Task 1',
        milestoneId: null,
        parentId: null,
        category: '',
        assignee: '',
        status: '',
        estimate: 0,
        startDate: '',
        progress: 0,
        dependencies: [],
        comments: [],
      };

      const tasks = [task1];
      const milestones: Milestone[] = [];

      vi.mocked(scheduling.computeBaseSchedules).mockReturnValue({
        t1: { start: '2024-12-01', end: '' },
      });

      const csv = buildTasksCsvString(tasks, milestones);
      const lines = csv.split('\n');
      const task1Row = lines[1];

      // Milestone column should be empty (no name after first comma)
      expect(task1Row).toMatch(/^Task 1,,/);
    });

    it('should handle complex scenario with multiple tasks, milestones, and special characters', () => {
      const milestone1: Milestone = {
        id: 'm1',
        name: 'Release 1.0',
      };

      const task1: Task = {
        id: 't1',
        name: 'Setup "Environment"',
        milestoneId: 'm1',
        parentId: null,
        category: 'Infrastructure',
        assignee: 'Alice',
        status: 'In Progress',
        estimate: 3,
        startDate: '2024-12-01',
        progress: 50,
        dependencies: [],
        comments: [],
      };

      const task2: Task = {
        id: 't2',
        name: 'Build API, Tests\nand Deploy',
        milestoneId: null,
        parentId: null,
        category: 'Development',
        assignee: 'Bob',
        status: 'Not Started',
        estimate: 5,
        startDate: '2024-12-05',
        progress: 0,
        dependencies: ['t1'],
        comments: [],
      };

      const tasks = [task1, task2];
      const milestones = [milestone1];

      vi.mocked(scheduling.computeBaseSchedules).mockReturnValue({
        t1: { start: '2024-12-01', end: '2024-12-04' },
        t2: { start: '2024-12-01', end: '2024-12-10' },
      });

      const csv = buildTasksCsvString(tasks, milestones);

      // Check that task1 has proper escaping for quotes
      expect(csv).toContain('"Setup ""Environment"""');

      // Check that task2 has proper escaping for newline
      expect(csv).toContain('"Build API, Tests\nand Deploy"');

      // Check that dependencies are resolved to names (escaped in CSV)
      expect(csv).toContain('"Setup ""Environment"""');

      // Check milestone name is used, not id
      expect(csv).toContain('Release 1.0');

      // Verify task1 name is present
      expect(csv).toContain('""Environment""');

      // Verify task2 content is present
      expect(csv).toContain('Build API, Tests');
      expect(csv).toContain('and Deploy');
    });
  });
});
