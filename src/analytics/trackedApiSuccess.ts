export async function runWithCompletionEvent<T>(
  operation: () => Promise<T>,
  recordCompletion: () => void,
): Promise<T> {
  const result = await operation();
  recordCompletion();
  return result;
}
