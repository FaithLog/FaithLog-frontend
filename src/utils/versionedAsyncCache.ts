type Entry<V> = {epoch: number; value: V};
type Flight<V> = {epoch: number; promise: Promise<V>};

export class VersionedAsyncCache<K, V> {
  private readonly entries = new Map<K, Entry<V>>();
  private readonly epochs = new Map<K, number>();
  private readonly flights = new Map<K, Flight<V>>();

  get(key: K) {
    return this.entries.get(key)?.value;
  }

  has(key: K) {
    return this.entries.has(key);
  }

  getOrLoad(key: K, loader: () => Promise<V>) {
    const cached = this.get(key);
    if (cached !== undefined) return Promise.resolve(cached);
    const existing = this.flights.get(key);
    if (existing) return existing.promise;

    const epoch = this.epochs.get(key) ?? 0;
    const promise = loader().then((value) => {
      const current = this.flights.get(key);
      if (current?.promise === promise && current.epoch === epoch &&
          (this.epochs.get(key) ?? 0) === epoch) {
        this.entries.set(key, {epoch, value});
        this.flights.delete(key);
      }
      return value;
    }, (error) => {
      if (this.flights.get(key)?.promise === promise) this.flights.delete(key);
      throw error;
    });
    this.flights.set(key, {epoch, promise});
    return promise;
  }

  invalidate(key: K) {
    this.entries.delete(key);
    this.flights.delete(key);
    this.epochs.set(key, (this.epochs.get(key) ?? 0) + 1);
  }
}
