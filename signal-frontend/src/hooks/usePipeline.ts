import { useReducer, useCallback, useRef } from 'react';
import type { PipelineState, AgentId, AgentState, ScreenedMarket, PipelineFullResult } from '../types';

const STEP_TO_AGENT: Record<string, AgentId> = {
  fetch:        'MarketFetcherAgent',
  screen:       'StatisticalScreenerAgent',
  cluster:      'K2ThinkV2-Orchestrator',
  contradiction:'ContradictionDetectorAgent',
  precedent:    'HistoricalPrecedentAgent',
  causal:       'K2ThinkV2-CausalReasoning',
  math:         'K2ThinkV2-MathReasoning',
  action:       'K2ThinkV2-ActionDirective',
  audit:        'K2ThinkV2-MetaReasoning',
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
      return { ...state, agents: { ...state.agents, [action.agentId]: { ...prev, ...action.patch } as AgentState } };
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

  const run = useCallback((domain: string, useCached = false) => {
    esRef.current?.close();
    dispatch({ type: 'START' });

    const url = `/api/pipeline?domain=${encodeURIComponent(domain)}${useCached ? '&cached=true' : ''}`;
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

  return { state, run, reset };
}
