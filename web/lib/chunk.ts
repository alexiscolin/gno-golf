// A screen's code split off (its own chunk), fetched once: prefetch() for each
// screen with a door to it, at most one fetch, and none again once it failed
// (no retry on every screen change while offline); load() for the screen
// itself, opened: it asks again after a failure. value() once it is in.

export function chunk<T>(get: () => Promise<T>) {
  let pending: Promise<T> | null = null, value: T | undefined, failed = false;
  const start = () =>
    (pending = get().then(
      (v) => ((value = v), (pending = null), v),
      (e: unknown) => {
        failed = true;
        pending = null;
        throw e;
      },
    ));
  return {
    prefetch: () => void (value === undefined && !pending && !failed && start().catch(() => {})),
    load: () => (value !== undefined ? Promise.resolve(value) : pending || start()),
    value: () => value,
  };
}
