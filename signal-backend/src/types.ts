export interface EnrichedMarket {
  id: string;
  title: string;
  probability: number;
  volume: number;
  daysToResolution: number;
  decayWeight: number;
  historicalVolatility: number;
  probHistory: number[];
  volumeHistory: number[];
  source: 'polymarket' | 'kalshi';
  isResolved: boolean;
  outcome?: 'yes' | 'no';
}

export interface ScoredMarket extends EnrichedMarket {
  score: number;   // 0–1 composite signal strength
}

export interface CausalAnalysis {
  causalMechanism: string;
  propagationChain: string;
  confidenceScore: number;     // 0–100
  signalConfirmed: boolean;
  keyInsight: string;          // one-sentence decision-maker takeaway
}

export interface ActionDirective {
  actor: string;
  action: string;
  legalMechanism: string;
  geography: string;
  timeWindow: string;
  effectiveWindowDays: number;
  urgency: 'immediate' | 'urgent' | 'planned';
  reasoning: string;
  confidenceScore: number;
  jointPosteriorProbability: number;
  confidenceIntervalLow: number;
  confidenceIntervalHigh: number;
}

export interface ReportContent {
  title: string;
  executiveSummary: string;
  causalReasoningProse: string;
  generatedAt: string;
}

export type PipelineStatus = 'confirmed' | 'low_confidence' | 'no_signal';

export interface PipelineResult {
  domain: string;
  enrichedMarkets: EnrichedMarket[];
  selectedMarkets: ScoredMarket[];
  causalAnalysis: CausalAnalysis | null;
  actionDirective: ActionDirective | null;
  report: ReportContent | null;
  status: PipelineStatus;
  statusReason: string;
}

export interface PipelineEvent {
  step: 'fetch' | 'select' | 'causal' | 'action' | 'report' | 'done' | 'error';
  status: 'running' | 'complete' | 'failed';
  data?: unknown;
  message?: string;
  agentName?: string;
}
