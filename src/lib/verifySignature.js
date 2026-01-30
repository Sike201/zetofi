import nacl from 'tweetnacl';
import { PublicKey } from '@solana/web3.js';

const MESSAGE_PREFIX_CREATE = 'Zeto create intent\n';
const MESSAGE_PREFIX_DELETE = 'Zeto delete intent\n';
const TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000; // 5 minutes

function getMessageTimestamp(message, prefix) {
  if (!message.startsWith(prefix)) return null;
  const rest = message.slice(prefix.length).trim();
  const ts = parseInt(rest, 10);
  if (Number.isNaN(ts)) return null;
  return ts;
}

export function verifySolanaMessage(message, signatureBase64, publicKeyBase58) {
  try {
    const messageBytes = new TextEncoder().encode(message);
    const signatureBytes = Uint8Array.from(Buffer.from(signatureBase64, 'base64'));
    if (signatureBytes.length !== nacl.sign.signatureLength) return false;
    const publicKey = new PublicKey(publicKeyBase58);
    const publicKeyBytes = publicKey.toBytes();
    return nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
  } catch (err) {
    console.error('Signature verification error:', err);
    return false;
  }
}

export function createIntentMessage() {
  const timestamp = Date.now();
  return `${MESSAGE_PREFIX_CREATE}${timestamp}`;
}

export function deleteIntentMessage(intentId) {
  const timestamp = Date.now();
  return `${MESSAGE_PREFIX_DELETE}${intentId}\n${timestamp}`;
}

export function verifyCreateMessage(message) {
  const ts = getMessageTimestamp(message, MESSAGE_PREFIX_CREATE);
  if (ts == null) return false;
  const now = Date.now();
  return Math.abs(now - ts) <= TIMESTAMP_TOLERANCE_MS;
}

export function verifyDeleteMessage(message, intentId) {
  if (!message.startsWith(MESSAGE_PREFIX_DELETE)) return false;
  const rest = message.slice(MESSAGE_PREFIX_DELETE.length);
  const [idPart, tsPart] = rest.split('\n');
  if (idPart !== intentId) return false;
  const ts = parseInt(tsPart, 10);
  if (Number.isNaN(ts)) return false;
  const now = Date.now();
  return Math.abs(now - ts) <= TIMESTAMP_TOLERANCE_MS;
}
