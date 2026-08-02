import React, { useCallback, useState, useMemo } from 'react'
import { X } from 'lucide-react'
import type { AppState } from '../lib/state'

interface SyncConflictOverlayProps {
  state: AppState
  dispatch: (action: any) => void
}

const SyncConflictOverlay: React.FC<SyncConflictOverlayProps> = ({ state, dispatch }) => {
  // If no conflicts, don't render
  if (state.syncConflicts.length === 0) {
    return null
  }

  // Local state to track choices: { [key: string]: 'sheet' | 'browser' | undefined }
  // Key is `${taskId}:${field}` - undefined means unpicked
  const [choices, setChoices] = useState<{ [key: string]: 'sheet' | 'browser' | undefined }>({})

  const handlePanelClick = (e: React.MouseEvent) => {
    e.stopPropagation()
  }

  const handleChoiceChange = useCallback((conflictKey: string, choice: 'sheet' | 'browser') => {
    setChoices((prev) => ({
      ...prev,
      [conflictKey]: prev[conflictKey] === choice ? undefined : choice,
    }))
  }, [])

  const handleCancel = useCallback(() => {
    dispatch({
      type: 'CLEAR_SYNC_CONFLICTS',
    })
  }, [dispatch])

  const handleApplyAndSync = useCallback(() => {
    dispatch({
      type: 'SYNC_RESOLVE_CONFLICTS',
      choices,
    })
  }, [dispatch, choices])

  // Check if all conflicts have been resolved
  const allResolved = useMemo(() => {
    return state.syncConflicts.every((conflict) => {
      const key = `${conflict.taskId}:${conflict.field}`
      return choices[key] !== undefined
    })
  }, [state.syncConflicts, choices])

  // Helper to format field name for display
  const formatFieldName = (field: string): string => {
    return field.charAt(0).toUpperCase() + field.slice(1)
  }

  // Helper to format value for display
  const formatValue = (value: unknown): string => {
    if (value === null || value === undefined) {
      return '(empty)'
    }
    if (typeof value === 'boolean') {
      return value ? 'Yes' : 'No'
    }
    if (typeof value === 'number') {
      return value.toString()
    }
    if (typeof value === 'string') {
      return value
    }
    if (Array.isArray(value)) {
      return `[${value.length} items]`
    }
    return String(value)
  }

  return (
    <>
      {/* Backdrop - no dismiss on click per requirements */}
      <div
        className="fixed inset-0 z-40"
        style={{ background: 'rgba(8,26,89,0.35)' }}
      />

      {/* Panel */}
      <div
        className="fixed top-1/2 left-1/2 flex flex-col bg-white rounded-lg shadow-3 overflow-hidden z-[41]"
        style={{
          transform: 'translate(-50%, -50%)',
          width: '480px',
          maxHeight: '70vh',
        }}
        onClick={handlePanelClick}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-divider px-[22px] py-[18px] flex-shrink-0">
          <div>
            <div className="text-[0.6875rem] font-semibold tracking-[0.06em] text-fg-3 mb-1 uppercase">
              Sync Conflicts
            </div>
            <div className="text-[1.0625rem] font-medium text-fg-1">
              Resolve {state.syncConflicts.length} conflict{state.syncConflicts.length !== 1 ? 's' : ''}
            </div>
          </div>
          <span
            onClick={() => handleCancel()}
            className="cursor-pointer text-fg-3 flex hover:text-fg-1 transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </span>
        </div>

        {/* Conflict List */}
        <div className="flex-1 overflow-y-auto px-3 py-2">
          {state.syncConflicts.map((conflict) => {
            const conflictKey = `${conflict.taskId}:${conflict.field}`
            const selectedChoice = choices[conflictKey]

            return (
              <div key={conflictKey} className="mb-4 rounded-md border border-border p-3 bg-bg-tint">
                {/* Conflict Header */}
                <div className="mb-2">
                  <div className="text-sm font-medium text-fg-1">{conflict.taskName}</div>
                  <div className="text-xs text-fg-3">{formatFieldName(conflict.field)}</div>
                </div>

                {/* Radio Options */}
                <div className="space-y-1">
                  {/* Sheet Version Option */}
                  <div
                    onClick={() => handleChoiceChange(conflictKey, 'sheet')}
                    className={`flex items-center gap-[10px] px-[10px] py-[9px] rounded-md cursor-pointer transition-colors ${
                      selectedChoice === 'sheet'
                        ? 'bg-deepBlue-50 border border-deepBlue-200'
                        : 'hover:bg-ink-50'
                    }`}
                  >
                    <div className="w-[15px] h-[15px] flex-shrink-0 rounded-full border-2 border-deepBlue flex items-center justify-center">
                      {selectedChoice === 'sheet' && (
                        <div className="w-[7px] h-[7px] bg-deepBlue rounded-full" />
                      )}
                    </div>
                    <span className="text-xs text-fg-3 min-w-[70px] flex-shrink-0">
                      Sheet version:
                    </span>
                    <span className="text-xs text-fg-1 overflow-hidden text-ellipsis whitespace-nowrap">
                      {formatValue(conflict.sheetValue)}
                    </span>
                  </div>

                  {/* Browser Version Option */}
                  <div
                    onClick={() => handleChoiceChange(conflictKey, 'browser')}
                    className={`flex items-center gap-[10px] px-[10px] py-[9px] rounded-md cursor-pointer transition-colors ${
                      selectedChoice === 'browser'
                        ? 'bg-deepBlue-50 border border-deepBlue-200'
                        : 'hover:bg-ink-50'
                    }`}
                  >
                    <div className="w-[15px] h-[15px] flex-shrink-0 rounded-full border-2 border-deepBlue flex items-center justify-center">
                      {selectedChoice === 'browser' && (
                        <div className="w-[7px] h-[7px] bg-deepBlue rounded-full" />
                      )}
                    </div>
                    <span className="text-xs text-fg-3 min-w-[70px] flex-shrink-0">
                      Browser version:
                    </span>
                    <span className="text-xs text-fg-1 overflow-hidden text-ellipsis whitespace-nowrap">
                      {formatValue(conflict.browserValue)}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className="border-t border-divider bg-bg-tint px-[22px] py-3 flex-shrink-0 flex items-center justify-between gap-3">
          <button
            onClick={handleApplyAndSync}
            disabled={!allResolved}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              allResolved
                ? 'bg-deepBlue text-white hover:bg-deepBlue-600 cursor-pointer'
                : 'bg-bg-disabled text-fg-disabled cursor-not-allowed'
            }`}
          >
            Apply and Sync
          </button>
          <button
            onClick={handleCancel}
            className="text-xs text-fg-3 hover:text-fg-1 transition-colors cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </div>
    </>
  )
}

export default SyncConflictOverlay
