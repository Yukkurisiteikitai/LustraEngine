'use client';

import styles from './DomainSelector.module.css';
import type { Domain } from '@/types';

const DOMAINS: { value: Domain; label: string }[] = [
  { value: 'WORK', label: '仕事' },
  { value: 'RELATIONSHIP', label: '人間関係' },
  { value: 'HEALTH', label: '健康' },
  { value: 'MONEY', label: 'お金' },
  { value: 'SELF', label: '自分' },
];

interface DomainSelectorProps {
  value?: Domain;
  onChange: (domain: Domain) => void;
  error?: string;
}

export default function DomainSelector({ value, onChange, error }: DomainSelectorProps) {
  return (
    <fieldset className={styles.wrapper} aria-describedby={error ? 'domain-error' : undefined}>
      <legend className={styles.legend}>領域</legend>
      <div className={styles.chips}>
        {DOMAINS.map((domain) => {
          const isActive = value === domain.value;
          return (
            <button
              key={domain.value}
              type="button"
              className={`${styles.chip} ${isActive ? styles.active : ''}`}
              onClick={() => onChange(domain.value)}
              aria-pressed={isActive}
            >
              {domain.label}
            </button>
          );
        })}
      </div>
      {error ? (
        <p className={styles.error} id="domain-error" role="alert">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
