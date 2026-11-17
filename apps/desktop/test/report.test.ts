import { describe, expect, it } from 'vitest';
import { bugReportUrl, describeSystem } from '../src/main/report';

describe('bug report link', () => {
  it('opens the bug report form with the versions filled in', () => {
    const url = new URL(bugReportUrl('0.5.0', 'macOS 15.1 (Apple Silicon)'));
    expect(url.origin + url.pathname).toBe('https://github.com/blnkhz/plotka/issues/new');
    expect(url.searchParams.get('template')).toBe('bug_report.yml');
    expect(url.searchParams.get('app')).toBe('0.5.0');
    expect(url.searchParams.get('os')).toBe('macOS 15.1 (Apple Silicon)');
  });

  it('names the Mac the way the form asks for it', () => {
    expect(describeSystem('darwin', '15.1', 'arm64')).toBe('macOS 15.1 (Apple Silicon)');
    expect(describeSystem('darwin', '14.6.1', 'x64')).toBe('macOS 14.6.1 (Intel)');
  });

  it('tells Windows 11 from Windows 10, which both report 10.0', () => {
    expect(describeSystem('win32', '10.0.26100', 'x64')).toBe('Windows 11 (build 26100)');
    expect(describeSystem('win32', '10.0.22631', 'arm64')).toBe('Windows 11 (build 22631, Arm)');
    expect(describeSystem('win32', '10.0.19045', 'x64')).toBe('Windows 10 (build 19045)');
  });

  it('describes Linux plainly', () => {
    expect(describeSystem('linux', '6.8.0', 'x64')).toBe('Linux 6.8.0 (x64)');
  });
});
