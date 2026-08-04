import type { Task, Milestone } from './types'
import { buildTasksCsvString, getCSVFilename } from './csv'

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
const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000;  // Refresh 5 min before expiry

// Get per-project storage key
function getTokenStorageKey(projectId: string): string {
  return `projects_app_oauth_token_${projectId}`;
}

const logger = {
  info: (msg: string, ...args: any[]) => console.log(`[Google Auth] ${msg}`, ...args),
  error: (msg: string, ...args: any[]) => console.error(`[Google Auth] ${msg}`, ...args),
  debug: (msg: string, ...args: any[]) => console.debug(`[Google Auth] ${msg}`, ...args),
};

/**
 * Load cached token from localStorage if valid.
 * Returns null if token is missing, expired, or invalid.
 */
function getCachedToken(projectId: string): TokenData | null {
  try {
    const storageKey = getTokenStorageKey(projectId);
    const stored = localStorage.getItem(storageKey);
    if (!stored) return null;

    const data: TokenData = JSON.parse(stored);
    const now = Date.now();

    // Check expiry with buffer (refresh 5 min before actual expiry)
    if (data.expires_at && now >= data.expires_at - TOKEN_EXPIRY_BUFFER_MS) {
      logger.debug('Cached token expired (or expiring soon), will refresh');
      clearToken(projectId);
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
function saveToken(projectId: string, accessToken: string): void {
  const data: TokenData = {
    access_token: accessToken,
    expires_at: Date.now() + 3600 * 1000,  // 1 hour (standard Google access token TTL)
    requested_at: Date.now(),
  };
  const storageKey = getTokenStorageKey(projectId);
  localStorage.setItem(storageKey, JSON.stringify(data));
  logger.info(`Token saved to storage for project ${projectId}`);
}

/**
 * Clear cached token (on logout/revocation).
 */
function clearToken(projectId: string): void {
  const storageKey = getTokenStorageKey(projectId);
  localStorage.removeItem(storageKey);
  logger.info(`Token cleared from storage for project ${projectId}`);
}

/**
 * True if a Sheets API error body indicates the cached token was granted
 * without the scopes we need (e.g. a token cached before 'spreadsheets' was
 * added to the requested scope, or one granted via a narrower consent).
 * Cached tokens don't record their granted scope, so this is how we detect
 * a stale token instead of reusing it for the remainder of its 1hr lifetime.
 */
function isScopeInsufficientError(errorText: string): boolean {
  return /ACCESS_TOKEN_SCOPE_INSUFFICIENT/.test(errorText);
}

/**
 * Get or request a valid access token for a specific project.
 * Attempts to use cached token if valid; requests new token if expired or missing.
 */
export async function getAccessToken(projectId: string): Promise<string> {
  // Try cached token first
  const cached = getCachedToken(projectId);
  if (cached) {
    return cached.access_token;
  }

  // No valid cached token — request a new one. Coalesce concurrent callers
  // (e.g. multiple filter rules syncing at once) onto a single OAuth request
  // instead of each triggering its own token flow.
  if (inFlightTokenPromise) {
    return inFlightTokenPromise;
  }

  inFlightTokenPromise = requestAccessToken(projectId).finally(() => {
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
 * Scopes: drive.file and userinfo.email
 * @param projectId Project to save the token for
 * @param scopes Optional OAuth scopes
 * @param callback Optional callback when token is obtained
 */
export async function requestAccessToken(projectId: string, scopes?: string[], callback?: (token: string) => void): Promise<string> {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  if (!clientId) {
    const err = 'VITE_GOOGLE_CLIENT_ID environment variable not set';
    logger.error(err);
    throw new Error(err);
  }

  await waitForGoogleIdentityServices();

  return new Promise((resolve, reject) => {
    const scope = scopes ? scopes.join(' ') : 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email';

    if (!tokenClient) {
      tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: scope,
        callback: (response: any) => {
          if (response.error) {
            logger.error('Token request failed:', response.error);
            tokenReject?.(new Error(`OAuth error: ${response.error}`));
          } else {
            logger.info('Token obtained successfully for project', projectId);
            saveToken(projectId, response.access_token);
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
 * Revoke the token for a specific project.
 * Clears cached token and attempts to revoke with Google's revocation endpoint.
 */
export async function revokeToken(projectId: string): Promise<void> {
  try {
    const cached = getCachedToken(projectId);
    if (!cached) {
      logger.info('No token to revoke for project', projectId);
      clearToken(projectId);
      return;
    }

    logger.info('Revoking token for project', projectId);
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

    clearToken(projectId);
    logger.info('Token revoked successfully for project', projectId);
  } catch (error) {
    logger.error('Failed to revoke token:', error);
    // Still clear cached token even if revocation failed (best-effort)
    clearToken(projectId);
    throw error;
  }
}

/**
 * Get authentication status for a specific project: whether a valid token exists.
 */
export function getAuthStatus(projectId: string): { authenticated: boolean; cachedToken: boolean } {
  const cached = getCachedToken(projectId);
  return {
    authenticated: cached !== null,
    cachedToken: cached !== null,
  };
}


/**
 * Find or create a folder in Google Drive.
 * Queries for a folder with the given name under the specified parent.
 * If not found, creates a new folder and returns its ID.
 * When parentId is undefined, searches under 'root'.
 *
 * @param name Folder name to find or create
 * @param parentId Parent folder ID, or undefined for root
 * @param token OAuth access token
 * @param projectId Project ID (for clearing token on auth failures)
 * @returns The folder ID
 */
export async function findOrCreateFolder(
  name: string,
  parentId: string | undefined,
  token: string,
  projectId: string
): Promise<string> {
  try {
    const parentQuery = parentId ? `'${parentId}' in parents` : `'root' in parents`;
    const query = `${parentQuery} and name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    const encodedQuery = encodeURIComponent(query);

    const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodedQuery}&fields=files(id,name)`;
    const searchResponse = await fetch(searchUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!searchResponse.ok) {
      const errorText = await searchResponse.text();
      if (searchResponse.status === 403 && isScopeInsufficientError(errorText)) {
        clearToken(projectId);
      }
      throw new Error(`Failed to search for folder: ${searchResponse.status} - ${errorText}`);
    }

    const searchData = await searchResponse.json();
    const files = searchData.files || [];

    if (files.length > 0) {
      logger.info(`Found existing folder "${name}": ${files[0].id}`);
      return files[0].id;
    }

    // Folder not found, create it
    const createUrl = 'https://www.googleapis.com/drive/v3/files';
    const createBody = {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId || 'root'],
    };

    const createResponse = await fetch(createUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(createBody),
    });

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      if (createResponse.status === 403 && isScopeInsufficientError(errorText)) {
        clearToken(projectId);
      }
      throw new Error(`Failed to create folder: ${createResponse.status} - ${errorText}`);
    }

    const createData = await createResponse.json();
    logger.info(`Created new folder "${name}": ${createData.id}`);
    return createData.id;
  } catch (error) {
    logger.error('Error in findOrCreateFolder:', error);
    throw error;
  }
}

/**
 * Ensure the app's folder structure exists in Google Drive.
 * Creates or finds the 'OpenWebApp' folder at root, then creates or finds
 * the 'Planning' subfolder within it.
 * Returns the ID of the innermost ('Planning') folder.
 *
 * @param token OAuth access token
 * @param projectId Project ID (for clearing token on auth failures)
 * @returns The Planning folder ID
 */
export async function ensureAppFolder(token: string, projectId: string): Promise<string> {
  try {
    const openWebAppId = await findOrCreateFolder('OpenWebApp', undefined, token, projectId);
    const planningId = await findOrCreateFolder('Planning', openWebAppId, token, projectId);
    logger.info('App folder structure ensured');
    return planningId;
  } catch (error) {
    logger.error('Error in ensureAppFolder:', error);
    throw error;
  }
}

/**
 * Create a CSV file in Google Drive.
 * Uses multipart/related upload with metadata and content.
 *
 * @param filename Name for the CSV file
 * @param csvContent CSV content as string
 * @param folderId Parent folder ID where the file will be created
 * @param token OAuth access token
 * @param projectId Project ID (for clearing token on auth failures)
 * @returns The new file's ID
 */
export async function createDriveCsvFile(
  filename: string,
  csvContent: string,
  folderId: string,
  token: string,
  projectId: string
): Promise<string> {
  try {
    const metadata = {
      name: filename,
      parents: [folderId],
      mimeType: 'text/csv',
    };

    // Build multipart/related body with metadata and CSV content
    const boundary = '===============7330845974216740156==';
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const multipartBody =
      delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      'Content-Type: text/csv; charset=UTF-8\r\n\r\n' +
      csvContent +
      closeDelimiter;

    const uploadUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
    const uploadResponse = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: multipartBody,
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      if (uploadResponse.status === 403 && isScopeInsufficientError(errorText)) {
        clearToken(projectId);
      }
      throw new Error(`Failed to create CSV file: ${uploadResponse.status} - ${errorText}`);
    }

    const uploadData = await uploadResponse.json();
    logger.info(`Created CSV file "${filename}": ${uploadData.id}`);
    return uploadData.id;
  } catch (error) {
    logger.error('Error in createDriveCsvFile:', error);
    throw error;
  }
}

/**
 * Update an existing CSV file in Google Drive.
 * Uses media upload to replace the file content.
 *
 * @param fileId ID of the file to update
 * @param csvContent New CSV content as string
 * @param token OAuth access token
 * @param projectId Project ID (for clearing token on auth failures)
 */
export async function updateDriveCsvFile(
  fileId: string,
  csvContent: string,
  token: string,
  projectId: string
): Promise<void> {
  try {
    const uploadUrl = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`;
    const uploadResponse = await fetch(uploadUrl, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'text/csv',
      },
      body: csvContent,
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      if (uploadResponse.status === 403 && isScopeInsufficientError(errorText)) {
        clearToken(projectId);
      }
      throw new Error(`Failed to update CSV file: ${uploadResponse.status} - ${errorText}`);
    }

    logger.info(`Updated CSV file: ${fileId}`);
  } catch (error) {
    logger.error('Error in updateDriveCsvFile:', error);
    throw error;
  }
}

/**
 * Retrieve CSV content from a Google Drive file.
 * Returns null if the file is not found (404).
 *
 * @param fileId ID of the file to retrieve
 * @param token OAuth access token
 * @param projectId Project ID (for clearing token on auth failures)
 * @returns CSV content as string, or null if not found
 */
export async function getDriveCsvContent(fileId: string, token: string, projectId: string): Promise<string | null> {
  try {
    const downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
    const downloadResponse = await fetch(downloadUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (downloadResponse.status === 404) {
      logger.info(`CSV file not found: ${fileId}`);
      return null;
    }

    if (!downloadResponse.ok) {
      const errorText = await downloadResponse.text();
      if (downloadResponse.status === 403 && isScopeInsufficientError(errorText)) {
        clearToken(projectId);
      }
      throw new Error(`Failed to retrieve CSV file: ${downloadResponse.status} - ${errorText}`);
    }

    const content = await downloadResponse.text();
    logger.debug(`Retrieved CSV file: ${fileId}`);
    return content;
  } catch (error) {
    logger.error('Error in getDriveCsvContent:', error);
    throw error;
  }
}

/**
 * Connect to Google Drive by creating the app folder structure and seeding
 * a CSV file with the current state of tasks and milestones.
 * Called once when the user clicks "Connect to Google Drive" in Settings.
 *
 * @param token OAuth access token
 * @param currentTasks Array of tasks to seed the CSV file with
 * @param currentMilestones Array of milestones to seed the CSV file with
 * @param projectNameForFilename Project name to use for the CSV filename
 * @param projectId Project ID
 * @returns The new file's driveFileId
 */
export async function connectDriveSync(
  token: string,
  currentTasks: Task[],
  currentMilestones: Milestone[],
  projectNameForFilename: string,
  projectId: string
): Promise<string> {
  try {
    // 1. Ensure app folder structure (OpenWebApp/Planning) exists
    const folderId = await ensureAppFolder(token, projectId);

    // 2. Get CSV filename from project name
    const filename = getCSVFilename(projectNameForFilename);

    // 3. Build CSV content from current tasks and milestones
    const csvContent = buildTasksCsvString(currentTasks, currentMilestones);

    // 4. Create the CSV file in Google Drive
    const driveFileId = await createDriveCsvFile(filename, csvContent, folderId, token, projectId);

    // 5. Return the file ID to be stored in Project.driveFileId
    logger.info(`Connected to Google Drive and created CSV file: ${driveFileId}`);
    return driveFileId;
  } catch (error) {
    logger.error('Error in connectDriveSync:', error);
    throw error;
  }
}
