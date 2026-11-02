import { BrowserWindow, powerSaveBlocker } from 'electron';
import {
  EbbDriver,
  getProfile,
  DEFAULT_PROFILE_ID,
  Machine,
  planDryRun,
  planToolpath,
  PlotRunner,
  SimulatedDriver,
  type DeviceInfo,
  type MachineProfile,
  type PlotterDriver,
} from '@plotter-studio/plotter';
import type { Bounds } from '@plotter-studio/core';
import {
  SIMULATED_PORT,
  type ActionResult,
  type ManualCommand,
  type PlotRequest,
  type PlotterStatus,
} from '@shared/ipc';
import { openSerial } from './serial';

/** Simulated plotter speed (1 = real time). Tests set PLOTTER_SIM_SPEED to run faster. */
const SIM_SPEED = Number(process.env['PLOTTER_SIM_SPEED']) || 1;

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** States in which a plot is under way (the window asks before closing, manual moves wait). */
const ACTIVE = new Set(['running', 'pausing', 'stopping', 'paused', 'error']);
const MOVING = new Set(['running', 'pausing', 'stopping']);

/**
 * Owns the plotter connection, the machine state and the plot runner in the main process
 * (PLOT-1: the plot loop doesn't depend on the renderer), and pushes status to the window.
 */
export class PlotterService {
  private driver: PlotterDriver | null = null;
  private machine: Machine | null = null;
  private runner: PlotRunner | null = null;
  private info: DeviceInfo | null = null;
  private port: string | null = null;
  private simulated = false;
  private lost = false;
  private blocker: number | null = null;
  private plotKind: 'plot' | 'dryRun' | null = null;
  private profile: MachineProfile = getProfile(DEFAULT_PROFILE_ID)!;
  private pushQueued = false;

  status(): PlotterStatus {
    return {
      connection: {
        connected: this.driver?.connected ?? false,
        port: this.port,
        firmware: this.info?.firmware ?? null,
        simulated: this.simulated,
        lost: this.lost,
      },
      machine: this.machine?.state ?? null,
      plot: this.runner?.progress ?? null,
      plotKind: this.runner ? this.plotKind : null,
    };
  }

  /** True while a plot is running, paused, or interrupted and resumable. */
  isPlotting(): boolean {
    return !!this.runner && ACTIVE.has(this.runner.state);
  }

  private push() {
    if (this.pushQueued) return;
    this.pushQueued = true;
    queueMicrotask(() => {
      this.pushQueued = false;
      const status = this.status();
      for (const w of BrowserWindow.getAllWindows())
        if (!w.isDestroyed()) w.webContents.send('plotter:changed', status);
    });
  }

  private async act(fn: () => Promise<unknown>): Promise<ActionResult> {
    try {
      await fn();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: message(e) };
    } finally {
      this.push();
    }
  }

  connect(port: string, profileId: string): Promise<ActionResult> {
    return this.act(async () => {
      if (this.runner && MOVING.has(this.runner.state))
        throw new Error('Pause or stop the plot before reconnecting.');
      const profile = getProfile(profileId) ?? this.profile;
      const simulated = port === SIMULATED_PORT;
      // Reconnecting to the same kind of plotter keeps the machine (and its position), so an
      // interrupted plot can resume. Switching kind or profile starts fresh.
      const reuse =
        this.driver && this.machine && this.simulated === simulated && this.profile === profile;
      if (this.driver?.connected) await this.driver.disconnect();
      if (!reuse) {
        this.profile = profile;
        this.driver = simulated
          ? new SimulatedDriver(profile, { speed: SIM_SPEED })
          : new EbbDriver(profile, openSerial, { onDisconnect: () => this.onLost() });
        this.machine = new Machine(this.driver, profile);
        this.machine.onChange(() => this.push());
        this.runner = null;
      }
      this.simulated = simulated;
      this.info = await this.driver!.connect(port);
      this.port = port;
      this.lost = false;
      this.machine!.connected();
    });
  }

  disconnect(): Promise<ActionResult> {
    return this.act(async () => {
      if (this.runner && MOVING.has(this.runner.state))
        throw new Error('Pause or stop the plot before disconnecting.');
      await this.driver?.disconnect();
      this.machine?.disconnected();
      this.lost = false;
    });
  }

  private onLost() {
    this.lost = true;
    this.machine?.disconnected();
    this.push();
  }

  command(cmd: ManualCommand): Promise<ActionResult> {
    return this.act(async () => {
      const m = this.machine;
      if (!m || !this.driver?.connected) throw new Error('Connect the plotter first.');
      if (this.runner && MOVING.has(this.runner.state))
        throw new Error('Pause the plot to use the manual controls.');
      switch (cmd.kind) {
        case 'penUp':
          return m.penUp();
        case 'penDown':
          return m.penDown();
        case 'penToggle':
          return m.state.penUp === false ? m.penUp() : m.penDown();
        case 'motorsOff':
          if (this.runner && ACTIVE.has(this.runner.state))
            throw new Error(
              'Stop the plot before turning the motors off (it would lose its place).',
            );
          await m.penUp();
          return m.motorsOff();
        case 'home':
          return m.home();
        case 'jog':
          return m.jog(cmd.dx, cmd.dy);
        case 'penHeights':
          return m.setPenHeights(cmd.up, cmd.down, cmd.show);
      }
    });
  }

  start(req: PlotRequest): Promise<ActionResult> {
    return this.act(async () => {
      const m = this.machine;
      if (!m || !this.driver?.connected) throw new Error('Connect the plotter first.');
      if (this.isPlotting()) throw new Error('A plot is already in progress. Stop it first.');
      if (getProfile(req.profileId) !== this.profile)
        throw new Error('The plotter was connected with a different machine profile. Reconnect.');
      const start = m.state.position ?? { x: 0, y: 0 };
      const plan = planToolpath(
        req.toolpath,
        this.profile,
        (id) => {
          const s = req.settings[id];
          if (!s) throw new Error(`Missing settings for layer ${id}.`);
          return s;
        },
        { start },
      );
      if (plan.totalMs === 0) throw new Error('Nothing to plot.');
      this.runner = new PlotRunner(m, plan, { onProgress: () => this.onProgress() });
      this.plotKind = 'plot';
      this.keepAwake(true);
      void this.runner.start().finally(() => this.onProgress());
    });
  }

  dryRun(profileId: string, bounds: Bounds): Promise<ActionResult> {
    return this.act(async () => {
      const m = this.machine;
      if (!m || !this.driver?.connected) throw new Error('Connect the plotter first.');
      if (this.isPlotting()) throw new Error('A plot is in progress. Stop it first.');
      if (getProfile(profileId) !== this.profile)
        throw new Error('The plotter was connected with a different machine profile. Reconnect.');
      if (![bounds.minX, bounds.minY, bounds.maxX, bounds.maxY].every(Number.isFinite))
        throw new Error('Nothing to trace.');
      // The trace never lowers the pen, so make sure it starts up.
      if (m.state.penUp !== true) await m.penUp();
      await m.ensureMotors();
      const plan = planDryRun(this.profile, bounds, m.steps ?? { x: 0, y: 0 });
      this.runner = new PlotRunner(m, plan, { onProgress: () => this.onProgress() });
      this.plotKind = 'dryRun';
      void this.runner.start().finally(() => this.onProgress());
    });
  }

  control(action: 'pause' | 'resume' | 'stop' | 'toggle'): Promise<ActionResult> {
    return this.act(async () => {
      const r = this.runner;
      if (!r) throw new Error('No plot to control.');
      if (action === 'pause') r.pause();
      else if (action === 'toggle') void r.toggle();
      else if (action === 'stop') await r.stop();
      else {
        if (!this.driver?.connected) throw new Error('Reconnect the plotter first.');
        void r.resume().finally(() => this.onProgress());
      }
    });
  }

  /** Stops a plot (pen up, home) and waits, e.g. before the window closes. */
  async stopAndWait() {
    if (this.runner && ACTIVE.has(this.runner.state))
      await this.runner.stop().catch(() => undefined);
    this.keepAwake(false);
  }

  private onProgress() {
    const s = this.runner?.state;
    // Keep the computer awake from start until the plot is done or stopped (also while paused).
    this.keepAwake(!!s && ACTIVE.has(s) && s !== 'error');
    this.push();
  }

  private keepAwake(on: boolean) {
    if (on && this.blocker === null)
      this.blocker = powerSaveBlocker.start('prevent-app-suspension');
    if (!on && this.blocker !== null) {
      powerSaveBlocker.stop(this.blocker);
      this.blocker = null;
    }
  }

  async shutdown() {
    this.keepAwake(false);
    await this.driver?.disconnect().catch(() => undefined);
  }
}
