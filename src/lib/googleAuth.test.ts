import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

describe('pullFromSheet', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns null (treats as first-ever sync) when tabs do not exist yet, surfaced as 400 INVALID_ARGUMENT', async () => {
    // Reproduces the reported bug: a spreadsheet that exists but only has the default
    // 'Sheet1' tab fails the Tasks/Milestones range batchGet with 400, not 404 — and the
    // old code only special-cased 404/403, so it threw instead of treating this as "no data yet".
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: async () =>
          JSON.stringify({
            error: {
              code: 400,
              message: 'Unable to parse range: Tasks!A:Z',
              status: 'INVALID_ARGUMENT',
            },
          }),
      })
    )

    const { pullFromSheet } = await import('./googleAuth')
    const result = await pullFromSheet('sheet-id', 'fake-token')

    expect(result).toBeNull()
  })

  it('still throws, with the response body included, for other 400 errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: async () =>
          JSON.stringify({
            error: { code: 400, message: 'Invalid spreadsheet ID', status: 'INVALID_ARGUMENT' },
          }),
      })
    )

    const { pullFromSheet } = await import('./googleAuth')

    await expect(pullFromSheet('sheet-id', 'fake-token')).rejects.toThrow('Invalid spreadsheet ID')
  })

  it('reads milestone as a plain text column (not milestoneId) from a single Tasks tab', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          valueRanges: [
            {
              values: [
                ['id', 'name', 'milestone', 'parentId', 'category', 'assignee', 'status', 'estimate', 'startDate', 'progress', 'dependencies', 'comments', 'notes'],
                ['t1', 'Task One', 'Launch', '', 'Default', 'Alice', 'Not Started', '3', '2026-08-01', '0', '', '', ''],
              ],
            },
          ],
        }),
      })
    )

    const { pullFromSheet } = await import('./googleAuth')
    const result = await pullFromSheet('sheet-id', 'fake-token')

    expect(result).not.toBeNull()
    expect(result!.milestones).toHaveLength(1)
    expect(result!.milestones[0].name).toBe('Launch')
    expect(result!.tasks[0].milestoneId).toBe(result!.milestones[0].id)
  })

  it('reuses an existing milestone id for a matching name instead of minting a new one', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          valueRanges: [
            {
              values: [
                ['id', 'name', 'milestone', 'parentId', 'category', 'assignee', 'status', 'estimate', 'startDate', 'progress', 'dependencies', 'comments', 'notes'],
                ['t1', 'Task One', 'Launch', '', '', '', '', '', '', '', '', '', ''],
              ],
            },
          ],
        }),
      })
    )

    const { pullFromSheet } = await import('./googleAuth')
    const result = await pullFromSheet('sheet-id', 'fake-token', [{ id: 'm-existing', name: 'Launch' }])

    expect(result!.milestones).toEqual([{ id: 'm-existing', name: 'Launch' }])
    expect(result!.tasks[0].milestoneId).toBe('m-existing')
  })
})

describe('requestAccessToken', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'test-client-id')
    delete window.google

    // jsdom in this project's vitest config doesn't wire up localStorage; stub a minimal one.
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
    })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.useRealTimers()
  })

  it('waits for window.google.accounts.oauth2 instead of throwing when the GIS script has not loaded yet', async () => {
    // Reproduces "Cannot read properties of undefined (reading 'accounts')":
    // window.google is undefined when requestAccessToken is first called (script still loading),
    // then becomes available shortly after (script finishes loading).
    const { requestAccessToken } = await import('./googleAuth')

    const initTokenClient = vi.fn().mockReturnValue({
      requestAccessToken: vi.fn(),
    })

    const promise = requestAccessToken(['https://www.googleapis.com/auth/spreadsheets'])

    // Script hasn't loaded yet: window.google is still undefined at this point.
    expect((window as any).google).toBeUndefined()

    // Simulate the async GIS script finishing load shortly after.
    setTimeout(() => {
      ;(window as any).google = { accounts: { oauth2: { initTokenClient } } }
    }, 150)

    // Let the internal poll (every 100ms) observe the newly-defined window.google.
    await vi.waitFor(() => expect(initTokenClient).toHaveBeenCalled(), { timeout: 2000, interval: 50 })

    // Resolve the pending token request so the outer promise doesn't hang.
    const callbackArg = initTokenClient.mock.calls[0][0]
    callbackArg.callback({ access_token: 'fake-token' })

    await expect(promise).resolves.toBe('fake-token')
  })

  it('rejects with a clear message instead of a TypeError when GIS never loads', async () => {
    vi.useFakeTimers()
    const { requestAccessToken } = await import('./googleAuth')

    const promise = requestAccessToken(['https://www.googleapis.com/auth/spreadsheets'])
    // Prevent an unhandled rejection warning while we advance timers below.
    const assertion = expect(promise).rejects.toThrow(
      'Google Identity Services failed to load. Check your connection and try again.'
    )

    await vi.advanceTimersByTimeAsync(10_000)

    await assertion
  })
})
