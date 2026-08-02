import React, { useCallback } from 'react'
import { X } from 'lucide-react'
import type { AppState } from '../lib/state'

interface DepsPickerOverlayProps {
  state: AppState
  dispatch: (action: any) => void
}

const DepsPickerOverlay: React.FC<DepsPickerOverlayProps> = ({ state, dispatch }) => {
  if (!state.depsEditorTaskId) {
    return null
  }

  const currentTask = state.tasks.find((t) => t.id === state.depsEditorTaskId)
  if (!currentTask) {
    return null
  }

  const handleBackdropClick = useCallback(() => {
    dispatch({ type: 'CLOSE_DEPS_EDITOR' })
  }, [dispatch])

  const handlePanelClick = (e: React.MouseEvent) => {
    e.stopPropagation()
  }

  const handleFilterChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      dispatch({
        type: 'UPDATE_DEPS_FILTER_TEXT',
        text: e.target.value,
      })
    },
    [dispatch]
  )

  const handleToggleDependency = useCallback(
    (depId: string) => {
      dispatch({
        type: 'TOGGLE_DEPENDENCY',
        taskId: state.depsEditorTaskId,
        depId,
      })
    },
    [dispatch, state.depsEditorTaskId]
  )

  // Get tasks with row numbers for display
  // Build a map of task id to row number
  const taskRowMap: { [taskId: string]: number } = {}
  let rowNum = 1
  const buildRowMap = (taskId: string, depth: number = 0) => {
    const task = state.tasks.find((t) => t.id === taskId)
    if (!task) return

    taskRowMap[task.id] = rowNum
    rowNum++

    // Add children
    const children = state.tasks.filter((t) => t.parentId === taskId)
    children.forEach((child) => buildRowMap(child.id, depth + 1))
  }

  // Build row map for all root tasks
  state.tasks.forEach((task) => {
    if (!task.parentId) {
      buildRowMap(task.id)
    }
  })

  // Filter tasks based on depsFilterText
  const filterText = state.depsFilterText.toLowerCase()
  const otherTasks = state.tasks
    .filter((t) => t.id !== state.depsEditorTaskId)
    .sort((a, b) => (taskRowMap[a.id] || 999) - (taskRowMap[b.id] || 999))
    .filter((t) => {
      const rowNum = taskRowMap[t.id] || ''
      return (
        t.name.toLowerCase().includes(filterText) ||
        String(rowNum).includes(filterText)
      )
    })

  const currentDeps = currentTask.dependencies || []

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        style={{ background: 'rgba(8,26,89,0.35)' }}
        onClick={handleBackdropClick}
      />

      {/* Panel */}
      <div
        className="fixed top-1/2 left-1/2 flex flex-col bg-white rounded-lg shadow-3 overflow-hidden z-[41]"
        style={{
          transform: 'translate(-50%, -50%)',
          width: '420px',
          maxHeight: '70vh',
        }}
        onClick={handlePanelClick}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-divider px-[22px] py-[18px] flex-shrink-0">
          <div>
            <div className="text-[0.6875rem] font-semibold tracking-[0.06em] text-fg-3 mb-1 uppercase">
              Dependencies
            </div>
            <div className="text-[1.0625rem] font-medium text-fg-1">{currentTask.name}</div>
          </div>
          <span
            onClick={() => dispatch({ type: 'CLOSE_DEPS_EDITOR' })}
            className="cursor-pointer text-fg-3 flex hover:text-fg-1 transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </span>
        </div>

        {/* Filter Input */}
        <div className="px-[22px] pt-3 flex-shrink-0">
          <input
            type="text"
            value={state.depsFilterText || ''}
            onChange={handleFilterChange}
            placeholder="Filter tasks…"
            className="w-full text-[0.8125rem] text-fg-1 border border-border bg-white rounded-md px-2 py-[7px] box-border"
          />
        </div>

        {/* Checkbox List */}
        <div className="flex-1 overflow-y-auto px-3 py-2">
          {otherTasks.length > 0 ? (
            otherTasks.map((task) => {
              const rowNum = taskRowMap[task.id] || '?'
              const isChecked = currentDeps.includes(task.id)

              return (
                <div
                  key={task.id}
                  onClick={() => handleToggleDependency(task.id)}
                  className="flex items-center gap-[10px] px-[10px] py-[9px] rounded-md cursor-pointer hover:bg-ink-50"
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    readOnly
                    className="w-[15px] h-[15px] flex-shrink-0 accent-deepBlue pointer-events-none"
                  />
                  <span className="text-xs text-fg-3 w-6 flex-shrink-0">#{rowNum}</span>
                  <span className="text-sm text-fg-1 overflow-hidden text-ellipsis whitespace-nowrap">
                    {task.name}
                  </span>
                </div>
              )
            })
          ) : (
            <div className="text-[0.8125rem] text-fg-3 p-[10px]">No matching tasks.</div>
          )}
        </div>

        {/* Footer helper */}
        <div className="px-[22px] py-3 border-t border-divider bg-bg-tint text-xs text-fg-3 flex-shrink-0">
          Click a task to add or remove it as a dependency.
        </div>
      </div>
    </>
  )
}

export default DepsPickerOverlay
