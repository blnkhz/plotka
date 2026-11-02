/**
 * DRIVER-0 spike. Talks to an EiBotBoard (AxiDraw / NextDraw) over USB serial, one step at a
 * time, asking before every motion, and writes a report of everything sent and received.
 *
 * Run:   pnpm spike                     (auto-detect the plotter)
 *        pnpm spike -- --port /dev/cu.usbmodem1101
 *        pnpm spike -- --simulate       (no hardware; fake board that answers OK)
 *
 * Protocol facts used here are documented in docs/hardware-notes.md.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import os from 'node:os';
import { SerialPort } from 'serialport';

// ---------- Values under test (see docs/hardware-notes.md for sources) ----------
const EBB_VID = '04d8';
const EBB_PID = 'fd92';
/** AxiDraw standard servo range, 83.3 ns units (axidraw_conf.py: servo_min / servo_max). */
const SERVO_MIN = 9855;
const SERVO_MAX = 27831;
const PEN_UP_PCT = 60;
const PEN_DOWN_PCT = 30;
/** Expected steps per mm at 16x microstepping (2032 steps/inch). Verified by this spike. */
const STEPS_PER_MM = 80;
const TEST_MOVE_MM = 10;
const MOVE_MS = 1000;
const PEN_DELAY_MS = 200;
const REPLY_TIMEOUT_MS = 2000;

const args = process.argv.slice(2);
const argValue = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const simulate = args.includes('--simulate');

const servoValue = (pct: number) => Math.round(SERVO_MIN + ((SERVO_MAX - SERVO_MIN) * pct) / 100);
// Servo rate: full range in 200 ms at 100% (axidraw_conf.py servo_sweep_time), applied per 24 ms
// servo cycle (EBB S2 docs). 75% for raising, 50% for lowering (axidraw defaults).
const servoRate = (pct: number) => Math.round((((SERVO_MAX - SERVO_MIN) * 24) / 200) * (pct / 100));

// ---------- Report ----------
type LogEntry = { t: number; kind: 'tx' | 'rx' | 'note' | 'answer' | 'error'; text: string };
const log: LogEntry[] = [];
const t0 = Date.now();
const record = (kind: LogEntry['kind'], text: string) => {
  log.push({ t: Date.now() - t0, kind, text });
  const prefix = { tx: '  → ', rx: '  ← ', note: '', answer: '  you: ', error: '  ERROR: ' }[kind];
  console.log(prefix + text);
};
const show = (s: string) => s.replace(/\r/g, '\\r').replace(/\n/g, '\\n');

// ---------- Serial line I/O ----------
interface Link {
  write(data: string): void;
  close(): Promise<void>;
  onData(cb: (chunk: string) => void): void;
}

function fakeLink(): Link {
  let cb: (s: string) => void = () => {};
  let a = 0;
  let b = 0;
  // Scheduled queued commands, to mimic the one-slot FIFO of firmware 2.x.
  let sched: { start: number; end: number }[] = [];
  let outbox = Promise.resolve();
  const enqueue = (ms: number): number => {
    const now = Date.now();
    sched = sched.filter((x) => x.end > now);
    const waiting = sched.filter((x) => x.start > now);
    const start = Math.max(now, sched.length ? sched[sched.length - 1]!.end : now);
    sched.push({ start, end: start + ms });
    // FIFO full: the reply comes when the waiting command starts executing.
    return waiting.length ? waiting[waiting.length - 1]!.start - now : 0;
  };
  return {
    onData: (f) => (cb = f),
    write(data) {
      const cmd = data.trim().toUpperCase();
      const [name, ...p] = cmd.split(',');
      const ms = queuedMs(cmd);
      const delay = ms > 0 ? enqueue(ms) : 0;
      // Replies go out in order, like the real serial stream.
      const reply = (s: string) => {
        outbox = outbox.then(
          () => new Promise<void>((r) => setTimeout(() => (cb(s), r()), delay + 2)),
        );
      };
      if (name === 'V') reply('EBBv13_and_above EB Firmware Version 3.0.2 (SIMULATED)\r\n');
      else if (name === 'QG') {
        const busy = sched.some((x) => x.end > Date.now());
        reply(busy ? '1F\r\n' : '10\r\n');
      } else if (name === 'QS') reply(`${a},${b}\n\rOK\r\n`);
      else if (name === 'QC') reply('0394,0300\r\nOK\r\n');
      else if (name === 'QB') reply('0\r\nOK\r\n');
      else if (name === 'XM') {
        const A = Number(p[1]);
        const B = Number(p[2]);
        a += A + B;
        b += A - B;
        reply('OK\r\n');
      } else if (name === 'EM') {
        a = b = 0;
        reply('OK\r\n');
      } else reply('OK\r\n');
    },
    close: async () => {},
  };
}

async function serialLink(path: string): Promise<Link> {
  const port = new SerialPort({ path, baudRate: 9600, autoOpen: false });
  await new Promise<void>((resolve, reject) =>
    port.open((err) => {
      if (!err) return resolve();
      const msg = String(err.message);
      if (/busy|lock|denied/i.test(msg))
        reject(
          new Error(
            `${path} is busy. Close the AxiDraw software, Inkscape and any other plotter app, then try again. (${msg})`,
          ),
        );
      else reject(err);
    }),
  );
  await new Promise<void>((r) => port.flush(() => r()));
  return {
    onData: (cb) => port.on('data', (buf: Buffer) => cb(buf.toString('latin1'))),
    write: (d) => void port.write(d),
    close: () => new Promise<void>((r) => (port.isOpen ? port.close(() => r()) : r())),
  };
}

/**
 * How long a queued command occupies the motion FIFO, in ms (XM/SM duration, SP delay).
 * The EBB's FIFO is shallow (one slot on firmware 2.x): when it's full, the board doesn't answer
 * a new queued command until the move ahead of it has started, so the reply can take as long
 * as the queued motion. Timeouts have to account for that.
 */
function queuedMs(cmd: string): number {
  const [name, ...p] = cmd.toUpperCase().split(',');
  if (name === 'XM' || name === 'SM') return Number(p[0]) || 0;
  if (name === 'SP' && (p[0] === '0' || p[0] === '1')) return Number(p[1]) || 0;
  if (name === 'TP') return Number(p[0]) || 0;
  return 0;
}

class Ebb {
  private buffer = '';
  private waiters: ((line: string) => void)[] = [];
  private lines: string[] = [];
  private link: Link;
  /** Estimated time (Date.now) when everything queued so far has finished. */
  private busyUntil = 0;
  /** Replies still owed for commands that timed out; they're discarded when they arrive. */
  private stale = 0;

  constructor(link: Link) {
    this.link = link;
    link.onData((chunk) => {
      this.buffer += chunk;
      // Lines end with \r\n, \n\r or a lone \r / \n. Split on any run of CR/LF.
      const parts = this.buffer.split(/[\r\n]+/);
      this.buffer = parts.pop() ?? '';
      for (const line of parts) {
        if (line === '') continue;
        if (this.stale > 0) {
          this.stale--;
          record('rx', `${line}   (late reply to a timed-out command, ignored)`);
          continue;
        }
        record('rx', line);
        const w = this.waiters.shift();
        if (w) w(line);
        else this.lines.push(line);
      }
    });
  }

  private nextLine(timeout = REPLY_TIMEOUT_MS): Promise<string> {
    const queued = this.lines.shift();
    if (queued !== undefined) return Promise.resolve(queued);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((w) => w !== done);
        this.stale++;
        reject(new Error(`No reply within ${timeout} ms`));
      }, timeout);
      const done = (line: string) => {
        clearTimeout(timer);
        resolve(line);
      };
      this.waiters.push(done);
    });
  }

  /** ms until the queued motion is expected to finish. */
  pendingMs(): number {
    return Math.max(0, this.busyUntil - Date.now());
  }

  /** Command that answers with just OK (legacy syntax). */
  async command(cmd: string): Promise<void> {
    record('tx', cmd);
    this.link.write(cmd + '\r');
    // A queued command may not be answered until the motion ahead of it has started.
    const line = await this.nextLine(REPLY_TIMEOUT_MS + this.pendingMs());
    if (!line.startsWith('OK')) throw new Error(`Expected OK for ${cmd}, got "${show(line)}"`);
    const ms = queuedMs(cmd);
    if (ms > 0) this.busyUntil = Math.max(Date.now(), this.busyUntil) + ms;
  }

  /** After a timeout: wait for the queued motion and any late replies, then continue. */
  async resync(): Promise<void> {
    const deadline = Date.now() + this.pendingMs() + REPLY_TIMEOUT_MS;
    while (this.stale > 0 && Date.now() < deadline) await sleep(50);
    this.stale = 0;
    this.lines = [];
  }

  /** Query whose reply is one data line, optionally followed by OK. */
  async query(cmd: string, thenOk: boolean): Promise<string> {
    record('tx', cmd);
    this.link.write(cmd + '\r');
    const data = await this.nextLine();
    if (data.startsWith('!')) throw new Error(`Board error for ${cmd}: ${data}`);
    if (thenOk) {
      const ok = await this.nextLine();
      if (!ok.startsWith('OK')) throw new Error(`Expected OK after ${cmd} data, got "${show(ok)}"`);
    }
    return data;
  }

  async status(): Promise<number> {
    return parseInt(await this.query('QG', false), 16);
  }

  async steps(): Promise<{ a: number; b: number }> {
    const [a, b] = (await this.query('QS', true)).split(',').map((s) => parseInt(s, 10));
    return { a: a!, b: b! };
  }

  /** Waits until the motion queue is empty and motors are idle (QG bits 0-3). */
  async waitIdle(maxMs = 10000, fallbackMs = MOVE_MS * 2 + 500): Promise<void> {
    maxMs += this.pendingMs();
    const start = Date.now();
    while (Date.now() - start < maxMs) {
      let s: number;
      try {
        s = await this.status();
      } catch (e) {
        // Old firmware without QG: just wait long enough.
        record('error', `QG failed, waiting ${fallbackMs} ms instead: ${(e as Error).message}`);
        await sleep(fallbackMs);
        return;
      }
      if ((s & 0x0f) === 0) return;
      await sleep(100);
    }
    throw new Error('Motion did not finish in time');
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------- Port discovery ----------
type PortRow = Awaited<ReturnType<typeof SerialPort.list>>[number];

function isEbb(p: PortRow): boolean {
  return (
    (p.vendorId?.toLowerCase() === EBB_VID && p.productId?.toLowerCase() === EBB_PID) ||
    /EiBotBoard/i.test(p.manufacturer ?? '') ||
    /EiBotBoard/i.test((p as { friendlyName?: string }).friendlyName ?? '') ||
    /EiBotBoard/i.test(p.pnpId ?? '')
  );
}

/** On macOS, use the callout device (/dev/cu.*), not the dial-in one (/dev/tty.*). */
const calloutPath = (path: string) =>
  process.platform === 'darwin' ? path.replace(/^\/dev\/tty\./, '/dev/cu.') : path;

// ---------- Main ----------
// Line queue instead of rl.question, so answers can also be piped in (for --simulate tests).
const rl = createInterface({ input: stdin, output: stdout, terminal: stdin.isTTY });
const pending: string[] = [];
const readers: ((line: string) => void)[] = [];
let inputClosed = false;
rl.on('line', (line) => {
  const r = readers.shift();
  if (r) r(line);
  else pending.push(line);
});
rl.on('close', () => {
  inputClosed = true;
  for (const r of readers.splice(0)) r('q');
});
const nextInput = (): Promise<string> =>
  pending.length
    ? Promise.resolve(pending.shift()!)
    : inputClosed
      ? Promise.resolve('q')
      : new Promise((resolve) => readers.push(resolve));

async function ask(question: string): Promise<string> {
  stdout.write(`\n${question}\n> `);
  const answer = (await nextInput()).trim();
  record('answer', answer || '(enter)');
  return answer;
}
async function confirm(question: string): Promise<boolean> {
  const a = (await ask(`${question} [Enter = go, s = skip, q = quit]`)).toLowerCase();
  if (a === 'q') throw new Error('Stopped by user');
  return a !== 's';
}

let ebb: Ebb | null = null;
let link: Link | null = null;

async function main() {
  record('note', `Plotter Studio DRIVER-0 spike · ${new Date().toISOString()}`);
  record(
    'note',
    `Node ${process.version} · ${os.platform()} ${os.release()} ${os.arch()}${simulate ? ' · SIMULATED' : ''}`,
  );

  let path = argValue('--port');
  if (!simulate) {
    const ports = await SerialPort.list();
    record('note', `Serial ports found: ${ports.length}`);
    for (const p of ports)
      record(
        'note',
        `  ${p.path}  vid=${p.vendorId ?? '-'} pid=${p.productId ?? '-'} manufacturer=${p.manufacturer ?? '-'} serial=${p.serialNumber ?? '-'} pnpId=${p.pnpId ?? '-'}`,
      );
    if (!path) {
      const ebbs = ports.filter(isEbb);
      if (ebbs.length === 0)
        throw new Error(
          'No EBB plotter found. Is the USB cable plugged in? Pass --port to pick one.',
        );
      if (ebbs.length > 1)
        record('note', `More than one EBB found; using the first. Pass --port to choose.`);
      path = calloutPath(ebbs[0]!.path);
    }
    record('note', `Using ${path}`);
    link = await serialLink(path);
  } else link = fakeLink();
  ebb = new Ebb(link);

  // 1. Identify
  record('note', '\n## 1. Identify the board');
  const version = await ebb.query('V', false);
  if (!/EBB/.test(version)) throw new Error(`Unexpected version reply: ${version}`);
  record('note', `Firmware: ${version}`);
  try {
    const [ra0, vplus] = (await ebb.query('QC', true)).split(',').map(Number);
    if (vplus! < 100)
      record(
        'note',
        "WARNING: motor power looks off. Plug in the plotter's power supply, or the moves below will do nothing.",
      );
    record(
      'note',
      `QC: current limit raw ${ra0} (≈${(((ra0! / 1023) * 3.3) / 1.76).toFixed(2)} A), V+ raw ${vplus} (≈${((vplus! / 1023) * 3.3 * 9.2).toFixed(1)} V on v2.3+ boards; ~0 V means the power supply isn't plugged in)`,
    );
  } catch (e) {
    record('error', `QC failed: ${(e as Error).message}`);
  }
  try {
    const g = await ebb.status();
    record('note', `QG status: 0x${g.toString(16)} (pen ${g & 0x10 ? 'up' : 'down'})`);
  } catch (e) {
    record('error', `QG failed (needs firmware 2.6.2+): ${(e as Error).message}`);
  }

  // 2. Pen
  record('note', '\n## 2. Pen up / down');
  const up = servoValue(PEN_UP_PCT);
  const down = servoValue(PEN_DOWN_PCT);
  record(
    'note',
    `Pen up ${PEN_UP_PCT}% = ${up}, pen down ${PEN_DOWN_PCT}% = ${down} (83.3 ns units)`,
  );
  if (
    await confirm(
      'The pen will go UP, then DOWN, then UP again, about one second apart. Remove the pen or keep paper under it.',
    )
  ) {
    await ebb.command(`SC,4,${up}`);
    await ebb.command(`SC,5,${down}`);
    await ebb.command(`SC,11,${servoRate(75)}`);
    await ebb.command(`SC,12,${servoRate(50)}`);
    await ebb.command(`SP,1,${PEN_DELAY_MS}`);
    await sleep(1000);
    await ebb.command(`SP,0,${PEN_DELAY_MS}`);
    await sleep(1000);
    await ebb.command(`SP,1,${PEN_DELAY_MS}`);
    await sleep(500);
    await ask(
      "Did the pen go up, down and up again? Describe anything odd (too high, too low, didn't move).",
    );
  }

  // 3. X and Y moves
  record('note', `\n## 3. Moves (${TEST_MOVE_MM} mm, ${STEPS_PER_MM} steps/mm expected)`);
  const steps = TEST_MOVE_MM * STEPS_PER_MM;
  await ebb.command('EM,0,0');
  if (
    await confirm(
      'Motors are now off. Move the carriage BY HAND to roughly the middle of the drawing area,\nso a 10 mm move in any direction is safe. The pen stays up. Ready?',
    )
  ) {
    await ebb.command('SP,1,100');
    await ebb.command('EM,1,1'); // 16x microstepping, both motors; resets step counters
    for (const [label, a, b] of [
      ['X+ (should go RIGHT, away from the home corner)', steps, 0],
      ['Y+ (should go DOWN the page, toward you)', 0, steps],
    ] as const) {
      if (!(await confirm(`Next: move ${label}, wait, then move back.`))) continue;
      await ebb.command(`XM,${MOVE_MS},${a},${b}`);
      await ebb.waitIdle();
      const mid = await ebb.steps();
      record('note', `Motor steps after move: a=${mid.a} b=${mid.b}`);
      await ask(`Which way did it go, and roughly how far (mm)? e.g. "right 10"`);
      await ebb.command(`XM,${MOVE_MS},${-a},${-b}`);
      await ebb.waitIdle();
      const back = await ebb.steps();
      record('note', `Motor steps after return: a=${back.a} b=${back.b} (expect 0,0)`);
    }
  }

  // 4. Optional scale check
  record('note', '\n## 4. Optional: scale check with the pen down');
  if (
    await confirm(
      'Optional. Put paper under the pen with room for a 100 mm line to the RIGHT of the pen.\nThe pen will draw a 100 mm horizontal line, lift, and return. Measure it with a ruler.',
    )
  ) {
    const s100 = 100 * STEPS_PER_MM;
    await ebb.command('EM,1,1');
    await ebb.command(`SP,0,${PEN_DELAY_MS}`);
    await ebb.command(`XM,4000,${s100},0`);
    await ebb.command(`SP,1,${PEN_DELAY_MS}`);
    await ebb.command(`XM,4000,${-s100},0`);
    await ebb.waitIdle(15000, 9000);
    await ask('How long is the line, in mm (as exact as you can)?');
  }

  // 5. Button
  record('note', '\n## 5. Pause button');
  if (
    await confirm(
      'Press and release the small button on the plotter board once, then press Enter here.',
    )
  ) {
    try {
      const g = await ebb.status();
      record(
        'note',
        `QG: 0x${g.toString(16)} · button pressed since last check: ${g & 0x20 ? 'yes' : 'no'}`,
      );
    } catch (e) {
      record('error', `QG failed: ${(e as Error).message}`);
    }
  }

  await ask('Anything else worth noting? (noises, skipped steps, the pen dragging...)');
}

async function shutdown() {
  if (ebb) {
    await ebb.resync();
    for (const cmd of ['SP,1,100', 'EM,0,0']) {
      try {
        await ebb.command(cmd);
      } catch {
        /* best effort */
      }
    }
  }
  await link?.close();
  rl.close();
}

function writeReport(): string {
  const dir = join(import.meta.dirname, 'reports');
  mkdirSync(dir, { recursive: true });
  const file = join(
    dir,
    `spike-${new Date().toISOString().replace(/[:.]/g, '-')}${simulate ? '-sim' : ''}.md`,
  );
  const body = log
    .map((e) => {
      const t = `${(e.t / 1000).toFixed(2)}s`;
      if (e.kind === 'note') return e.text.startsWith('\n##') ? e.text : `${t} ${e.text}`;
      return `${t} ${{ tx: '→', rx: '←', answer: 'you:', error: 'ERROR:' }[e.kind]} ${show(e.text)}`;
    })
    .join('\n');
  writeFileSync(file, `# DRIVER-0 spike report\n\n\`\`\`\n${body}\n\`\`\`\n`);
  return file;
}

process.on('SIGINT', () => {
  record('note', 'Interrupted (Ctrl+C): lifting pen, motors off.');
  void (async () => {
    try {
      await ebb?.query('ES', true);
    } catch {
      /* ignore */
    }
    await shutdown();
    console.log(`\nReport: ${writeReport()}`);
    process.exit(130);
  })();
});

try {
  await main();
  record('note', '\nDone.');
} catch (e) {
  record('error', (e as Error).message);
  process.exitCode = 1;
} finally {
  await shutdown();
  console.log(`\nReport saved to ${writeReport()}`);
}
