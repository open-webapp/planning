import React, { useEffect, useRef, useState } from 'react'
import { LayoutGrid, ListChecks, BarChart3, ChevronDown, Settings, CloudSync, Loader2, Download } from 'lucide-react'
import type { AppState } from '../lib/state'
import ProjectSwitcher from './ProjectSwitcher'

export interface AppShellProps {
  state: AppState
  dispatch: (state: AppState) => void
  onViewChange: (view: 'dashboard' | 'tasks' | 'milestones' | 'timeline') => void
  onSettingsClick?: () => void
  onSyncClick?: () => void
  onExportCsv?: () => void
  onCloseProjectMenu?: () => void
  toolbar?: React.ReactNode
  children?: React.ReactNode
}

const AppShell: React.FC<AppShellProps> = ({
  state,
  dispatch,
  onViewChange,
  onSettingsClick,
  onSyncClick,
  onExportCsv,
  onCloseProjectMenu,
  toolbar,
  children,
}) => {
  const shellRef = useRef<HTMLDivElement>(null)
  const projectTriggerRef = useRef<HTMLDivElement>(null)
  const [projectMenuOpen, setProjectMenuOpen] = useState(false)

  // Click-outside handler to close project menu
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      // If click is outside the shell area, close menus
      if (shellRef.current && !shellRef.current.contains(target)) {
        setProjectMenuOpen(false)
        if (onCloseProjectMenu) {
          onCloseProjectMenu()
        }
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onCloseProjectMenu])

  const activeProject = state.projects.find((p) => p.id === state.activeProjectId)

  const navTabs = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutGrid },
    { id: 'tasks', label: 'Tasks', icon: ListChecks },
    { id: 'timeline', label: 'Timeline', icon: BarChart3 },
  ] as const

  return (
    <div ref={shellRef} className="flex flex-col h-screen bg-bg">
      {/* Dark top chrome bar */}
      <div className="flex items-center gap-s6 px-s7 border-b border-divider bg-deepBlue flex-shrink-0">
        {/* Project switcher trigger */}
        <div ref={projectTriggerRef} className="relative py-s3">
          <div
            className="cursor-pointer select-none"
            onClick={() => setProjectMenuOpen((open) => !open)}
          >
            <div className="flex items-center gap-s1 mt-px">
              <span className="text-body text-monoWhite font-medium">
                {activeProject?.name || 'Project'}
              </span>
              <ChevronDown size={13} className="text-white/55" />
            </div>
          </div>

          <ProjectSwitcher
            state={state}
            dispatch={dispatch}
            isOpen={projectMenuOpen}
            onClose={() => setProjectMenuOpen(false)}
            triggerRef={projectTriggerRef}
          />
        </div>

        {/* Nav pills */}
        <div className="flex items-stretch gap-s1">
          {navTabs.map((tab) => {
            const Icon = tab.icon
            const isActive = state.activeView === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => onViewChange(tab.id)}
                className={`flex items-center gap-s2 px-s3 py-s2 rounded-md text-body-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-white/12 text-monoWhite'
                    : 'text-white/70 hover:bg-white/8 hover:text-monoWhite'
                }`}
              >
                <Icon size={16} />
                <span>{tab.label}</span>
              </button>
            )
          })}
        </div>

        <div className="flex-1" />

        {/* CloudSync icon */}
        {activeProject?.spreadsheetId && (
          <button
            onClick={onSyncClick}
            title="Sync with sheet"
            aria-label="Sync with sheet"
            className="flex items-center justify-center w-[34px] h-[34px] rounded-md text-white/75 hover:bg-white/12 hover:text-monoWhite transition-colors flex-shrink-0"
          >
            {state.syncBusy ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <CloudSync size={18} />
            )}
          </button>
        )}

        {/* CSV Export icon */}
        <button
          onClick={onExportCsv}
          title="Download tasks as CSV"
          aria-label="Download tasks as CSV"
          className="flex items-center justify-center w-[34px] h-[34px] rounded-md text-white/75 hover:bg-white/12 hover:text-monoWhite transition-colors flex-shrink-0"
        >
          <Download size={18} />
        </button>

        {/* Settings icon */}
        <button
          onClick={onSettingsClick}
          title="Settings"
          aria-label="Settings"
          className="flex items-center justify-center w-[34px] h-[34px] rounded-md text-white/75 hover:bg-white/12 hover:text-monoWhite transition-colors flex-shrink-0"
        >
          <Settings size={18} />
        </button>
      </div>

      {toolbar}

      {/* Main Content Area */}
      <div className="flex-1 overflow-auto">
        {children || <div className="p-s6 text-fg-2">View content here</div>}
      </div>
    </div>
  )
}

export default AppShell
