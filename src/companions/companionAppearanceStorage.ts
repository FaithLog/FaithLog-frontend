export type CompanionAppearanceStorage = {
  load(): Promise<ReadonlySet<string>>;
  save(appearance: ReadonlySet<string>): Promise<void>;
};

const pending = new Map<number, Promise<void>>();

export function companionAppearanceStorage(userId: number): CompanionAppearanceStorage {
  const key = `faithlog.companion.appearance.${userId}`;
  return {
    async load() {
      await pending.get(userId)?.catch(() => undefined);
      const storage = await import('expo-secure-store');
      const raw = await storage.getItemAsync(key);
      try {
        const ids: unknown = raw === null ? [] : JSON.parse(raw);
        return new Set(Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : []);
      } catch {
        return new Set<string>();
      }
    },
    save(appearance) {
      const previous = pending.get(userId) ?? Promise.resolve();
      const write = previous.catch(() => undefined).then(async () => {
        const storage = await import('expo-secure-store');
        await storage.setItemAsync(key, JSON.stringify([...appearance]), {
          keychainAccessible: storage.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
        });
      });
      pending.set(userId, write);
      const clear = () => {
        if (pending.get(userId) === write) pending.delete(userId);
      };
      void write.then(clear, clear);
      return write;
    },
  };
}
