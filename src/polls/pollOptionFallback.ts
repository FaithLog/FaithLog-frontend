export async function runPollOptionFallback<Request, Result>(
  requests: Request[],
  isCurrent: () => boolean,
  send: (request: Request) => Promise<Result>,
  canRetry: (error: unknown) => boolean,
  staleError: () => Error,
) {
  let lastError: unknown = null;
  for (const request of requests) {
    if (!isCurrent()) throw staleError();
    try {
      return await send(request);
    } catch (error) {
      if (!isCurrent()) throw staleError();
      if (!canRetry(error)) throw error;
      lastError = error;
    }
  }
  throw lastError;
}
