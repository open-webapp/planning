import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

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

    const promise = requestAccessToken('p-test', ['https://www.googleapis.com/auth/spreadsheets'])

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

    const promise = requestAccessToken('p-test', ['https://www.googleapis.com/auth/spreadsheets'])
    // Prevent an unhandled rejection warning while we advance timers below.
    const assertion = expect(promise).rejects.toThrow(
      'Google Identity Services failed to load. Check your connection and try again.'
    )

    await vi.advanceTimersByTimeAsync(10_000)

    await assertion
  })
})
