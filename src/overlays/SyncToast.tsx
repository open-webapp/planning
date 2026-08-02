import React, { useEffect, useCallback } from 'react'
import { X } from 'lucide-react'
import type { AppState } from '../lib/state'
import { syncNow } from '../lib/sync'
import { parseSyncError } from '../lib/syncErrors'

interface SyncToastProps {
  state: AppState
  dispatch: (action: any) => void
}

const SyncToast: React.FC<SyncToastProps> = ({ state, dispatch }) => {
  // Only show if syncStatus is set and there are no conflicts
  if (!state.syncStatus || state.syncConflicts.length > 0) {
    return null
  }

  const isSuccess = state.syncStatus.startsWith('Synced at')
  const isError = !isSuccess
  const friendlyError = isError ? parseSyncError(state.syncStatus) : null

  // Auto-dismiss success toasts after 4 seconds
  useEffect(() => {
    if (isSuccess) {
      const timer = setTimeout(() => {
        dispatch({ type: 'CLEAR_SYNC_STATUS' })
      }, 4000)
      return () => clearTimeout(timer)
    }
  }, [isSuccess, dispatch])

  const handleClose = useCallback(() => {
    dispatch({ type: 'CLEAR_SYNC_STATUS' })
  }, [dispatch])

  const handleRetry = useCallback(() => {
    syncNow(state, dispatch)
  }, [state, dispatch])

  return (
    <div
      className="fixed bottom-4 right-4 max-w-sm z-50"
      style={{
        animation: 'slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      <style>{`
        @keyframes slideIn {
          from {
            transform: translateX(400px);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `}</style>
      <div
        className={`flex items-start gap-3 px-4 py-3 rounded-md shadow-3 border ${
          isSuccess
            ? 'bg-emerald-50 border-emerald-200'
            : 'bg-rose-50 border-rose-200'
        }`}
      >
        {/* Message content */}
        <div className="flex-1 min-w-0">
          <p
            className={`text-sm font-medium ${
              isSuccess ? 'text-emerald-900' : 'text-rose-900'
            }`}
          >
            {isSuccess ? state.syncStatus : friendlyError!.message}
          </p>
          {friendlyError?.actionUrl && (
            <a
              href={friendlyError.actionUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium text-rose-700 underline hover:text-rose-900"
            >
              {friendlyError.actionLabel}
            </a>
          )}
        </div>

        {/* Retry button (error only) */}
        {isError && (
          <button
            onClick={handleRetry}
            className="ml-2 px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-100 rounded transition-colors flex-shrink-0"
          >
            Retry
          </button>
        )}

        {/* Close button */}
        <button
          onClick={handleClose}
          className={`ml-2 p-1 rounded hover:bg-white/50 transition-colors flex-shrink-0 ${
            isSuccess ? 'text-emerald-600' : 'text-rose-600'
          }`}
          aria-label="Close"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  )
}

export default SyncToast
