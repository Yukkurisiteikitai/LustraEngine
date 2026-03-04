import styles from './StressChart.module.css';

interface StressChartProps {
  points: number[];
}

export default function StressChart({ points }: StressChartProps) {
  const normalized = points.length > 0 ? points : [3, 3, 3, 3, 3, 3, 3];
  const maxX = 260;
  const maxY = 80;

  const polylinePoints = normalized
    .map((point, index) => {
      const x = (index / Math.max(1, normalized.length - 1)) * maxX + 20;
      const y = maxY - ((point - 1) / 4) * 60 + 10;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <section className={styles.card} aria-label="ストレストレンドチャート">
      <h3 className={styles.title}>ストレストレンド</h3>
      <svg viewBox="0 0 300 100" className={styles.svg} role="img" aria-label="直近のストレス推移">
        <line x1="20" y1="90" x2="280" y2="90" stroke="#d1d5db" strokeWidth="2" />
        <polyline
          fill="none"
          stroke="#9333ea"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={polylinePoints}
        />
      </svg>
    </section>
  );
}
