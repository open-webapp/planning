import React from 'react'
import type { DerivedData } from '../lib/selectors'
import type { AppState } from '../lib/state'
import type { Task, Milestone } from '../lib/types'
import { formatDate, diffDays } from '../lib/dates'

interface TimelineViewProps {
  derivedData: DerivedData
  state: AppState
  dispatch: (action: any) => void
  displaySchedules: { [taskId: string]: { start: string; end: string } }
  criticalSet: Set<string>
}

const TimelineView: React.FC<TimelineViewProps> = ({
  derivedData,
  state,
  dispatch,
  displaySchedules,
  criticalSet,
}) => {
  const { ganttMeta, rowMap } = derivedData

  const getTaskById = (id: string): Task | undefined => {
    return state.tasks.find((t) => t.id === id)
  }

  const getMilestoneById = (id: string): Milestone | undefined => {
    return state.milestones.find((m) => m.id === id)
  }

  const calculateBarPosition = (startDate: string): number => {
    const days = diffDays(ganttMeta.minDate, startDate)
    return days * ganttMeta.dayWidth
  }

  const calculateBarWidth = (startDate: string, endDate: string): number => {
    const days = Math.max(1, diffDays(startDate, endDate) + 1)
    return days * ganttMeta.dayWidth
  }

  const weekTicks = ganttMeta.weekTicks

  const totalWidth = diffDays(ganttMeta.minDate, ganttMeta.maxDate) * ganttMeta.dayWidth + 200

  return (
    <div>
      <h2 className="mb-5 text-[1.75rem] font-normal text-fg-1">Timeline</h2>
      <div className="flex border border-border rounded-lg overflow-hidden bg-white">
        {/* Left Column: Task Names */}
        <div className="w-[260px] flex-shrink-0 border-r border-border">
          <div className="h-10 border-b border-divider" />
          {rowMap.visibleRows.map((row) => {
            if (row.type === 'milestone') {
              const milestone = getMilestoneById(row.id)
              return (
                <div
                  key={`mil-${row.id}`}
                  className="h-[34px] flex items-center px-3 font-medium text-deepBlue text-[0.8125rem] bg-ink-50 border-b border-divider"
                >
                  {milestone?.name}
                </div>
              )
            } else {
              const task = getTaskById(row.id)
              if (!task) return null
              return (
                <div
                  key={`task-${task.id}`}
                  onClick={() => dispatch({ type: 'SELECT_TASK', taskId: task.id })}
                  className="h-[34px] flex items-center pr-3 text-[0.8125rem] text-fg-1 border-b border-divider cursor-pointer overflow-hidden whitespace-nowrap text-ellipsis"
                  style={{ paddingLeft: `${12 + row.level * 16}px` }}
                >
                  {task.name}
                </div>
              )
            }
          })}
        </div>

        {/* Right Column: Gantt Chart */}
        <div className="flex-1 overflow-x-auto">
          <div style={{ width: `${totalWidth}px` }}>
            {/* Header with date ticks */}
            <div className="h-10 border-b border-divider relative">
              {weekTicks.map((tick) => {
                const pos = calculateBarPosition(tick.date)
                return (
                  <div
                    key={`tick-${tick.date}`}
                    className="absolute top-0 h-full flex items-center text-caption text-fg-3"
                    style={{ left: `${pos}px`, paddingLeft: '6px' }}
                  >
                    {formatDate(tick.date)}
                  </div>
                )
              })}
            </div>

            {/* Gantt Rows */}
            {rowMap.visibleRows.map((row) => {
              if (row.type === 'milestone') {
                return (
                  <div
                    key={`mil-bar-${row.id}`}
                    className="h-[34px] bg-ink-50 border-b border-divider"
                  />
                )
              } else {
                const task = getTaskById(row.id)
                if (!task) return null
                const schedule = displaySchedules[task.id]
                if (!schedule) {
                  return (
                    <div key={`task-bar-${task.id}`} className="h-[34px] border-b border-divider" />
                  )
                }

                const left = calculateBarPosition(schedule.start)
                const width = calculateBarWidth(schedule.start, schedule.end)
                const isCritical = criticalSet.has(task.id)

                return (
                  <div
                    key={`task-bar-${task.id}`}
                    className="h-[34px] border-b border-divider relative"
                  >
                    <div
                      onClick={() => dispatch({ type: 'SELECT_TASK', taskId: task.id })}
                      className={`absolute top-1.5 bottom-1.5 rounded flex items-center px-2 cursor-pointer overflow-hidden ${
                        isCritical ? 'bg-orange' : 'bg-netskopeBlue'
                      }`}
                      style={{
                        left: `${left}px`,
                        width: `${width}px`,
                        boxShadow: isCritical ? '0 0 0 2px var(--ns-orange)' : 'none',
                      }}
                      title={task.name}
                    >
                      <span className="text-caption text-white font-medium truncate">
                        {task.name}
                      </span>
                    </div>
                  </div>
                )
              }
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

export default TimelineView
