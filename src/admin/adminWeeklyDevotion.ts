import type {
  AdminWeeklyDevotion,
  AdminWeeklyDevotionAdapter,
  AdminWeeklyDevotionExport,
  AdminWeeklyDevotionRequest,
} from '../api/adminWeeklyDevotionApi';

type SelectionResult =
  | {data: AdminWeeklyDevotion; status: 'applied'}
  | {status: 'stale'};

type CacheEntry = {
  data?: AdminWeeklyDevotion;
  promise?: Promise<AdminWeeklyDevotion>;
};

export class AdminWeeklyDevotionCoordinator {
  private readonly adapter: AdminWeeklyDevotionAdapter;
  private readonly cache = new Map<string, CacheEntry>();
  private selectionSequence = 0;

  constructor(adapter: AdminWeeklyDevotionAdapter) {
    this.adapter = adapter;
  }

  load(request: AdminWeeklyDevotionRequest) {
    const key = createCacheKey(request);
    const existing = this.cache.get(key);
    if (existing?.data) {
      return Promise.resolve(existing.data);
    }
    if (existing?.promise) {
      return existing.promise;
    }

    const promise = this.adapter.fetchWeek(request).then(
      (data) => {
        if (this.cache.get(key)?.promise === promise) {
          this.cache.set(key, {data});
        }
        return data;
      },
      (error: unknown) => {
        if (this.cache.get(key)?.promise === promise) {
          this.cache.delete(key);
        }
        throw error;
      },
    );
    this.cache.set(key, {promise});
    return promise;
  }

  async select(
    request: AdminWeeklyDevotionRequest,
    latestWeekStartDate: string,
    onPrefetchError?: (error: unknown) => void,
  ): Promise<SelectionResult> {
    const sequence = ++this.selectionSequence;
    let data: AdminWeeklyDevotion;
    try {
      data = await this.load(request);
    } catch (error) {
      if (sequence !== this.selectionSequence) {
        return {status: 'stale'};
      }
      throw error;
    }

    if (sequence !== this.selectionSequence) {
      return {status: 'stale'};
    }

    const adjacentWeeks =
      request.weekStartDate === latestWeekStartDate
        ? [moveAdminWeek(request.weekStartDate, -1)]
        : [
            moveAdminWeek(request.weekStartDate, -1),
            moveAdminWeek(request.weekStartDate, 1),
          ];
    for (const weekStartDate of adjacentWeeks) {
      void this.load({...request, weekStartDate}).catch((error: unknown) => {
        onPrefetchError?.(error);
      });
    }

    return {data, status: 'applied'};
  }

  peek(request: AdminWeeklyDevotionRequest) {
    return this.cache.get(createCacheKey(request))?.data;
  }

  invalidate(request: AdminWeeklyDevotionRequest) {
    this.cache.delete(createCacheKey(request));
  }
}

export class AdminWeeklyDevotionExportGate {
  private readonly exportWeek: (
    request: AdminWeeklyDevotionRequest,
  ) => Promise<AdminWeeklyDevotionExport>;
  private inFlight: Promise<AdminWeeklyDevotionExport> | null = null;

  constructor(
    exportWeek: (
      request: AdminWeeklyDevotionRequest,
    ) => Promise<AdminWeeklyDevotionExport>,
  ) {
    this.exportWeek = exportWeek;
  }

  run(request: AdminWeeklyDevotionRequest) {
    if (this.inFlight) {
      return this.inFlight;
    }

    const promise = this.exportWeek(request).finally(() => {
      if (this.inFlight === promise) {
        this.inFlight = null;
      }
    });
    this.inFlight = promise;
    return promise;
  }
}

export function getAdminWeekStartDate(date: Date) {
  const weekStart = new Date(date);
  weekStart.setHours(12, 0, 0, 0);
  const day = weekStart.getDay();
  weekStart.setDate(weekStart.getDate() + (day === 0 ? -6 : 1 - day));
  return formatLocalDate(weekStart);
}

export function moveAdminWeek(value: string, direction: -1 | 1) {
  const date = parseLocalDate(value);
  date.setDate(date.getDate() + direction * 7);
  return formatLocalDate(date);
}

export function formatAdminWeekRange(value: string) {
  const start = parseLocalDate(value);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);

  return `${formatFullDate(start)} - ${formatMonthDay(end)}`;
}

function createCacheKey(request: AdminWeeklyDevotionRequest) {
  return `${request.campusId}:${request.authGeneration}:${request.weekStartDate}`;
}

function parseLocalDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) {
    throw new Error('Invalid week date');
  }
  return date;
}

function formatLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatFullDate(date: Date) {
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

function formatMonthDay(date: Date) {
  return `${String(date.getMonth() + 1).padStart(2, '0')}.${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}
