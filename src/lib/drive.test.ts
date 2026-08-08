// Installs `indexedDB`/`IDBKeyRange` globals so `@open-webapp/drive-sync`'s
// storage layer (built on the `idb` package) works under jsdom, which does
// not implement IndexedDB itself. Must be imported before anything that
// touches drive-sync's storage.
import 'fake-indexeddb/auto'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDriveFake, createGisFake, type DriveFake, type GisFake } from '@open-webapp/drive-sync/testing'

const USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo'
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke'

/**
 * Wraps a driveFake's fetch with handling for the two endpoints drive-sync's
 * connect()/disconnect() hit directly (userinfo lookup + token revocation)
 * that driveFake itself doesn't understand. Mirrors the wiring used in the
 * library's own regression tests (packages/drive-sync/src/__tests__/regressions.test.ts).
 */
function createHostFetch(driveFake: DriveFake): typeof fetch {
  return (async (input: unknown, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : (input as Request)?.url ?? String(input)

    if (url.startsWith(USERINFO_URL)) {
      return new Response(JSON.stringify({ email: 'user@example.com' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (url.startsWith(REVOKE_URL)) {
      return new Response(null, { status: 200 })
    }

    return driveFake.fetch(input as any, init)
  }) as unknown as typeof fetch
}

describe('drive.ts folderPath wiring', () => {
  let gisFake: GisFake
  let driveFake: DriveFake

  beforeEach(() => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'test-client-id')
    gisFake = createGisFake()
    gisFake.install()
    driveFake = createDriveFake()
    vi.stubGlobal('fetch', createHostFetch(driveFake))
  })

  afterEach(() => {
    gisFake.uninstall()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  /**
   * Pins the exact folder path this app hands to drive-sync's
   * ensureFolderPath(). This is deliberately NOT a substring/snapshot check
   * on the source literal: it exercises the real `drive` singleton exported
   * from drive.ts end to end against an in-memory Drive fake.
   *
   * Rationale for why this test exists at all: a wrong folderPath value does
   * NOT throw or error anywhere. It silently creates a brand new, empty
   * Drive folder, and every existing user's backup simply appears to have
   * vanished from the app's point of view. That failure mode is invisible
   * without a test pinning the exact value.
   */
  it('ensureFolderPath() walks exactly ["OpenWebApp", "Planning"]', async () => {
    const { drive } = await import('./drive')

    gisFake.queueResponse({
      access_token: 'token-1',
      expires_in: 3600,
      scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email',
    })

    const project = drive.project('pin-test-project')
    await project.connect()

    await project.ensureFolderPath()

    // De-duplicate while preserving order: ensureFolderPath's find-or-create
    // walk logs each level's name once for the lookup and once for the
    // create when the level didn't already exist, so the raw log may
    // contain adjacent duplicates. The de-duped SEQUENCE is what must match
    // exactly, via deep-equal — never a substring/`.includes()` check.
    const uniqueInOrder = [...new Set(driveFake.folderCreationLog)]
    expect(uniqueInOrder).toEqual(['OpenWebApp', 'Planning'])
  })
})
