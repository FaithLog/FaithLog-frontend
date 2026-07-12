export async function fetchFreshFallbackPage<T>(
  requestedPage: number,
  fetchPage: (page: number) => Promise<T>,
) {
  const page = Math.max(0, requestedPage - 1);
  return {page, data: await fetchPage(page)};
}
