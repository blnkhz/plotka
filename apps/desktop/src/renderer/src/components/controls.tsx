import { createContext, useContext, useState, type ReactNode } from 'react';
import styles from './controls.module.css';

/** The label of the enclosing Row, used as the accessible name of the control inside it. */
const RowLabel = createContext<string>('');

/** Number input that commits on blur or Enter, so typing intermediate values doesn't thrash. */
export function NumberField({
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
  digits = 2,
  width,
  title,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  digits?: number;
  width?: number;
  title?: string;
}) {
  const label = useContext(RowLabel);
  const shown = String(Number(value.toFixed(digits)));
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const v = parseFloat(draft);
    setDraft(null);
    if (!Number.isFinite(v)) return;
    const clamped = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v));
    if (clamped !== value) onChange(clamped);
  };
  return (
    <span className={styles.number} title={title}>
      <input
        type="number"
        aria-label={label || title}
        value={draft ?? shown}
        min={min}
        max={max}
        step={step}
        style={width ? { width } : undefined}
        onChange={(e) => {
          // Spinner clicks and arrow keys commit right away; typing waits for blur/Enter.
          const native = e.nativeEvent as InputEvent;
          if (native.inputType === undefined || native.inputType === 'insertReplacementText') {
            const v = parseFloat(e.target.value);
            if (Number.isFinite(v)) onChange(v);
            setDraft(null);
          } else setDraft(e.target.value);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') setDraft(null);
        }}
      />
      {suffix && <span className={styles.suffix}>{suffix}</span>}
    </span>
  );
}

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.row}>
      <span className={styles.label}>{label}</span>
      <div className={styles.value}>
        <RowLabel.Provider value={label}>{children}</RowLabel.Provider>
      </div>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>{title}</h3>
      {children}
    </section>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string; title?: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className={styles.segmented}>
      {options.map((o) => (
        <button
          key={o.value}
          className={o.value === value ? styles.active : undefined}
          title={o.title}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Notice({
  kind,
  children,
}: {
  kind: 'warn' | 'error' | 'info';
  children: ReactNode;
}) {
  return <div className={`${styles.notice} ${styles[kind]}`}>{children}</div>;
}
