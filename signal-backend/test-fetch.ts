import 'dotenv/config';
import { fetchAndEnrich } from './src/agents/marketFetcher.js';

console.log('POLYMARKET_GAMMA_BASE:', process.env.POLYMARKET_GAMMA_BASE);
console.log('KALSHI_API_BASE:', process.env.KALSHI_API_BASE);
console.log('KALSHI_API_KEY_ID:', process.env.KALSHI_API_KEY_ID ? 'set' : 'MISSING');
console.log('K2_THINK_API_KEY:', process.env.K2_THINK_API_KEY ? 'set' : 'MISSING');
console.log('\nFetching markets...\n');

const markets = await fetchAndEnrich();
console.log(`Got ${markets.length} markets`);
markets.forEach(m => console.log(` - [${m.source}] ${m.title.slice(0, 70)}`));
