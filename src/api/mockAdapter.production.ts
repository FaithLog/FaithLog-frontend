export async function executeMockRequest(): Promise<Response> {
  throw new Error('Mock API is unavailable in production builds.');
}
