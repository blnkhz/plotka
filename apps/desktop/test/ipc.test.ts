import { describe, expect, it } from 'vitest';
import { EVENT_CHANNELS, INVOKE_CHANNELS } from '@shared/ipc';

describe('IPC channel list', () => {
  it('has unique channel names', () => {
    const all = [...INVOKE_CHANNELS, ...EVENT_CHANNELS];
    expect(new Set(all).size).toBe(all.length);
  });
});
