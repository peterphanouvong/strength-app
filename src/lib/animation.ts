import { useEffect, useState } from 'react';

// Entrance animations should greet the user once per app load, not replay on
// every navigation. Module-level so it resets only on a full page (re)load.
const played = new Set<string>();

/** True the first time a page type mounts this app session, false afterwards. */
export function useEntranceOnce(key: string): boolean {
  const [shouldAnimate] = useState(() => !played.has(key));
  useEffect(() => {
    played.add(key);
  }, [key]);
  return shouldAnimate;
}
