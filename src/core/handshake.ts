import crypto from 'node:crypto';
import { CipherState } from './channel.js';
import type { FrameSocket } from './framing.js';
import { fingerprint, publicKeyFromRaw, type Identity } from './identity.js';
import { cleanName } from './sanitize.js';

export const PROTOCOL = 'keyrace/1';
const HANDSHAKE_TIMEOUT = 5000;

export interface HandshakeResult {
  peerId: string;
  peerPublicRaw: Buffer;
  peerName: string;
  send: CipherState;
  recv: CipherState;
}

export class HandshakeError extends Error {}

interface Hello {
  eph: Buffer;
  nonce: Buffer;
}

function parseHello(frame: Buffer): Hello {
  let obj: unknown;
  try {
    obj = JSON.parse(frame.toString('utf8'));
  } catch {
    throw new HandshakeError('Invalid handshake');
  }
  const o = obj as Record<string, unknown>;
  if (o?.t !== 'hello' || o.p !== PROTOCOL || typeof o.eph !== 'string' || typeof o.nonce !== 'string') {
    throw new HandshakeError('Not a keyrace peer or incompatible version');
  }
  const eph = Buffer.from(o.eph, 'base64url');
  const nonce = Buffer.from(o.nonce, 'base64url');
  if (eph.length !== 32 || nonce.length !== 16) throw new HandshakeError('Invalid handshake');
  return { eph, nonce };
}

function authPayload(role: 'I' | 'R', transcript: Buffer): Buffer {
  return Buffer.concat([Buffer.from(`${PROTOCOL} auth ${role}`), transcript]);
}

/**
 * Authenticated key exchange (SIGMA-style):
 *  1. both send an ephemeral X25519 key + random nonce (plaintext)
 *  2. two directional keys are derived from the DH secret and the transcript
 *  3. both send their Ed25519 identity key + a signature over the transcript, encrypted
 * The other side is thus unambiguously identified, and past sessions stay secret even
 * if a key is lost later (forward secrecy).
 */
export async function performHandshake(
  fs: FrameSocket,
  me: Identity,
  myName: string,
  initiator: boolean,
  timeoutMs = HANDSHAKE_TIMEOUT,
): Promise<HandshakeResult> {
  const { privateKey: ephPriv, publicKey: ephPub } = crypto.generateKeyPairSync('x25519');
  const ephRaw = Buffer.from(ephPub.export({ format: 'jwk' }).x!, 'base64url');
  const nonce = crypto.randomBytes(16);

  fs.send(
    Buffer.from(
      JSON.stringify({ t: 'hello', p: PROTOCOL, eph: ephRaw.toString('base64url'), nonce: nonce.toString('base64url') }),
    ),
  );
  const peer = parseHello(await fs.read(timeoutMs));
  if (peer.eph.equals(ephRaw)) throw new HandshakeError('Reflected handshake');

  const [i, r] = initiator ? [{ eph: ephRaw, nonce }, peer] : [peer, { eph: ephRaw, nonce }];
  const transcript = crypto
    .createHash('sha256')
    .update(PROTOCOL)
    .update(i.eph)
    .update(i.nonce)
    .update(r.eph)
    .update(r.nonce)
    .digest();

  let shared: Buffer;
  try {
    const peerEphKey = crypto.createPublicKey({
      key: { kty: 'OKP', crv: 'X25519', x: peer.eph.toString('base64url') },
      format: 'jwk',
    });
    shared = crypto.diffieHellman({ privateKey: ephPriv, publicKey: peerEphKey });
  } catch {
    throw new HandshakeError('Invalid key');
  }
  if (shared.every((b) => b === 0)) throw new HandshakeError('Invalid key');

  const okm = Buffer.from(crypto.hkdfSync('sha256', shared, transcript, `${PROTOCOL} keys`, 64));
  const i2r = okm.subarray(0, 32);
  const r2i = okm.subarray(32, 64);
  const send = new CipherState(initiator ? i2r : r2i);
  const recv = new CipherState(initiator ? r2i : i2r);

  const myRole = initiator ? 'I' : 'R';
  const peerRole = initiator ? 'R' : 'I';
  const sig = crypto.sign(null, authPayload(myRole, transcript), me.privateKey);
  fs.send(
    send.encrypt(
      Buffer.from(
        JSON.stringify({ pub: me.publicRaw.toString('base64url'), name: myName, sig: sig.toString('base64url') }),
      ),
    ),
  );

  let auth: Record<string, unknown>;
  try {
    auth = JSON.parse(recv.decrypt(await fs.read(timeoutMs)).toString('utf8'));
  } catch (err) {
    if (err instanceof Error && /timed out|closed/.test(err.message)) throw err;
    throw new HandshakeError('Authentication failed');
  }
  if (typeof auth.pub !== 'string' || typeof auth.sig !== 'string') {
    throw new HandshakeError('Authentication failed');
  }
  const peerPublicRaw = Buffer.from(auth.pub, 'base64url');
  if (peerPublicRaw.length !== 32) throw new HandshakeError('Invalid identity key');
  let valid = false;
  try {
    valid = crypto.verify(
      null,
      authPayload(peerRole, transcript),
      publicKeyFromRaw(peerPublicRaw),
      Buffer.from(auth.sig, 'base64url'),
    );
  } catch {
    valid = false;
  }
  if (!valid) throw new HandshakeError('Invalid signature');

  const peerId = fingerprint(peerPublicRaw);
  if (peerId === me.id) throw new HandshakeError('Cannot connect to yourself');

  return { peerId, peerPublicRaw, peerName: cleanName(auth.name), send, recv };
}
