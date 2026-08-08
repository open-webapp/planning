import {
  DriveSyncError,
  NeedsReauthError,
  NotFoundError,
  RateLimitedError,
  ScopeInsufficientError,
  TransientError,
  WrongAccountError,
} from '@open-webapp/drive-sync'

/**
 * Turn a sync error into a friendly message plus an optional action link
 * for the UI to render. drive-sync throws typed error classes with
 * structured fields (see @open-webapp/drive-sync's errors.ts) rather than
 * baking the only available information into a formatted message string,
 * so this is a plain switch over error shape — no string/JSON parsing.
 */
export interface FriendlySyncError {
  message: string
  actionUrl?: string
  actionLabel?: string
}

export function parseSyncError(error: unknown): FriendlySyncError {
  if (error instanceof ScopeInsufficientError) {
    // drive-sync's ScopeInsufficientError doesn't carry a structured
    // activation-URL field (that's a SERVICE_DISABLED-specific Drive API
    // response shape, not something the library types today) — fall back
    // to reason-based copy without a link.
    return {
      message: 'Google Drive access needs to be re-authorized for this project.',
    }
  }

  if (error instanceof NeedsReauthError) {
    return {
      message: 'Your Google Drive connection needs to be reconnected before syncing.',
    }
  }

  if (error instanceof WrongAccountError) {
    return {
      message: `Google returned a token for ${error.actualEmail ?? 'a different account'}, not ${error.expectedEmail}. Reconnect the correct account.`,
    }
  }

  if (error instanceof NotFoundError) {
    // Google returns 404 both when the file id is wrong AND when the file
    // exists but isn't accessible to the authenticated account — it hides
    // which. drive-sync can't distinguish them either, so this message
    // stays honest about both possibilities.
    return {
      message:
        "Drive file not found. Either it was deleted/moved outside the app, or it isn't accessible to the connected Google account.",
    }
  }

  if (error instanceof RateLimitedError) {
    return {
      message: 'Google Drive is rate-limiting requests right now. Try syncing again shortly.',
    }
  }

  if (error instanceof TransientError) {
    return {
      message: 'Google Drive had a temporary problem. Try syncing again.',
    }
  }

  if (error instanceof DriveSyncError) {
    // drive-sync's generic 403 path (http.ts) carries the raw Drive API
    // response body verbatim in `reason` — unlike the old googleAuth.ts,
    // which required scanning an arbitrary "<prefix text>: <json>" message
    // string for a balanced {...} object, `reason` here IS exactly that
    // JSON body, so a plain JSON.parse suffices.
    if (error.status === 403 && error.reason) {
      try {
        const parsed = JSON.parse(error.reason)
        const apiError = parsed?.error
        const detail = apiError?.details?.find((d: any) => d?.reason === 'SERVICE_DISABLED')
        if (detail) {
          const activationUrl = detail.metadata?.activationUrl
          const serviceTitle = detail.metadata?.serviceTitle
          return {
            message: `${serviceTitle || 'Google Drive API'} isn't enabled for this app's Google Cloud project yet.`,
            actionUrl: activationUrl,
            actionLabel: 'Enable the API',
          }
        }
      } catch {
        // reason wasn't JSON (or didn't match) — fall through to the generic message.
      }
    }

    return { message: error.message }
  }

  if (error instanceof Error) {
    return { message: error.message }
  }

  return { message: String(error) }
}
