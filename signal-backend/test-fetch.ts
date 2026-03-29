import 'dotenv/config';
import { fetchAndEnrich } from './src/agents/marketFetcher.js';
import { generateSearchStrategy } from './src/agents/searchStrategy.js';
import { getDomain } from './src/domains.js';

const domain = getDomain('iran-oil');
console.log('Generating search strategy for:', domain.name);
const strategy = await generateSearchStrategy(domain);
console.log('Strategy:', JSON.stringify(strategy, null, 2));
console.log('\nFetching markets...\n');

const markets = await fetchAndEnrich(strategy, domain);
console.log(`Got ${markets.length} markets`);
markets.forEach(m => console.log(` - [${m.source}] ${m.title.slice(0, 70)}`));
