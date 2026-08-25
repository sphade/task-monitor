import { useSyncExternalStore } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';

/** No-op subscribe: hydration state never changes after the first client render. */
const subscribe = () => () => {};

/**
 * To support static rendering, this value needs to be re-calculated on the
 * client side for web.
 *
 * `useSyncExternalStore` gives us the server/client split directly (false while
 * rendering on the server, true on the client) without calling setState inside
 * an effect, which triggers cascading renders and is rejected by the React
 * Compiler.
 */
export function useColorScheme() {
  const hasHydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

  const colorScheme = useRNColorScheme();

  return hasHydrated ? colorScheme : 'light';
}
