/** The GitHub bug report form (.github/ISSUE_TEMPLATE/bug_report.yml). */
const NEW_ISSUE = 'https://github.com/blnkhz/plotka/issues/new';

/**
 * Help › Report a Problem opens the bug report form with the app and OS versions filled in.
 * The query keys are the form's field ids.
 */
export function bugReportUrl(appVersion: string, os: string): string {
  const q = new URLSearchParams({ template: 'bug_report.yml', app: appVersion, os });
  return `${NEW_ISSUE}?${q}`;
}

/** "macOS 15.1 (Apple Silicon)", as the form's placeholder shows it. */
export function describeMac(version: string, arch: string): string {
  return `macOS ${version} (${arch === 'arm64' ? 'Apple Silicon' : 'Intel'})`;
}
