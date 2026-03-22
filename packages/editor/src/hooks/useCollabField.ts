import { useCallback, useRef, useMemo, useEffect, type RefObject } from 'react'
import { useCollab } from '../context/CollabContext'
import { getUserColor } from '../components/collab/presenceUtils'

export interface CollabFieldResult {
  onFocus: () => void
  onBlur: () => void
  isLocked: boolean
  lockedBy: { userId: string; displayName: string; color: string } | null
  readOnly: boolean
  /** Ref to attach to the input element for auto-focus when following */
  followRef: RefObject<HTMLInputElement | HTMLTextAreaElement | null>
}

/**
 * Hook for field-level collaboration awareness and locking.
 *
 * Usage:
 *   const nameField = useCollabField(editingId, 'name')
 *   <TextInput ref={nameField.followRef} onFocus={nameField.onFocus} onBlur={nameField.onBlur}
 *     readOnly={nameField.readOnly} rightSection={nameField.lockedBy && <FieldLockIndicator user={nameField.lockedBy} />} />
 */
export function useCollabField(itemId: string | null, fieldName: string): CollabFieldResult {
  const { users, currentUserId, currentModule, updatePresence, followTargetField } = useCollab()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const followRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)

  const onFocus = useCallback(() => {
    if (!itemId) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      updatePresence(currentModule, itemId, fieldName)
    }, 100)
  }, [itemId, fieldName, currentModule, updatePresence])

  const onBlur = useCallback(() => {
    if (!itemId) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      updatePresence(currentModule, itemId, null)
    }, 100)
  }, [itemId, currentModule, updatePresence])

  const locker = useMemo(() => {
    if (!itemId) return null
    return users.find(
      u =>
        u.userId !== currentUserId &&
        u.module === currentModule &&
        u.focusId === itemId &&
        u.focusField === fieldName
    ) ?? null
  }, [users, currentUserId, currentModule, itemId, fieldName])

  const lockedBy = useMemo(() => {
    if (!locker) return null
    return {
      userId: locker.userId,
      displayName: locker.displayName,
      color: getUserColor(locker.userId),
    }
  }, [locker])

  // Auto-focus when follow mode targets this field
  useEffect(() => {
    if (followTargetField === fieldName && followRef.current) {
      followRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
      followRef.current.focus({ preventScroll: true })
    }
  }, [followTargetField, fieldName])

  return {
    onFocus,
    onBlur,
    isLocked: !!locker,
    lockedBy,
    readOnly: !!locker,
    followRef,
  }
}
