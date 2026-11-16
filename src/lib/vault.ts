import type { HouseholdPlan } from './finance'

export const VAULT_STORAGE_KEY = 'margin-vault-v1'
export const PLAN_STORAGE_KEYS = ['margin-plan-v3', 'margin-plan-v2', 'margin-household-v1'] as const
export const MIN_PASSWORD_LENGTH = 12
const ITERATIONS = 600_000

interface VaultRecord {
  version: 1
  iterations: number
  salt: string
  iv: string
  ciphertext: string
}

interface VaultPayload {
  plan: unknown
  backups: Record<string, string>
}

export interface VaultSession {
  key: CryptoKey
  salt: string
  iterations: number
  backups: Record<string, string>
}

function encodeBytes(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function decodeBytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

function parseRecord(serialized: string): VaultRecord {
  const value: unknown = JSON.parse(serialized)
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid vault')
  const record = value as Record<string, unknown>
  if (record.version !== 1 || typeof record.iterations !== 'number' || !Number.isInteger(record.iterations) || record.iterations < ITERATIONS || record.iterations > 2_000_000 || typeof record.salt !== 'string' || typeof record.iv !== 'string' || typeof record.ciphertext !== 'string') throw new Error('Invalid vault')
  if (decodeBytes(record.salt).length !== 16 || decodeBytes(record.iv).length !== 12 || decodeBytes(record.ciphertext).length < 16) throw new Error('Invalid vault')
  return record as unknown as VaultRecord
}

async function deriveKey(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  if (!globalThis.crypto?.subtle) throw new Error('Password protection requires a secure connection and a modern browser.')
  const passwordBytes = new TextEncoder().encode(password)
  try {
    const material = await crypto.subtle.importKey('raw', passwordBytes, 'PBKDF2', false, ['deriveKey'])
    return await crypto.subtle.deriveKey(
      { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
      material,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    )
  } finally {
    passwordBytes.fill(0)
  }
}

export async function createVaultSession(password: string, backups: Record<string, string>): Promise<VaultSession> {
  const saltBytes = crypto.getRandomValues(new Uint8Array(16))
  return { key: await deriveKey(password, saltBytes, ITERATIONS), salt: encodeBytes(saltBytes), iterations: ITERATIONS, backups }
}

export async function encryptVault(session: VaultSession, plan: HouseholdPlan): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const data = new TextEncoder().encode(JSON.stringify({ plan, backups: session.backups }))
  try {
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, session.key, data)
    const record: VaultRecord = { version: 1, iterations: session.iterations, salt: session.salt, iv: encodeBytes(iv), ciphertext: encodeBytes(new Uint8Array(ciphertext)) }
    return JSON.stringify(record)
  } finally {
    data.fill(0)
  }
}

export async function unlockVault(password: string, serialized: string): Promise<{ session: VaultSession; plan: unknown }> {
  const record = parseRecord(serialized)
  const key = await deriveKey(password, decodeBytes(record.salt), record.iterations)
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decodeBytes(record.iv) }, key, decodeBytes(record.ciphertext))
  const bytes = new Uint8Array(plaintext)
  try {
    const payload: unknown = JSON.parse(new TextDecoder().decode(bytes))
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Invalid vault payload')
    const value = payload as Partial<VaultPayload>
    if (!value.backups || typeof value.backups !== 'object' || Array.isArray(value.backups)) throw new Error('Invalid vault payload')
    const backups: Record<string, string> = {}
    for (const keyName of PLAN_STORAGE_KEYS) {
      if (typeof value.backups[keyName] === 'string') backups[keyName] = value.backups[keyName]
    }
    return { session: { key, salt: record.salt, iterations: record.iterations, backups }, plan: value.plan }
  } finally {
    bytes.fill(0)
  }
}
