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

/**
 * The OS the way the form's placeholder shows it: "macOS 15.1 (Apple Silicon)",
 * "Windows 11 (build 26100)". `version` is process.getSystemVersion().
 */
export function describeSystem(platform: string, version: string, arch: string): string {
  if (platform === 'darwin')
    return `macOS ${version} (${arch === 'arm64' ? 'Apple Silicon' : 'Intel'})`;
  if (platform === 'win32') {
    // Windows 11 still reports 10.0; its builds start at 22000.
    const build = Number(version.split('.')[2]);
    const name = build >= 22000 ? 'Windows 11' : 'Windows 10';
    return `${name} (build ${Number.isFinite(build) ? build : version}${arch === 'arm64' ? ', Arm' : ''})`;
  }
  return `${platform === 'linux' ? 'Linux' : platform} ${version} (${arch})`;
}
