import { createContext, useContext, type ReactNode } from 'react'
import type { CollabUser } from '../store/collabStore'

export interface CollabContextValue {
  users: CollabUser[]
  currentUserId?: string
  currentModule: string
  updatePresence: (module: string, focusId: string | null, focusField?: string | null) => void
  followingUserId: string | null
  setFollowingUserId: (userId: string | null) => void
  /** The field name of the followed user's current focus (set by App.tsx follow effect) */
  followTargetField: string | null
}

const CollabContext = createContext<CollabContextValue | null>(null)

interface CollabProviderProps {
  users: CollabUser[]
  currentUserId?: string
  currentModule: string
  updatePresence: (module: string, focusId: string | null, focusField?: string | null) => void
  followingUserId: string | null
  setFollowingUserId: (userId: string | null) => void
  followTargetField: string | null
  children: ReactNode
}

export function CollabProvider({ users, currentUserId, currentModule, updatePresence, followingUserId, setFollowingUserId, followTargetField, children }: CollabProviderProps) {
  return (
    <CollabContext.Provider value={{
      users,
      currentUserId,
      currentModule,
      updatePresence,
      followingUserId,
      setFollowingUserId,
      followTargetField,
    }}>
      {children}
    </CollabContext.Provider>
  )
}

export function useCollab(): CollabContextValue {
  const ctx = useContext(CollabContext)
  if (!ctx) {
    return {
      users: [],
      currentUserId: undefined,
      currentModule: '',
      updatePresence: () => {},
      followingUserId: null,
      setFollowingUserId: () => {},
      followTargetField: null,
    }
  }
  return ctx
}
