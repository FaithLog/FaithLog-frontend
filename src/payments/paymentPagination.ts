export async function findFreshFallbackPage<T>(
  requestedPage: number,
  fetchPage: (page: number) => Promise<T>,
  isEmpty: (data: T) => boolean,
  isCurrent: () => boolean,
) {
  for (let page = Math.max(0, requestedPage - 1); page >= 0; page -= 1) {
    const data = await fetchPage(page);
    if (!isCurrent()) return null;
    if (page === 0 || !isEmpty(data)) return {page, data};
  }
  return null;
}
