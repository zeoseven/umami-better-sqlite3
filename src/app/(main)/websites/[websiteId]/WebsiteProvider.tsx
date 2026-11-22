'use client';
import { createContext, ReactNode, useEffect } from 'react';
import { useMessages, useModified, useWebsite } from '@/components/hooks';
import { Flexbox, Loading } from 'react-basics';

export const WebsiteContext = createContext(null);

export function WebsiteProvider({
  websiteId,
  children,
}: {
  websiteId: string;
  children: ReactNode;
}) {
  const { formatMessage, labels } = useMessages();
  const { modified } = useModified(`website:${websiteId}`);
  const { data: website, isFetching, isLoading, error, refetch } = useWebsite(websiteId);

  useEffect(() => {
    if (modified) {
      refetch();
    }
  }, [modified]);

  if (isFetching && isLoading) {
    return <Loading position="page" />;
  }

  if (error || !website) {
    return (
      <Flexbox alignItems="center" justifyContent="center" flex={1} style={{ minHeight: 400 }}>
        <h1>{formatMessage(labels.pageNotFound)}</h1>
      </Flexbox>
    );
  }

  return <WebsiteContext.Provider value={website}>{children}</WebsiteContext.Provider>;
}

export default WebsiteProvider;
