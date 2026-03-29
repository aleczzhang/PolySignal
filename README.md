# PolySignal

## Inspiration

Prediction markets predicted the Iran war hours before it happened. We built the system that tells you what to do about it.

Economic data is slow. Key indicators like inflation, GDP, and unemployment are released weeks or months after the fact — decisions by businesses, policymakers, and individuals are often based on outdated information.

Prediction markets like Kalshi and Polymarket solve this. They update in real time as traders react to new information — economic data, news, geopolitical events. A February 2026 Federal Reserve working paper confirms this, concluding that "Kalshi markets provide a high-frequency, continuously updated, distributionally rich benchmark" of value to researchers and policymakers.

The insight behind PolySignal is simple: the real value isn't just in individual prediction markets — it's in how they move together. When multiple markets shift at once (oil prices, inflation expectations, interest rate decisions), they reveal early signals about how events will unfold, often days or weeks before official data confirms it.

## What It Does

PolySignal turns prediction market data into actionable decisions. Instead of showing raw probabilities, it:

- Tracks real-time prediction markets from Polymarket and Kalshi
- Identifies meaningful relationships between them
- Infers cause-and-effect chains (what's driving what)
- Translates those insights into specific actions for different users

Same data, different outputs:

An Uber driver gets:
> *"Gas prices likely rising in ~2 weeks — adjust driving zones and maximize short-term earnings before margins shrink."*

A policymaker gets:
> *"Markets are pricing higher inflation, driven by food and energy signals — trend emerging ahead of official CPI data."*

We don't just explain what's happening — we tell you what to do about it.

## How It Works

PolySignal is built as a multi-agent pipeline designed for speed and efficiency.

**1. Smart Data Filtering (Cost-Aware)**

We pull thousands of markets from APIs, then use an AI filter to select only relevant markets before doing deeper analysis. K2 Think V2 receives candidates in batches and classifies each as relevant, historical precedent, or reject. Only markets that clear this filter get the expensive enrichment call — 60-day probability history and candlestick data. This keeps costs proportional to signal quality.

**2. Signal Scoring**

Each market is scored based on signal strength, trading volume, time horizon, and data availability:

$$\text{score} = 0.45 \cdot \underbrace{|p - 0.5| \times 2}_{\text{signal strength}} + 0.30 \cdot \underbrace{\sqrt{V/V_{\max}}}_{\text{volume}} + 0.15 \cdot \underbrace{w_t}_{\text{time horizon}} + 0.10 \cdot \underbrace{\mathbb{1}[\text{data} \geq 7]}_{\text{data availability}}$$

Only high-signal markets move forward.

**3. Causal Analysis (Core Innovation)**

Two AI agents run in parallel. The first pulls historical precedents — real past events analogous to what current markets are pricing in. The second performs the causal analysis: given live market probabilities and their co-movement over time, what is the propagation chain from the leading signal to downstream effects?

This is where K2 Think V2 is essential. Causal reasoning across noisy, cross-domain market data isn't a retrieval problem — it requires genuine multi-step reasoning: evaluating which correlations are spurious, identifying the direction of causality, and translating probabilistic signals into a coherent propagation chain. K2 Think V2 is a reasoning-first model built specifically for this kind of structured inference. Its visible `<think>` process lets us stream the model's reasoning to the user in real time, so the output isn't a black box — you can watch it work through the signal before it commits to a conclusion.

This lets us detect lead-lag relationships and correlations across domains (e.g., geopolitics → oil → inflation) — inferring causal chains, not just correlations.

**4. Role-Based Decision Engine**

We translate signals into actions tailored to the user. Instead of generic insights, outputs are time-bound, context-specific, and directly actionable — calibrated to what you can actually do with the information.

## What's Next for PolySignal

The most important next step is removing the hardcoded causal chains. Right now, the system is pre-loaded with the expected propagation structure for each domain. A more powerful version would derive that structure from the data itself — letting the model discover novel cross-domain signals rather than confirming ones we already expect.

Beyond that:

- **Broader market coverage** — crypto derivatives, political event markets, weather futures, and supply chain indices all carry signals that prediction markets haven't fully integrated
- **Longitudinal validation** — backtesting the pipeline's directional calls against what actually happened, to measure how far ahead of official data the signals consistently run
- **Alerts and monitoring** — rather than running on-demand, PolySignal should watch continuously and notify users when a new cross-market correlation emerges
- **Expanding the role model** — the current role-based directive system covers broad archetypes; a production version would let users define their specific constraints, authority, and available instruments so the directive is genuinely tailored rather than category-matched
