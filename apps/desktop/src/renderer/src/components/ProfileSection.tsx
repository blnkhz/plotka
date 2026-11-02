import { useState } from 'react';
import { BUILTIN_PROFILES, validateProfile, type MachineProfile } from '@plotter-studio/plotter';
import { useProfile } from '../lib/useProcessed';
import { useStore } from '../store';
import { Notice, NumberField, Row, Section } from './controls';
import styles from './MachineTab.module.css';

/**
 * DRIVER-5b: choose the machine, see whether its values are tested, and duplicate any profile to
 * edit your own copy.
 */
export function ProfileSection() {
  const profile = useProfile();
  const custom = useStore((s) => s.customProfiles);
  const connected = useStore((s) => s.plotter?.connection.connected ?? false);
  const duplicate = useStore((s) => s.duplicateProfile);
  const remove = useStore((s) => s.deleteCustomProfile);
  const isCustom = custom.some((p) => p.id === profile.id);
  const tested = BUILTIN_PROFILES.filter((p) => p.tested);
  const untested = BUILTIN_PROFILES.filter((p) => !p.tested);

  return (
    <Section title="Machine" help="machine#machine-profiles">
      <Row label="Profile">
        <select
          aria-label="Machine profile"
          className={styles.port}
          value={profile.id}
          onChange={(e) => useStore.setState({ profileId: e.target.value })}
        >
          <optgroup label="Tested">
            {tested.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </optgroup>
          <optgroup label="Not yet tested">
            {untested.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </optgroup>
          {custom.length > 0 && (
            <optgroup label="Your profiles">
              {custom.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </Row>
      <Row label="Travel">
        <span className={styles.value}>
          {profile.bed.width} × {profile.bed.height} mm
        </span>
      </Row>
      <Row label="Home">Top left of the paper</Row>
      {!profile.tested && !isCustom && (
        <p className={styles.warn}>
          Not yet tested with this app. The values come from the maker’s documentation; plot a small
          test first, and please report how it went.
        </p>
      )}
      {profile.notes && <p className={styles.muted}>{profile.notes}</p>}
      {connected && (
        <p className={styles.muted}>Reconnect after changing the profile so the plotter uses it.</p>
      )}
      <div className={styles.buttons}>
        <button
          onClick={() => duplicate(profile.id)}
          title="Make your own copy of this profile to edit"
        >
          Duplicate to edit
        </button>
        {isCustom && (
          <button onClick={() => remove(profile.id)} title="Delete this profile of yours">
            Delete
          </button>
        )}
      </div>
      {isCustom && <ProfileEditor profile={profile} />}
    </Section>
  );
}

/** Editing one of the user's profiles. Every change is validated before it's saved. */
function ProfileEditor({ profile }: { profile: MachineProfile }) {
  const update = useStore((s) => s.updateCustomProfile);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(profile.name);
  const apply = (next: MachineProfile) => {
    try {
      update(validateProfile(next));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const field = (
    label: string,
    value: number,
    patch: (v: number) => MachineProfile,
    opts: { step?: number; suffix?: string; title?: string } = {},
  ) => (
    <Row label={label}>
      <NumberField
        value={value}
        step={opts.step ?? 1}
        suffix={opts.suffix}
        title={opts.title}
        onChange={(v) => apply(patch(v))}
      />
    </Row>
  );
  const p = profile;
  return (
    <div className={styles.editor}>
      {error && <Notice kind="error">{error}</Notice>}
      <Row label="Name">
        <input
          type="text"
          aria-label="Profile name"
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => apply({ ...p, name })}
        />
      </Row>
      {field('Travel X', p.bed.width, (v) => ({ ...p, bed: { ...p.bed, width: v } }), {
        suffix: 'mm',
      })}
      {field('Travel Y', p.bed.height, (v) => ({ ...p, bed: { ...p.bed, height: v } }), {
        suffix: 'mm',
      })}
      {field('Steps/mm', p.stepsPerMm, (v) => ({ ...p, stepsPerMm: v }), {
        step: 0.1,
        title: 'Motor steps per mm. Calibrate with a 100 mm line (see the hardware checklist).',
      })}
      {field(
        'Max draw',
        p.motion.maxSpeedPenDown,
        (v) => ({ ...p, motion: { ...p.motion, maxSpeedPenDown: v } }),
        {
          suffix: 'mm/s',
          title: 'Speed at 100% with the pen down',
        },
      )}
      {field(
        'Max move',
        p.motion.maxSpeedPenUp,
        (v) => ({ ...p, motion: { ...p.motion, maxSpeedPenUp: v } }),
        {
          suffix: 'mm/s',
          title: 'Speed at 100% with the pen up',
        },
      )}
      {field(
        'Accel draw',
        p.motion.accelPenDown,
        (v) => ({ ...p, motion: { ...p.motion, accelPenDown: v } }),
        {
          step: 10,
          suffix: 'mm/s²',
        },
      )}
      {field(
        'Accel move',
        p.motion.accelPenUp,
        (v) => ({ ...p, motion: { ...p.motion, accelPenUp: v } }),
        {
          step: 10,
          suffix: 'mm/s²',
        },
      )}
      {field(
        'Servo 0%',
        p.servo.min,
        (v) => ({ ...p, servo: { ...p.servo, min: Math.round(v) } }),
        {
          step: 100,
          title: 'Servo pulse for 0% pen height, in EBB units of 83.3 ns',
        },
      )}
      {field(
        'Servo 100%',
        p.servo.max,
        (v) => ({ ...p, servo: { ...p.servo, max: Math.round(v) } }),
        {
          step: 100,
          title: 'Servo pulse for 100% pen height, in EBB units of 83.3 ns',
        },
      )}
      {field(
        'Servo pin',
        p.servo.pin ?? 1,
        (v) => ({ ...p, servo: { ...p.servo, pin: Math.round(v) } }),
        {
          title:
            'EBB port B pin of the pen-lift servo: 1 for a standard servo, 2 for the brushless upgrade',
        },
      )}
      {field('Sweep', p.servo.sweepMs, (v) => ({ ...p, servo: { ...p.servo, sweepMs: v } }), {
        suffix: 'ms',
        title: 'Time for a full 0–100% sweep at full speed',
      })}
    </div>
  );
}
