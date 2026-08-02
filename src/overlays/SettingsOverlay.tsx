import React, { useCallback } from 'react'
import { X, Loader, Trash2 } from 'lucide-react'
import type { AppState } from '../lib/state'
import { syncNow } from '../lib/sync'
import { parseSyncError } from '../lib/syncErrors'

interface SettingsOverlayProps {
  state: AppState
  dispatch: (action: any) => void
  onDeleteProject?: (projectId: string) => Promise<void>
}

const SettingsOverlay: React.FC<SettingsOverlayProps> = ({ state, dispatch, onDeleteProject }) => {
  if (!state.settingsOpen) {
    return null
  }

  const handleBackdropClick = useCallback(() => {
    dispatch({ type: 'CLOSE_SETTINGS' })
  }, [dispatch])

  const handlePanelClick = (e: React.MouseEvent) => {
    e.stopPropagation()
  }

  const handleSpreadsheetIdChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const activeProject = state.projects.find((p) => p.id === state.activeProjectId)
      if (activeProject) {
        const rawValue = e.target.value
        // Users often paste the full sheet URL rather than just the ID; extract it if so.
        const urlMatch = rawValue.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
        const spreadsheetId = (urlMatch ? urlMatch[1] : rawValue).trim()
        dispatch({
          type: 'UPDATE_PROJECT',
          projectId: state.activeProjectId,
          patch: { spreadsheetId: spreadsheetId || null },
        })
      }
    },
    [dispatch, state.activeProjectId, state.projects]
  )

  const handleConnectGoogle = useCallback(() => {
    // Phase 6: requestAccessToken() from lib/googleAuth.ts
    // For now, dispatch a stub action
    dispatch({
      type: 'REQUEST_GOOGLE_TOKEN',
    })
  }, [dispatch])

  const handleDisconnectGoogle = useCallback(() => {
    // Phase 6: revokeToken() from lib/googleAuth.ts
    // For now, clear tokens and close overlay
    dispatch({
      type: 'REVOKE_GOOGLE_TOKEN',
    })
    dispatch({
      type: 'CLOSE_SETTINGS',
    })
  }, [dispatch])

  const handleSyncNow = useCallback(() => {
    syncNow(state, dispatch)
  }, [state, dispatch])

  const handleDeleteProject = useCallback(
    (projectId: string) => {
      if (onDeleteProject) {
        onDeleteProject(projectId)
      }
    },
    [onDeleteProject]
  )

  const activeProject = state.projects.find((p) => p.id === state.activeProjectId)
  const isConnected = !!state.googleAccessToken
  const canBackup = state.googleAccessToken && activeProject?.spreadsheetId

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
          width: '460px',
          maxHeight: '82vh',
        }}
        onClick={handlePanelClick}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-divider px-[22px] py-[18px] flex-shrink-0">
          <div className="text-[1.0625rem] font-medium text-fg-1">Settings</div>
          <span
            onClick={() => dispatch({ type: 'CLOSE_SETTINGS' })}
            className="cursor-pointer text-fg-3 flex hover:text-fg-1 transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </span>
        </div>

        {/* Tab Row */}
        <div className="flex items-center gap-6 px-[22px] border-b border-divider flex-shrink-0">
          {['General', 'Projects'].map((label) => {
            const tabValue = label.toLowerCase() as 'general' | 'projects'
            const isActive = state.settingsTab === tabValue
            return (
              <button
                key={tabValue}
                onClick={() => dispatch({ type: 'SET_SETTINGS_TAB', tab: tabValue })}
                className={`py-3 px-1 font-medium text-[0.9375rem] transition-colors ${
                  isActive
                    ? 'text-netskopeBlue border-b-2 border-netskopeBlue'
                    : 'text-fg-3 border-b-2 border-transparent hover:text-fg-1'
                }`}
              >
                {label}
              </button>
            )
          })}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-[22px] py-5 flex flex-col gap-[22px]">
          {state.settingsTab === 'general' && (
            <>
              {/* Data Storage Section */}
              <div>
                <div className="text-[0.9375rem] font-medium text-fg-1 mb-1">Data storage</div>
                <div className="text-[0.8125rem] text-fg-3 leading-normal">
                  This project's tasks are saved automatically in your browser. Connect a Google
                  account below to back them up to a spreadsheet, or restore from one.
                </div>
              </div>

              {/* Google Account Section */}
              <div>
                <div className="text-[0.6875rem] font-semibold tracking-[0.06em] text-fg-3 mb-2 uppercase">
                  Google Account
                </div>

                {state.googleBusy ? (
                  <div className="flex items-center gap-2">
                    <Loader size={16} className="animate-spin text-netskopeBlue" />
                    <span className="text-sm text-fg-2">{state.googleStatus || 'Loading...'}</span>
                  </div>
                ) : isConnected ? (
                  <div className="flex items-center justify-between px-3 py-[10px] border border-border rounded-md bg-ink-50">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ background: '#2BAE66' }}
                      />
                      <span className="text-[0.8125rem] text-fg-1">
                        {state.googleUserEmail || 'Connected'}
                      </span>
                    </div>
                    <span
                      onClick={handleDisconnectGoogle}
                      className="text-xs text-netskopeBlue cursor-pointer"
                    >
                      Disconnect
                    </span>
                  </div>
                ) : (
                  <>
                    <button
                      onClick={handleConnectGoogle}
                      className="px-4 py-2 bg-deepBlue text-white rounded-md text-[0.8125rem] cursor-pointer"
                    >
                      Connect Google Account
                    </button>
                  </>
                )}
              </div>

              {/* Spreadsheet Backup Section */}
              <div>
                <div className="text-[0.6875rem] font-semibold tracking-[0.06em] text-fg-3 mb-2 uppercase">
                  Spreadsheet Backup{activeProject ? ` · ${activeProject.name}` : ''}
                </div>

                {/* Spreadsheet ID Input */}
                <input
                  type="text"
                  value={activeProject?.spreadsheetId || ''}
                  onChange={handleSpreadsheetIdChange}
                  placeholder="Spreadsheet ID (from the sheet's URL)"
                  className="w-full text-[0.8125rem] text-fg-1 border border-border rounded-md px-[10px] py-2 box-border mb-[10px]"
                />

                {/* Sync Button */}
                <button
                  onClick={handleSyncNow}
                  disabled={!canBackup || state.syncBusy}
                  className="w-full px-3 py-2 bg-deepBlue text-white rounded-md text-[0.8125rem] cursor-pointer disabled:bg-fg-3 disabled:cursor-not-allowed"
                >
                  Sync Now
                </button>

                {/* Last Sync Status */}
                <div className="text-xs text-fg-3 mt-[10px]">
                  {activeProject?.lastSyncedAt
                    ? `Last sync: ${new Date(activeProject.lastSyncedAt).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}`
                    : 'Not synced yet.'}
                </div>

                {/* Status Text */}
                {state.syncStatus && !state.syncBusy && (() => {
                  const isSuccess = state.syncStatus.startsWith('Synced at')
                  const friendlyError = isSuccess ? null : parseSyncError(state.syncStatus)
                  return (
                    <div className={`text-xs mt-[6px] ${isSuccess ? 'text-netskopeBlue' : 'text-rose-600'}`}>
                      {isSuccess ? state.syncStatus : friendlyError!.message}
                      {friendlyError?.actionUrl && (
                        <>
                          {' '}
                          <a
                            href={friendlyError.actionUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline hover:text-rose-800"
                          >
                            {friendlyError.actionLabel}
                          </a>
                        </>
                      )}
                    </div>
                  )
                })()}

                {/* Busy Spinner */}
                {state.syncBusy && (
                  <div className="flex items-center gap-2 mt-[6px]">
                    <Loader size={14} className="animate-spin text-netskopeBlue" />
                    <span className="text-xs text-fg-2">Processing...</span>
                  </div>
                )}
              </div>
            </>
          )}

          {state.settingsTab === 'projects' && (
            <>
              {/* Intro Line */}
              <div className="text-[0.8125rem] text-fg-3 leading-normal">
                Deleting a project backs up its tasks first — to its linked spreadsheet if connected
                and configured, otherwise as a CSV download.
              </div>

              {/* Projects List */}
              <div className="flex flex-col gap-3">
                {state.projects.map((project) => {
                  const syncLabel = !project.spreadsheetId
                    ? 'No spreadsheet configured'
                    : !project.lastSyncedAt
                    ? 'Synced to spreadsheet'
                    : `Synced to spreadsheet — last synced ${new Date(
                        project.lastSyncedAt
                      ).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}`

                  return (
                    <div
                      key={project.id}
                      className="flex items-center justify-between px-3 py-[10px] border border-border rounded-md bg-ink-50"
                    >
                      <div className="flex items-center gap-3 flex-1">
                        {/* Color Dot */}
                        <div
                          style={{
                            width: 16,
                            height: 16,
                            backgroundColor: project.color,
                            borderRadius: '50%',
                            flexShrink: 0,
                          }}
                        />

                        {/* Project Info */}
                        <div className="flex flex-col gap-1">
                          <div className="text-[0.8125rem] font-medium text-fg-1">{project.name}</div>
                          <div className="text-xs text-fg-3">{syncLabel}</div>
                        </div>
                      </div>

                      {/* Delete Button */}
                      <button
                        onClick={() => handleDeleteProject(project.id)}
                        className="flex items-center justify-center text-fg-3 hover:text-red-600 transition-colors flex-shrink-0"
                        aria-label={`Delete ${project.name}`}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}

export default SettingsOverlay
