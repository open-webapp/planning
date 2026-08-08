import { createDriveSync } from '@open-webapp/drive-sync'
import type { Task, Milestone } from './types'
import { buildTasksCsvString, getCSVFilename } from './csv'

/**
 * Single app-wide drive-sync facade. `folderPath` here is load-bearing and
 * silent-failure-prone: a wrong value does not error, it just creates a
 * fresh EMPTY Drive folder, and every existing user's backup appears to
 * have vanished. See drive.test.ts for a test that pins this exact array.
 */
export const drive = createDriveSync({
  appId: 'planning',
  clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID,
  folderPath: ['OpenWebApp', 'Planning'],
})

/**
 * Connect to Google Drive by creating the app folder structure and seeding
 * a CSV file with the current state of tasks and milestones.
 * Called once when the user clicks "Connect to Google Drive" in Settings.
 * Moved from googleAuth.ts's connectDriveSync, now built on top of the
 * drive-sync library's ensureFolderPath()/files.write() rather than raw
 * fetch calls with a manually-threaded token.
 *
 * @param currentTasks Array of tasks to seed the CSV file with
 * @param currentMilestones Array of milestones to seed the CSV file with
 * @param projectNameForFilename Project name to use for the CSV filename
 * @param projectId Project ID
 * @returns The new file's driveFileId
 */
export async function connectDriveSync(
  currentTasks: Task[],
  currentMilestones: Milestone[],
  projectNameForFilename: string,
  projectId: string
): Promise<string> {
  const project = drive.project(projectId)

  // 1. Ensure app folder structure (OpenWebApp/Planning) exists
  const folderId = await project.ensureFolderPath()

  // 2. Get CSV filename from project name
  const filename = getCSVFilename(projectNameForFilename)

  // 3. Build CSV content from current tasks and milestones
  const csvContent = buildTasksCsvString(currentTasks, currentMilestones)

  // 4. Create the CSV file in Google Drive
  const file = await project.files.write({
    folderId,
    name: filename,
    content: csvContent,
    mimeType: 'text/csv',
  })

  // 5. Return the file ID to be stored in Project.driveFileId
  return file.id
}
