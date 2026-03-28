// TODO: implement — fetches from Polymarket + Kalshi
import type { EnrichedMarket } from '../types.js';

export async function fetchAndEnrich(): Promise<EnrichedMarket[]> {
  throw new Error('marketFetcher: not implemented yet');
}

export async function loadSnapshot(): Promise<EnrichedMarket[]> {
  throw new Error('marketFetcher: not implemented yet');
}
