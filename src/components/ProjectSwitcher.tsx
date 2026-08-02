import React, { useRef, useEffect } from 'react'
import { Check, Plus } from 'lucide-react'
import type { AppState } from '../lib/state'
import { switchProject, promptNewProject } from '../lib/state'

export interface ProjectSwitcherProps {
  state: AppState
  dispatch: (state: AppState) => void
  isOpen: boolean
  onClose: () => void
  triggerRef?: React.RefObject<HTMLDivElement | null>
}

const ProjectSwitcher: React.FC<ProjectSwitcherProps> = ({
  state,
  dispatch,
  isOpen,
  onClose,
  triggerRef,
}) => {
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Click-outside handler
  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(target) &&
        triggerRef &&
        !triggerRef.current?.contains(target)
      ) {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen, onClose, triggerRef])

  if (!isOpen) return null

  const handleProjectClick = (projectId: string) => {
    const newState = switchProject(state, projectId)
    dispatch(newState)
    onClose()
  }

  const handleNewProject = () => {
    const newState = promptNewProject(state)
    if (newState) {
      dispatch(newState)
      onClose()
    }
  }

  return (
    <div
      ref={dropdownRef}
      className="absolute top-full left-0 mt-s2 z-20 min-w-60 bg-monoWhite border border-divider rounded-md shadow-2 overflow-hidden"
    >
      {/* Projects List */}
      <div className="max-h-64 overflow-y-auto">
        {state.projects.map((project) => {
          const isActive = state.activeProjectId === project.id
          return (
            <button
              key={project.id}
              onClick={() => handleProjectClick(project.id)}
              className="w-full flex items-center justify-between gap-s3 px-s4 py-s2 hover:bg-ink-50 transition-colors text-left"
            >
              <span
                className={`text-body-sm truncate ${
                  isActive ? 'text-fg-1 font-medium' : 'text-fg-1 font-regular'
                }`}
              >
                {project.name}
              </span>
              {isActive && <Check size={14} className="text-netskopeBlue flex-shrink-0" strokeWidth={2.2} />}
            </button>
          )
        })}
      </div>

      {/* New Project Row */}
      <button
        onClick={handleNewProject}
        className="w-full flex items-center gap-s2 px-s4 py-s3 hover:bg-ink-50 transition-colors text-left text-body-sm font-medium text-netskopeBlue border-t border-divider"
      >
        <Plus size={15} className="flex-shrink-0" />
        <span>New Project</span>
      </button>
    </div>
  )
}

export default ProjectSwitcher
