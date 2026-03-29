// ── Market types ──────────────────────────────────────────────────────────────

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
}

// Backend-compatible scored market (extends EnrichedMarket with composite score)
export interface ScoredMarket extends EnrichedMarket {
  score: number;   // 0-1 composite signal strength
}

// Legacy type kept for backward compat with old pipeline architecture
export interface ScreenedMarket extends EnrichedMarket {
  vwScore: number;
  regime: 'stable' | 'transitioning' | 'stressed' | 'insufficient_data';
  transitionDay: number | null;
  stressedSince: number | null;
  passesScreening: boolean;
}

export interface LagResult {
  marketIdA: string; marketIdB: string;
  bestLag: number; bestR: number;
  lagProfile: { lag: number; r: number }[];
}

export interface LagMatrix {
  pairs: LagResult[];
  dominantLeader: string | null;
  avgBestR: number;
  propagationSummary: string;
}

export interface CausalAnalysis {
  causalMechanism: string; propagationChain: string;
  confoundingRisk: 'none' | 'low' | 'medium' | 'high';
  confoundingExplanation: string;
  rejectedMarketIds: string[]; rejectionReasons: Record<string, string>;
  timeDecayNote: string; signalConfirmed: boolean;
  confidenceScore: number; confidenceReasoning: string;
  precedentsIntegrated: string; domainKnowledgeIntegrated: string;
}

export interface MathAnalysis {
  correlationDecayAssessment: string;
  adjustedCorrelationConfidence: number;
  jointPosteriorProbability: number;
  jointPosteriorReasoning: string;
  confidenceIntervalLow: number; confidenceIntervalHigh: number;
  confidenceIntervalReasoning: string;
  derivedDecayWeights: Record<string, number>;
  decayDerivationReasoning: string;
  mathSignalStrength: number;
  effectiveActionWindowDays: number;
}

export interface ActionDirective {
  actor: string; specificRole: string; action: string;
  legalMechanism: string; geography: string;
  timeWindow: string; effectiveWindowDays: number;
  reasoning: string; confidenceScore: number;
  confidenceIntervalLow: number; confidenceIntervalHigh: number;
  jointPosteriorProbability: number; avgDecayWeight: number;
  urgency: 'immediate' | 'urgent' | 'planned';
}

export interface OrchestrationAudit {
  agentsCalledInOrder: string[];
  agentTrustDecisions: { agent: string; trusted: boolean; reasoning: string }[];
  unexpectedFindings: string[];
  gapsIdentified: string[]; gapsFilled: string[]; gapsUnfilled: string[];
  orchestrationConfidence: number; wouldChangeWith: string[];
}

// ── Pipeline state ────────────────────────────────────────────────────────────

export type AgentId =
  | 'MarketFetcherAgent'
  | 'StatisticalScreenerAgent'
  | 'K2ThinkV2-Orchestrator'
  | 'ContradictionDetectorAgent'
  | 'HistoricalPrecedentAgent'
  | 'K2ThinkV2-CausalReasoning'
  | 'K2ThinkV2-MathReasoning'
  | 'K2ThinkV2-ActionDirective'
  | 'K2ThinkV2-MetaReasoning'
  | 'K2ThinkV2-ReportWriter';

export type AgentStatus = 'idle' | 'running' | 'streaming' | 'complete' | 'failed' | 'retry';

export interface AgentState {
  id: AgentId;
  status: AgentStatus;
  data?: unknown;
  partialText?: string;
  k2Decision?: string;
  retryCount?: number;
  message?: string;
  startedAt?: number;
  completedAt?: number;
}

export interface PipelineState {
  running: boolean;
  agents: Record<string, AgentState>;
  k2Decisions: { agent: string; decision: string; timestamp: number }[];
  rejectedClusters: { markets: ScreenedMarket[]; reason: string; avgR: number }[];
  finalStatus: 'confirmed' | 'low_confidence' | 'no_signal' | 'causally_ambiguous' | null;
  fullResult: PipelineFullResult | null;
  error: string | null;
}

export interface PipelineFullResult {
  status: string;
  // Backend-current fields
  selectedMarkets?: ScoredMarket[];
  causalAnalysis?: CausalAnalysis;
  actionDirective?: ActionDirective;
  report?: {
    title: string; executiveSummary: string;
    causalReasoningProse: string; generatedAt: string;
  };
  // Legacy fields (kept for backward compat, may be undefined)
  cluster?: ScreenedMarket[];
  rejectedClusters?: { markets: ScreenedMarket[]; reason: string; avgR: number }[];
  mathAnalysis?: MathAnalysis;
  audit?: OrchestrationAudit;
  [key: string]: unknown;
}

// ── Domain ────────────────────────────────────────────────────────────────────

export type DomainId = 'iran-oil' | 'us-election' | 'fed-rates' | 'crypto';

export interface DomainConfig {
  id: DomainId;
  name: string;
  emoji: string;
  sub: string;
  accentColor: string;  /* data-encoding only */
  volume: string;
}

// ── Sparkline market (mock live data for Tab1) ────────────────────────────────

export interface SparkMarket {
  name: string;
  probability: number;
  delta24h: number;
  probHistory: number[];  /* 30 points */
  source: 'Polymarket' | 'Kalshi';
  color: string;
}

// ── Directive personalization ─────────────────────────────────────────────────

export type OrgGroup = 'gov' | 'fin' | 'ind' | 'res' | 'default';

export interface DirectiveVariant {
  actor: string;
  action: string;       /* {role} placeholder replaced at render */
  mechanism: string;
  geography: string;
  window: string;
  urgency: 'immediate' | 'urgent' | 'planned';
  reasoning: string;
}
