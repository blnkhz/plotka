import { getTransform, TRANSFORMS, type ParamSpec, type PipelineStep } from '@plotter-studio/core';
import { useStore } from '../store';
import { NumberField, Row, Section } from './controls';
import styles from './TransformsPanel.module.css';

/** The transform list (left panel): add, reorder, turn off, remove; settings from each schema. */
export function TransformsPanel() {
  const pipeline = useStore((s) => s.pipeline);
  const addStep = useStore((s) => s.addStep);
  return (
    <Section title="Transforms" help="transforms">
      {pipeline.length === 0 && (
        <p className={styles.muted}>Repeat or rearrange the artwork before it goes on the page.</p>
      )}
      {pipeline.map((step, i) => (
        <StepCard key={step.id} step={step} first={i === 0} last={i === pipeline.length - 1} />
      ))}
      <select
        className={styles.add}
        aria-label="Add transform"
        value=""
        onChange={(e) => {
          if (e.target.value) addStep(e.target.value);
        }}
      >
        <option value="">Add transform…</option>
        {TRANSFORMS.map((t) => (
          <option key={t.type} value={t.type} title={t.description}>
            {t.name}
          </option>
        ))}
      </select>
    </Section>
  );
}

function StepCard({ step, first, last }: { step: PipelineStep; first: boolean; last: boolean }) {
  const updateStep = useStore((s) => s.updateStep);
  const removeStep = useStore((s) => s.removeStep);
  const moveStep = useStore((s) => s.moveStep);
  const def = getTransform(step.type);
  const name = def?.name ?? step.type;
  return (
    <div className={styles.card} data-disabled={!step.enabled || undefined}>
      <div className={styles.header}>
        <label className={styles.title} title={def?.description}>
          <input
            type="checkbox"
            checked={step.enabled}
            onChange={(e) => updateStep(step.id, { enabled: e.target.checked })}
            aria-label={`Use ${name}`}
          />
          {name}
        </label>
        <button
          className={styles.icon}
          disabled={first}
          onClick={() => moveStep(step.id, -1)}
          title="Move up"
          aria-label={`Move ${name} up`}
        >
          ↑
        </button>
        <button
          className={styles.icon}
          disabled={last}
          onClick={() => moveStep(step.id, 1)}
          title="Move down"
          aria-label={`Move ${name} down`}
        >
          ↓
        </button>
        <button
          className={styles.icon}
          onClick={() => removeStep(step.id)}
          title="Remove"
          aria-label={`Remove ${name}`}
        >
          ✕
        </button>
      </div>
      {def && step.enabled && (
        <div className={styles.params}>
          {def.params.map((p) => (
            <ParamField
              key={p.key}
              spec={p}
              value={step.params[p.key] ?? p.default}
              onChange={(v) => updateStep(step.id, { params: { [p.key]: v } })}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ParamField({
  spec,
  value,
  onChange,
}: {
  spec: ParamSpec;
  value: number | string | boolean;
  onChange: (v: number | string | boolean) => void;
}) {
  if (spec.type === 'boolean')
    return (
      <Row label="">
        <label className={styles.check} title={spec.help}>
          <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
          {spec.label}
        </label>
      </Row>
    );
  if (spec.type === 'select')
    return (
      <Row label={spec.label}>
        <select
          aria-label={spec.label}
          title={spec.help}
          value={String(value)}
          onChange={(e) => onChange(e.target.value)}
        >
          {spec.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Row>
    );
  return (
    <Row label={spec.label}>
      <NumberField
        value={typeof value === 'number' ? value : spec.default}
        min={spec.min}
        max={spec.max}
        step={spec.step}
        suffix={spec.suffix}
        title={spec.help}
        onChange={(v) => onChange(spec.integer ? Math.round(v) : v)}
      />
    </Row>
  );
}
