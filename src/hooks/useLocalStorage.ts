import { useCallback, useEffect, useRef, useState } from 'react';

export function useLocalStorage<T>(key: string, initialValue: T) {
  // Callers often pass a fresh literal (e.g. {}) each render — keep it in a ref
  // so readValue stays stable without re-subscribing the storage listener.
  const initialValueRef = useRef(initialValue);
  initialValueRef.current = initialValue;

  const readValue = useCallback((): T => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValueRef.current;
    } catch (error) {
      console.warn(error);
      return initialValueRef.current;
    }
  }, [key]);

  const [storedValue, setStoredValue] = useState<T>(readValue);

  const setValue = (value: T | ((val: T) => T)) => {
    try {
      // Run functional updates against the latest persisted value, not the
      // in-memory state captured at mount — another tab may have written the
      // key since, and updating from a stale snapshot would clobber its data.
      const valueToStore = value instanceof Function ? value(readValue()) : value;
      setStoredValue(valueToStore);
      window.localStorage.setItem(key, JSON.stringify(valueToStore));
    } catch (error) {
      console.warn(error);
    }
  };

  // Keep in-memory state in sync with writes from other tabs.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.storageArea !== window.localStorage) return;
      if (e.key !== null && e.key !== key) return; // null key = storage.clear()
      setStoredValue(readValue());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [key, readValue]);

  return [storedValue, setValue] as const;
}
