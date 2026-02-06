import { useRef, useCallback, useEffect } from 'react';

/**
 * Returns a debounced version of the given callback.
 * The callback will only execute after `delay` ms of inactivity.
 * Uses a ref for fn so the debounced wrapper is stable across renders.
 */
export function useDebouncedCallback<T extends (...args: never[]) => void>(
  fn: T,
  delay: number
): T {
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return useCallback(
    (...args: Parameters<T>) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => fnRef.current(...args), delay);
    },
    [delay]
  ) as unknown as T;
}
