import { describe, expect, it } from 'vitest'
import { cloneDefaultPlan } from './finance'
import { createVaultSession, encryptVault, unlockVault } from './vault'

describe('local password vault', () => {
  it('encrypts the plan and preserved previous data, then unlocks them with the password', async () => {
    const plan = cloneDefaultPlan()
    const backups = { 'margin-plan-v2': '{"old":"private value"}' }
    const session = await createVaultSession('test-only-passphrase', backups)
    const encrypted = await encryptVault(session, plan)

    expect(session.key.extractable).toBe(false)
    expect(encrypted).not.toContain('Maya')
    expect(encrypted).not.toContain('private value')
    const unlocked = await unlockVault('test-only-passphrase', encrypted)
    expect(unlocked.plan).toEqual(plan)
    expect(unlocked.session.backups).toEqual(backups)
  }, 10000)

  it('uses a fresh nonce for each save and rejects a wrong password', async () => {
    const session = await createVaultSession('test-only-passphrase', {})
    const first = await encryptVault(session, cloneDefaultPlan())
    const second = await encryptVault(session, cloneDefaultPlan())
    expect(JSON.parse(first).iv).not.toBe(JSON.parse(second).iv)
    await expect(unlockVault('incorrect-passphrase', first)).rejects.toThrow()
  }, 10000)

  it('rejects tampered ciphertext and unreasonable derivation costs', async () => {
    const session = await createVaultSession('test-only-passphrase', {})
    const record = JSON.parse(await encryptVault(session, cloneDefaultPlan())) as { ciphertext: string; iterations: number }
    record.ciphertext = `${record.ciphertext[0] === 'A' ? 'B' : 'A'}${record.ciphertext.slice(1)}`
    await expect(unlockVault('test-only-passphrase', JSON.stringify(record))).rejects.toThrow()
    record.iterations = 2_000_001
    await expect(unlockVault('test-only-passphrase', JSON.stringify(record))).rejects.toThrow('Invalid vault')
  }, 10000)
})
