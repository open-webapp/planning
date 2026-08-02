import React, { useCallback } from 'react'
import { X } from 'lucide-react'
import type { AppState } from '../lib/state'
import { formatTs } from '../lib/dates'

interface TaskDetailsOverlayProps {
  state: AppState
  dispatch: (action: any) => void
}

const TaskDetailsOverlay: React.FC<TaskDetailsOverlayProps> = ({ state, dispatch }) => {
  if (!state.commentsOverlayId) {
    return null
  }

  const task = state.tasks.find((t) => t.id === state.commentsOverlayId)
  if (!task) {
    return null
  }

  const handleBackdropClick = useCallback(() => {
    dispatch({ type: 'CLOSE_COMMENTS_OVERLAY' })
  }, [dispatch])

  const handlePanelClick = (e: React.MouseEvent) => {
    e.stopPropagation()
  }

  const handleMilestoneChange = useCallback(
    (milestoneId: string) => {
      dispatch({
        type: 'UPDATE_TASK',
        taskId: task.id,
        patch: { milestoneId },
      })
    },
    [dispatch, task.id]
  )

  const handleAddNewMilestone = useCallback(() => {
    const milestoneName = window.prompt('New milestone name:')
    if (milestoneName && milestoneName.trim()) {
      // Create the milestone and move task to it in one atomic action
      dispatch({
        type: 'ADD_MILESTONE_AND_MOVE_TASK',
        taskId: task.id,
        milestoneName: milestoneName.trim(),
      })
    }
  }, [dispatch, task.id])

  const handleNotesChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      dispatch({
        type: 'UPDATE_TASK',
        taskId: task.id,
        patch: { notes: e.target.value },
      })
    },
    [dispatch, task.id]
  )

  const handleNewCommentChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      dispatch({
        type: 'UPDATE_NEW_COMMENT_TEXT',
        text: e.target.value,
      })
    },
    [dispatch]
  )

  const handlePostComment = useCallback(() => {
    const commentText = state.newCommentText || ''
    if (commentText.trim()) {
      dispatch({
        type: 'ADD_COMMENT',
        taskId: task.id,
        text: commentText,
        author: 'Current User', // TODO: Use actual user info from state
      })
    }
  }, [dispatch, task.id, state.newCommentText])

  const sortedComments = [...(task.comments || [])]
    .filter((c) => c.ts && !isNaN(new Date(c.ts).getTime()))
    .sort(
      (a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime()
    )

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
          width: '480px',
          maxHeight: '80vh',
        }}
        onClick={handlePanelClick}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-divider px-[22px] py-[18px] flex-shrink-0">
          <div>
            <div className="text-[0.6875rem] font-semibold tracking-[0.06em] text-fg-3 mb-1 uppercase">
              Details
            </div>
            <div className="text-[1.0625rem] font-medium text-fg-1">{task.name}</div>
          </div>
          <span
            onClick={() => dispatch({ type: 'CLOSE_COMMENTS_OVERLAY' })}
            className="cursor-pointer text-fg-3 flex hover:text-fg-1 transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </span>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-[22px] py-[18px] flex flex-col gap-4">
          {/* Milestone Select */}
          <div>
            <div className="text-[0.6875rem] font-semibold tracking-[0.06em] text-fg-3 mb-2 uppercase">
              Milestone
            </div>
            <select
              value={task.milestoneId || ''}
              onChange={(e) => {
                if (e.target.value === '__add_new__') {
                  handleAddNewMilestone()
                } else {
                  handleMilestoneChange(e.target.value)
                }
              }}
              className="w-full text-sm text-fg-1 border border-border bg-white rounded-md px-2 py-[7px] cursor-pointer box-border"
            >
              <option value="">No milestone</option>
              {state.milestones.map((milestone) => (
                <option key={milestone.id} value={milestone.id}>
                  {milestone.name}
                </option>
              ))}
              <option value="__add_new__">+ Add new</option>
            </select>
          </div>

          {/* Notes Textarea */}
          <div>
            <div className="text-[0.6875rem] font-semibold tracking-[0.06em] text-fg-3 mb-2 uppercase">
              Notes
            </div>
            <textarea
              value={task.notes || ''}
              onChange={handleNotesChange}
              placeholder="Add notes…"
              className="w-full p-[10px] border border-border rounded-md text-sm leading-normal text-fg-1 resize-y box-border"
              style={{ minHeight: '120px', whiteSpace: 'pre-wrap', overflowWrap: 'break-word' }}
            />
          </div>

          {/* Updates Feed */}
          <div className="text-[0.6875rem] font-semibold tracking-[0.06em] text-fg-3 uppercase">
            Updates
          </div>
          {sortedComments.length > 0 ? (
            sortedComments.map((comment) => (
              <div key={comment.id} className="border-b border-divider pb-[10px]">
                <div className="flex justify-between mb-[3px]">
                  <span className="text-[0.8125rem] font-medium text-fg-1">{comment.author}</span>
                  <span className="text-xs text-fg-3">{formatTs(comment.ts)}</span>
                </div>
                <div
                  className="text-[0.8125rem] text-fg-2 leading-normal"
                  style={{ whiteSpace: 'pre-wrap', overflowWrap: 'break-word' }}
                >
                  {comment.text}
                </div>
              </div>
            ))
          ) : (
            <div className="text-[0.8125rem] text-fg-3">No updates yet.</div>
          )}
        </div>

        {/* Footer: New Comment */}
        <div className="px-[22px] py-4 border-t border-divider bg-bg-tint flex-shrink-0">
          <textarea
            value={state.newCommentText || ''}
            onChange={handleNewCommentChange}
            placeholder="Post a text update…"
            className="w-full p-[10px] border border-border rounded-md text-sm leading-normal resize-y box-border"
            style={{ minHeight: '120px', whiteSpace: 'pre-wrap', overflowWrap: 'break-word' }}
          />
          <button
            onClick={handlePostComment}
            className="mt-2 px-[14px] py-[6px] bg-deepBlue text-white rounded-md text-[0.8125rem] cursor-pointer"
          >
            Post
          </button>
        </div>
      </div>
    </>
  )
}

export default TaskDetailsOverlay
