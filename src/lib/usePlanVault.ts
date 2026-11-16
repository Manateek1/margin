import { useCallback, useEffect, useRef, useState } from 'react'
import type { HouseholdPlan } from './finance'
import { createVaultSession, encryptVault, MIN_PASSWORD_LENGTH, PLAN_STORAGE_KEYS, unlockVault, VAULT_STORAGE_KEY, type VaultSession } from './vault'

type VaultStatus = 'unprotected' | 'locked' | 'unlocked'
type SaveState = 'saved' | 'error'

export function usePlanVault(readPlan: () => HouseholdPlan, sanitizePlan: (value: unknown) => HouseholdPlan | null, emptyPlan: () => HouseholdPlan) {
  const [initial] = useState(() => {
    try { return { encrypted: localStorage.getItem(VAULT_STORAGE_KEY) !== null, failed: false } }
    catch { return { encrypted: false, failed: true } }
  })
  const [status, setStatus] = useState<VaultStatus>(initial.encrypted ? 'locked' : 'unprotected')
  const [plan, setPlan] = useState<HouseholdPlan>(() => initial.encrypted ? emptyPlan() : readPlan())
  const [saveState, setSaveState] = useState<SaveState>(initial.failed ? 'error' : 'saved')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const statusRef = useRef<VaultStatus>(status)
  const sessionRef = useRef<VaultSession | null>(null)
  const savedRecordRef = useRef<string | null>(null)
  const revision = useRef(0)
  const pendingSave = useRef(false)

  const changeStatus = useCallback((next: VaultStatus) => {
    statusRef.current = next
    setStatus(next)
  }, [])

  const forceLocked = useCallback((reason: string) => {
    revision.current += 1
    pendingSave.current = false
    sessionRef.current = null
    savedRecordRef.current = null
    changeStatus('locked')
    setPlan(emptyPlan())
    setSaveState('saved')
    setMessage(reason)
  }, [changeStatus, emptyPlan])

  useEffect(() => {
    if (status === 'locked') return undefined
    const currentRevision = ++revision.current
    pendingSave.current = true
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          if (currentRevision !== revision.current) return
          if (statusRef.current === 'unprotected') {
            if (localStorage.getItem(VAULT_STORAGE_KEY) !== null) {
              forceLocked('Protection was enabled in another tab. Unlock to continue.')
              return
            }
            localStorage.setItem(PLAN_STORAGE_KEYS[0], JSON.stringify(plan))
          } else {
            const session = sessionRef.current
            if (!session) return
            const encrypted = await encryptVault(session, plan)
            if (currentRevision !== revision.current || statusRef.current !== 'unlocked') return
            if (localStorage.getItem(VAULT_STORAGE_KEY) !== savedRecordRef.current) {
              forceLocked('The plan changed in another tab. Unlock to load the latest saved version.')
              return
            }
            localStorage.setItem(VAULT_STORAGE_KEY, encrypted)
            savedRecordRef.current = encrypted
          }
          if (currentRevision === revision.current) {
            pendingSave.current = false
            setSaveState('saved')
          }
        } catch {
          if (currentRevision === revision.current) {
            pendingSave.current = false
            setSaveState('error')
          }
        }
      })()
    }, status === 'unprotected' ? 0 : 150)
    return () => window.clearTimeout(timer)
  }, [plan, status, forceLocked])

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== VAULT_STORAGE_KEY) return
      if (event.newValue !== null && statusRef.current !== 'locked') {
        forceLocked('The plan changed in another tab. Unlock to load the latest saved version.')
      } else if (event.newValue === null && statusRef.current !== 'unprotected') {
        revision.current += 1
        pendingSave.current = false
        sessionRef.current = null
        savedRecordRef.current = null
        changeStatus('unprotected')
        setPlan(readPlan())
        setMessage('The password lock was turned off in another tab.')
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [changeStatus, forceLocked, readPlan])

  useEffect(() => {
    const warnIfUnsaved = (event: BeforeUnloadEvent) => {
      if (pendingSave.current || saveState === 'error') {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', warnIfUnsaved)
    return () => window.removeEventListener('beforeunload', warnIfUnsaved)
  }, [saveState])

  const enable = async (password: string): Promise<boolean> => {
    if (password.length < MIN_PASSWORD_LENGTH || password.length > 128) {
      setMessage(`Use a password between ${MIN_PASSWORD_LENGTH} and 128 characters.`)
      return false
    }
    setBusy(true)
    setMessage('')
    revision.current += 1
    pendingSave.current = true
    let vaultWritten = false
    let session: VaultSession | null = null
    try {
      if (localStorage.getItem(VAULT_STORAGE_KEY) !== null) throw new Error('A protected plan already exists. Reload this page to unlock it.')
      const backups: Record<string, string> = {}
      for (const key of PLAN_STORAGE_KEYS) {
        const value = localStorage.getItem(key)
        if (value !== null) backups[key] = value
      }
      session = await createVaultSession(password, backups)
      const encrypted = await encryptVault(session, plan)
      const verified = await unlockVault(password, encrypted)
      if (JSON.stringify(verified.plan) !== JSON.stringify(plan) || JSON.stringify(verified.session.backups) !== JSON.stringify(backups)) throw new Error('Could not verify the protected plan. Your existing plan was kept.')
      if (localStorage.getItem(VAULT_STORAGE_KEY) !== null || PLAN_STORAGE_KEYS.some((key) => localStorage.getItem(key) !== (backups[key] ?? null))) throw new Error('The plan changed in another tab. Reload and try again.')
      localStorage.setItem(VAULT_STORAGE_KEY, encrypted)
      vaultWritten = true
      if (localStorage.getItem(VAULT_STORAGE_KEY) !== encrypted) throw new Error('Could not verify the protected plan on this device.')
      for (const key of PLAN_STORAGE_KEYS) localStorage.removeItem(key)
      if (PLAN_STORAGE_KEYS.some((key) => localStorage.getItem(key) !== null)) throw new Error('Older unencrypted data could not be removed from this browser.')
      sessionRef.current = session
      savedRecordRef.current = encrypted
      changeStatus('unlocked')
      setSaveState('saved')
      return true
    } catch (error) {
      if (vaultWritten && session) {
        sessionRef.current = session
        savedRecordRef.current = localStorage.getItem(VAULT_STORAGE_KEY)
        changeStatus('unlocked')
      } else {
        setSaveState('error')
      }
      setMessage(error instanceof Error ? error.message : 'Could not protect this plan. Your existing data was kept.')
      return false
    } finally {
      pendingSave.current = false
      setBusy(false)
    }
  }

  const unlock = async (password: string): Promise<boolean> => {
    setBusy(true)
    setMessage('')
    try {
      const encrypted = localStorage.getItem(VAULT_STORAGE_KEY)
      if (!encrypted) throw new Error('The protected plan is no longer here. Reload the page to continue.')
      const result = await unlockVault(password, encrypted)
      const restored = sanitizePlan(result.plan)
      if (!restored) throw new Error('The protected plan could not be read.')
      if (localStorage.getItem(VAULT_STORAGE_KEY) !== encrypted) throw new Error('The plan changed in another tab. Try unlocking again.')
      sessionRef.current = result.session
      savedRecordRef.current = encrypted
      setPlan(restored)
      changeStatus('unlocked')
      setSaveState('saved')
      return true
    } catch (error) {
      setMessage(error instanceof DOMException && error.name === 'OperationError'
        ? 'That password did not unlock the plan. Check it and try again.'
        : error instanceof Error ? error.message : 'Could not unlock this plan.')
      return false
    } finally {
      setBusy(false)
    }
  }

  const lock = async (): Promise<boolean> => {
    const session = sessionRef.current
    if (!session || statusRef.current !== 'unlocked') return false
    setBusy(true)
    setMessage('')
    revision.current += 1
    pendingSave.current = true
    try {
      const encrypted = await encryptVault(session, plan)
      if (statusRef.current !== 'unlocked' || localStorage.getItem(VAULT_STORAGE_KEY) !== savedRecordRef.current) throw new Error('The plan changed in another tab. Unlock to load the latest version.')
      localStorage.setItem(VAULT_STORAGE_KEY, encrypted)
      savedRecordRef.current = encrypted
      forceLocked('')
      return true
    } catch (error) {
      setSaveState('error')
      setMessage(error instanceof Error ? error.message : 'Could not save the plan before locking. Please try again.')
      return false
    } finally {
      pendingSave.current = false
      setBusy(false)
    }
  }

  const disable = async (): Promise<boolean> => {
    const session = sessionRef.current
    if (!session || statusRef.current !== 'unlocked') return false
    setBusy(true)
    setMessage('')
    revision.current += 1
    pendingSave.current = true
    let plaintextWritten = false
    try {
      const encrypted = await encryptVault(session, plan)
      if (statusRef.current !== 'unlocked' || localStorage.getItem(VAULT_STORAGE_KEY) !== savedRecordRef.current) throw new Error('The plan changed in another tab. Unlock to load the latest version.')
      const archiveKey = `margin-vault-archive-${crypto.randomUUID()}`
      localStorage.setItem(archiveKey, encrypted)
      localStorage.setItem(PLAN_STORAGE_KEYS[0], JSON.stringify(plan))
      plaintextWritten = true
      localStorage.removeItem(VAULT_STORAGE_KEY)
      sessionRef.current = null
      savedRecordRef.current = null
      changeStatus('unprotected')
      setSaveState('saved')
      return true
    } catch (error) {
      if (plaintextWritten) {
        try { localStorage.removeItem(PLAN_STORAGE_KEYS[0]) } catch { /* The warning below stays visible. */ }
      }
      setMessage(error instanceof Error ? error.message : 'Could not turn off the lock. Your protected plan was kept.')
      return false
    } finally {
      pendingSave.current = false
      setBusy(false)
    }
  }

  return { plan, setPlan, status, saveState, busy, message, setMessage, enable, unlock, lock, disable }
}
