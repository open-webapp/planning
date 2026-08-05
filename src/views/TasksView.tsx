import React, { useState, useMemo } from 'react'
import type { DerivedData } from '../lib/selectors'
import type { AppState } from '../lib/state'
import type { Task, Milestone } from '../lib/types'
import { filterTasksByFilters } from '../lib/rows'
import { computeStatCards, computeAssigneeBreakdown, computeUpcomingMilestones } from '../lib/selectors'
import { statusColor } from '../lib/statusColors'
import TaskRow from './TaskRow'
import Collapsible from '../components/Collapsible'

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

// Stat card color/accent definitions for the 5 cards
const STAT_ACCENTS = [
  { label: 'Total Items', color: 'var(--ns-netskope-blue)' },
  { label: 'Total Estimate', color: 'var(--ns-teal)' },
  { label: 'Completed', color: 'var(--ns-success)' },
  { label: 'In Progress', color: 'var(--ns-warning)' },
  { label: 'Overdue', color: 'var(--ns-danger)' },
]

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
  const [showAllMilestones, setShowAllMilestones] = useState(false)

  // Compute filtered tasks based on active filters
  const filteredTasks = useMemo(
    () => filterTasksByFilters(state.tasks, state.filters),
    [state.tasks, state.filters]
  )

  // Compute stat cards for the filtered task set
  const statCards = useMemo(
    () => computeStatCards(filteredTasks, displaySchedules),
    [filteredTasks, displaySchedules]
  )

  // Compute assignee breakdown for the filtered task set
  const assigneeBreakdown = useMemo(
    () => computeAssigneeBreakdown(filteredTasks),
    [filteredTasks]
  )

  // Compute upcoming milestones for the filtered task set
  const filteredUpcomingMilestones = useMemo(
    () => computeUpcomingMilestones(filteredTasks, state.milestones, displaySchedules, progressMap),
    [filteredTasks, state.milestones, displaySchedules, progressMap]
  )

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

  const renderAssigneeBreakdownChart = (): React.ReactNode => {
    if (assigneeBreakdown.length === 0) {
      return <p className="text-[0.8125rem] text-fg-3">No tasks match the current filters</p>
    }

    return (
      <div className="space-y-2">
        {assigneeBreakdown.map((entry) => {
          const maxEstimate = assigneeBreakdown[0]?.totalEstimate || 0
          const percentage = maxEstimate > 0 ? (entry.totalEstimate / maxEstimate) * 100 : 0
          return (
            <div key={entry.assignee} className="flex items-center gap-[10px]">
              <span className="w-[100px] text-[0.8125rem] text-fg-2 flex-shrink-0 truncate">
                {entry.assignee}
              </span>
              <div className="flex-1 h-2 bg-ink-100 rounded-pill overflow-hidden">
                <div
                  className="h-full rounded-pill"
                  style={{ width: `${percentage}%`, background: 'var(--ns-netskope-blue)' }}
                />
              </div>
              <span className="w-[28px] text-right text-[0.8125rem] text-fg-3">
                {entry.totalEstimate}d
              </span>
            </div>
          )
        })}
      </div>
    )
  }

  const renderUpcomingMilestonesChart = (): React.ReactNode => {
    if (filteredUpcomingMilestones.length === 0) {
      return <p className="text-[0.8125rem] text-fg-3">No upcoming milestones</p>
    }

    const visibleMilestones = showAllMilestones
      ? filteredUpcomingMilestones
      : filteredUpcomingMilestones.slice(0, 3)
    const hiddenCount = filteredUpcomingMilestones.length - visibleMilestones.length

    return (
      <div>
        {visibleMilestones.map((milestone) => (
          <div
            key={milestone.id}
            onClick={() => {
              dispatch({ type: 'SET_FILTER', filterKey: 'milestone', value: milestone.id })
            }}
            className="pb-2 border-b border-border last:border-b-0 cursor-pointer hover:bg-bg transition-colors p-2 rounded"
          >
            <div className="text-[0.8125rem] font-medium text-fg-1 mb-1">{milestone.name}</div>
            <div className="text-[0.75rem] text-fg-3 mb-1">
              {milestone.startDate && milestone.endDate
                ? `${milestone.startDate} - ${milestone.endDate} · ${milestone.itemCount} items`
                : 'No tasks assigned'}
            </div>
            {milestone.itemCount > 0 && (
              <div className="w-full h-2 bg-ink-100 rounded-pill overflow-hidden">
                <div
                  className="h-full rounded-pill"
                  style={{ width: `${milestone.progress}%`, background: statusColor('Done') }}
                />
              </div>
            )}
          </div>
        ))}
        {hiddenCount > 0 && (
          <button
            type="button"
            onClick={() => setShowAllMilestones(true)}
            className="text-[0.75rem] text-fg-3 hover:text-fg-1 mt-1 underline-offset-2 hover:underline"
          >
            +{hiddenCount} more
          </button>
        )}
        {showAllMilestones && filteredUpcomingMilestones.length > 3 && (
          <button
            type="button"
            onClick={() => setShowAllMilestones(false)}
            className="text-[0.75rem] text-fg-3 hover:text-fg-1 mt-1 underline-offset-2 hover:underline"
          >
            Show fewer
          </button>
        )}
      </div>
    )
  }

  const totalWidth = columns.reduce((sum, col) => sum + getColumnWidth(col.name), 0)

  return (
    <div
      className="h-full overflow-auto bg-bg px-s7 py-2"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Stat Strip */}
      <div className="flex items-center justify-center flex-wrap gap-s5 mb-2" style={{ minHeight: '44px' }}>
        {STAT_ACCENTS.map((accent, idx) => {
          const statKey = ['totalItems', 'totalEstimateDays', 'completedPercent', 'inProgressCount', 'overdueCount'][idx] as keyof typeof statCards
          const value = statCards[statKey]
          const displayValue =
            idx === 1 ? `${value}d` :
            idx === 2 ? `${value}%` :
            String(value)

          return (
            <div key={accent.label} className="flex items-center gap-2">
              <div
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: accent.color }}
              />
              <span className="text-[0.9375rem] font-semibold text-fg-1">{displayValue}</span>
              <span className="text-[0.75rem] text-fg-3">{accent.label}</span>
            </div>
          )
        })}
      </div>

      {/* Breakdown Collapsible Section */}
      <Collapsible label="Breakdown" defaultOpen={false}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-s3">
          <div>
            <div className="text-body font-medium mb-s4">Assignee breakdown</div>
            <div className="flex flex-col gap-s3">{renderAssigneeBreakdownChart()}</div>
          </div>
          <div>
            <div className="text-body font-medium mb-s4">Upcoming milestones</div>
            <div className="flex flex-col gap-2">{renderUpcomingMilestonesChart()}</div>
          </div>
        </div>
      </Collapsible>

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
