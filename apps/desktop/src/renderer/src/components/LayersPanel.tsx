import { useRef, useState } from 'react';
import type { LayerMode } from '@plotka/core';
import { applyOverrides, useStore } from '../store';
import { Section, Segmented } from './controls';
import styles from './LayersPanel.module.css';

/** Editing a layer's name: Enter or clicking away keeps it, Esc leaves it as it was. */
function NameInput({ name, onDone }: { name: string; onDone: (name: string | null) => void }) {
  // Removing the field can blur it too: only the first of these counts.
  const done = useRef(false);
  const finish = (next: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(next);
  };
  return (
    <input
      className={styles.nameInput}
      aria-label={`Name of ${name}`}
      defaultValue={name}
      maxLength={80}
      autoFocus
      onFocus={(e) => e.target.select()}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onBlur={(e) => finish(e.target.value)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') finish(e.currentTarget.value);
        if (e.key === 'Escape') finish(null);
      }}
    />
  );
}

export function LayersPanel() {
  const doc = useStore((s) => s.doc);
  const overrides = useStore((s) => s.layerOverrides);
  const selected = useStore((s) => s.selectedLayerId);
  const selectLayer = useStore((s) => s.selectLayer);
  const setLayer = useStore((s) => s.setLayer);
  const layerMode = useStore((s) => s.layerMode);
  const setLayerMode = useStore((s) => s.setLayerMode);
  const hasFile = useStore((s) => s.source !== null);
  const [renaming, setRenaming] = useState<string | null>(null);

  const addText = () => {
    useStore.getState().addText();
    useStore.getState().setTab('fill');
  };
  const addButtons = (
    <div className={styles.adds}>
      <button onClick={() => useStore.getState().addLayer()} title="Add an empty layer to draw on">
        + Add layer
      </button>
      <button onClick={addText} title="Type text to plot in a single-stroke font">
        + Add text
      </button>
    </div>
  );
  if (!doc) {
    return (
      <Section title="Layers" help="opening-artwork#layers">
        <p className={styles.muted}>No file open.</p>
        {addButtons}
      </Section>
    );
  }
  const layers = applyOverrides(doc, overrides).layers;
  const removed = doc.layers.filter((l) => overrides[l.id]?.removed).map((l) => l.id);
  const modeOptions: { value: LayerMode; label: string; title?: string }[] = [
    ...(doc.source?.hasLayers ? [{ value: 'auto' as const, label: 'From file' }] : []),
    { value: doc.source?.hasLayers ? 'single' : 'auto', label: 'One layer' },
    { value: 'byColor', label: 'By color', title: 'One layer per stroke color' },
  ];
  // Without file layers, 'auto' and 'single' behave the same.
  const shownMode = !doc.source?.hasLayers && layerMode === 'single' ? 'auto' : layerMode;

  return (
    <Section title="Layers" help="opening-artwork#layers">
      {/* How a file is split into layers: doodles and text always have one each. */}
      {hasFile && (
        <div className={styles.mode}>
          <Segmented
            value={shownMode}
            options={modeOptions}
            onChange={(m) => void setLayerMode(m)}
          />
        </div>
      )}
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
            {renaming === l.id ? (
              <NameInput
                name={l.name}
                onDone={(next) => {
                  setRenaming(null);
                  const name = next?.trim();
                  // Left empty, it keeps the name it has.
                  if (name && name !== l.name) setLayer(l.id, { name });
                }}
              />
            ) : (
              <span
                className={styles.name}
                title={l.name}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  setRenaming(l.id);
                }}
              >
                {l.name}
              </span>
            )}
            <span className={styles.count} title="Strokes / filled shapes">
              {l.strokes.length}/{l.fills.filter((f) => !f.knockout).length}
            </span>
            <button
              className={styles.icon}
              title="Duplicate this layer, with its settings"
              aria-label={`Duplicate ${l.name}`}
              onClick={(e) => {
                e.stopPropagation();
                useStore.getState().duplicateLayer(l.id);
              }}
            >
              <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
                <rect
                  x="1"
                  y="1"
                  width="7.5"
                  height="7.5"
                  rx="1"
                  fill="none"
                  stroke="currentColor"
                />
                <path d="M4 11h6a1 1 0 0 0 1-1V4" fill="none" stroke="currentColor" />
              </svg>
            </button>
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
              aria-label={`Plot ${l.name}`}
              title={
                l.plot && !l.visible
                  ? 'Hidden in the preview, but still plotted. Untick to leave it out of the plot.'
                  : 'Plot this layer'
              }
              className={l.plot && !l.visible ? styles.hiddenPlotted : undefined}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setLayer(l.id, { plot: e.target.checked })}
            />
            <button
              className={styles.icon}
              title="Remove this layer (Undo brings it back)"
              aria-label={`Remove ${l.name}`}
              onClick={(e) => {
                e.stopPropagation();
                // Text and doodles are deleted (Undo brings them back); other layers are hidden
                // away.
                if (l.text) useStore.getState().removeText(l.text.id);
                else if (l.doodle) useStore.getState().removeDoodle(l.doodle);
                else setLayer(l.id, { removed: true });
                if (selected === l.id) selectLayer(layers.find((x) => x.id !== l.id)?.id ?? null);
              }}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
      {layers.some((l) => l.plot && !l.visible) && (
        <p className={styles.warn}>
          A hidden layer is still plotted. Untick its checkbox to leave it out.
        </p>
      )}
      {removed.length > 0 && (
        <p className={styles.removed}>
          {removed.length} removed {removed.length === 1 ? 'layer' : 'layers'} ·{' '}
          <button
            className={styles.link}
            onClick={() => {
              for (const id of removed) setLayer(id, { removed: false });
            }}
          >
            Restore
          </button>
        </p>
      )}
      {addButtons}
    </Section>
  );
}
