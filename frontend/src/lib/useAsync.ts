import { useCallback, useEffect, useRef, useState } from "react";
import { friendlyError } from "./errors";

/** Runs an async loader; exposes loading / friendly error / data and a reload. Stale responses are ignored. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  const run = useCallback(() => {
    const id = ++seq.current;
    setLoading(true); setError("");
    fn()
      .then((r) => { if (id === seq.current) setData(r); })
      .catch((e: unknown) => { if (id === seq.current) setError(friendlyError(e)); })
      .finally(() => { if (id === seq.current) setLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { run(); return () => { seq.current++; }; }, [run]);
  return { data, error, loading, reload: run, setData };
}
