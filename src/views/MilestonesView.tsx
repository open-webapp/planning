import React, { useState } from 'react'
import { Edit2 } from 'lucide-react'
import type { Milestone } from '../lib/types'
import type { AppState } from '../lib/state'
import type { DerivedData } from '../lib/selectors'
import { formatDate } from '../lib/dates'
import { statusColor } from '../lib/statusColors'

interface MilestonesViewProps {
  state: AppState
  dispatch: (action: any) => void
  derivedData: DerivedData
}

const MilestonesView: React.FC<MilestonesViewProps> = ({ state, dispatch, derivedData }) => {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')

  const handleStartEdit = (milestone: Milestone) => {
    setEditingId(milestone.id)
    setEditingName(milestone.name)
  }

  const handleSaveEdit = (milestoneId: string) => {
    if (editingName.trim()) {
      dispatch({ type: 'UPDATE_MILESTONE', milestoneId, patch: { name: editingName } })
    }
    setEditingId(null)
  }

  return (
    <div className="flex flex-col h-full overflow-auto p-[28px_32px]">
      <h2 className="mb-[20px] text-[1.75rem] font-normal text-fg-1">Milestones</h2>

      {state.milestones.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-s12 text-center">
          <p className="text-h3 font-medium text-fg-2 mb-s2">No milestones yet</p>
          <p className="text-body text-fg-3">Create a milestone to get started</p>
        </div>
      ) : (
        <div
          className="grid gap-[20px]"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}
        >
          {state.milestones.map((milestone) => {
            const upcomingMilestone = derivedData.upcomingMilestones.find(
              (m) => m.id === milestone.id
            )

            const progress = upcomingMilestone?.progress || 0
            const itemCount = upcomingMilestone?.itemCount || 0
            const startDate = upcomingMilestone?.startDate
            const endDate = upcomingMilestone?.endDate
            const statusCounts = upcomingMilestone?.statusCounts || {}

            return (
              <div
                key={milestone.id}
                onClick={() => {
                  dispatch({ type: 'SET_ACTIVE_VIEW', view: 'tasks' })
                  dispatch({ type: 'SET_FILTER', filterKey: 'milestone', value: milestone.id })
                }}
                className="bg-white border border-border rounded-lg p-[22px] shadow-1 cursor-pointer"
              >
                <div className="flex items-start justify-between gap-s2 mb-1">
                  {editingId === milestone.id ? (
                    <input
                      autoFocus
                      type="text"
                      value={editingName}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveEdit(milestone.id)
                        if (e.key === 'Escape') setEditingId(null)
                      }}
                      onBlur={() => handleSaveEdit(milestone.id)}
                      className="flex-1 px-s2 py-s1 bg-white border border-netskopeBlue rounded text-[1.0625rem] font-medium text-fg-1"
                    />
                  ) : (
                    <div className="text-[1.0625rem] font-medium text-fg-1 flex-1">
                      {milestone.name}
                    </div>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleStartEdit(milestone)
                    }}
                    className="p-s1 text-fg-2 hover:text-netskopeBlue transition-colors flex-shrink-0"
                    title="Edit"
                  >
                    <Edit2 size={16} />
                  </button>
                </div>

                {/* Date Range and Item Count */}
                <p className="text-[0.8125rem] text-fg-3 mb-[14px]">
                  {startDate && endDate
                    ? `${formatDate(startDate)} - ${formatDate(endDate)} · ${itemCount} items`
                    : 'No tasks assigned'}
                </p>

                {/* Progress Bar */}
                {itemCount > 0 && (
                  <>
                    <div className="w-full h-2 bg-ink-100 rounded-pill overflow-hidden">
                      <div
                        className="h-full bg-lightningGreen rounded-pill transition-all"
                        style={{ width: `${progress}%` }}
                      ></div>
                    </div>
                    <div className="flex justify-between mt-[6px] mb-[14px]">
                      <span className="text-[0.75rem] text-fg-3">Progress</span>
                      <span className="text-[0.75rem] font-medium text-fg-2">{progress}%</span>
                    </div>
                  </>
                )}

                {/* Status Chips */}
                {itemCount > 0 && (
                  <div className="flex flex-wrap gap-s3">
                    {Object.entries(statusCounts)
                      .sort(([, countA], [, countB]) => countB - countA)
                      .map(([status, count]) => (
                        <div key={status} className="flex items-center gap-[5px]">
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{ background: statusColor(status) }}
                          />
                          <span className="text-[0.75rem] text-fg-2">
                            {count} {status}
                          </span>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default MilestonesView
