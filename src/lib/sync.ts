import type { Task, Milestone, SyncConflict } from './types'
import type { AppState } from './state'
import { getAccessToken, pullFromSheet, pushToSheet } from './googleAuth'

/**
 * Represents changes (diffs) against a snapshot, per entity (task or milestone).
 * For each entity id: added (was in current, not in snapshot),
 * removed (was in snapshot, not in current), or modified (both exist, fields differ).
 */
export interface ChangeSet {
  tasks: {
    addedIds: Set<string>
    removedIds: Set<string>
    modifiedIds: Map<string, Map<string, { oldValue: unknown; newValue: unknown }>> // taskId -> { field -> { oldValue, newValue } }
  }
  milestones: {
    addedIds: Set<string>
    removedIds: Set<string>
    modifiedIds: Map<string, Map<string, { oldValue: unknown; newValue: unknown }>> // milestoneId -> { field -> { oldValue, newValue } }
  }
}

/**
 * Diffing helper: compare an entity against its snapshot version.
 * Returns a map of { field -> { oldValue, newValue } } for fields that differ.
 * Skips 'comments' and 'notes' fields as they are special-cased.
 */
function diffEntity<T extends Task | Milestone>(
  current: T,
  snapshot: T | undefined,
  skipFields: string[] = ['comments', 'notes']
): Map<string, { oldValue: unknown; newValue: unknown }> {
  const diff = new Map<string, { oldValue: unknown; newValue: unknown }>()

  if (!snapshot) {
    // New entity: every own property is a "change" from undefined
    for (const key in current) {
      if (!skipFields.includes(key)) {
        diff.set(key, { oldValue: undefined, newValue: current[key] })
      }
    }
    return diff
  }

  // Compare fields
  const allKeys = new Set<string>([...Object.keys(current), ...Object.keys(snapshot)])
  for (const key of allKeys) {
    if (skipFields.includes(key)) continue

    const currentValue = current[key as keyof T]
    const snapshotValue = snapshot[key as keyof T]

    // Deep compare for arrays (dependencies)
    if (Array.isArray(currentValue) && Array.isArray(snapshotValue)) {
      if (JSON.stringify(currentValue) !== JSON.stringify(snapshotValue)) {
        diff.set(key, { oldValue: snapshotValue, newValue: currentValue })
      }
    } else if (currentValue !== snapshotValue) {
      diff.set(key, { oldValue: snapshotValue, newValue: currentValue })
    }
  }

  return diff
}

/**
 * Diff the current state against a snapshot.
 * Returns per-entity-id change info: added, removed, and field-level diffs for modified entities.
 * If snapshot is null, treat all current entities as "added".
 */
export function diffAgainstSnapshot(
  current: { tasks: Task[]; milestones: Milestone[] },
  snapshot: { tasks: Task[]; milestones: Milestone[] } | null
): ChangeSet {
  const changeset: ChangeSet = {
    tasks: { addedIds: new Set(), removedIds: new Set(), modifiedIds: new Map() },
    milestones: { addedIds: new Set(), removedIds: new Set(), modifiedIds: new Map() },
  }

  if (!snapshot) {
    // First sync: everything is "added"
    current.tasks.forEach(t => changeset.tasks.addedIds.add(t.id))
    current.milestones.forEach(m => changeset.milestones.addedIds.add(m.id))
    return changeset
  }

  // Tasks
  const snapshotTaskMap = new Map(snapshot.tasks.map(t => [t.id, t]))
  const currentTaskMap = new Map(current.tasks.map(t => [t.id, t]))

  currentTaskMap.forEach((task, id) => {
    const snapshotTask = snapshotTaskMap.get(id)
    if (!snapshotTask) {
      changeset.tasks.addedIds.add(id)
    } else {
      const fieldDiff = diffEntity(task, snapshotTask)
      if (fieldDiff.size > 0) {
        changeset.tasks.modifiedIds.set(id, fieldDiff)
      }
    }
  })

  snapshotTaskMap.forEach((_, id) => {
    if (!currentTaskMap.has(id)) {
      changeset.tasks.removedIds.add(id)
    }
  })

  // Milestones
  const snapshotMilestoneMap = new Map(snapshot.milestones.map(m => [m.id, m]))
  const currentMilestoneMap = new Map(current.milestones.map(m => [m.id, m]))

  currentMilestoneMap.forEach((milestone, id) => {
    const snapshotMilestone = snapshotMilestoneMap.get(id)
    if (!snapshotMilestone) {
      changeset.milestones.addedIds.add(id)
    } else {
      const fieldDiff = diffEntity(milestone, snapshotMilestone)
      if (fieldDiff.size > 0) {
        changeset.milestones.modifiedIds.set(id, fieldDiff)
      }
    }
  })

  snapshotMilestoneMap.forEach((_, id) => {
    if (!currentMilestoneMap.has(id)) {
      changeset.milestones.removedIds.add(id)
    }
  })

  return changeset
}

/**
 * Merge comments arrays by id-based union.
 * Comments are append-only and id-keyed: union by id, never conflictable.
 */
function mergeComments(
  browserComments: Task['comments'],
  sheetComments: Task['comments']
): Task['comments'] {
  const commentMap = new Map<string, Task['comments'][0]>()

  browserComments.forEach(c => commentMap.set(c.id, c))
  sheetComments.forEach(c => {
    if (!commentMap.has(c.id)) {
      commentMap.set(c.id, c)
    }
  })

  return Array.from(commentMap.values())
}

/**
 * Three-way merge of browser and sheet changes against a snapshot.
 * Returns merged state with non-conflicting changes applied,
 * and conflicts for fields changed differently on both sides.
 *
 * NOTE: This implementation requires the actual current states (browserCurrent, sheetCurrent)
 * to properly merge. The changesets alone don't contain enough information to reconstruct
 * the exact values. For unit testing, we enhance diffAgainstSnapshot to also store refs
 * to the source data.
 */
export function threeWayMerge(
  browserChanges: ChangeSet,
  sheetChanges: ChangeSet,
  snapshot: { tasks: Task[]; milestones: Milestone[] } | null,
  browserCurrent?: { tasks: Task[]; milestones: Milestone[] },
  sheetCurrent?: { tasks: Task[]; milestones: Milestone[] }
): { merged: { tasks: Task[]; milestones: Milestone[] }; conflicts: SyncConflict[] } {
  const conflicts: SyncConflict[] = []

  const snapshotData = snapshot || { tasks: [], milestones: [] }
  const snapshotTaskMap = new Map(snapshotData.tasks.map(t => [t.id, t]))
  const snapshotMilestoneMap = new Map(snapshotData.milestones.map(m => [m.id, m]))

  // Map current versions for lookup
  const browserTaskMap = new Map((browserCurrent?.tasks || []).map(t => [t.id, t]))
  const sheetTaskMap = new Map((sheetCurrent?.tasks || []).map(t => [t.id, t]))
  const browserMilestoneMap = new Map((browserCurrent?.milestones || []).map(m => [m.id, m]))
  const sheetMilestoneMap = new Map((sheetCurrent?.milestones || []).map(m => [m.id, m]))

  // Collect all task ids from any source (snapshot, changes, current states)
  const allTaskIds = new Set<string>([
    ...snapshotTaskMap.keys(),
    ...browserTaskMap.keys(),
    ...sheetTaskMap.keys(),
  ])

  // Collect all milestone ids from any source
  const allMilestoneIds = new Set<string>([
    ...snapshotMilestoneMap.keys(),
    ...browserMilestoneMap.keys(),
    ...sheetMilestoneMap.keys(),
  ])

  // Merge tasks
  const mergedTasks: Task[] = []

  allTaskIds.forEach(taskId => {
    const snapshotTask = snapshotTaskMap.get(taskId)
    const browserTask = browserTaskMap.get(taskId)
    const sheetTask = sheetTaskMap.get(taskId)

    const browserRemoved = browserChanges.tasks.removedIds.has(taskId)
    const browserModified = browserChanges.tasks.modifiedIds.has(taskId)
    const sheetRemoved = sheetChanges.tasks.removedIds.has(taskId)
    const sheetModified = sheetChanges.tasks.modifiedIds.has(taskId)

    // Handle deletion conflicts
    if (browserRemoved && sheetModified && sheetTask) {
      conflicts.push({
        taskId,
        taskName: sheetTask.name,
        field: '__deleted' as any,
        browserValue: 'deleted',
        sheetValue: 'edited',
      })
      mergedTasks.push(sheetTask)
      return
    }

    if (sheetRemoved && browserModified && browserTask) {
      conflicts.push({
        taskId,
        taskName: browserTask.name,
        field: '__deleted' as any,
        browserValue: 'edited',
        sheetValue: 'deleted',
      })
      mergedTasks.push(browserTask)
      return
    }

    // If both deleted, skip
    if (browserRemoved && sheetRemoved) {
      return
    }

    // If only one side deleted, respect that deletion
    if (browserRemoved && !sheetRemoved) {
      return
    }

    if (sheetRemoved && !browserRemoved) {
      return
    }

    // Determine merged task by merging field-by-field
    let mergedTask: Task | null = null

    // Start with a base version: prefer the one that exists and has been modified, or snapshot
    let baseTask: Task | null = null
    if (browserTask) {
      baseTask = { ...browserTask }
    } else if (sheetTask) {
      baseTask = { ...sheetTask }
    } else if (snapshotTask) {
      baseTask = { ...snapshotTask }
    }

    if (!baseTask) return

    // Now apply field-level merging for tasks modified on both sides
    if ((browserModified || sheetModified) && snapshotTask) {
      const browserFieldDiff = browserChanges.tasks.modifiedIds.get(taskId) || new Map()
      const sheetFieldDiff = sheetChanges.tasks.modifiedIds.get(taskId) || new Map()

      const allChangedFields = new Set([...browserFieldDiff.keys(), ...sheetFieldDiff.keys()])

      allChangedFields.forEach(field => {
        const browserChange = browserFieldDiff.get(field)
        const sheetChange = sheetFieldDiff.get(field)

        if (browserChange && sheetChange) {
          // Both sides changed this field
          if (JSON.stringify(browserChange.newValue) === JSON.stringify(sheetChange.newValue)) {
            // Same value on both sides: converged, use the value
            ;(baseTask as any)[field] = browserChange.newValue
          } else {
            // Different values: conflict
            conflicts.push({
              taskId,
              taskName: baseTask.name,
              field: field as keyof Task,
              browserValue: browserChange.newValue,
              sheetValue: sheetChange.newValue,
            })
            // Keep browser value as placeholder
            ;(baseTask as any)[field] = browserChange.newValue
          }
        } else if (browserChange) {
          // Only browser changed this field
          ;(baseTask as any)[field] = browserChange.newValue
        } else if (sheetChange) {
          // Only sheet changed this field
          ;(baseTask as any)[field] = sheetChange.newValue
        }
      })
    }

    mergedTask = baseTask

    // Special handling for comments: always union by id, never conflict
    if (browserTask && sheetTask) {
      mergedTask.comments = mergeComments(browserTask.comments, sheetTask.comments)
    } else if (browserTask) {
      mergedTask.comments = browserTask.comments
    } else if (sheetTask) {
      mergedTask.comments = sheetTask.comments
    }

    mergedTasks.push(mergedTask)
  })

  // Merge milestones
  const mergedMilestones: Milestone[] = []

  allMilestoneIds.forEach(milestoneId => {
    const snapshotMilestone = snapshotMilestoneMap.get(milestoneId)
    const browserMilestone = browserMilestoneMap.get(milestoneId)
    const sheetMilestone = sheetMilestoneMap.get(milestoneId)

    const browserRemoved = browserChanges.milestones.removedIds.has(milestoneId)
    const browserModified = browserChanges.milestones.modifiedIds.has(milestoneId)
    const sheetRemoved = sheetChanges.milestones.removedIds.has(milestoneId)
    const sheetModified = sheetChanges.milestones.modifiedIds.has(milestoneId)

    // Handle deletion conflicts
    if (browserRemoved && sheetModified && sheetMilestone) {
      conflicts.push({
        taskId: milestoneId,
        taskName: sheetMilestone.name,
        field: '__deleted' as any,
        browserValue: 'deleted',
        sheetValue: 'edited',
      })
      mergedMilestones.push(sheetMilestone)
      return
    }

    if (sheetRemoved && browserModified && browserMilestone) {
      conflicts.push({
        taskId: milestoneId,
        taskName: browserMilestone.name,
        field: '__deleted' as any,
        browserValue: 'edited',
        sheetValue: 'deleted',
      })
      mergedMilestones.push(browserMilestone)
      return
    }

    // If both deleted, skip
    if (browserRemoved && sheetRemoved) {
      return
    }

    // If only one side deleted, respect that deletion
    if (browserRemoved && !sheetRemoved) {
      return
    }

    if (sheetRemoved && !browserRemoved) {
      return
    }

    // Determine merged milestone by merging field-by-field
    let baseMilestone: Milestone | null = null
    if (browserMilestone) {
      baseMilestone = { ...browserMilestone }
    } else if (sheetMilestone) {
      baseMilestone = { ...sheetMilestone }
    } else if (snapshotMilestone) {
      baseMilestone = { ...snapshotMilestone }
    }

    if (!baseMilestone) return

    let mergedMilestone = baseMilestone

    // Apply field-level merging for milestones modified on both sides
    if ((browserModified || sheetModified) && snapshotMilestone) {
      const browserFieldDiff = browserChanges.milestones.modifiedIds.get(milestoneId) || new Map()
      const sheetFieldDiff = sheetChanges.milestones.modifiedIds.get(milestoneId) || new Map()

      const allChangedFields = new Set([...browserFieldDiff.keys(), ...sheetFieldDiff.keys()])

      allChangedFields.forEach(field => {
        const browserChange = browserFieldDiff.get(field)
        const sheetChange = sheetFieldDiff.get(field)

        if (browserChange && sheetChange) {
          // Both sides changed this field
          if (JSON.stringify(browserChange.newValue) === JSON.stringify(sheetChange.newValue)) {
            // Same value: converged
            ;(mergedMilestone as any)[field] = browserChange.newValue
          } else {
            // Different values: conflict
            conflicts.push({
              taskId: milestoneId,
              taskName: mergedMilestone.name,
              field: field as any,
              browserValue: browserChange.newValue,
              sheetValue: sheetChange.newValue,
            })
            // Keep browser value as placeholder
            ;(mergedMilestone as any)[field] = browserChange.newValue
          }
        } else if (browserChange) {
          // Only browser changed this field
          ;(mergedMilestone as any)[field] = browserChange.newValue
        } else if (sheetChange) {
          // Only sheet changed this field
          ;(mergedMilestone as any)[field] = sheetChange.newValue
        }
      })
    }

    mergedMilestones.push(mergedMilestone)
  })

  return {
    merged: {
      tasks: mergedTasks,
      milestones: mergedMilestones,
    },
    conflicts,
  }
}

/**
 * Apply user's conflict resolutions to the merged state.
 * choices: { [conflictKey]: 'sheet' | 'browser' } keyed by "${taskId}:${field}"
 * Returns final state ready to commit locally and push.
 */
export function applyResolutions(
  merged: { tasks: Task[]; milestones: Milestone[] },
  conflicts: SyncConflict[],
  choices: { [conflictKey: string]: 'sheet' | 'browser' }
): { tasks: Task[]; milestones: Milestone[] } {
  // Create a map of task/milestone id -> { field -> chosen value }
  const resolutionMap = new Map<string, Map<string, unknown>>()

  Object.entries(choices).forEach(([key, choice]) => {
    const [entityId, field] = key.split(':')
    const conflict = conflicts.find(c => c.taskId === entityId && c.field === field)
    if (!conflict) return

    if (!resolutionMap.has(entityId)) {
      resolutionMap.set(entityId, new Map())
    }

    const entityResolutions = resolutionMap.get(entityId)!
    const chosenValue = choice === 'sheet' ? conflict.sheetValue : conflict.browserValue
    entityResolutions.set(field, chosenValue)
  })

  // Apply resolutions to tasks
  const resolvedTasks = merged.tasks.map(task => {
    const taskResolutions = resolutionMap.get(task.id)
    if (!taskResolutions) return task

    const resolved = { ...task }
    taskResolutions.forEach((value, field) => {
      if (field === '__deleted') {
        // Skip pseudo-field for tasks; deletion is handled separately
        return
      }
      ;(resolved as any)[field] = value
    })
    return resolved
  })

  // Apply resolutions to milestones
  const resolvedMilestones = merged.milestones.map(milestone => {
    const milestoneResolutions = resolutionMap.get(milestone.id)
    if (!milestoneResolutions) return milestone

    const resolved = { ...milestone }
    milestoneResolutions.forEach((value, field) => {
      if (field === '__deleted') {
        // Skip pseudo-field for milestones
        return
      }
      ;(resolved as any)[field] = value
    })
    return resolved
  })

  return {
    tasks: resolvedTasks,
    milestones: resolvedMilestones,
  }
}

/**
 * Orchestration function for two-way sync.
 * Pulls sheet data, diffs both sides, performs three-way merge,
 * and either pushes non-conflicting changes or surfaces conflicts for resolution.
 *
 * Dispatches:
 * - SYNC_STARTED: when sync begins
 * - SYNC_SUCCESS: on successful push (no conflicts)
 * - SYNC_CONFLICTS_DETECTED: when conflicts are found (user must resolve)
 * - SYNC_ERROR: on any error (token fetch, pull, or push failure)
 *
 * Prevents data loss if user switches projects mid-sync by comparing the
 * captured projectId at sync-start to the current state when async work resolves.
 */
export async function syncNow(
  state: AppState,
  dispatch: (action: any) => void
): Promise<void> {
  // Capture project ID at start to detect mid-sync project switches
  const projectId = state.activeProjectId
  const activeProject = state.projects.find((p) => p.id === projectId)

  // Dispatch sync started
  dispatch({ type: 'SYNC_STARTED' })

  try {
    // Ensure we have a project with a spreadsheet ID
    if (!activeProject?.spreadsheetId) {
      throw new Error('No spreadsheet ID configured for this project')
    }

    // Get access token
    const token = await getAccessToken()

    // Pull sheet data
    let sheetData = await pullFromSheet(activeProject.spreadsheetId, token, state.milestones)
    if (sheetData === null) {
      sheetData = { tasks: [], milestones: [] }
    }

    // Parse last synced snapshot (if exists)
    let snapshot: { tasks: Task[]; milestones: Milestone[] } | null = null
    if (activeProject.lastSyncedSnapshot) {
      try {
        snapshot = JSON.parse(activeProject.lastSyncedSnapshot)
      } catch (e) {
        console.error('Failed to parse lastSyncedSnapshot, treating as null:', e)
        snapshot = null
      }
    }

    // Guard against data loss: if we've synced before (snapshot has data) but the sheet
    // just came back completely empty, that's almost certainly a transient fetch/parse
    // problem (or a blanked-out sheet) rather than the user deleting everything. Treating
    // it as real would make threeWayMerge see every task/milestone as "deleted on the sheet
    // side" and wipe them from the browser too. Fall back to first-sync semantics instead:
    // trust the browser's data and let the push repopulate the sheet.
    const hadSnapshotData = !!snapshot && (snapshot.tasks.length > 0 || snapshot.milestones.length > 0)
    const sheetCameBackEmpty = sheetData.tasks.length === 0 && sheetData.milestones.length === 0
    if (hadSnapshotData && sheetCameBackEmpty) {
      console.warn('Sheet pull returned no data despite an existing snapshot; treating as a stale read instead of a mass deletion')
      snapshot = null
    }

    // Calculate diffs
    const browserData = { tasks: state.tasks, milestones: state.milestones }
    const browserChanges = diffAgainstSnapshot(browserData, snapshot)
    const sheetChanges = diffAgainstSnapshot(sheetData, snapshot)

    // Perform three-way merge
    const { merged, conflicts } = threeWayMerge(
      browserChanges,
      sheetChanges,
      snapshot,
      browserData,
      sheetData
    )

    // Check if project switched during async work (guard against data loss)
    if (state.activeProjectId !== projectId) {
      console.warn('Project switched mid-sync, discarding sync result')
      dispatch({ type: 'SYNC_ERROR', error: 'Sync cancelled: project switched' })
      return
    }

    // Handle conflicts or success
    if (conflicts.length === 0) {
      // No conflicts: push merged data to sheet
      const pushResult = await pushToSheet(activeProject.spreadsheetId, token, merged.tasks, merged.milestones)

      if (!pushResult.success) {
        dispatch({ type: 'SYNC_ERROR', error: pushResult.message })
        return
      }

      // Guard again in case state changed during push
      if (state.activeProjectId !== projectId) {
        console.warn('Project switched mid-push, discarding result')
        dispatch({ type: 'SYNC_ERROR', error: 'Sync cancelled: project switched' })
        return
      }

      // Dispatch success
      const timestamp = new Date().toISOString()
      dispatch({
        type: 'SYNC_SUCCESS',
        tasks: merged.tasks,
        milestones: merged.milestones,
        snapshot: JSON.stringify(merged),
        timestamp,
        projectId,
      })
    } else {
      // Conflicts detected: hold the merged result for user to resolve
      dispatch({
        type: 'SYNC_CONFLICTS_DETECTED',
        conflicts,
        merged,
      })
    }
  } catch (error) {
    // Guard again in case state changed during error
    if (state.activeProjectId !== projectId) {
      console.warn('Project switched during sync error, discarding error dispatch')
      return
    }

    const errorMessage = error instanceof Error ? error.message : String(error)
    dispatch({
      type: 'SYNC_ERROR',
      error: errorMessage,
    })
  }
}
