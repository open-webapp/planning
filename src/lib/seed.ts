import type { Task, Milestone } from './types'

/**
 * Generate a unique ID with the given prefix.
 * Used for first-run demo state generation.
 * Format: "prefix-abc123def"
 */
export function uid(prefix: string): string {
  return prefix + '-' + Math.random().toString(36).slice(2, 9)
}

/**
 * Return initial seed data.
 */
export function seedData(): { tasks: Task[]; milestones: Milestone[] } {
  return { milestones: [], tasks: [] }
}
