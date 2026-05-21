import Header from '@/components/Header';
import Footer from '@/components/Footer';
import UserSettingsSection from './UserSettingsSection';
import SettingsClient from './SettingsClient';
import styles from './page.module.css';

const isProduction = process.env.APP_ENV === 'production';
const llmSettingsEnabled = !isProduction;

export default function SettingsPage() {
  return (
    <>
      <Header />
      <main className={styles.main}>
        <div className={styles.stack}>
          <UserSettingsSection />
          <SettingsClient
            isProduction={isProduction}
            llmSettingsEnabled={llmSettingsEnabled}
          />
        </div>
      </main>
      <Footer />
    </>
  );
}
