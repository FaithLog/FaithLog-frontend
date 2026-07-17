export const DEFAULT_PAGE_SIZE = 10;

export type PaginationMetadata = {
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
};

export function hasNextPage(metadata: Pick<PaginationMetadata, 'page' | 'totalPages'>) {
  return metadata.page + 1 < metadata.totalPages;
}
