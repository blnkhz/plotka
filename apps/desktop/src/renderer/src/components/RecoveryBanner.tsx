import { discardRecovery, restoreRecovery } from '../lib/autosave';
import { useStore } from '../store';
import styles from './RecoveryBanner.module.css';

/** PROJ-4: offers back unsaved work from a run that didn't close cleanly. */
export function RecoveryBanner() {
  const recovery = useStore((s) => s.recovery);
  if (!recovery) return null;
  const when = new Date(recovery.savedAt).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  return (
    <div className={styles.banner} role="alert">
      <span>
        Plotter Studio closed with unsaved changes to <strong>{recovery.name}</strong> ({when}).
      </span>
      <button className={styles.primary} onClick={() => void restoreRecovery()}>
        Restore
      </button>
      <button onClick={() => void discardRecovery()}>Discard</button>
    </div>
  );
}
