import type { Task, Milestone } from './types'
import { uid } from './seed'

declare global {
  interface Window {
    google: any;
  }
}

interface TokenData {
  access_token: string;
  expires_at?: number;  // epoch ms when token expires
  requested_at: number;  // epoch ms when token was obtained
}

let tokenClient: any;
let tokenResolve: ((token: string) => void) | null = null;
let tokenReject: ((error: Error) => void) | null = null;
let inFlightTokenPromise: Promise<string> | null = null;
const TOKEN_STORAGE_KEY = 'projects_app_oauth_token';
const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000;  // Refresh 5 min before expiry

const logger = {
  info: (msg: string, ...args: any[]) => console.log(`[Google Auth] ${msg}`, ...args),
  error: (msg: string, ...args: any[]) => console.error(`[Google Auth] ${msg}`, ...args),
  debug: (msg: string, ...args: any[]) => console.debug(`[Google Auth] ${msg}`, ...args),
};

/**
 * Load cached token from localStorage if valid.
 * Returns null if token is missing, expired, or invalid.
 */
function getCachedToken(): TokenData | null {
  try {
    const stored = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!stored) return null;

    const data: TokenData = JSON.parse(stored);
    const now = Date.now();

    // Check expiry with buffer (refresh 5 min before actual expiry)
    if (data.expires_at && now >= data.expires_at - TOKEN_EXPIRY_BUFFER_MS) {
      logger.debug('Cached token expired (or expiring soon), will refresh');
      clearToken();
      return null;
    }

    logger.debug('Using cached token');
    return data;
  } catch (error) {
    logger.debug('Failed to load cached token:', error);
    return null;
  }
}

/**
 * Save token to localStorage with expiry tracking.
 * GIS client doesn't provide explicit expiry, assume standard 1 hour.
 */
function saveToken(accessToken: string): void {
  const data: TokenData = {
    access_token: accessToken,
    expires_at: Date.now() + 3600 * 1000,  // 1 hour (standard Google access token TTL)
    requested_at: Date.now(),
  };
  localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(data));
  logger.info('Token saved to storage');
}

/**
 * Clear cached token (on logout/revocation).
 */
function clearToken(): void {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  logger.info('Token cleared from storage');
}

/**
 * Get or request a valid access token.
 * Attempts to use cached token if valid; requests new token if expired or missing.
 */
export async function getAccessToken(): Promise<string> {
  // Try cached token first
  const cached = getCachedToken();
  if (cached) {
    return cached.access_token;
  }

  // No valid cached token — request a new one. Coalesce concurrent callers
  // (e.g. multiple filter rules syncing at once) onto a single OAuth request
  // instead of each triggering its own token flow.
  if (inFlightTokenPromise) {
    return inFlightTokenPromise;
  }

  inFlightTokenPromise = requestAccessToken().finally(() => {
    inFlightTokenPromise = null;
  });
  return inFlightTokenPromise;
}

/**
 * Wait for the Google Identity Services script (loaded async/defer in index.html)
 * to finish initializing window.google.accounts.oauth2. Without this guard, a token
 * request that fires before the script has loaded throws
 * "Cannot read properties of undefined (reading 'accounts')".
 */
function waitForGoogleIdentityServices(timeoutMs = 10000): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) {
      resolve();
      return;
    }

    const start = Date.now();
    const interval = setInterval(() => {
      if (window.google?.accounts?.oauth2) {
        clearInterval(interval);
        resolve();
      } else if (Date.now() - start >= timeoutMs) {
        clearInterval(interval);
        reject(new Error('Google Identity Services failed to load. Check your connection and try again.'));
      }
    }, 100);
  });
}

/**
 * Request a new access token from Google.
 * User may be prompted for consent if scope not previously granted.
 * Scopes: spreadsheets and userinfo.email
 */
export async function requestAccessToken(scopes?: string[], callback?: (token: string) => void): Promise<string> {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  if (!clientId) {
    const err = 'VITE_GOOGLE_CLIENT_ID environment variable not set';
    logger.error(err);
    throw new Error(err);
  }

  await waitForGoogleIdentityServices();

  return new Promise((resolve, reject) => {
    const scope = scopes ? scopes.join(' ') : 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/userinfo.email';

    if (!tokenClient) {
      tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: scope,
        callback: (response: any) => {
          if (response.error) {
            logger.error('Token request failed:', response.error);
            tokenReject?.(new Error(`OAuth error: ${response.error}`));
          } else {
            logger.info('Token obtained successfully');
            saveToken(response.access_token);
            if (callback) callback(response.access_token);
            tokenResolve?.(response.access_token);
          }
        },
      });
    }

    // Store resolve/reject for this request so callback uses the correct ones
    tokenResolve = resolve;
    tokenReject = reject;

    // Request with consent prompt (user must click to authorize)
    tokenClient.requestAccessToken({ prompt: 'consent' });
  });
}

/**
 * Revoke the current token (logout).
 * Clears cached token and attempts to revoke with Google's revocation endpoint.
 */
export async function revokeToken(): Promise<void> {
  try {
    const cached = getCachedToken();
    if (!cached) {
      logger.info('No token to revoke');
      clearToken();
      return;
    }

    logger.info('Revoking token...');
    const response = await fetch('https://oauth2.googleapis.com/revoke', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `token=${cached.access_token}`,
    });

    if (!response.ok) {
      logger.error('Token revocation returned status', response.status);
    }

    clearToken();
    logger.info('Token revoked successfully');
  } catch (error) {
    logger.error('Failed to revoke token:', error);
    // Still clear cached token even if revocation failed (best-effort)
    clearToken();
    throw error;
  }
}

/**
 * Get authentication status: whether a valid token exists.
 */
export function getAuthStatus(): { authenticated: boolean; cachedToken: boolean } {
  const cached = getCachedToken();
  return {
    authenticated: cached !== null,
    cachedToken: cached !== null,
  };
}

/**
 * Look up which Google account a token actually belongs to.
 * Used to surface account-mismatch diagnostics when a sheet request
 * unexpectedly 404s/403s despite the user believing they're on the right account.
 */
async function getTokenAccountEmail(token: string): Promise<string | null> {
  try {
    const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return null;
    const info = await response.json();
    return info.email || null;
  } catch {
    return null;
  }
}

/**
 * Ensure that the spreadsheet has a 'Tasks' tab (the single tab that holds all synced data).
 * Creates it if missing.
 */
async function ensureSheetTabs(spreadsheetId: string, token: string): Promise<void> {
  spreadsheetId = spreadsheetId.trim();
  try {
    // Fetch spreadsheet metadata to check existing tabs
    const metadataUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`;
    const metadataResponse = await fetch(metadataUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!metadataResponse.ok) {
      const errorText = await metadataResponse.text();
      if (metadataResponse.status === 404 || metadataResponse.status === 403) {
        const accountEmail = await getTokenAccountEmail(token);
        throw new Error(
          `Failed to fetch spreadsheet metadata: ${metadataResponse.status} - ${errorText} (request was made as ${accountEmail || 'an unknown account'})`
        );
      }
      throw new Error(`Failed to fetch spreadsheet metadata: ${metadataResponse.status} - ${errorText}`);
    }

    const metadata = await metadataResponse.json();
    const existingTabs = new Set((metadata.sheets || []).map((s: any) => s.properties.title));

    const requiredTabs = ['Tasks'];
    const missingTabs = requiredTabs.filter((tab) => !existingTabs.has(tab));

    if (missingTabs.length === 0) {
      logger.debug('All required tabs already exist');
      return;
    }

    // Create missing tabs via batchUpdate
    const requests = missingTabs.map((title) => ({
      addSheet: {
        properties: {
          title,
        },
      },
    }));

    const batchUpdateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;
    const batchUpdateResponse = await fetch(batchUpdateUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ requests }),
    });

    if (!batchUpdateResponse.ok) {
      const errorText = await batchUpdateResponse.text();
      throw new Error(`Failed to create sheets: ${batchUpdateResponse.status} - ${errorText}`);
    }

    logger.info(`Created missing tabs: ${missingTabs.join(', ')}`);
  } catch (error) {
    logger.error('Error ensuring sheet tabs:', error);
    throw error;
  }
}

/**
 * Pull (read) tasks and milestones from a Google Sheet using values:batchGet.
 * All data lives in a single 'Tasks' tab; milestones are synced as a plain
 * text 'milestone' column on each task row (same as 'assignee' or 'category'),
 * not as a separate tab keyed by id. Milestone entities are reconstructed from
 * the distinct milestone names seen, reusing ids from existingMilestones where
 * the name matches so stable identity survives round-trips, and minting new
 * ids (via uid) for names that aren't already known.
 * Returns null if the sheet or the 'Tasks' tab doesn't exist (first-ever sync from empty sheet).
 *
 * @param spreadsheetId Google Sheets spreadsheet ID
 * @param token OAuth access token
 * @param existingMilestones Milestones already known in the browser, used to resolve milestone names back to stable ids
 * @returns {tasks: Task[], milestones: Milestone[]} or null if sheet/tab doesn't exist
 */
export async function pullFromSheet(
  spreadsheetId: string,
  token: string,
  existingMilestones: Milestone[] = []
): Promise<{ tasks: Task[]; milestones: Milestone[] } | null> {
  spreadsheetId = spreadsheetId.trim();
  try {
    const batchGetUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?ranges=Tasks!A:Z`;
    const response = await fetch(batchGetUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    // If not found or forbidden, return null (sheet doesn't exist or tab doesn't exist)
    if (response.status === 404 || response.status === 403) {
      logger.info('Sheet or Tasks tab not found, returning null for first-ever sync');
      return null;
    }

    if (!response.ok) {
      const errorText = await response.text();

      // A spreadsheet that exists but doesn't yet have a 'Tasks' tab
      // (e.g. a brand-new sheet with only the default 'Sheet1') fails range parsing
      // with 400 INVALID_ARGUMENT rather than 404 — treat it the same as "no data yet".
      if (response.status === 400 && /Unable to parse range/i.test(errorText)) {
        logger.info('Tab not found (range parse error), returning null for first-ever sync');
        return null;
      }

      throw new Error(`Failed to fetch sheet data: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const valueRanges = data.valueRanges || [];

    if (!valueRanges || valueRanges.length < 1) {
      logger.info('Sheet tab not found, returning null for first-ever sync');
      return null;
    }

    const tasksData = valueRanges[0];

    const tasks: any[] = [];
    const nameToId = new Map<string, string>();
    existingMilestones.forEach((m) => {
      if (m.name && !nameToId.has(m.name)) nameToId.set(m.name, m.id);
    });
    const milestoneOrder: string[] = [];

    const resolveMilestoneId = (milestoneName: string): string | null => {
      const name = milestoneName.trim();
      if (!name) return null;
      if (!nameToId.has(name)) {
        nameToId.set(name, uid('m'));
      }
      if (!milestoneOrder.includes(name)) milestoneOrder.push(name);
      return nameToId.get(name)!;
    };

    // Parse Tasks (single sheet holds all data)
    if (tasksData.values && tasksData.values.length > 1) {
      const headerRow = tasksData.values[0];
      const idIdx = headerRow.indexOf('id');
      const nameIdx = headerRow.indexOf('name');
      const milestoneIdx = headerRow.indexOf('milestone');
      const parentIdIdx = headerRow.indexOf('parentId');
      const categoryIdx = headerRow.indexOf('category');
      const assigneeIdx = headerRow.indexOf('assignee');
      const statusIdx = headerRow.indexOf('status');
      const estimateIdx = headerRow.indexOf('estimate');
      const startDateIdx = headerRow.indexOf('startDate');
      const progressIdx = headerRow.indexOf('progress');
      const dependenciesIdx = headerRow.indexOf('dependencies');
      const commentsIdx = headerRow.indexOf('comments');
      const notesIdx = headerRow.indexOf('notes');

      for (let i = 1; i < tasksData.values.length; i++) {
        const row = tasksData.values[i];

        // Parse dependencies (CSV)
        let dependencies: string[] = [];
        if (row[dependenciesIdx] && row[dependenciesIdx].trim()) {
          dependencies = row[dependenciesIdx].split(',').map((d: string) => d.trim()).filter((d: string) => d);
        }

        // Parse comments (JSON), swallow parse errors → []
        let comments: any[] = [];
        if (row[commentsIdx] && row[commentsIdx].trim()) {
          try {
            comments = JSON.parse(row[commentsIdx]);
          } catch (e) {
            logger.debug('Failed to parse comments, swallowing error:', e);
            comments = [];
          }
        }

        // Coerce estimate and progress to int
        const estimate = parseInt(row[estimateIdx] || '0', 10) || 0;
        const progress = parseInt(row[progressIdx] || '0', 10) || 0;

        if (idIdx >= 0 && nameIdx >= 0) {
          tasks.push({
            id: row[idIdx] || '',
            name: row[nameIdx] || '',
            milestoneId: resolveMilestoneId(row[milestoneIdx] || ''),
            parentId: row[parentIdIdx] ? row[parentIdIdx] : null,
            category: row[categoryIdx] || '',
            assignee: row[assigneeIdx] || '',
            status: row[statusIdx] || '',
            estimate,
            startDate: row[startDateIdx] || '',
            progress,
            dependencies,
            comments,
            notes: row[notesIdx] || undefined,
          });
        }
      }
    }

    const milestones: Milestone[] = milestoneOrder.map((name) => ({ id: nameToId.get(name)!, name }));

    return { tasks, milestones };
  } catch (error) {
    logger.error('Error pulling from sheet:', error);
    throw error;
  }
}

/**
 * Push (write) tasks and milestones to a Google Sheet using values:batchUpdate.
 * Everything lives in a single 'Tasks' tab: each task row carries its milestone
 * as a plain text name in a 'milestone' column (looked up via task.milestoneId),
 * the same way 'assignee' or 'category' are plain values — there is no separate
 * milestoneId/Milestones tab to keep in sync.
 *
 * @param spreadsheetId Google Sheets spreadsheet ID
 * @param token OAuth access token
 * @param tasks Array of tasks to write
 * @param milestones Array of milestones, used to resolve each task's milestoneId to a name
 * @returns result object with success and message
 */
export async function pushToSheet(
  spreadsheetId: string,
  token: string,
  tasks: Task[],
  milestones: Milestone[]
): Promise<{ success: boolean; message: string }> {
  spreadsheetId = spreadsheetId.trim();
  try {
    // Ensure the tab exists first
    await ensureSheetTabs(spreadsheetId, token);

    const milestoneIdToName = new Map(milestones.map((m) => [m.id, m.name]));

    // Build Tasks data with fixed column order (same as pullFromSheet expects)
    const taskHeaders = [
      'id',
      'name',
      'milestone',
      'parentId',
      'category',
      'assignee',
      'status',
      'estimate',
      'startDate',
      'progress',
      'dependencies',
      'comments',
      'notes',
    ];

    const taskRows: any[][] = [taskHeaders];
    tasks.forEach((task) => {
      taskRows.push([
        task.id || '',
        task.name || '',
        (task.milestoneId && milestoneIdToName.get(task.milestoneId)) || '',
        task.parentId || '',
        task.category || '',
        task.assignee || '',
        task.status || '',
        task.estimate || 0,
        task.startDate || '',
        task.progress || 0,
        task.dependencies ? task.dependencies.join(',') : '',
        task.comments ? JSON.stringify(task.comments) : '',
        task.notes || '',
      ]);
    });

    // Upload data to the single tab via batchUpdate
    const batchUpdateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`;
    const batchUpdateResponse = await fetch(batchUpdateUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        valueInputOption: 'RAW',
        data: [
          {
            range: 'Tasks!A1',
            values: taskRows,
          },
        ],
      }),
    });

    if (!batchUpdateResponse.ok) {
      const errorText = await batchUpdateResponse.text();
      throw new Error(`Failed to push to sheet: ${batchUpdateResponse.status} - ${errorText}`);
    }

    logger.info(`Pushed ${tasks.length} tasks and ${milestones.length} milestones to sheet`);
    return {
      success: true,
      message: `Pushed ${tasks.length} tasks and ${milestones.length} milestones successfully`,
    };
  } catch (error) {
    logger.error('Error pushing to sheet:', error);
    return {
      success: false,
      message: `Push failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}
