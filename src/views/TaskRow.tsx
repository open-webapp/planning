import React, { useEffect, useState, useRef } from 'react'
import { ChevronDown, ChevronRight, Trash2, MessageSquare, GripVertical } from 'lucide-react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import type { Task } from '../lib/types'
import type { AppState } from '../lib/state'
import { formatDate } from '../lib/dates'
import { statusColor as sharedStatusColor } from '../lib/statusColors'
import AutocompleteCell from '../components/AutocompleteCell'

interface TaskRowProps {
  task: Task
  taskNumber: number
  level: number
  columns: Array<{ name: string; label: string; key: string }>
  getColumnWidth: (colName: string) => number
  displaySchedules: { [taskId: string]: { start: string; end: string } }
  progress: number
  isCritical: boolean
  hasChildren: boolean
  isExpanded: boolean
  isSelected: boolean
  state: AppState
  dispatch: (action: any) => void
  dragDisabled?: boolean
}

// Shared "transparent until hover/focus" styling used for the inline-editable
// fields (name, category, assignee, start date, estimate, deps, progress).
const inlineFieldClass =
  'border border-transparent bg-transparent hover:bg-ink-50 focus:border-netskopeBlue focus:bg-white focus:outline-none'

const TaskRow: React.FC<TaskRowProps> = ({
  task,
  taskNumber,
  level,
  columns,
  getColumnWidth,
  displaySchedules,
  progress,
  isCritical,
  hasChildren,
  isExpanded,
  isSelected,
  dragDisabled = false,
  state,
  dispatch,
}) => {
  const [newName, setNewName] = useState(task.name)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
    disabled: dragDisabled,
  })

  const { setNodeRef: setDroppableRef } = useDroppable({
    id: task.id,
  })

  useEffect(() => {
    setNewName(task.name)
  }, [task.name])

  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [newName])

  const scheduleInfo = displaySchedules[task.id]
  const isParent = state.tasks.some((t) => t.parentId === task.id)
  const displayProgress = isParent ? progress : task.progress
  const commentCount = task.comments?.length || 0
  const hasComments = commentCount > 0
  const visualLevel = task.parentId ? level : 0

  const statusColor = sharedStatusColor(task.status)

  const detailsColor = hasComments ? 'var(--ns-netskope-blue)' : 'var(--ns-fg-3)'
  const detailsBg = hasComments ? 'color-mix(in srgb, var(--ns-netskope-blue) 10%, white)' : 'transparent'
  const detailsBorder = hasComments
    ? 'color-mix(in srgb, var(--ns-netskope-blue) 30%, white)'
    : 'var(--ns-border)'

  const handleNameKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault()
      if (e.shiftKey) {
        dispatch({ type: 'OUTDENT_TASK', taskId: task.id })
      } else {
        dispatch({ type: 'INDENT_TASK', taskId: task.id })
      }
    } else if (e.key === 'Enter') {
      e.preventDefault()
      ;(e.target as HTMLTextAreaElement).blur()
    }
  }

  const handleNameBlur = () => {
    if (newName.trim() && newName !== task.name) {
      dispatch({ type: 'UPDATE_TASK', taskId: task.id, patch: { name: newName } })
    } else {
      setNewName(task.name)
    }
  }

  const renderCell = (colName: string): React.ReactNode => {
    switch (colName) {
      case 'number':
        return (
          <div className="flex items-center justify-center text-fg-3" style={{ fontSize: '0.8125rem' }}>
            {taskNumber}
          </div>
        )

      case 'name':
        return (
          <div className="flex min-w-0 w-full items-start gap-s2">
            {hasChildren ? (
              <button
                onClick={() => dispatch({ type: 'TOGGLE_EXPAND', taskId: task.id })}
                className="flex flex-shrink-0 items-center p-0 text-fg-3 hover:text-fg-1"
                style={{ marginTop: '6px' }}
              >
                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
            ) : (
              <div className="w-3.5 flex-shrink-0" />
            )}
            {isCritical && (
              <span
                title="On critical path"
                className="flex-shrink-0 rounded-full"
                style={{ width: '7px', height: '7px', background: 'var(--ns-orange)', marginTop: '9px' }}
              />
            )}
            <textarea
              ref={inputRef}
              autoFocus={task.name === 'Unnamed'}
              data-task-id={task.id}
              value={newName}
              rows={1}
              onChange={(e) => setNewName(e.target.value)}
              onBlur={handleNameBlur}
              onKeyDown={handleNameKeyDown}
              onClick={(e) => e.stopPropagation()}
              title={task.name}
              className={`min-w-0 flex-1 resize-none rounded font-sans ${inlineFieldClass}`}
              style={{
                fontSize: '0.95rem',
                color: 'var(--ns-fg-1)',
                padding: '6px 8px',
                margin: '-6px 0 -6px -8px',
                paddingLeft: `${8 + visualLevel * 16}px`,
                lineHeight: '1.4',
                overflow: 'hidden',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            />
          </div>
        )

      case 'details':
        return (
          <span
            onClick={(e) => {
              e.stopPropagation()
              dispatch({ type: 'OPEN_COMMENTS_OVERLAY', taskId: task.id })
            }}
            title="Task details"
            className="flex flex-shrink-0 cursor-pointer items-center gap-1 whitespace-nowrap rounded-pill hover:bg-ink-100"
            style={{
              padding: '3px 8px',
              color: detailsColor,
              background: detailsBg,
              border: `1px solid ${detailsBorder}`,
            }}
          >
            <MessageSquare size={12} />
            <span style={{ fontSize: '0.6875rem', fontWeight: 500 }}>Details</span>
            {hasComments && <span style={{ fontSize: '0.6875rem', fontWeight: 600 }}>({commentCount})</span>}
          </span>
        )

      case 'category':
        return (
          <AutocompleteCell
            value={task.category}
            options={state.customCategories}
            placeholder="Category"
            multiline
            onCommit={(v) => {
              dispatch({ type: 'UPDATE_TASK', taskId: task.id, patch: { category: v } })
              dispatch({ type: 'ADD_CUSTOM_VALUE', fieldName: 'customCategories', value: v })
            }}
            wrapperStyle={{
              width: '100%',
              maxWidth: '100%',
            }}
            inputStyle={{
              fontSize: '0.8125rem',
              color: 'var(--ns-fg-2)',
              padding: '2px',
              margin: '-2px',
              border: '1px solid transparent',
              background: 'transparent',
              borderRadius: 'var(--ns-r-md)',
              fontFamily: 'sans-serif',
              lineHeight: '1.4',
            }}
            inputHoverStyle={{
              backgroundColor: 'var(--ns-ink-50)',
            }}
            inputFocusStyle={{
              borderColor: 'var(--ns-netskope-blue)',
              backgroundColor: 'white',
            }}
            onStopClick={(e) => e.stopPropagation()}
          />
        )

      case 'status': {
        const statusPillStyle: React.CSSProperties = {
          fontSize: '0.75rem',
          color: statusColor,
          background: `color-mix(in srgb, ${statusColor} 14%, white)`,
          borderColor: `color-mix(in srgb, ${statusColor} 28%, white)`,
          padding: '3px 8px',
          border: '1px solid',
          borderRadius: 'var(--ns-r-full)',
          fontWeight: 500,
          cursor: 'pointer',
        };

        return (
          <AutocompleteCell
            value={task.status}
            options={state.customStatuses}
            placeholder="Status"
            onCommit={(v) => {
              dispatch({ type: 'UPDATE_TASK', taskId: task.id, patch: { status: v } });
              dispatch({ type: 'ADD_CUSTOM_VALUE', fieldName: 'customStatuses', value: v });
            }}
            inputStyle={statusPillStyle}
            onStopClick={(e) => e.stopPropagation()}
          />
        );
      }

      case 'assignee':
        return (
          <AutocompleteCell
            value={task.assignee}
            options={state.customAssignees}
            placeholder="Assignee"
            onCommit={(v) => {
              dispatch({ type: 'UPDATE_TASK', taskId: task.id, patch: { assignee: v } })
              dispatch({ type: 'ADD_CUSTOM_VALUE', fieldName: 'customAssignees', value: v })
            }}
            onStopClick={(e) => e.stopPropagation()}
            inputStyle={{
              color: 'var(--ns-fg-2)',
              padding: '2px 4px',
              margin: '-2px -4px',
              border: '1px solid transparent',
              background: 'transparent',
              borderRadius: 'var(--ns-r-md)',
              fontFamily: 'inherit',
            }}
            inputHoverStyle={{
              background: 'var(--ns-ink-50)',
            }}
            inputFocusStyle={{
              borderColor: 'var(--ns-netskope-blue)',
              background: 'white',
              outline: 'none',
            }}
          />
        )

      case 'start':
        return (
          <input
            type="date"
            value={task.startDate}
            onChange={(e) =>
              dispatch({ type: 'UPDATE_TASK', taskId: task.id, patch: { startDate: e.target.value } })
            }
            onClick={(e) => e.stopPropagation()}
            className={`w-full rounded font-sans ${inlineFieldClass}`}
            style={{ fontSize: '0.8125rem', color: 'var(--ns-fg-2)', padding: '2px', margin: '-2px', boxSizing: 'border-box' }}
          />
        )

      case 'estimate':
        return (
          <input
            type="number"
            min="0"
            value={task.estimate}
            onChange={(e) =>
              dispatch({ type: 'UPDATE_TASK', taskId: task.id, patch: { estimate: parseInt(e.target.value) || 0 } })
            }
            onClick={(e) => e.stopPropagation()}
            className={`w-full rounded font-sans ${inlineFieldClass}`}
            style={{ fontSize: '0.8125rem', color: 'var(--ns-fg-2)', padding: '2px 4px', margin: '-2px -4px', boxSizing: 'border-box' }}
          />
        )

      case 'end':
        return (
          <div style={{ fontSize: '0.8125rem', color: 'var(--ns-fg-2)' }}>
            {scheduleInfo ? formatDate(scheduleInfo.end) : '-'}
          </div>
        )

      case 'deps':
        return (
          <span
            onClick={(e) => {
              e.stopPropagation()
              dispatch({ type: 'OPEN_DEPS_EDITOR', taskId: task.id })
            }}
            title="Edit dependencies"
            className="block w-full cursor-pointer rounded hover:bg-ink-50"
            style={{
              fontSize: '0.8125rem',
              color: 'var(--ns-fg-2)',
              padding: '2px 4px',
              margin: '-2px -4px',
              boxSizing: 'border-box',
            }}
          >
            {task.dependencies.length > 0 ? task.dependencies.length : '-'}
          </span>
        )

      case 'progress':
        return (
          <div className="flex items-center gap-1">
            {isParent ? (
              <span style={{ fontSize: '0.8125rem', color: 'var(--ns-fg-2)' }}>{displayProgress}%</span>
            ) : (
              <>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={displayProgress}
                  onChange={(e) =>
                    dispatch({ type: 'UPDATE_TASK', taskId: task.id, patch: { progress: parseInt(e.target.value) || 0 } })
                  }
                  onClick={(e) => e.stopPropagation()}
                  className={`rounded text-right font-sans ${inlineFieldClass}`}
                  style={{ width: '36px', fontSize: '0.8125rem', color: 'var(--ns-fg-2)', padding: '1px 2px' }}
                />
                <span style={{ fontSize: '0.8125rem', color: 'var(--ns-fg-2)' }}>%</span>
              </>
            )}
          </div>
        )

      case 'actions':
        return (
          <div className="flex items-center justify-center">
            <button
              onClick={(e) => {
                e.stopPropagation()
                dispatch({ type: 'DELETE_TASK', taskId: task.id })
              }}
              className="flex items-center justify-center rounded p-1 text-fg-3 transition-colors hover:bg-danger/10 hover:text-danger"
              title="Delete task"
            >
              <Trash2 size={15} />
            </button>
          </div>
        )

      default:
        return null
    }
  }

  const width = columns.reduce((sum, col) => sum + getColumnWidth(col.name), 0)
  const boxShadowStyle = isCritical
    ? {
        boxShadow: '1px 0 0 var(--ns-orange), -1px 0 0 var(--ns-orange)',
      }
    : {}

  return (
    <div
      ref={setDroppableRef}
      className={`flex group border-b border-divider transition-colors hover:bg-ink-50 cursor-pointer ${
        isSelected ? 'bg-[color-mix(in_srgb,var(--ns-netskope-blue)_8%,white)]' : ''
      }`}
      style={{ width: `${width}px`, ...boxShadowStyle }}
      onClick={() => dispatch({ type: 'SELECT_TASK', taskId: task.id })}
    >
      <div
        ref={setNodeRef}
        className={`flex flex-shrink-0 items-center justify-center w-4 text-fg-3 opacity-0 group-hover:opacity-100 transition-opacity ${
          dragDisabled ? 'cursor-not-allowed opacity-30' : 'cursor-grab active:cursor-grabbing'
        }`}
        title={dragDisabled ? 'Clear filters to reorder' : 'Drag to reorder'}
        {...(dragDisabled ? {} : listeners)}
        {...(dragDisabled ? {} : attributes)}
        style={{
          opacity: isDragging ? 0.5 : undefined,
        }}
      >
        <GripVertical size={13} />
      </div>
      {columns.map((col) => (
        <div
          key={col.name}
          className="flex items-center overflow-hidden"
          style={{
            width: `${getColumnWidth(col.name)}px`,
            minWidth: col.name === 'name' ? '160px' : '50px',
            padding: '8px',
            justifyContent: col.name === 'number' ? 'center' : 'flex-start',
          }}
        >
          {renderCell(col.name)}
        </div>
      ))}
    </div>
  )
}

export default TaskRow
