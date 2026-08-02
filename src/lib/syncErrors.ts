/**
 * Turn raw sync error strings (often raw Google API JSON embedded in a message)
 * into a friendly message plus an optional action link for the UI to render.
 */
export interface FriendlySyncError {
  message: string
  actionUrl?: string
  actionLabel?: string
}

/**
 * Extract the first balanced {...} object from a string, respecting quoted strings,
 * so trailing non-JSON text (e.g. our appended account diagnostic) doesn't break parsing.
 */
function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf('{')
  if (start === -1) return null

  let depth = 0
  let inString = false
  let escaped = false

  for (let i = start; i < text.length; i++) {
    const char = text[i]

    if (inString) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === '"') {
        inString = false
      }
      continue
    }

    if (char === '"') {
      inString = true
    } else if (char === '{') {
      depth++
    } else if (char === '}') {
      depth--
      if (depth === 0) return text.slice(start, i + 1)
    }
  }

  return null
}

/** Extract the "(request was made as X)" account diagnostic we append in googleAuth.ts, if present. */
function extractAccountDiagnostic(text: string): string | null {
  const match = text.match(/\(request was made as ([^)]+)\)/)
  return match ? match[1] : null
}

export function parseSyncError(rawError: string): FriendlySyncError {
  const accountEmail = extractAccountDiagnostic(rawError)
  const jsonText = extractFirstJsonObject(rawError)

  if (jsonText) {
    try {
      const parsed = JSON.parse(jsonText)
      const apiError = parsed?.error
      const reason = apiError?.details?.find((d: any) => d?.reason)?.reason
      const activationUrl = apiError?.details?.find((d: any) => d?.metadata?.activationUrl)?.metadata
        ?.activationUrl
      const serviceTitle = apiError?.details?.find((d: any) => d?.metadata?.serviceTitle)?.metadata
        ?.serviceTitle

      if (reason === 'SERVICE_DISABLED') {
        return {
          message: `${serviceTitle || 'Google Sheets API'} isn't enabled for this app's Google Cloud project yet.`,
          actionUrl: activationUrl,
          actionLabel: 'Enable the API',
        }
      }

      if (apiError?.status === 'PERMISSION_DENIED') {
        const base = apiError.message || 'Google denied access to this spreadsheet. Make sure it is shared with your account.'
        return {
          message: accountEmail ? `${base} (request used ${accountEmail} — check this matches the account the sheet is shared with)` : base,
        }
      }

      if (apiError?.status === 'NOT_FOUND') {
        // Google returns 404 (not 403) both when the ID is wrong AND when the file
        // exists but isn't shared with the authenticated account — it hides which.
        const base = "Spreadsheet not found. Either the ID is wrong, or the sheet isn't shared with the connected Google account."
        return {
          message: accountEmail ? `${base} The request used ${accountEmail} — check this matches the account the sheet is shared with (it may differ from what's shown in Settings if the token silently refreshed).` : base,
        }
      }
    } catch {
      // Not parseable JSON, fall through to generic handling
    }
  }

  return { message: rawError }
}
