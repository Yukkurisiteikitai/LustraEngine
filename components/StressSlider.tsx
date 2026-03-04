'use client';

import styles from './StressSlider.module.css';

interface StressSliderProps {
  value: number;
  onChange: (value: number) => void;
}

export default function StressSlider({ value, onChange }: StressSliderProps) {
  return (
    <div className={styles.wrapper}>
      <label className={styles.label} htmlFor="stressLevel">
        ストレスレベル: <strong>{value}</strong>
      </label>
      <input
        id="stressLevel"
        name="stressLevel"
        type="range"
        min={1}
        max={5}
        step={1}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className={styles.slider}
      />
      <div className={styles.scale} aria-hidden>
        <span>1</span>
        <span>2</span>
        <span>3</span>
        <span>4</span>
        <span>5</span>
      </div>
    </div>
  );
}
