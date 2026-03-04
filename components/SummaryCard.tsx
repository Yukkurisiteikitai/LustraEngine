import styles from './SummaryCard.module.css';

interface SummaryCardProps {
  title: string;
  value: string;
  note?: string;
}

export default function SummaryCard({ title, value, note }: SummaryCardProps) {
  return (
    <article className={styles.card}>
      <h3 className={styles.title}>{title}</h3>
      <p className={styles.value}>{value}</p>
      {note ? <p className={styles.note}>{note}</p> : null}
    </article>
  );
}
