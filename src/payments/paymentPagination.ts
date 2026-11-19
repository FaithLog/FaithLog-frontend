export async function findFreshFallbackPage<T>(
  requestedPage: number,
  fetchPage: (page: number) => Promise<T>,
  isEmpty: (data: T) => boolean,
  isCurrent: () => boolean,
  totalPages = requestedPage,
) {
  const lastCandidate = Math.max(0, Math.min(requestedPage, totalPages) - 1);
  for (let page = lastCandidate; page >= 0; page -= 1) {
    const data = await fetchPage(page);
    if (!isCurrent()) return null;
    if (page === 0 || !isEmpty(data)) return {page, data};
  }
  return null;
}
