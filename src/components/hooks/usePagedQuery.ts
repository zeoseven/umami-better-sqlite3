import { UseQueryOptions } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { PageResult, PageParams, PagedQueryResult } from '@/lib/types';
import { useApi } from './useApi';
import { useNavigation } from './useNavigation';

export function usePagedQuery<T = any>({
  queryKey,
  queryFn,
  ...options
}: Omit<UseQueryOptions, 'queryFn'> & { queryFn: (params?: object) => any }): PagedQueryResult<T> {
  const { query: queryParams } = useNavigation();
  const [params, setParams] = useState<PageParams>({
    search: '',
    page: +queryParams.page || 1,
  });

  const { useQuery } = useApi();
  const { data, ...query } = useQuery({
    queryKey: [...(Array.isArray(queryKey) ? queryKey : []), params],
    queryFn: () => queryFn(params as any),
    ...options,
  });

  useEffect(() => {
    const page = +queryParams.page || 1;

    setParams(current => (Number(current.page) === page ? current : { ...current, page }));
  }, [queryParams.page]);

  useEffect(() => {
    const result = data as PageResult<any>;

    if (Array.isArray(result?.data) && result.data.length === 0 && Number(params.page) > 1) {
      setParams(current => ({ ...current, page: 1 }));
    }
  }, [data, params.page]);

  return {
    result: data as PageResult<T>,
    query,
    params,
    setParams,
  };
}

export default usePagedQuery;
