import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PROFILE_ID,
  DriverError,
  EbbDriver,
  getProfile,
  Machine,
  parseFirmware,
  queuedMs,
  type Transport,
} from '../src';

const profile = getProfile(DEFAULT_PROFILE_ID)!;
type Timers = { setTimeout(f: () => void, ms: number): unknown };
const later = (f: () => void, ms: number) => (globalThis as unknown as Timers).setTimeout(f, ms);

/**
 * A fake EBB (firmware 2.8.1 behavior): one-slot motion queue, and the reply to a queued command
 * only comes once the command ahead of it has started. Time runs `scale` × faster than real.
 */
class FakeBoard implements Transport {
  sent: string[] = [];
  a = 0;
  b = 0;
  button = false;
  version = 'EBBv13_and_above EB Firmware Version 2.8.1';
  /** End times (ms, Date.now) of queued motion. */
  private queue: number[] = [];
  private data?: (s: string) => void;
  private closed?: (e?: Error) => void;
  constructor(private readonly scale = 0.02) {}
  onData(l: (s: string) => void) {
    this.data = l;
  }
  onClose(l: (e?: Error) => void) {
    this.closed = l;
  }
  async close() {}
  unplug() {
    this.closed?.(new Error('unplugged'));
  }
  private reply(s: string, delay = 0) {
    if (delay > 0) later(() => this.data?.(s), delay);
    else void Promise.resolve().then(() => this.data?.(s));
  }
  private busy() {
    const now = Date.now();
    this.queue = this.queue.filter((t) => t > now);
    return this.queue.length > 0;
  }
  async write(raw: string) {
    const cmd = raw.trim();
    this.sent.push(cmd);
    const p = cmd.split(',');
    const c = p[0]!.toUpperCase();
    const now = Date.now();
    const enqueue = (ms: number) => {
      this.busy();
      const start = Math.max(now, this.queue[this.queue.length - 1] ?? now);
      this.queue.push(start + ms * this.scale);
      // Reply when there's room: once the command ahead (if any) has started.
      const ahead = this.queue.length >= 2 ? (this.queue[this.queue.length - 3] ?? now) : now;
      return Math.max(0, ahead - now);
    };
    switch (c) {
      case 'V':
        return this.reply(`${this.version}\r\n`);
      case 'QG': {
        const busy = this.busy();
        const g = 0xc0 | (this.button ? 0x20 : 0) | 0x10 | (busy ? 0x0f : 0);
        this.button = false;
        return this.reply(`${g.toString(16).toUpperCase()}\r\n`);
      }
      case 'QS':
        return this.reply(`${this.a},${this.b}\n\rOK\r\n`);
      case 'EM':
        this.a = 0;
        this.b = 0;
        return this.reply('OK\r\n');
      case 'SC':
        return this.reply('OK\r\n');
      case 'SP':
        return this.reply('OK\r\n', enqueue(Number(p[2]) || 0));
      case 'XM': {
        const [ms, x, y] = [Number(p[1]), Number(p[2]), Number(p[3])];
        this.a += x + y;
        this.b += x - y;
        return this.reply('OK\r\n', enqueue(ms));
      }
      case 'ES':
        this.queue = [];
        return this.reply('interrupted\n\rOK\r\n');
      default:
        return this.reply(`!8 Err: Unknown command '${c}'\r\n`);
    }
  }
}

const open = (board: FakeBoard) => async () => board;

describe('EbbDriver', () => {
  it('parses firmware versions and queued durations', () => {
    expect(parseFirmware('EBBv13_and_above EB Firmware Version 2.8.1')).toEqual([2, 8, 1]);
    expect(queuedMs('XM,250,10,0')).toBe(250);
    expect(queuedMs('SP,1,130')).toBe(130);
    expect(queuedMs('SC,4,100')).toBe(0);
  });

  it('connects, reads the firmware and refuses firmware that is too old', async () => {
    const board = new FakeBoard();
    const d = new EbbDriver(profile, open(board));
    expect((await d.connect('/dev/cu.fake')).firmwareVersion).toBe('2.8.1');
    expect(d.connected).toBe(true);
    const old = new FakeBoard();
    old.version = 'EBBv13_and_above EB Firmware Version 2.5.3';
    await expect(new EbbDriver(profile, open(old)).connect('x')).rejects.toThrow(/too old/);
  });

  it('sends moves in order and tracks steps; the board agrees', async () => {
    const board = new FakeBoard();
    const d = new EbbDriver(profile, open(board));
    await d.connect('x');
    await d.enableMotors('16x');
    await d.move([
      { ms: 100, x: 800, y: 0 },
      { ms: 100, x: 0, y: 800 },
      { ms: 100, x: -800, y: -800 },
    ]);
    await d.waitIdle();
    expect(board.sent.filter((c) => c.startsWith('XM'))).toEqual([
      'XM,100,800,0',
      'XM,100,0,800',
      'XM,100,-800,-800',
    ]);
    expect(await d.queryPosition()).toEqual({ a: 0, b: 0 });
  });

  it('waits for replies delayed by the full queue instead of timing out', async () => {
    // Base timeout 40 ms; each 4000 ms move takes 80 ms on the fast fake, so replies to queued
    // moves arrive well after 40 ms. The driver must allow for the queued time.
    const board = new FakeBoard(0.02);
    const d = new EbbDriver(profile, open(board), { replyTimeoutMs: 40 });
    await d.connect('x');
    await d.enableMotors('16x');
    await d.move([
      { ms: 4000, x: 8000, y: 0 },
      { ms: 4000, x: -8000, y: 0 },
      { ms: 4000, x: 8000, y: 0 },
    ]);
    await d.waitIdle();
    expect(await d.queryPosition()).toEqual({ a: 8000, b: 8000 });
  });

  it('remembers a button press seen while waiting', async () => {
    const board = new FakeBoard();
    const d = new EbbDriver(profile, open(board));
    await d.connect('x');
    board.button = true;
    await d.waitIdle(); // its QG sees (and clears) the board's latch
    expect(await d.queryButton()).toBe(true);
    expect(await d.queryButton()).toBe(false);
  });

  it('turns ! replies into errors and keeps working', async () => {
    const board = new FakeBoard();
    const d = new EbbDriver(profile, open(board));
    await d.connect('x');
    board.version = 'x';
    await expect(
      (d as unknown as { exec(c: string, e: string): Promise<string> }).exec('ZZ', 'ok'),
    ).rejects.toThrow(/rejected/);
    await expect(d.penUp(100)).resolves.toBeUndefined();
  });

  it('refuses invalid moves before sending them', async () => {
    const board = new FakeBoard();
    const d = new EbbDriver(profile, open(board));
    await d.connect('x');
    await expect(d.move([{ ms: 1, x: 100, y: 0 }])).rejects.toBeInstanceOf(DriverError);
    expect(board.sent.some((c) => c.startsWith('XM'))).toBe(false);
  });

  it('reports an unplugged board and fails the waiting command', async () => {
    const board = new FakeBoard();
    let lost = false;
    const d = new EbbDriver(profile, open(board), { onDisconnect: () => (lost = true) });
    await d.connect('x');
    await d.enableMotors('16x');
    const pending = d.move([
      { ms: 4000, x: 8000, y: 0 },
      { ms: 4000, x: 8000, y: 0 },
      { ms: 4000, x: 8000, y: 0 },
    ]);
    later(() => board.unplug(), 30);
    await expect(pending).rejects.toMatchObject({ code: 'disconnected' });
    expect(lost).toBe(true);
    expect(d.connected).toBe(false);
  });

  it('drives a Machine: jog and home land back on the board counters at 0', async () => {
    const board = new FakeBoard();
    const d = new EbbDriver(profile, open(board));
    await d.connect('x');
    const m = new Machine(d, profile);
    await m.jog(12.5, 7.25);
    expect(m.state.position).toEqual({ x: 12.5, y: 7.25 });
    await m.home();
    expect(await d.queryPosition()).toEqual({ a: 0, b: 0 });
  });
});
