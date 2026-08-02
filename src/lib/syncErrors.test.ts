import { describe, it, expect } from 'vitest'
import { parseSyncError } from './syncErrors'

describe('parseSyncError', () => {
  it('produces a friendly message and enable link for SERVICE_DISABLED errors', () => {
    const raw = `Push failed: Failed to fetch spreadsheet metadata: 403 - ${JSON.stringify({
      error: {
        code: 403,
        message: 'Google Sheets API has not been used in project 123 before or it is disabled.',
        status: 'PERMISSION_DENIED',
        details: [
          {
            '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
            reason: 'SERVICE_DISABLED',
            metadata: {
              serviceTitle: 'Google Sheets API',
              activationUrl: 'https://console.developers.google.com/apis/api/sheets.googleapis.com/overview?project=123',
            },
          },
        ],
      },
    })}`

    const result = parseSyncError(raw)

    expect(result.message).toContain("Google Sheets API isn't enabled")
    expect(result.actionUrl).toBe(
      'https://console.developers.google.com/apis/api/sheets.googleapis.com/overview?project=123'
    )
    expect(result.actionLabel).toBe('Enable the API')
  })

  it('falls back to the API message for other PERMISSION_DENIED errors', () => {
    const raw = `Push failed: 403 - ${JSON.stringify({
      error: { code: 403, message: 'The caller does not have permission', status: 'PERMISSION_DENIED' },
    })}`

    const result = parseSyncError(raw)

    expect(result.message).toBe('The caller does not have permission')
    expect(result.actionUrl).toBeUndefined()
  })

  it('produces a friendly message for NOT_FOUND errors', () => {
    const raw = `Push failed: Failed to fetch spreadsheet metadata: 404 - ${JSON.stringify({
      error: { code: 404, message: 'Requested entity was not found.', status: 'NOT_FOUND' },
    })}`

    const result = parseSyncError(raw)

    expect(result.message).toContain('Spreadsheet not found')
    expect(result.actionUrl).toBeUndefined()
  })

  it('surfaces the account diagnostic appended after the JSON body', () => {
    const raw = `Push failed: Failed to fetch spreadsheet metadata: 404 - ${JSON.stringify({
      error: { code: 404, message: 'Requested entity was not found.', status: 'NOT_FOUND' },
    })} (request was made as someone@example.com)`

    const result = parseSyncError(raw)

    expect(result.message).toContain('Spreadsheet not found')
    expect(result.message).toContain('someone@example.com')
  })

  it('returns the raw string unchanged when it is not JSON', () => {
    const result = parseSyncError('Sync cancelled: project switched')
    expect(result).toEqual({ message: 'Sync cancelled: project switched' })
  })
})
