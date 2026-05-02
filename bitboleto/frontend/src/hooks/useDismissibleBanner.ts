import { useCallback, useState } from 'react';

interface Options {
  reappearAfterDays?: number;
}

const STORAGE_PREFIX = 'pagdepix:dismissed:';

export function useDismissibleBanner(key: string, options: Options = {}) {
  const storageKey = `${STORAGE_PREFIX}${key}`;

  const isDismissed = (): boolean => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return false;
      const { dismissedAt, reappearAfterDays: days } = JSON.parse(raw);
      if (!days) return true;
      const elapsed = (Date.now() - dismissedAt) / 86400000;
      return elapsed < days;
    } catch {
      return false;
    }
  };

  const [dismissed, setDismissed] = useState<boolean>(isDismissed);

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          dismissedAt: Date.now(),
          reappearAfterDays: options.reappearAfterDays ?? null,
        }),
      );
    } catch {}
    setDismissed(true);
  }, [storageKey, options.reappearAfterDays]);

  return { dismissed, dismiss };
}
