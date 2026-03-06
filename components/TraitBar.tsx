import styles from './TraitBar.module.css';

interface TraitBarProps {
  name: string;
  label: string;
  score: number; // 0-1
}

export default function TraitBar({ name, label, score }: TraitBarProps) {
  const pct = Math.round(score * 100);

  return (
    <div className={styles.row} aria-label={`${label}: ${pct}%`}>
      <span className={styles.label}>{label}</span>
      <div className={styles.track}>
        <div
          className={styles.fill}
          style={{ width: `${pct}%` }}
          data-trait={name}
        />
      </div>
      <span className={styles.pct}>{pct}%</span>
    </div>
  );
}
