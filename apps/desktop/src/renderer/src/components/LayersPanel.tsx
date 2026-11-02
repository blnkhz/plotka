import type { LayerMode } from '@plotter-studio/core';
import { applyOverrides, useStore } from '../store';
import { Section, Segmented } from './controls';
import styles from './LayersPanel.module.css';

export function LayersPanel() {
  const doc = useStore((s) => s.doc);
  const overrides = useStore((s) => s.layerOverrides);
  const selected = useStore((s) => s.selectedLayerId);
  const selectLayer = useStore((s) => s.selectLayer);
  const setLayer = useStore((s) => s.setLayer);
  const layerMode = useStore((s) => s.layerMode);
  const setLayerMode = useStore((s) => s.setLayerMode);

  if (!doc) {
    return (
      <Section title="Layers">
        <p className={styles.muted}>No file open.</p>
      </Section>
    );
  }
  const layers = applyOverrides(doc, overrides).layers;
  const modeOptions: { value: LayerMode; label: string; title?: string }[] = [
    ...(doc.source?.hasLayers ? [{ value: 'auto' as const, label: 'From file' }] : []),
    { value: doc.source?.hasLayers ? 'single' : 'auto', label: 'One layer' },
    { value: 'byColor', label: 'By color', title: 'One layer per stroke color' },
  ];
  // Without file layers, 'auto' and 'single' behave the same.
  const shownMode = !doc.source?.hasLayers && layerMode === 'single' ? 'auto' : layerMode;

  return (
    <Section title="Layers">
      <div className={styles.mode}>
        <Segmented value={shownMode} options={modeOptions} onChange={(m) => void setLayerMode(m)} />
      </div>
      {layers.length === 0 && <p className={styles.muted}>Nothing to draw in this file.</p>}
      <ul className={styles.list}>
        {layers.map((l) => (
          <li
            key={l.id}
            className={`${styles.layer} ${l.id === selected ? styles.selected : ''}`}
            onClick={() => selectLayer(l.id)}
          >
            <input
              type="color"
              value={l.color.startsWith('#') ? l.color : '#000000'}
              onChange={(e) => setLayer(l.id, { color: e.target.value })}
              onClick={(e) => e.stopPropagation()}
              title="Display color"
            />
            <span className={styles.name} title={l.name}>
              {l.name}
            </span>
            <span className={styles.count} title="Strokes / filled shapes">
              {l.strokes.length}/{l.fills.filter((f) => !f.knockout).length}
            </span>
            <button
              className={styles.icon}
              title={l.visible ? 'Hide in preview' : 'Show in preview'}
              onClick={(e) => {
                e.stopPropagation();
                setLayer(l.id, { visible: !l.visible });
              }}
            >
              {l.visible ? '◉' : '○'}
            </button>
            <input
              type="checkbox"
              checked={l.plot}
              title="Plot this layer"
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setLayer(l.id, { plot: e.target.checked })}
            />
          </li>
        ))}
      </ul>
    </Section>
  );
}
