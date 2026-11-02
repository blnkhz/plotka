import { useEffect } from 'react';
import { fmtClock } from '../lib/playback';
import { useProcessed } from '../lib/useProcessed';
import { useStore } from '../store';
import { Segmented } from './controls';
import styles from './Preview.module.css';

const SPEEDS = ['1', '5', '20', '100'] as const;

/** PREVIEW-4: play / pause, a scrubber over the plot's time, and the playback speed. */
export function PlaybackBar() {
  const processed = useProcessed();
  const playback = useStore((s) => s.playback);
  const total = processed?.timeline.totalMs ?? 0;
  const set = (patch: Partial<typeof playback>) =>
    useStore.setState((s) => ({ playback: { ...s.playback, ...patch } }));

  // Advance time while playing, by real elapsed time × speed.
  useEffect(() => {
    if (!playback.playing) return;
    let last = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const { playback: p, processed: pr } = useStore.getState();
      const end = pr?.timeline.totalMs ?? 0;
      const t = Math.min(end, p.t + (now - last) * p.speed);
      last = now;
      useStore.setState({ playback: { ...p, t, playing: t < end } });
      if (t < end) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [playback.playing]);

  if (!playback.on || !processed) return null;
  const t = Math.min(playback.t, total);
  return (
    <div className={styles.playback} role="group" aria-label="Playback">
      <button
        onClick={() => set({ playing: !playback.playing, t: t >= total ? 0 : t })}
        aria-label={playback.playing ? 'Pause playback' : 'Play'}
        title={playback.playing ? 'Pause' : 'Play'}
      >
        {playback.playing ? '❚❚' : '▶'}
      </button>
      <input
        type="range"
        aria-label="Playback time"
        min={0}
        max={Math.max(1, total)}
        step={Math.max(1, total / 2000)}
        value={t}
        onChange={(e) => set({ t: Number(e.target.value), playing: false })}
      />
      <span className={styles.clock}>
        {fmtClock(t)} / {fmtClock(total)}
      </span>
      <Segmented
        value={String(playback.speed) as (typeof SPEEDS)[number]}
        options={SPEEDS.map((s) => ({ value: s, label: `${s}×`, title: `${s} times real speed` }))}
        onChange={(s) => set({ speed: Number(s) })}
      />
      <button
        onClick={() => set({ on: false, playing: false })}
        aria-label="Close playback"
        title="Close"
      >
        ✕
      </button>
    </div>
  );
}
