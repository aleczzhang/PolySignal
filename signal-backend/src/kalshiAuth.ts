import { createSign } from 'crypto';

/**
 * Generates Kalshi RSA auth headers for a given request.
 * Kalshi uses RSA-SHA256 signing — not a simple Bearer token.
 *
 * Signature message: millisecondTimestamp + METHOD + /path
 * e.g. "1711648800000GET/trade-api/v2/markets"
 */
export function kalshiHeaders(method: string, path: string): Record<string, string> {
  const keyId     = process.env.KALSHI_API_KEY_ID ?? '';
  const rawKey    = process.env.KALSHI_PRIVATE_KEY ?? '';
  const timestamp = Date.now().toString();

  // .env stores the key with literal \n — restore actual newlines before signing
  const privateKey = rawKey.replace(/\\n/g, '\n');

  const message   = timestamp + method.toUpperCase() + path;
  const sign      = createSign('SHA256');
  sign.update(message);
  sign.end();
  const signature = sign.sign(privateKey, 'base64');

  return {
    'KALSHI-ACCESS-KEY':       keyId,
    'KALSHI-ACCESS-TIMESTAMP': timestamp,
    'KALSHI-ACCESS-SIGNATURE': signature,
    'Content-Type':            'application/json',
  };
}
