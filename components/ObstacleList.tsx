import styles from './ObstacleList.module.css';
import type { ObstacleRecord } from '@/types';

interface ObstacleListProps {
  items: ObstacleRecord[];
}

function domainLabel(domain: ObstacleRecord['domain']) {
  switch (domain) {
    case 'WORK':
      return '仕事';
    case 'RELATIONSHIP':
      return '人間関係';
    case 'HEALTH':
      return '健康';
    case 'MONEY':
      return 'お金';
    case 'SELF':
      return '自分';
    default:
      return domain;
  }
}

export default function ObstacleList({ items }: ObstacleListProps) {
  return (
    <section className={styles.wrapper} aria-label="最近の障害リスト">
      <h3 className={styles.title}>最近の障害</h3>
      <ul className={styles.list}>
        {items.map((item) => (
          <li key={item.id} className={styles.item}>
            <p className={styles.desc}>{item.description}</p>
            <p className={styles.meta}>
              {item.date} ・ {domainLabel(item.domain)} ・ ストレス {item.stressLevel} ・
              {item.actionResult === 'CONFRONTED' ? '向き合った' : '回避した'}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
