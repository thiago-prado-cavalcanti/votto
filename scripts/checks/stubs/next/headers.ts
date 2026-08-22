const jar = (globalThis as Record<string, unknown>).__cookieJar as Map<string, string>;
export async function cookies() {
  return {
    get: (k: string) => (jar.has(k) ? { value: jar.get(k) } : undefined),
    set: (k: string, v: string) => { jar.set(k, v); },
    delete: (k: string) => { jar.delete(k); },
  };
}
