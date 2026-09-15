import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { googleConnections } from "../db/schema";

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/webmasters.readonly",
  "https://www.googleapis.com/auth/analytics.readonly",
];

const encoder = new TextEncoder();

function base64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function unbase64(value: string) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function digestSecret(secret: string) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(secret)));
}

async function encryptionKey(secret: string) {
  return crypto.subtle.importKey("raw", await digestSecret(secret), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function signingKey(secret: string) {
  return crypto.subtle.importKey("raw", await digestSecret(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function createOAuthState(email: string, secret: string) {
  const payload = base64(encoder.encode(JSON.stringify({ email, issuedAt: Date.now(), nonce: base64(crypto.getRandomValues(new Uint8Array(16))) })));
  const signature = base64(new Uint8Array(await crypto.subtle.sign("HMAC", await signingKey(secret), encoder.encode(payload))));
  return `${payload}.${signature}`;
}

export async function verifyOAuthState(value: string, email: string, secret: string) {
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return false;
  const valid = await crypto.subtle.verify("HMAC", await signingKey(secret), unbase64(signature), encoder.encode(payload));
  if (!valid) return false;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(unbase64(payload))) as { email?: string; issuedAt?: number };
    return parsed.email === email && typeof parsed.issuedAt === "number" && Date.now() - parsed.issuedAt < 10 * 60 * 1000;
  } catch {
    return false;
  }
}

export async function encryptRefreshToken(token: string, secret: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(secret), encoder.encode(token)));
  return `${base64(iv)}.${base64(encrypted)}`;
}

export async function decryptRefreshToken(ciphertext: string, secret: string) {
  const [ivValue, encryptedValue] = ciphertext.split(".");
  if (!ivValue || !encryptedValue) throw new Error("Stored Google token is invalid.");
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unbase64(ivValue) }, await encryptionKey(secret), unbase64(encryptedValue));
  return new TextDecoder().decode(decrypted);
}

export async function loadGoogleConnection(workspaceKey: string) {
  const db = await getDb();
  const [row] = await db.select().from(googleConnections).where(eq(googleConnections.workspaceKey, workspaceKey)).limit(1);
  return row || null;
}

export async function saveGoogleConnection(workspaceKey: string, refreshTokenCiphertext: string, scopes: string) {
  const db = await getDb();
  const updatedAt = new Date().toISOString();
  await db.insert(googleConnections).values({ workspaceKey, refreshTokenCiphertext, scopes, updatedAt }).onConflictDoUpdate({
    target: googleConnections.workspaceKey,
    set: { refreshTokenCiphertext, scopes, updatedAt },
  });
  return updatedAt;
}

export async function removeGoogleConnection(workspaceKey: string) {
  const db = await getDb();
  await db.delete(googleConnections).where(eq(googleConnections.workspaceKey, workspaceKey));
}
