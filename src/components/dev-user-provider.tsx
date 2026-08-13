"use client"

import * as React from "react"
import { DEV_USERS, type DevUser } from "@/lib/dev-users"

const STORAGE_KEY = "dev-user-id"

type DevUserContextValue = {
  user: DevUser
  setUser: (user: DevUser) => void
}

const DevUserContext = React.createContext<DevUserContextValue | null>(null)

export function DevUserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = React.useState<DevUser>(DEV_USERS[0])

  // Сонгосон хэрэглэгчийг localStorage-с сэргээнэ (hydration зөрөхөөс сэргийлж effect дотор)
  React.useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    const found = DEV_USERS.find((u) => u.id === saved)
    if (found) setUserState(found)
  }, [])

  const setUser = React.useCallback((next: DevUser) => {
    setUserState(next)
    localStorage.setItem(STORAGE_KEY, next.id)
  }, [])

  return (
    <DevUserContext.Provider value={{ user, setUser }}>
      {children}
    </DevUserContext.Provider>
  )
}

export function useDevUser() {
  const ctx = React.useContext(DevUserContext)
  if (!ctx) {
    throw new Error("useDevUser must be used within DevUserProvider")
  }
  return ctx
}
