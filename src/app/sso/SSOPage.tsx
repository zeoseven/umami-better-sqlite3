'use client';
import { useEffect } from 'react';
import { Loading } from 'react-basics';
import { useRouter, useSearchParams } from 'next/navigation';
import { setClientAuthToken } from '@/lib/client';

function getSafeRedirect(value: string) {
  try {
    const target = new URL(value, window.location.origin);

    if (target.origin !== window.location.origin) {
      return null;
    }

    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return null;
  }
}

export default function SSOPage() {
  const router = useRouter();
  const search = useSearchParams();
  const url = search.get('url');
  const token = search.get('token');

  useEffect(() => {
    if (!url || !token) {
      return;
    }

    const redirectUrl = getSafeRedirect(url);

    if (!redirectUrl) {
      return;
    }

    setClientAuthToken(token);
    router.push(redirectUrl);
  }, [router, url, token]);

  return <Loading />;
}
