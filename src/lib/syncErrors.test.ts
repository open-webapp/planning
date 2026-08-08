import { describe, it, expect } from 'vitest'
import {
  DriveSyncError,
  NeedsReauthError,
  NotFoundError,
  RateLimitedError,
  ScopeInsufficientError,
  TransientError,
  WrongAccountError,
} from '@open-webapp/drive-sync'
import { parseSyncError } from './syncErrors'

describe('parseSyncError', () => {
  it('produces a friendly message and enable link for a SERVICE_DISABLED 403', () => {
    const body = JSON.stringify({
      error: {
        code: 403,
        message: 'Google Drive API has not been used in project 123 before or it is disabled.',
        status: 'PERMISSION_DENIED',
        details: [
          {
            '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
            reason: 'SERVICE_DISABLED',
            metadata: {
              serviceTitle: 'Google Drive API',
              activationUrl: 'https://console.developers.google.com/apis/api/drive.googleapis.com/overview?project=123',
            },
          },
        ],
      },
    })
    const error = new DriveSyncError('Drive request forbidden (403)', { status: 403, reason: body })

    const result = parseSyncError(error)

    expect(result.message).toContain("Google Drive API isn't enabled")
    expect(result.actionUrl).toBe(
      'https://console.developers.google.com/apis/api/drive.googleapis.com/overview?project=123'
    )
    expect(result.actionLabel).toBe('Enable the API')
  })

  it('falls back to the error message for a 403 that is not SERVICE_DISABLED', () => {
    const error = new DriveSyncError('Drive request forbidden (403): The caller does not have permission', {
      status: 403,
      reason: 'The caller does not have permission',
    })

    const result = parseSyncError(error)

    expect(result.message).toBe('Drive request forbidden (403): The caller does not have permission')
    expect(result.actionUrl).toBeUndefined()
  })

  it('produces a friendly message for NotFoundError', () => {
    const error = new NotFoundError('some-file-id')

    const result = parseSyncError(error)

    expect(result.message).toContain('Drive file not found')
    expect(result.actionUrl).toBeUndefined()
  })

  it('produces a friendly message for NeedsReauthError', () => {
    const result = parseSyncError(new NeedsReauthError())
    expect(result.message).toContain('reconnected')
  })

  it('produces a friendly message for ScopeInsufficientError', () => {
    const result = parseSyncError(new ScopeInsufficientError())
    expect(result.message).toContain('re-authorized')
  })

  it('produces a friendly message for WrongAccountError, naming both accounts', () => {
    const result = parseSyncError(new WrongAccountError({ expectedEmail: 'a@x.com', actualEmail: 'b@x.com' }))
    expect(result.message).toContain('a@x.com')
    expect(result.message).toContain('b@x.com')
  })

  it('produces a friendly message for RateLimitedError', () => {
    const result = parseSyncError(new RateLimitedError())
    expect(result.message).toContain('rate-limiting')
  })

  it('produces a friendly message for TransientError', () => {
    const result = parseSyncError(new TransientError())
    expect(result.message).toContain('temporary problem')
  })

  it('falls back to a plain Error message for untyped errors', () => {
    const result = parseSyncError(new Error('Sync cancelled: project switched'))
    expect(result).toEqual({ message: 'Sync cancelled: project switched' })
  })

  it('falls back to String(error) for a raw string (e.g. the mid-sync cancellation message)', () => {
    const result = parseSyncError('Sync cancelled: project switched')
    expect(result).toEqual({ message: 'Sync cancelled: project switched' })
  })
})
