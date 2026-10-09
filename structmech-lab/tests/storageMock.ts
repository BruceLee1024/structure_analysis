/** 模拟浏览器 Storage，避免 Node 原生 localStorage 干扰 jsdom。 */
export function createStorageMock(): Storage {
  const items = new Map<string, string>();
  return {
    get length() { return items.size; },
    clear: () => items.clear(),
    getItem: key => items.get(key) ?? null,
    key: index => [...items.keys()][index] ?? null,
    removeItem: key => { items.delete(key); },
    setItem: (key, value) => { items.set(key, String(value)); },
  };
}
