import { DEFAULT_PAGE_SIZE } from '@/lib/constants';

export function toDate(value?: string | null): Date | null {
  return value ? new Date(value) : null;
}

export function parseJson(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function escapeLike(value: string) {
  return String(value).replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_');
}

export function sqlIn(values: string[]) {
  return `(${values.map(value => `'${String(value).replaceAll("'", "''")}'`).join(',')})`;
}

export function getPageParams(pageParams: { page?: string | number; pageSize?: string | number } = {}) {
  const { page, pageSize } = pageParams;
  const parsedPage = +page;
  const parsedSize = +pageSize;
  const currentPage = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const size = Number.isFinite(parsedSize) && parsedSize !== 0 ? parsedSize : DEFAULT_PAGE_SIZE;

  return {
    page: currentPage,
    pageSize: size,
    offset: size > 0 ? size * (currentPage - 1) : 0,
    limit: size > 0 ? size : -1,
  };
}

export function getOrderBy(
  orderBy: string | undefined,
  allowed: Record<string, string>,
  sortDescending = false,
) {
  if (!orderBy) {
    return '';
  }

  const column = allowed[orderBy] ?? (allowed['*'] === '*' ? orderBy : null);

  if (!column) {
    return '';
  }

  return `order by ${column} ${sortDescending ? 'desc' : 'asc'}`;
}
