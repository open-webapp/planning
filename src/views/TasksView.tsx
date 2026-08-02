import React, { useState } from 'react'
import type { DerivedData } from '../lib/selectors'
import type { AppState } from '../lib/state'
import type { Task, Milestone } from '../lib/types'
import TaskRow from './TaskRow'

interface TasksViewProps {
  derivedData: DerivedData
  state: AppState
  dispatch: (action: any) => void
  displaySchedules: { [taskId: string]: { start: string; end: string } }
  progressMap: { [taskId: string]: number }
  criticalSet: Set<string>
}

interface MilestoneRowProps {
  milestone: Milestone
  width: number
  dispatch: (action: any) => void
}

const MilestoneRow: React.FC<MilestoneRowProps> = ({ milestone, width, dispatch }) => {
  const [name, setName] = useState(milestone.name)

  React.useEffect(() => {
    setName(milestone.name)
  }, [milestone.name])

  const commit = () => {
    if (name.trim() && name !== milestone.name) {
      dispatch({ type: 'UPDATE_MILESTONE', milestoneId: milestone.id, patch: { name } })
    } else {
      setName(milestone.name)
    }
  }

  return (
    <div
      className="flex items-center gap-s2 border-b border-divider"
      style={{ width: `${width}px`, minWidth: '100%', background: 'var(--ns-ink-050)', padding: '8px 16px' }}
    >
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        }}
        className="border border-transparent bg-transparent hover:bg-white/60 focus:border-netskopeBlue focus:bg-white focus:outline-none"
        style={{
          fontSize: '0.9375rem',
          fontWeight: 500,
          color: 'var(--ns-deep-blue)',
          padding: '3px 5px',
          margin: '-3px -5px',
          borderRadius: '4px',
          width: '320px',
          boxSizing: 'border-box',
        }}
      />
    </div>
  )
}

const TasksView: React.FC<TasksViewProps> = ({
  derivedData,
  state,
  dispatch,
  displaySchedules,
  progressMap,
  criticalSet,
}) => {
  const { rowMap } = derivedData
  const [resizingColumn, setResizingColumn] = useState<string | null>(null)
  const [resizeStart, setResizeStart] = useState<number>(0)

  const columns = [
    { name: 'number', label: '#', key: 'number' },
    { name: 'name', label: 'Name', key: 'name' },
    { name: 'details', label: '', key: 'details' },
    { name: 'category', label: 'Category', key: 'category' },
    { name: 'status', label: 'Status', key: 'status' },
    { name: 'assignee', label: 'Assignee', key: 'assignee' },
    { name: 'start', label: 'Start', key: 'start' },
    { name: 'estimate', label: 'Estimate', key: 'estimate' },
    { name: 'end', label: 'Est. End', key: 'end' },
    { name: 'deps', label: 'Dependencies', key: 'deps' },
    { name: 'progress', label: 'Progress', key: 'progress' },
    { name: 'actions', label: '', key: 'actions' },
  ]

  // Name column must stay readable at a glance: floor width at ~16 characters.
  const getMinColumnWidth = (colName: string): number => (colName === 'name' ? 160 : 50)

  const getColumnWidth = (colName: string): number => {
    if (state.columnWidths[colName]) return state.columnWidths[colName]
    if (colName === 'name') return 320
    if (colName === 'details') return 90
    return 100
  }

  const handleColumnResizeStart = (e: React.MouseEvent, colName: string) => {
    e.preventDefault()
    setResizingColumn(colName)
    setResizeStart(e.clientX)
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!resizingColumn) return
    const delta = e.clientX - resizeStart
    const currentWidth = getColumnWidth(resizingColumn)
    const newWidth = Math.max(getMinColumnWidth(resizingColumn), currentWidth + delta)
    dispatch({ type: 'SET_COLUMN_WIDTH', columnName: resizingColumn, width: newWidth })
    setResizeStart(e.clientX)
  }

  const handleMouseUp = () => {
    setResizingColumn(null)
  }

  const getSortIndicator = (colName: string): string => {
    if (state.sortKey !== colName) return ''
    return state.sortDir === 'asc' ? '↑' : '↓'
  }

  const getTaskById = (id: string): Task | undefined => {
    return state.tasks.find((t) => t.id === id)
  }

  const getMilestoneById = (id: string): Milestone | undefined => {
    return state.milestones.find((m) => m.id === id)
  }

  const totalWidth = columns.reduce((sum, col) => sum + getColumnWidth(col.name), 0)
  const visibleCount = Object.keys(rowMap.rowNumberMap).length

  return (
    <div
      className="h-full overflow-auto bg-bg p-s7"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <h2 className="mb-s5" style={{ fontSize: '1.75rem', fontWeight: 400, color: 'var(--ns-fg-1)', margin: '0 0 16px' }}>
        Tasks{' '}
        <span className="font-normal text-fg-3" style={{ fontSize: '0.875rem' }}>
          ({visibleCount} shown)
        </span>
      </h2>

      <div className="bg-white border border-border rounded-lg overflow-x-auto">
        <div style={{ minWidth: `${totalWidth}px` }}>
          {/* Header */}
          <div className="flex border-b border-divider" style={{ width: `${totalWidth}px` }}>
            {columns.map((col) => (
              <div
                key={col.name}
                className="group relative flex items-center gap-1 select-none"
                style={{
                  width: `${getColumnWidth(col.name)}px`,
                  minWidth: `${getMinColumnWidth(col.name)}px`,
                  padding: '10px 12px',
                  cursor: col.name === 'actions' || col.name === 'details' ? 'default' : 'pointer',
                }}
                onClick={() => {
                  if (col.name !== 'actions' && col.name !== 'details') {
                    dispatch({ type: 'TOGGLE_SORT', sortKey: col.key })
                  }
                }}
              >
                <span className="text-fg-2" style={{ fontSize: '0.75rem', fontWeight: 600 }}>
                  {col.label}
                </span>
                {getSortIndicator(col.key) && (
                  <span style={{ color: 'var(--ns-netskope-blue)', fontSize: '0.75rem' }}>
                    {getSortIndicator(col.key)}
                  </span>
                )}
                {col.name !== 'actions' && (
                  <div
                    onMouseDown={(e) => handleColumnResizeStart(e, col.name)}
                    className="absolute z-10 cursor-col-resize"
                    style={{ top: '-10px', bottom: '-10px', right: '-6px', width: '10px' }}
                  />
                )}
              </div>
            ))}
          </div>

          {/* Body */}
          <div>
            {rowMap.visibleRows.map((row) => {
              if (row.type === 'milestone') {
                const milestone = getMilestoneById(row.id)
                if (!milestone) return null
                return (
                  <MilestoneRow
                    key={`milestone-${row.id}`}
                    milestone={milestone}
                    width={totalWidth}
                    dispatch={dispatch}
                  />
                )
              } else {
                const task = getTaskById(row.id)
                if (!task) return null
                return (
                  <TaskRow
                    key={task.id}
                    task={task}
                    taskNumber={rowMap.rowNumberMap[task.id] || 0}
                    level={row.level}
                    columns={columns}
                    getColumnWidth={getColumnWidth}
                    displaySchedules={displaySchedules}
                    progress={progressMap[task.id] || 0}
                    isCritical={criticalSet.has(task.id)}
                    hasChildren={state.tasks.some((t) => t.parentId === task.id)}
                    isExpanded={state.expanded[task.id] !== false}
                    state={state}
                    dispatch={dispatch}
                  />
                )
              }
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

export default TasksView
