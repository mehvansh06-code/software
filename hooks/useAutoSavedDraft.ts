import { useEffect, useMemo, useRef, useState } from 'react';

type DraftEnvelope<T> = {
  savedAt: number;
  data: T;
};

interface UseAutoSavedDraftOptions<T> {
  key: string;
  data: T;
  onRestore: (draftData: T) => void;
  enabled?: boolean;
  debounceMs?: number;
  version?: string;
}

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function useAutoSavedDraft<T>({
  key,
  data,
  onRestore,
  enabled = true,
  debounceMs = 700,
  version = '1',
}: UseAutoSavedDraftOptions<T>) {
  const storageKey = useMemo(() => `ei:draft:${key}:v${version}`, [key, version]);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const restoreAttemptedRef = useRef(false);
  const restoringRef = useRef(false);

  useEffect(() => {
    if (!enabled || restoreAttemptedRef.current || !canUseStorage()) return;
    restoreAttemptedRef.current = true;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as DraftEnvelope<T>;
      if (!parsed || typeof parsed !== 'object' || parsed.data == null) return;
      restoringRef.current = true;
      onRestore(parsed.data);
      setLastSavedAt(typeof parsed.savedAt === 'number' ? parsed.savedAt : null);
    } catch (error) {
      console.warn(`Failed to restore draft for ${storageKey}`, error);
    } finally {
      queueMicrotask(() => {
        restoringRef.current = false;
      });
    }
  }, [enabled, storageKey, onRestore]);

  useEffect(() => {
    if (!enabled || !canUseStorage() || !restoreAttemptedRef.current || restoringRef.current) return;
    const handle = window.setTimeout(() => {
      try {
        const envelope: DraftEnvelope<T> = {
          savedAt: Date.now(),
          data,
        };
        window.localStorage.setItem(storageKey, JSON.stringify(envelope));
        setLastSavedAt(envelope.savedAt);
      } catch (error) {
        console.warn(`Failed to save draft for ${storageKey}`, error);
      }
    }, debounceMs);

    return () => window.clearTimeout(handle);
  }, [enabled, data, debounceMs, storageKey]);

  const clearDraft = () => {
    if (!canUseStorage()) return;
    window.localStorage.removeItem(storageKey);
    setLastSavedAt(null);
  };

  return { clearDraft, lastSavedAt };
}

