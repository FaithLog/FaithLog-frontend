const listeners = new Set<() => void>();
let visibleRequests = 0;

export function subscribeToApiProgress(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function isApiProgressVisible() {
  return visibleRequests > 0;
}

/** Track the full request, including authentication refresh and retry. */
export async function withApiProgress<T>(request: () => Promise<T>): Promise<T> {
  let visible = false;
  const timer = setTimeout(() => {
    visible = true;
    visibleRequests++;
    if (visibleRequests === 1) listeners.forEach(listener => listener());
  }, 400);
  try {
    return await request();
  } finally {
    clearTimeout(timer);
    if (visible) {
      visibleRequests--;
      if (visibleRequests === 0) listeners.forEach(listener => listener());
    }
  }
}

