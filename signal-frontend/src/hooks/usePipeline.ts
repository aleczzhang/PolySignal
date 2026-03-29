import { useReducer, useCallback, useRef } from 'react';
import type { PipelineState, AgentId, AgentState, ScreenedMarket, PipelineFullResult } from '../types';

const STEP_TO_AGENT: Record<string, AgentId> = {
  fetch_poly:   'PolymarketFetchAgent',
  fetch_kalshi: 'KalshiFetchAgent',
  select:       'MarketSelectorAgent',
  stat:         'StatisticalScreenerAgent',
  precedent:    'HistoricalPrecedentAgent',
  causal:       'K2ThinkV2-CausalReasoning',
  action:       'K2ThinkV2-ActionDirective',
  report:       'K2ThinkV2-ReportWriter',
};

const INITIAL: PipelineState = {
  running: false, agents: {}, k2Decisions: [],
  rejectedClusters: [], finalStatus: null, fullResult: null, error: null,
};

type Action =
  | { type: 'RESET' }
  | { type: 'START' }
  | { type: 'AGENT_UPDATE'; agentId: string; patch: Partial<AgentState> }
  | { type: 'ADD_K2'; agent: string; decision: string }
  | { type: 'SET_REJECTED'; clusters: { markets: ScreenedMarket[]; reason: string; avgR: number }[] }
  | { type: 'DONE'; status: PipelineState['finalStatus']; result: PipelineFullResult }
  | { type: 'ERROR'; error: string };

function reducer(state: PipelineState, action: Action): PipelineState {
  switch (action.type) {
    case 'RESET': return { ...INITIAL };
    case 'START': return { ...INITIAL, running: true };
    case 'AGENT_UPDATE': {
      const prev = state.agents[action.agentId];
      const patch = action.patch;
      // When transitioning to complete, preserve partialText so reasoning stays visible
      const merged = (patch.status === 'complete' && patch.partialText === undefined && prev?.partialText)
        ? { ...prev, ...patch, partialText: prev.partialText }
        : { ...prev, ...patch };
      return { ...state, agents: { ...state.agents, [action.agentId]: merged as AgentState } };
    }
    case 'ADD_K2':
      return { ...state, k2Decisions: [...state.k2Decisions, { agent: action.agent, decision: action.decision, timestamp: Date.now() }] };
    case 'SET_REJECTED':
      return { ...state, rejectedClusters: action.clusters };
    case 'DONE':
      return { ...state, running: false, finalStatus: action.status, fullResult: action.result, error: null };
    case 'ERROR':
      return { ...state, running: false, error: action.error };
    default: return state;
  }
}

export function usePipeline() {
  const [state, dispatch] = useReducer(reducer, INITIAL);
  const esRef = useRef<EventSource | null>(null);

  const run = useCallback((domain: string, useCached = false, role = '', org = '') => {
    esRef.current?.close();
    dispatch({ type: 'START' });

    const url = `/api/pipeline?domain=${encodeURIComponent(domain)}${useCached ? '&cached=true' : ''}${role ? `&role=${encodeURIComponent(role)}` : ''}${org ? `&org=${encodeURIComponent(org)}` : ''}`;
    const es = new EventSource(url);
    esRef.current = es;

    es.onmessage = (e: MessageEvent) => {
      let event: Record<string, unknown>;
      try { event = JSON.parse(e.data as string); } catch { return; }

      const step   = event.step   as string | undefined;
      const status = event.status as string | undefined;
      const data   = event.data   as Record<string, unknown> | undefined;

      if (step === 'done') {
        es.close();
        const result = (data ?? {}) as PipelineFullResult;
        dispatch({ type: 'DONE', status: (result.status as PipelineState['finalStatus']) ?? 'confirmed', result });
        return;
      }
      if (step === 'error') {
        es.close();
        dispatch({ type: 'ERROR', error: (event.message as string) ?? 'Pipeline error' });
        return;
      }
      if (!step) return;

      const agentId = (event.agentName as string) ?? STEP_TO_AGENT[step] ?? step;
      const now = Date.now();
      const partialText = status === 'streaming' ? (data?.partial as string | undefined) : undefined;

      dispatch({
        type: 'AGENT_UPDATE', agentId,
        patch: {
          id: agentId as AgentId,
          status: (status ?? 'running') as AgentState['status'],
          data: status !== 'streaming' ? data : undefined,
          partialText,
          k2Decision:  (event.k2Decision  as string) ?? undefined,
          retryCount:  (event.retryCount  as number) ?? undefined,
          message:     (event.message     as string) ?? undefined,
          startedAt:   status === 'running'  ? now : undefined,
          completedAt: status === 'complete' ? now : undefined,
        },
      });

      if (event.k2Decision) dispatch({ type: 'ADD_K2', agent: agentId, decision: event.k2Decision as string });

      const rc = data?.rejectedClusters as { markets: ScreenedMarket[]; reason: string; avgR: number }[] | undefined;
      if (rc?.length) dispatch({ type: 'SET_REJECTED', clusters: rc });
    };

    es.onerror = () => { es.close(); dispatch({ type: 'ERROR', error: 'Connection lost' }); };
  }, []);

  const reset = useCallback(() => { esRef.current?.close(); dispatch({ type: 'RESET' }); }, []);

  // Demo mode — simulates the full pipeline locally, no backend call
  const runDemo = useCallback((result: PipelineFullResult) => {
    esRef.current?.close();
    dispatch({ type: 'START' });
    console.log('[POLYSIGNAL DEMO] 🚗 Uber driver demo mode active — using hardcoded pipeline data');

    const timers: ReturnType<typeof setTimeout>[] = [];
    const t = (ms: number, fn: () => void) => { timers.push(setTimeout(fn, ms)); };

    const agent = (agentId: string, status: AgentState['status'], extra: Partial<AgentState> = {}) =>
      dispatch({ type: 'AGENT_UPDATE', agentId, patch: { id: agentId as AgentId, status, startedAt: status === 'running' ? Date.now() : undefined, completedAt: status === 'complete' ? Date.now() : undefined, ...extra } });

    // Parallel fetch — Polymarket ~28s, Kalshi ~5s (faster API)
    t(0,     () => { agent('PolymarketFetchAgent', 'running'); agent('KalshiFetchAgent', 'running'); console.log('[POLYSIGNAL DEMO] Fetching Polymarket + Kalshi (simulated)'); });
    t(28000, () => agent('PolymarketFetchAgent', 'complete'));
    t(5000,  () => agent('KalshiFetchAgent', 'complete'));

    // Market selection — ~1.5s (starts after both fetches done, i.e. after Polymarket at 28s)
    t(28300, () => { agent('MarketSelectorAgent', 'running'); console.log('[POLYSIGNAL DEMO] Running market selection (simulated)'); });
    t(29800, () => agent('MarketSelectorAgent', 'complete'));

    // Statistical screener — ~1.5s
    t(30000, () => agent('StatisticalScreenerAgent', 'running'));
    t(31500, () => agent('StatisticalScreenerAgent', 'complete'));

    // K2 parallel: historical precedents + causal reasoning
    t(31900, () => {
      agent('HistoricalPrecedentAgent', 'running');
      agent('K2ThinkV2-CausalReasoning', 'running');
      console.log('[POLYSIGNAL DEMO] K2 Think V2 causal reasoning started (simulated)');
    });
    t(36000, () => agent('HistoricalPrecedentAgent', 'complete'));

    // Stream causal reasoning text in chunks over ~12s
    const causalChunks = [
      'Examining causal chain: Hormuz closure probability → Brent crude futures → US retail gas prices → rideshare driver margin compression…',
      '\n\nHistorical precedent (2019 Saudi Aramco attack): Brent spiked +14% within 72 hours. Retail gas lagged by 3.1 days. Uber driver earnings dropped ~6.8% net in the following 2-week window.',
      '\n\nCurrent signal cluster: Hormuz closure at 67%, Brent > $120 at 54%, gas > $4/gal at 71%. Joint posterior: 0.74. Lead-lag r = 0.81 with 3.2-day propagation delay.',
      '\n\nConfounding risks: OPEC+ emergency response could dampen spike (low probability — OPEC+ meeting not scheduled). SPR release possible but historically slow to deploy.',
      '\n\nDriver-specific impact: at +$0.25/gal average increase, per-mile fuel cost rises by ~$0.04 on a 25 MPG vehicle. For a driver averaging 180 miles/day, that is ~$7.20/day in added cost — ~$50/week.',
      '\n\nSignal confirmed. Causal chain is robust. Action window: 14 days before retail price adjustment fully propagates.',
    ];
    let causalText = '';
    causalChunks.forEach((chunk, i) => {
      t(33000 + i * 1800, () => {
        causalText += chunk;
        agent('K2ThinkV2-CausalReasoning', 'streaming', { partialText: causalText });
      });
    });
    t(33000 + causalChunks.length * 1800 + 800, () => {
      agent('K2ThinkV2-CausalReasoning', 'complete');
      dispatch({ type: 'ADD_K2', agent: 'K2ThinkV2-CausalReasoning', decision: 'Signal confirmed — Hormuz→Brent→gas causal chain active. 14-day action window. Confidence: 0.78.' });
      console.log('[POLYSIGNAL DEMO] K2 causal reasoning complete');
    });

    // Action directive — ~5s after causal completes
    t(45500, () => { agent('K2ThinkV2-ActionDirective', 'running'); console.log('[POLYSIGNAL DEMO] Generating action directive (simulated)'); });
    t(50500, () => {
      agent('K2ThinkV2-ActionDirective', 'complete');
      dispatch({ type: 'ADD_K2', agent: 'K2ThinkV2-ActionDirective', decision: 'Directive: shift to surge zones, lock weekly earnings targets before +$0.20–0.35/gal fuel increase in 14 days.' });
    });

    // Report writer — ~5s
    t(50800, () => agent('K2ThinkV2-ReportWriter', 'running'));
    t(55500, () => agent('K2ThinkV2-ReportWriter', 'complete'));

    // Done
    t(56000, () => {
      dispatch({ type: 'DONE', status: 'confirmed', result });
      console.log('[POLYSIGNAL DEMO] ✅ Pipeline complete — demo result injected');
    });

    return () => timers.forEach(clearTimeout);
  }, []);

  return { state, run, reset, runDemo };
}
