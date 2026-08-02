import React, { useRef, useEffect, useState } from 'react'
import { Search, ChevronDown, Plus } from 'lucide-react'
import type { AppState } from '../lib/state'

export interface ToolbarProps {
  state: AppState
  dispatch: (action: any) => void
  onAddTask?: () => void
}

const Toolbar: React.FC<ToolbarProps> = ({
  state,
  dispatch,
  onAddTask,
}) => {
  const [searchValue, setSearchValue] = useState(state.filters.search || '')
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Determine visibility based on activeView
  const showSearch = state.activeView === 'tasks'
  const showFilters = state.activeView === 'tasks' || state.activeView === 'timeline'
  const showAddTaskButton = state.activeView === 'tasks'

  // Sync local searchValue with global state
  useEffect(() => {
    setSearchValue(state.filters.search || '')
  }, [state.filters.search])

  // Handle search input change
  const handleSearchChange = (value: string) => {
    setSearchValue(value)
    dispatch({ type: 'SET_FILTER', filterKey: 'search', value })
  }

  // Handle filter change
  const handleFilterChange = (filterKey: 'status' | 'category' | 'assignee' | 'milestone', value: string) => {
    dispatch({ type: 'SET_FILTER', filterKey, value })
  }

  // Handle add new value in dropdown
  const handlePromptAndAdd = (fieldName: 'customStatuses' | 'customAssignees' | 'customCategories') => {
    const val = window.prompt('Enter new value:')
    if (!val || !val.trim()) {
      return
    }
    dispatch({ type: 'ADD_CUSTOM_VALUE', fieldName, value: val.trim() })
  }

  // Handle add new milestone
  const handleAddMilestone = () => {
    const val = window.prompt('Enter milestone name:')
    if (!val || !val.trim()) {
      return
    }
    dispatch({ type: 'ADD_MILESTONE', name: val.trim() })
  }

  // Handle add task button
  const handleAddTask = () => {
    if (onAddTask) {
      onAddTask()
    }
  }

  // Build filter options with custom values
  const statusOptions = [...state.customStatuses]
  const assigneeOptions = [...state.customAssignees]
  const categoryOptions = [...state.customCategories]
  const milestoneOptions = state.milestones.map((m) => m.name)

  return (
    <div className="border-b border-divider bg-monoWhite px-s6 py-s3 flex items-center gap-s3">
      {/* Left: Search Input (only on Tasks view) */}
      {showSearch && (
        <div className="flex items-center gap-s2 border border-divider rounded-md px-s3 py-s2 flex-1 max-w-[280px]">
          <Search size={16} className="text-fg-3 flex-shrink-0" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search tasks…"
            value={searchValue}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="flex-1 min-w-0 bg-transparent outline-none text-body-sm text-fg-1 placeholder-fg-3"
          />
        </div>
      )}

      {/* Middle: Filter Selects (only on Tasks/Timeline) */}
      {showFilters && (
        <div className="flex items-center gap-s2">
          {/* Status Filter */}
          <FilterSelect
            label="Status"
            value={state.filters.status || ''}
            options={statusOptions}
            onSelect={(value) => handleFilterChange('status', value)}
            onAddNew={() => handlePromptAndAdd('customStatuses')}
          />

          {/* Category Filter */}
          <FilterSelect
            label="Category"
            value={state.filters.category || ''}
            options={categoryOptions}
            onSelect={(value) => handleFilterChange('category', value)}
            onAddNew={() => handlePromptAndAdd('customCategories')}
          />

          {/* Assignee Filter */}
          <FilterSelect
            label="Assignee"
            value={state.filters.assignee || ''}
            options={assigneeOptions}
            onSelect={(value) => handleFilterChange('assignee', value)}
            onAddNew={() => handlePromptAndAdd('customAssignees')}
          />

          {/* Milestone Filter */}
          <FilterSelect
            label="Milestone"
            value={state.filters.milestone || ''}
            options={milestoneOptions}
            onSelect={(value) => handleFilterChange('milestone', value)}
            onAddNew={handleAddMilestone}
          />
        </div>
      )}

      {/* Right: Add Task Button (only on Tasks view) */}
      {showAddTaskButton && (
        <button
          onClick={handleAddTask}
          className="flex items-center gap-s2 px-s4 py-s2 bg-deepBlue text-monoWhite rounded-md hover:opacity-90 transition-opacity text-body-sm font-medium whitespace-nowrap"
        >
          <Plus size={15} />
          <span>New Task</span>
        </button>
      )}
    </div>
  )
}

interface FilterSelectProps {
  label: string
  value: string
  options: string[]
  onSelect: (value: string) => void
  onAddNew: () => void
}

const FilterSelect: React.FC<FilterSelectProps> = ({
  label,
  value,
  options,
  onSelect,
  onAddNew,
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Click-outside handler
  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (dropdownRef.current && !dropdownRef.current.contains(target)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-s1 px-s2 py-s2 border border-divider rounded-md bg-monoWhite hover:bg-bg-alt transition-colors text-body-sm text-fg-2"
      >
        <span>{value || label}</span>
        <ChevronDown size={14} className="text-fg-3" />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-s1 z-40 min-w-40 bg-monoWhite border border-divider rounded-md shadow-2">
          <div className="max-h-56 overflow-y-auto">
            {/* Clear filter option */}
            {value && (
              <>
                <button
                  onClick={() => {
                    onSelect('')
                    setIsOpen(false)
                  }}
                  className="w-full text-left px-s3 py-s1 hover:bg-bg-alt text-body-sm text-fg-3 italic"
                >
                  (Clear)
                </button>
                <div className="border-t border-divider" />
              </>
            )}

            {/* Options */}
            {options.map((option) => (
              <button
                key={option}
                onClick={() => {
                  onSelect(option)
                  setIsOpen(false)
                }}
                className={`w-full text-left px-s3 py-s1 hover:bg-bg-alt transition-colors text-body-sm ${
                  value === option ? 'text-netskopeBlue font-medium' : 'text-fg-1'
                }`}
              >
                {option}
              </button>
            ))}

            {/* Add new option */}
            <div className="border-t border-divider">
              <button
                onClick={() => {
                  onAddNew()
                  setIsOpen(false)
                }}
                className="w-full text-left px-s3 py-s1 hover:bg-bg-alt text-body-sm text-netskopeBlue font-medium"
              >
                + Add new value...
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Toolbar
