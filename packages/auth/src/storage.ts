/** Where the refresh token lives. Methods may be sync or async. */
export interface StorageAdapter {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
}

export type StorageOption = "local" | "session" | "memory" | StorageAdapter;

export function memoryStorage(): StorageAdapter {
  const items = new Map<string, string>();
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, value);
    },
    removeItem: (key) => {
      items.delete(key);
    },
  };
}

/** Web Storage when the page can use it (Safari can throw on access), else memory. */
export function resolveStorage(option: StorageOption = "local"): {
  adapter: StorageAdapter;
  web: Storage | undefined;
} {
  if (typeof option === "object") return { adapter: option, web: undefined };
  let web: Storage | undefined;
  try {
    web =
      option === "local"
        ? globalThis.localStorage
        : option === "session"
          ? globalThis.sessionStorage
          : undefined;
    // Touch it once: some browsers only throw on first use.
    web?.getItem("exwave");
  } catch {
    web = undefined;
  }
  return { adapter: web ?? memoryStorage(), web };
}
