import { useState } from 'react';
import { useStore } from '../store';
import { Row, Section } from './controls';
import styles from './PageTab.module.css';

/** PAGE-4: apply, save and delete named page setups. */
export function PagePresets() {
  const presets = useStore((s) => s.pagePresets);
  const page = useStore((s) => s.page);
  const setPage = useStore((s) => s.setPage);
  const save = useStore((s) => s.savePagePreset);
  const remove = useStore((s) => s.deletePagePreset);
  const [name, setName] = useState('');
  const current = presets.find((p) => JSON.stringify(p.page) === JSON.stringify(page));

  return (
    <Section title="Presets" help="page-setup#presets">
      {presets.length > 0 && (
        <Row label="Use">
          <select
            aria-label="Page preset"
            value={current?.name ?? ''}
            onChange={(e) => {
              const p = presets.find((x) => x.name === e.target.value);
              if (p) setPage({ ...p.page });
            }}
          >
            <option value="" disabled>
              {current ? '' : 'Choose a preset…'}
            </option>
            {presets.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name}
              </option>
            ))}
          </select>
          {current && (
            <button onClick={() => remove(current.name)} title={`Delete “${current.name}”`}>
              Delete
            </button>
          )}
        </Row>
      )}
      <form
        className={styles.presetForm}
        onSubmit={(e) => {
          e.preventDefault();
          save(name);
          setName('');
        }}
      >
        <input
          type="text"
          aria-label="Preset name"
          placeholder="Name this setup, e.g. A4 landscape 15 mm"
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
        />
        <button type="submit" disabled={!name.trim()}>
          Save preset
        </button>
      </form>
    </Section>
  );
}
