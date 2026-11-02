import { useCallback, useEffect, useRef, useState } from 'react';
import { SIMULATED_PORT, type PortInfo } from '@shared/ipc';
import { command, connect, disconnect, listPorts } from '../lib/plotter';
import { useProfile } from '../lib/useProcessed';
import { useStore } from '../store';
import { Notice, Row, Section, Segmented } from './controls';
import styles from './MachineTab.module.css';

const MOVING = new Set(['running', 'pausing', 'stopping']);
const ACTIVE = new Set(['running', 'pausing', 'stopping', 'paused', 'error']);

export function MachineTab() {
  const status = useStore((s) => s.plotter);
  const error = useStore((s) => s.plotterError);
  const connected = status?.connection.connected ?? false;
  return (
    <>
      {error && <Notice kind="error">{error}</Notice>}
      <ConnectionSection />
      {connected && <ManualSection />}
      {connected && <PenHeightSection />}
      <MachineInfo />
    </>
  );
}

function ConnectionSection() {
  const status = useStore((s) => s.plotter);
  const [ports, setPorts] = useState<PortInfo[]>([]);
  const [port, setPort] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const conn = status?.connection;

  const apply = useCallback((list: PortInfo[]) => {
    setPorts(list);
    // Auto-select when exactly one plotter is found (DRIVER-1).
    const plotters = list.filter((p) => p.isPlotter);
    setPort((cur) =>
      cur && (cur === SIMULATED_PORT || list.some((p) => p.path === cur))
        ? cur
        : plotters.length === 1
          ? plotters[0]!.path
          : (list[0]?.path ?? SIMULATED_PORT),
    );
  }, []);
  const refresh = useCallback(() => listPorts().then(apply), [apply]);

  useEffect(() => {
    let alive = true;
    void listPorts().then((list) => alive && apply(list));
    return () => {
      alive = false;
    };
  }, [apply]);

  const doConnect = async (p: string) => {
    setBusy(true);
    await connect(p);
    setBusy(false);
  };

  if (conn?.connected)
    return (
      <Section title="Plotter" help="machine#connecting">
        <Row label="Connected">
          <span className={styles.value}>
            {conn.simulated
              ? 'Simulated plotter'
              : (ports.find((p) => p.path === conn.port)?.label ?? conn.port)}
          </span>
        </Row>
        {conn.firmware && (
          <Row label="Firmware">
            <span className={styles.value} title={conn.firmware}>
              {/(\d+\.\d+\.\d+)/.exec(conn.firmware)?.[1] ?? conn.firmware}
            </span>
          </Row>
        )}
        <div className={styles.buttons}>
          <button onClick={() => void disconnect()}>Disconnect</button>
        </div>
      </Section>
    );

  return (
    <Section title="Plotter" help="machine#connecting">
      {conn?.lost && (
        <Notice kind="warn">
          The plotter was disconnected. Check the USB cable, then reconnect.
        </Notice>
      )}
      <Row label="Port">
        <select
          aria-label="Port"
          value={port}
          onChange={(e) => setPort(e.target.value)}
          className={styles.port}
        >
          {ports.map((p) => (
            <option key={p.path} value={p.path}>
              {p.label}
            </option>
          ))}
          <option value={SIMULATED_PORT}>Simulated plotter (no hardware)</option>
        </select>
      </Row>
      {ports.length > 0 && !ports.some((p) => p.isPlotter) && (
        <p className={styles.muted}>No plotter found. Is it plugged in and switched on?</p>
      )}
      <div className={styles.buttons}>
        <button
          className={styles.primary}
          disabled={busy || !port}
          onClick={() => void doConnect(port)}
        >
          {busy ? 'Connecting…' : conn?.lost && conn.port === port ? 'Reconnect' : 'Connect'}
        </button>
        <button onClick={() => void refresh()} disabled={busy}>
          Refresh
        </button>
      </div>
    </Section>
  );
}

function ManualSection() {
  const status = useStore((s) => s.plotter)!;
  const [stepMm, setStepMm] = useState<'1' | '10' | '50'>('10');
  const machine = status.machine;
  const plotState = status.plot?.state;
  const locked = !!plotState && MOVING.has(plotState);
  const inPlot = !!plotState && ACTIVE.has(plotState);
  const pos = machine?.position;
  const d = Number(stepMm);
  const jog = (dx: number, dy: number) => void command({ kind: 'jog', dx: dx * d, dy: dy * d });

  return (
    <Section title="Move" help="machine#home">
      {locked && <p className={styles.muted}>Pause the plot to use these.</p>}
      <Row label="Pen">
        <div className={styles.group}>
          <button
            disabled={locked}
            onClick={() => void command({ kind: 'penUp' })}
            title="Pen up (U)"
          >
            Up
          </button>
          <button
            disabled={locked}
            onClick={() => void command({ kind: 'penDown' })}
            title="Pen down (D)"
          >
            Down
          </button>
          <button disabled={locked} onClick={() => void command({ kind: 'penToggle' })}>
            Toggle
          </button>
        </div>
      </Row>
      <Row label="Position">
        <span className={styles.value}>
          {pos ? `X ${pos.x.toFixed(1)} · Y ${pos.y.toFixed(1)} mm` : 'Not set (motors off)'}
        </span>
      </Row>
      {!machine?.motorsOn && (
        <p className={styles.muted}>
          The motors are off, so the carriage moves freely. Slide it by hand to the top-left corner
          of the paper: that spot becomes home when the motors switch on (on the first move or
          plot).
        </p>
      )}
      <Row label="Jog">
        <Segmented
          value={stepMm}
          options={[
            { value: '1', label: '1 mm' },
            { value: '10', label: '10 mm' },
            { value: '50', label: '50 mm' },
          ]}
          onChange={setStepMm}
        />
      </Row>
      <div className={styles.jog}>
        <span />
        <button disabled={locked} onClick={() => jog(0, -1)} aria-label={`Jog up ${d} mm`}>
          ↑
        </button>
        <span />
        <button disabled={locked} onClick={() => jog(-1, 0)} aria-label={`Jog left ${d} mm`}>
          ←
        </button>
        <button
          disabled={locked}
          onClick={() => void command({ kind: 'home' })}
          title="Raise the pen and go back to home"
        >
          Home
        </button>
        <button disabled={locked} onClick={() => jog(1, 0)} aria-label={`Jog right ${d} mm`}>
          →
        </button>
        <span />
        <button disabled={locked} onClick={() => jog(0, 1)} aria-label={`Jog down ${d} mm`}>
          ↓
        </button>
        <span />
      </div>
      <div className={styles.buttons}>
        <button
          disabled={inPlot || !machine?.motorsOn}
          onClick={() => void command({ kind: 'motorsOff' })}
          title={
            inPlot ? 'Stop the plot first' : 'Let the carriage move freely by hand. Forgets home.'
          }
        >
          Motors off
        </button>
      </div>
    </Section>
  );
}

/** DRIVER-3: the sliders move the servo live; values are saved and used for plots. */
function PenHeightSection() {
  const heights = useStore((s) => s.penHeights);
  const setPenHeights = useStore((s) => s.setPenHeights);
  const locked = MOVING.has(useStore((s) => s.plotter?.plot?.state) ?? '');
  const pending = useRef<{ up: number; down: number; show: 'up' | 'down' } | null>(null);
  const sending = useRef(false);

  // Send at most one update at a time; the latest value wins.
  const flush = useCallback(async () => {
    if (sending.current) return;
    sending.current = true;
    while (pending.current) {
      const p = pending.current;
      pending.current = null;
      await command({ kind: 'penHeights', ...p });
    }
    sending.current = false;
  }, []);

  const change = (which: 'up' | 'down', value: number) => {
    const next = { ...heights, [which]: value };
    setPenHeights(next);
    pending.current = { ...next, show: which };
    void flush();
  };

  return (
    <Section title="Pen height" help="machine#pen-height">
      {(['up', 'down'] as const).map((which) => (
        <Row key={which} label={which === 'up' ? 'Up' : 'Down'}>
          <input
            type="range"
            min={0}
            max={100}
            disabled={locked}
            aria-label={`Pen ${which} height`}
            value={heights[which]}
            onChange={(e) => change(which, Number(e.target.value))}
          />
          <span className={styles.value}>{heights[which]}%</span>
        </Row>
      ))}
      {heights.down >= heights.up && (
        <p className={styles.warn}>Down is at or above Up, so the pen won’t lift between lines.</p>
      )}
      <p className={styles.muted}>
        Moving a slider moves the pen there so you can see it. Up should clear the paper; down
        should just touch it.
      </p>
    </Section>
  );
}

function MachineInfo() {
  const profile = useProfile();
  return (
    <Section title="Machine">
      <Row label="Profile">{profile.name}</Row>
      <Row label="Travel">
        {profile.bed.width} × {profile.bed.height} mm
      </Row>
      <Row label="Home">Top left of the paper</Row>
      {profile.provisional?.length ? (
        <p className={styles.muted}>
          Top speeds are the maker’s values, not yet tested with this app.
        </p>
      ) : null}
    </Section>
  );
}
