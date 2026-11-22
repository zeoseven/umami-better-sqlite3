import { useCallback } from 'react';
import * as reactQuery from '@tanstack/react-query';
import { getClientAuthToken } from '@/lib/client';
import { SHARE_TOKEN_HEADER } from '@/lib/constants';
import { httpGet, httpPost, httpPut, httpDelete, FetchResponse } from '@/lib/fetch';
import useStore from '@/store/app';

const selector = (state: { shareToken: { token?: string } }) => state.shareToken;

async function handleResponse(res: FetchResponse): Promise<any> {
  if (!res.ok) {
    return Promise.reject(new Error(res.error?.error || res.error || 'Unexpected error.'));
  }
  return Promise.resolve(res.data);
}

function handleError(err: Error | string) {
  return Promise.reject((err as Error)?.message || err || null);
}

export function useApi() {
  const shareToken = useStore(selector);

  const basePath = process.env.basePath;

  const getUrl = useCallback(
    (url: string) => {
      return url.startsWith('http') ? url : `${basePath || ''}/api${url}`;
    },
    [basePath],
  );

  const getHeaders = useCallback(
    (headers: any = {}) => {
      return {
        authorization: `Bearer ${getClientAuthToken()}`,
        [SHARE_TOKEN_HEADER]: shareToken?.token,
        ...headers,
      };
    },
    [shareToken],
  );

  return {
    get: useCallback(
      async (url: string, params: object = {}, headers: object = {}) => {
        return httpGet(getUrl(url), params, getHeaders(headers))
          .then(handleResponse)
          .catch(handleError);
      },
      [getUrl, getHeaders],
    ),

    post: useCallback(
      async (url: string, params: object = {}, headers: object = {}) => {
        return httpPost(getUrl(url), params, getHeaders(headers))
          .then(handleResponse)
          .catch(handleError);
      },
      [getUrl, getHeaders],
    ),

    put: useCallback(
      async (url: string, params: object = {}, headers: object = {}) => {
        return httpPut(getUrl(url), params, getHeaders(headers))
          .then(handleResponse)
          .catch(handleError);
      },
      [getUrl, getHeaders],
    ),

    del: useCallback(
      async (url: string, params: object = {}, headers: object = {}) => {
        return httpDelete(getUrl(url), params, getHeaders(headers))
          .then(handleResponse)
          .catch(handleError);
      },
      [getUrl, getHeaders],
    ),
    ...reactQuery,
  };
}

export default useApi;
