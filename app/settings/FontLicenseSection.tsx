import styles from './page.module.css';

export default function FontLicenseSection() {
  return (
    <section className={styles.card}>
      <h2 className={styles.title}>フォントライセンス</h2>
      <p className={styles.description}>
        このアプリで使用しているローカル同梱フォントのライセンス情報です。
      </p>

      <div className={styles.licenseList}>
        <article className={styles.licenseItem}>
          <h3 className={styles.licenseTitle}>Playfair Display</h3>
          <p className={styles.licenseText}>
            Copyright 2020 The Playfair Display Project Authors (
            <a
              className={styles.licenseLink}
              href="https://github.com/clagnut/Playfair"
              target="_blank"
              rel="noreferrer"
            >
              https://github.com/clagnut/Playfair
            </a>
            )
          </p>
          <p className={styles.licenseText}>
            Licensed under the SIL Open Font License, Version 1.1 (
            <a
              className={styles.licenseLink}
              href="http://scripts.sil.org/OFL"
              target="_blank"
              rel="noreferrer"
            >
              http://scripts.sil.org/OFL
            </a>
            )
          </p>
        </article>

        <article className={styles.licenseItem}>
          <h3 className={styles.licenseTitle}>Outfit</h3>
          <p className={styles.licenseText}>
            Copyright 2021 The Outfit Project Authors (
            <a
              className={styles.licenseLink}
              href="https://github.com/Outfitio/Outfit-Font"
              target="_blank"
              rel="noreferrer"
            >
              https://github.com/Outfitio/Outfit-Font
            </a>
            )
          </p>
          <p className={styles.licenseText}>
            Licensed under the SIL Open Font License, Version 1.1 (
            <a
              className={styles.licenseLink}
              href="http://scripts.sil.org/OFL"
              target="_blank"
              rel="noreferrer"
            >
              http://scripts.sil.org/OFL
            </a>
            )
          </p>
        </article>
      </div>
    </section>
  );
}
