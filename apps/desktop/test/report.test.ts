import { describe, expect, it } from 'vitest';
import { bugReportUrl, describeMac } from '../src/main/report';

describe('bug report link', () => {
  it('opens the bug report form with the versions filled in', () => {
    const url = new URL(bugReportUrl('0.5.0', 'macOS 15.1 (Apple Silicon)'));
    expect(url.origin + url.pathname).toBe('https://github.com/blnkhz/plotka/issues/new');
    expect(url.searchParams.get('template')).toBe('bug_report.yml');
    expect(url.searchParams.get('app')).toBe('0.5.0');
    expect(url.searchParams.get('os')).toBe('macOS 15.1 (Apple Silicon)');
  });

  it('names the Mac the way the form asks for it', () => {
    expect(describeMac('15.1', 'arm64')).toBe('macOS 15.1 (Apple Silicon)');
    expect(describeMac('14.6.1', 'x64')).toBe('macOS 14.6.1 (Intel)');
  });
});
