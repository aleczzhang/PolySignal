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

export interface ScreenedMarket extends EnrichedMarket {
  vwScore: number;
  regime: 'stable' | 'transitioning' | 'stressed' | 'insufficient_data';
  transitionDay: number | null;
  stressedSince: number | null;
  passesScreening: boolean;
}

export interface LagResult {
  marketIdA: string;
  marketIdB: string;
  bestLag: number;
  bestR: number;
  lagProfile: { lag: number; r: number }[];
}

export interface LagMatrix {
  pairs: LagResult[];
  dominantLeader: string | null;
  avgBestR: number;
  propagationSummary: string;
}

export interface ContradictionResult {
  hasContradiction: boolean;
  contradictions: {
    claimA: string;
    claimB: string;
    explanation: string;
    severity: 'blocking' | 'moderate' | 'minor';
  }[];
}

export interface PrecedentResult {
  cases: {
    description: string;
    similarity: number;
    outcome: string;
    relevantLesson: string;
    analogyStrength: 'strong' | 'moderate' | 'weak';
  }[];
  overallRelevance: string;
}

export interface StakeholderResult {
  primaryActor: {
    name: string;
    role: string;
    authority: string;
    legalMechanism: string;
    deploymentLeadTime: string;
  };
  secondaryActors: { name: string; role: string }[];
  institutionalContext: string;
}

export interface ClusterSelectionResult {
  selectedIds: string[];
  causalRanking: string[];
  selectionReasoning: string;
  provisionalIds: string[];
  provisionalReasoning: string;
  agentsToConsult: {
    agent: 'precedent';
    question: string;
    reason: string;
  }[];
}

export interface CausalAnalysis {
  causalMechanism: string;
  propagationChain: string;
  confoundingRisk: 'none' | 'low' | 'medium' | 'high';
  confoundingExplanation: string;
  rejectedMarketIds: string[];
  rejectionReasons: Record<string, string>;
  timeDecayNote: string;
  signalConfirmed: boolean;
  confidenceScore: number;
  confidenceReasoning: string;
  precedentsIntegrated: string;
}

export interface MathAnalysis {
  correlationDecayAssessment: string;
  adjustedCorrelationConfidence: number;
  jointPosteriorProbability: number;
  jointPosteriorReasoning: string;
  confidenceIntervalLow: number;
  confidenceIntervalHigh: number;
  confidenceIntervalReasoning: string;
  derivedDecayWeights: Record<string, number>;
  decayDerivationReasoning: string;
  mathSignalStrength: number;
  effectiveActionWindowDays: number;
}

export interface ActionDirective {
  actor: string;
  specificRole: string;
  action: string;
  legalMechanism: string;
  geography: string;
  timeWindow: string;
  effectiveWindowDays: number;
  reasoning: string;
  confidenceScore: number;
  confidenceIntervalLow: number;
  confidenceIntervalHigh: number;
  jointPosteriorProbability: number;
  avgDecayWeight: number;
  urgency: 'immediate' | 'urgent' | 'planned';
}

export interface OrchestrationAudit {
  agentsCalledInOrder: string[];
  agentTrustDecisions: { agent: string; trusted: boolean; reasoning: string }[];
  unexpectedFindings: string[];
  gapsIdentified: string[];
  gapsFilled: string[];
  gapsUnfilled: string[];
  orchestrationConfidence: number;
  wouldChangeWith: string[];
}

export type PipelineStatus =
  | 'confirmed'
  | 'low_confidence'
  | 'no_signal'
  | 'causally_ambiguous';

export interface PipelineResult {
  domain: string;
  enrichedMarkets: EnrichedMarket[];
  screenedMarkets: ScreenedMarket[];
  lagMatrix: LagMatrix | null;
  selectedCluster: ScreenedMarket[];
  rejectedClusters: { markets: ScreenedMarket[]; reason: string; avgR: number }[];
  validationResult: { pairs: any[]; avgR: number; passed: boolean } | null;
  causalAnalysis: CausalAnalysis | null;
  mathAnalysis: MathAnalysis | null;
  directive: ActionDirective | null;
  audit: OrchestrationAudit | null;
  report: ReportContent | null;
  statRetryCount: number;
  causalRetryCount: number;
  status: PipelineStatus;
  statusReason: string;
}

export interface ReportContent {
  title: string;
  executiveSummary: string;
  causalReasoningProse: string;
  generatedAt: string;
}

export interface PipelineEvent {
  step: 'fetch' | 'screen' | 'cluster' | 'precedent'
      | 'causal' | 'math' | 'action' | 'audit' | 'report' | 'done' | 'error';
  status: 'running' | 'streaming' | 'complete' | 'failed' | 'retry'
        | 'investigating' | 'ambiguous';
  data?: unknown;
  message?: string;
  agentName?: string;
  k2Decision?: string;
  retryCount?: number;
}

export interface CounterfactualRequest {
  assumption: string;
  overrideProbabilities?: Record<string, number>;
}

export interface CounterfactualResult {
  assumption: string;
  originalJointPosterior: number;
  revisedJointPosterior: number;
  posteriorDelta: number;
  revisedConfidenceIntervalLow: number;
  revisedConfidenceIntervalHigh: number;
  revisedMathSignalStrength: number;
  signalStillConfirmed: boolean;
  revisedRecommendation: string;
  reasoning: string;
}
