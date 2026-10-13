import { execFile } from 'node:child_process';

// Text is passed as argv (not interpolated into the script), so peer-controlled
// content can't inject AppleScript.
const MAC_SCRIPT = 'on run argv\ndisplay notification (item 2 of argv) with title (item 1 of argv)\nend run';

/** Shows a desktop banner (macOS only for now). Fire-and-forget; failures are ignored. */
export function notify(title: string, body: string): void {
  if (process.platform !== 'darwin') return;
  try {
    execFile('osascript', ['-e', MAC_SCRIPT, title, body], () => {}).on('error', () => {});
  } catch {
    // no notifications available
  }
}
