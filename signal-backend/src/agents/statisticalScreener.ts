// TODO: implement — cross-correlation lag analysis, volume-weighted scoring, regime detection
import type { EnrichedMarket, ScreenedMarket, LagMatrix } from '../types.js';

export function screenMarkets(
  markets: EnrichedMarket[],
  excludeIds: string[] = [],
): ScreenedMarket[] {
  throw new Error('statisticalScreener: not implemented yet');
}

export function buildLagMatrix(markets: EnrichedMarket[]): LagMatrix {
  throw new Error('statisticalScreener: not implemented yet');
}

export function validateCluster(
  cluster: ScreenedMarket[],
  lagMatrix: LagMatrix,
): { pairs: { ids: [string, string]; r: number; lag: number }[]; avgR: number; passed: boolean } {
  throw new Error('statisticalScreener: not implemented yet');
}
