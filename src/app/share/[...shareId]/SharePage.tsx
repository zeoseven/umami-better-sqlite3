'use client';
import WebsiteDetailsPage from '../../(main)/websites/[websiteId]/WebsiteDetailsPage';
import { useMessages, useShareToken } from '@/components/hooks';
import Page from '@/components/layout/Page';
import { Flexbox } from 'react-basics';
import Header from './Header';
import Footer from './Footer';
import styles from './SharePage.module.css';
import { WebsiteProvider } from '@/app/(main)/websites/[websiteId]/WebsiteProvider';

export default function SharePage({ shareId }) {
  const { shareToken, isLoading, error } = useShareToken(shareId);
  const { formatMessage, labels } = useMessages();

  if (isLoading) {
    return null;
  }

  if (error || !shareToken?.websiteId) {
    return (
      <div className={styles.container}>
        <Page>
          <Header />
          <Flexbox alignItems="center" justifyContent="center" flex={1} style={{ minHeight: 600 }}>
            <h1>{formatMessage(labels.pageNotFound)}</h1>
          </Flexbox>
          <Footer />
        </Page>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <Page>
        <Header />
        <WebsiteProvider websiteId={shareToken.websiteId}>
          <WebsiteDetailsPage websiteId={shareToken.websiteId} />
        </WebsiteProvider>
        <Footer />
      </Page>
    </div>
  );
}
