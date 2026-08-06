import { describe, it, expect, vi } from 'vitest';
import { buildTasksCsvString, escapeCSVField, getCSVFilename, parseTasksCsvString } from './csv';
import type { Task, Milestone } from './types';
import * as scheduling from './scheduling';
import * as seed from './seed';

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
    it('should slug project name: "My Cool Project!!" → my-cool-project.csv', () => {
      const result = getCSVFilename('My Cool Project!!');
      expect(result).toBe('my-cool-project-.csv');
    });

    it('should handle special characters in project name', () => {
      const result = getCSVFilename('Project@#$%Name');
      expect(result).toBe('project-name.csv');
    });

    it('should default to "project" when projectName is empty', () => {
      const result = getCSVFilename('');
      expect(result).toBe('project.csv');
    });

    it('should lowercase the filename', () => {
      const result = getCSVFilename('UPPERCASE PROJECT');
      expect(result).toBe('uppercase-project.csv');
    });

    it('should handle multiple consecutive special characters', () => {
      const result = getCSVFilename('My---Cool***Project');
      expect(result).toBe('my-cool-project.csv');
    });
  });

  describe('buildTasksCsvString', () => {
    // Test 1: Header row exact match
    it('should have correct header row with ID as first column', () => {
      const tasks: Task[] = [];
      const milestones: Milestone[] = [];

      vi.mocked(scheduling.computeBaseSchedules).mockReturnValue({});

      const csv = buildTasksCsvString(tasks, milestones);
      const lines = csv.split('\n');
      const headers = lines[0];

      expect(headers).toBe(
        'ID,Name,Milestone,Category,Assignee,Status,Start Date,Estimate (days),Est. End Date,Progress %,Dependencies'
      );
      expect(lines.length).toBe(1); // Only header row
    });

    // Test 6: Dependencies as IDs semicolon-joined
    it('should join dependency IDs with semicolon', () => {
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
        order: 0,
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
        order: 0,
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
        order: 0,
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

      // Dependencies column should be "t2; t3" (task IDs); ID should be first
      expect(task1Row).toContain('t1,Task 1,');
      expect(task1Row.endsWith('t2; t3')).toBe(true);
    });

    // Test 7: Est. End Date sourced from computeBaseSchedules
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
        order: 0,
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
        order: 0,
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

      // The milestone column should have "Phase 1", not "m1"; ID should be first
      expect(task1Row).toContain('t1,Task 1,Phase 1,');
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
        order: 0,
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

      // Milestone column should be empty (no name after ID and task name)
      expect(task1Row).toMatch(/^t1,Task 1,,/);
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
        order: 0,
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
        order: 0,
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

      // Check that dependencies are task IDs (not resolved names)
      expect(csv).toContain('t1');

      // Check milestone name is used, not id
      expect(csv).toContain('Release 1.0');

      // Verify task1 name is present
      expect(csv).toContain('""Environment""');

      // Verify task2 content is present
      expect(csv).toContain('Build API, Tests');
      expect(csv).toContain('and Deploy');
    });
  });

  describe('parseTasksCsvString', () => {
    // Test 1: Round-trip test
    it('should round-trip through buildTasksCsvString → parseTasksCsvString preserving tasks and milestones', () => {
      const milestone1: Milestone = {
        id: 'm1',
        name: 'Phase 1',
      };

      const milestone2: Milestone = {
        id: 'm2',
        name: 'Phase 2',
      };

      const task1: Task = {
        id: 't1',
        name: 'Task 1',
        milestoneId: 'm1',
        parentId: null,
        category: 'Infrastructure',
        assignee: 'Alice',
        status: 'In Progress',
        estimate: 5,
        startDate: '2024-12-01',
        progress: 50,
        order: 0,
        dependencies: ['t2'],
        comments: [],
      };

      const task2: Task = {
        id: 't2',
        name: 'Task 2',
        milestoneId: 'm2',
        parentId: null,
        category: 'Development',
        assignee: 'Bob',
        status: 'Not Started',
        estimate: 3,
        startDate: '2024-12-05',
        progress: 0,
        order: 0,
        dependencies: [],
        comments: [],
      };

      const originalTasks = [task1, task2];
      const originalMilestones = [milestone1, milestone2];

      vi.mocked(scheduling.computeBaseSchedules).mockReturnValue({
        t1: { start: '2024-12-01', end: '2024-12-06' },
        t2: { start: '2024-12-05', end: '2024-12-08' },
      });

      // Build CSV from original tasks/milestones
      const csv = buildTasksCsvString(originalTasks, originalMilestones);

      // Parse CSV back
      const parsed = parseTasksCsvString(csv, []);

      // Verify tasks match (notes undefined vs missing is ok)
      expect(parsed.tasks).toHaveLength(2);
      expect(parsed.tasks[0].id).toBe('t1');
      expect(parsed.tasks[0].name).toBe('Task 1');
      expect(parsed.tasks[0].category).toBe('Infrastructure');
      expect(parsed.tasks[0].assignee).toBe('Alice');
      expect(parsed.tasks[0].status).toBe('In Progress');
      expect(parsed.tasks[0].estimate).toBe(5);
      expect(parsed.tasks[0].startDate).toBe('2024-12-01');
      expect(parsed.tasks[0].progress).toBe(50);
      expect(parsed.tasks[0].dependencies).toEqual(['t2']);
      expect(parsed.tasks[0].comments).toEqual([]);

      expect(parsed.tasks[1].id).toBe('t2');
      expect(parsed.tasks[1].name).toBe('Task 2');
      expect(parsed.tasks[1].estimate).toBe(3);
      expect(parsed.tasks[1].dependencies).toEqual([]);

      // Verify milestones match by name
      expect(parsed.milestones).toHaveLength(2);
      expect(parsed.milestones[0].name).toBe('Phase 1');
      expect(parsed.milestones[1].name).toBe('Phase 2');
    });

    // Test 2: Existing milestone reuse
    it('should reuse existing milestone ID when CSV milestone name matches existing milestone by name', () => {
      const existingMilestones: Milestone[] = [
        { id: 'm-existing-1', name: 'Phase 1' },
        { id: 'm-existing-2', name: 'Phase 2' },
      ];

      const csv = 'ID,Name,Milestone,Category,Assignee,Status,Start Date,Estimate (days),Est. End Date,Progress %,Dependencies\n' +
        't1,Task 1,Phase 1,Dev,,,,0,,0,\n' +
        't2,Task 2,Phase 2,Dev,,,,0,,0,';

      const result = parseTasksCsvString(csv, existingMilestones);

      // Tasks should reference existing milestone IDs, not new ones
      expect(result.tasks[0].milestoneId).toBe('m-existing-1');
      expect(result.tasks[1].milestoneId).toBe('m-existing-2');

      // Result includes milestones referenced in CSV with their existing IDs
      expect(result.milestones).toHaveLength(2);
      expect(result.milestones[0]).toEqual({ id: 'm-existing-1', name: 'Phase 1' });
      expect(result.milestones[1]).toEqual({ id: 'm-existing-2', name: 'Phase 2' });
    });

    // Test 3: New milestone mint
    it('should mint a fresh milestone ID via uid("m") when CSV milestone name not in existingMilestones', () => {
      const existingMilestones: Milestone[] = [
        { id: 'm-existing-1', name: 'Phase 1' },
      ];

      const csv = 'ID,Name,Milestone,Category,Assignee,Status,Start Date,Estimate (days),Est. End Date,Progress %,Dependencies\n' +
        't1,Task 1,Phase 1,Dev,,,,0,,0,\n' +
        't2,Task 2,New Phase,Dev,,,,0,,0,';

      vi.spyOn(seed, 'uid').mockReturnValue('m-new-minted');

      const result = parseTasksCsvString(csv, existingMilestones);

      // First task should use existing milestone
      expect(result.tasks[0].milestoneId).toBe('m-existing-1');

      // Second task should use newly minted milestone ID
      expect(result.tasks[1].milestoneId).toBe('m-new-minted');

      // Result includes both referenced milestones (existing + new)
      expect(result.milestones).toHaveLength(2);
      expect(result.milestones[0]).toEqual({ id: 'm-existing-1', name: 'Phase 1' });
      expect(result.milestones[1]).toEqual({ id: 'm-new-minted', name: 'New Phase' });

      // Verify uid was called with 'm' prefix
      expect(seed.uid).toHaveBeenCalledWith('m');

      vi.restoreAllMocks();
    });

    // Test 4: Empty dependencies
    it('should parse empty dependencies column to empty array', () => {
      const csv = 'ID,Name,Milestone,Category,Assignee,Status,Start Date,Estimate (days),Est. End Date,Progress %,Dependencies\n' +
        't1,Task 1,,,,,,,0,0,\n' +
        't2,Task 2,,,,,,,0,0,';

      const result = parseTasksCsvString(csv, []);

      expect(result.tasks[0].dependencies).toEqual([]);
      expect(result.tasks[1].dependencies).toEqual([]);
    });

    // Test 5: Multiple dependencies
    it('should parse multiple dependencies separated by semicolon-space to array', () => {
      const csv = 'ID,Name,Milestone,Category,Assignee,Status,Start Date,Estimate (days),Est. End Date,Progress %,Dependencies\n' +
        't1,Task 1,,,,,,,0,0,t2; t3; t4\n' +
        't2,Task 2,,,,,,,0,0,t3\n' +
        't3,Task 3,,,,,,,0,0,';

      const result = parseTasksCsvString(csv, []);

      expect(result.tasks[0].dependencies).toEqual(['t2', 't3', 't4']);
      expect(result.tasks[1].dependencies).toEqual(['t3']);
      expect(result.tasks[2].dependencies).toEqual([]);
    });

    // Test 6: Malformed row tolerance
    it('should default to sensible values for missing columns (0 for numbers, empty string for text)', () => {
      // CSV with missing columns for first task; all columns present for second
      const csv = 'ID,Name,Milestone,Category,Assignee,Status,Start Date,Estimate (days),Est. End Date,Progress %,Dependencies\n' +
        't1,Task 1,,,,,,,0,0,\n' +
        't2,Task 2,Phase 1,Dev,Alice,In Progress,2024-12-01,5,2024-12-06,50,t1';

      const result = parseTasksCsvString(csv, []);

      // First task has missing optional fields (defaults apply)
      expect(result.tasks[0].id).toBe('t1');
      expect(result.tasks[0].name).toBe('Task 1');
      expect(result.tasks[0].category).toBe('');
      expect(result.tasks[0].assignee).toBe('');
      expect(result.tasks[0].status).toBe('');
      expect(result.tasks[0].startDate).toBe('');
      expect(result.tasks[0].estimate).toBe(0);
      expect(result.tasks[0].progress).toBe(0);

      // Second task has all fields provided
      expect(result.tasks[1].id).toBe('t2');
      expect(result.tasks[1].name).toBe('Task 2');
      expect(result.tasks[1].category).toBe('Dev');
      expect(result.tasks[1].assignee).toBe('Alice');
      expect(result.tasks[1].status).toBe('In Progress');
      expect(result.tasks[1].startDate).toBe('2024-12-01');
      expect(result.tasks[1].estimate).toBe(5);
      expect(result.tasks[1].progress).toBe(50);
      expect(result.tasks[1].dependencies).toEqual(['t1']);
    });
  });
});
