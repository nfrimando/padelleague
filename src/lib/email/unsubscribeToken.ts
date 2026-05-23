import crypto from "crypto";

const BASE_URL = "https://www.padelph.com";

type UnsubscribeType = "all" | "match_results" | "predictions";

function getSecret(): string {
  const secret = process.env.UNSUBSCRIBE_SECRET;
  if (!secret) throw new Error("Missing required environment variable: UNSUBSCRIBE_SECRET.");
  return secret;
}

export function generateUnsubscribeToken(playerId: number, type: UnsubscribeType): string {
  return crypto
    .createHmac("sha256", getSecret())
    .update(`${playerId}:${type}`)
    .digest("hex")
    .slice(0, 32);
}

export function verifyUnsubscribeToken(sig: string, playerId: number, type: string): void {
  const expected = generateUnsubscribeToken(playerId, type as UnsubscribeType);
  const sigBuf = Buffer.from(sig.padEnd(32, "0").slice(0, 32), "hex");
  const expBuf = Buffer.from(expected, "hex");
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    throw new Error("Invalid unsubscribe token");
  }
}

export function buildUnsubscribeUrl(playerId: number, type: UnsubscribeType): string {
  const sig = generateUnsubscribeToken(playerId, type);
  const params = new URLSearchParams({ pid: String(playerId), type, sig });
  return `${BASE_URL}/api/players/unsubscribe?${params.toString()}`;
}
