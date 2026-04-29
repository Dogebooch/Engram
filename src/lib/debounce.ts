export type DebouncedFn<TArgs extends unknown[]> = ((...args: TArgs) => void) & {
  cancel: () => void;
  flush: () => void;
};

export function debounce<TArgs extends unknown[]>(
  fn: (...args: TArgs) => void,
  waitMs: number,
): DebouncedFn<TArgs> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingArgs: TArgs | null = null;

  const debounced = ((...args: TArgs) => {
    pendingArgs = args;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      const a = pendingArgs;
      pendingArgs = null;
      if (a) fn(...a);
    }, waitMs);
  }) as DebouncedFn<TArgs>;

  debounced.cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    pendingArgs = null;
  };

  debounced.flush = () => {
    if (timer && pendingArgs) {
      clearTimeout(timer);
      timer = null;
      const a = pendingArgs;
      pendingArgs = null;
      fn(...a);
    }
  };

  return debounced;
}
