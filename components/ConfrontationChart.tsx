import styles from './ConfrontationChart.module.css';

interface ConfrontationChartProps {
  rate: number;
}

export default function ConfrontationChart({ rate }: ConfrontationChartProps) {
  const clampedRate = Math.max(0, Math.min(100, rate));
  const width = (clampedRate / 100) * 260;

  return (
    <section className={styles.card} aria-label="向き合い率チャート">
      <h3 className={styles.title}>向き合い率</h3>
      <svg viewBox="0 0 300 80" className={styles.svg} role="img" aria-label={`向き合い率 ${clampedRate}%`}>
        <rect x="20" y="28" width="260" height="18" rx="9" fill="#e5e7eb" />
        <rect x="20" y="28" width={width} height="18" rx="9" fill="#2563eb" />
      </svg>
      <p className={styles.value}>{clampedRate}%</p>
    </section>
  );
}
