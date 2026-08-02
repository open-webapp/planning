import React from 'react'
import { MessageSquare } from 'lucide-react'
import type { DerivedData } from '../lib/selectors'
import type { AppState } from '../lib/state'
import { formatDate, formatTs } from '../lib/dates'
import { statusColor } from '../lib/statusColors'

interface DashboardViewProps {
  derivedData: DerivedData
  state: AppState
  dispatch: (action: any) => void
}

// Accent colors for the stat cards, in mockup order: Total Items, Total Estimate,
// Completed, In Progress, Overdue.
const STAT_ACCENTS = [
  'var(--ns-deep-blue)',
  'var(--ns-netskope-blue)',
  'var(--ns-lightning-green)',
  'var(--ns-netskope-blue)',
  'var(--ns-orange)',
]

const DashboardView: React.FC<DashboardViewProps> = ({ derivedData, dispatch }) => {
  const { statCards, statusBreakdown, upcomingMilestones, recentActivity } = derivedData

  const statCardValues: { label: string; value: string | number }[] = [
    { label: 'Total Items', value: statCards.totalItems },
    { label: 'Total Estimate', value: `${statCards.totalEstimateDays}d` },
    { label: 'Completed', value: `${statCards.completedPercent}%` },
    { label: 'In Progress', value: statCards.inProgressCount },
    { label: 'Overdue', value: statCards.overdueCount },
  ]

  const totalForBreakdown = statCards.totalItems

  return (
    <div className="p-[28px_32px]">
      <h2 className="mb-[20px] text-[1.75rem] font-normal text-fg-1">Dashboard</h2>

      {/* Stat Cards Grid */}
      <div className="grid grid-cols-5 gap-[16px] mb-s6">
        {statCardValues.map((card, i) => (
          <div
            key={card.label}
            className="bg-white border border-border rounded-lg p-[20px] shadow-1"
          >
            <div className="text-[0.75rem] uppercase tracking-[0.06em] text-fg-3 mb-s2">
              {card.label}
            </div>
            <div
              className="text-[1.75rem] font-medium"
              style={{ color: STAT_ACCENTS[i] || 'var(--ns-fg-1)' }}
            >
              {card.value}
            </div>
          </div>
        ))}
      </div>

      {/* Status breakdown + Upcoming milestones */}
      <div className="grid grid-cols-[1.3fr_1fr] gap-s5 mb-s6">
        <div className="bg-white border border-border rounded-lg p-s6 shadow-1">
          <div className="text-body font-medium mb-s4">Status breakdown</div>
          <div className="flex flex-col gap-s3">
            {statusBreakdown.map((status) => {
              const percentage =
                totalForBreakdown > 0 ? (status.count / totalForBreakdown) * 100 : 0
              return (
                <div key={status.status} className="flex items-center gap-[10px]">
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ background: statusColor(status.status) }}
                  />
                  <span className="w-[100px] text-[0.8125rem] text-fg-2 flex-shrink-0">
                    {status.status}
                  </span>
                  <div className="flex-1 h-2 bg-ink-100 rounded-pill overflow-hidden">
                    <div
                      className="h-full rounded-pill"
                      style={{
                        width: `${percentage}%`,
                        background: statusColor(status.status),
                      }}
                    />
                  </div>
                  <span className="w-[28px] text-right text-[0.8125rem] text-fg-3">
                    {status.count}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        <div className="bg-white border border-border rounded-lg p-s6 shadow-1">
          <div className="text-body font-medium mb-s4">Upcoming milestones</div>
          <div className="flex flex-col gap-[14px]">
            {upcomingMilestones.length === 0 ? (
              <p className="text-[0.8125rem] text-fg-3">No upcoming milestones</p>
            ) : (
              upcomingMilestones.map((milestone) => (
                <div
                  key={milestone.id}
                  onClick={() => {
                    dispatch({ type: 'SET_ACTIVE_VIEW', view: 'tasks' })
                    dispatch({ type: 'SET_FILTER', filterKey: 'milestone', value: milestone.id })
                  }}
                  className="cursor-pointer"
                >
                  <div className="flex justify-between mb-s1">
                    <span className="text-[0.875rem] text-fg-1">{milestone.name}</span>
                    <span className="text-[0.75rem] text-fg-3">
                      {formatDate(milestone.endDate)}
                    </span>
                  </div>
                  <div className="h-[6px] bg-ink-100 rounded-pill overflow-hidden">
                    <div
                      className="h-full rounded-pill"
                      style={{
                        width: `${milestone.progress}%`,
                        background: 'var(--ns-lightning-green)',
                      }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Recent activity */}
      <div className="bg-white border border-border rounded-lg p-s6 shadow-1">
        <div className="text-body font-medium mb-s4">Recent activity</div>
        <div className="flex flex-col gap-[14px]">
          {recentActivity.length === 0 ? (
            <p className="text-[0.8125rem] text-fg-3">No recent activity</p>
          ) : (
            recentActivity.map((activity) => (
              <div
                key={activity.id}
                onClick={() => dispatch({ type: 'OPEN_COMMENTS_OVERLAY', taskId: activity.taskId })}
                className="cursor-pointer border-b border-divider pb-s3"
              >
                <div className="flex justify-between mb-1 gap-s2">
                  <span className="flex items-center gap-s2 text-[0.8125rem] font-medium text-fg-1 truncate">
                    <MessageSquare size={12} className="text-netskopeBlue flex-shrink-0" />
                    {activity.author} on {activity.taskName}
                  </span>
                  <span className="text-[0.75rem] text-fg-3 whitespace-nowrap flex-shrink-0">
                    {formatTs(activity.ts)}
                  </span>
                </div>
                <div className="text-[0.8125rem] text-fg-2">{activity.text}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

export default DashboardView
