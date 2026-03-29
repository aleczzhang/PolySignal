import { useState, useEffect, useRef } from 'react';

export interface DomainSuggestion {
  id: string;
  relevanceNote: string;
}

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:3001';
const DEBOUNCE_MS = 800;

export function useDomainSuggestions(role: string, org: string): {
  suggestions: DomainSuggestion[] | null;
  loading: boolean;
} {
  const [suggestions, setSuggestions] = useState<DomainSuggestion[] | null>(null);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // Need both fields with ≥ 2 chars to fire
    if (role.trim().length < 2 || org.trim().length < 2) {
      setSuggestions(null);
      setLoading(false);
      return;
    }

    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(async () => {
      if (abortRef.current) abortRef.current.abort();
      abortRef.current = new AbortController();

      setLoading(true);
      try {
        const res = await fetch(`${API_BASE}/api/domains/suggest`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: role.trim(), org: org.trim() }),
          signal: abortRef.current.signal,
        });
        if (!res.ok) throw new Error('suggest failed');
        const data = await res.json() as { suggestions: DomainSuggestion[] };
        setSuggestions(data.suggestions);
      } catch (err: any) {
        if (err?.name !== 'AbortError') setSuggestions(null);
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [role, org]);

  return { suggestions, loading };
}
