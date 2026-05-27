"use client"

import { createContext, useContext, useEffect, useRef, useState } from "react"
import { useAuth } from "@clerk/nextjs"
import { createSandboxApiClient, type SandboxApiClient } from "@/lib/api"

interface SandboxClientContext {
  apiClient: SandboxApiClient | null
  isReady: boolean
  token: string | null
}

const Ctx = createContext<SandboxClientContext>({
  apiClient: null,
  isReady: false,
  token: null,
})

export function SandboxApiClientProvider({ children }: { children: React.ReactNode }) {
  const { getToken, isLoaded, isSignedIn } = useAuth()
  const [token, setToken] = useState<string | null>(null)
  const [apiClient, setApiClient] = useState<SandboxApiClient | null>(null)
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return

    const refresh = async () => {
      try {
        const t = await getToken()
        setToken(t)
        setApiClient(createSandboxApiClient(t))
      } catch (e) {
        console.error("Token refresh failed:", e)
      }
      refreshTimer.current = setTimeout(refresh, 55_000)
    }

    refresh()
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current)
    }
  }, [isLoaded, isSignedIn])

  return (
    <Ctx.Provider value={{ apiClient, isReady: !!apiClient, token }}>
      {children}
    </Ctx.Provider>
  )
}

export function useSandboxClient() {
  return useContext(Ctx)
}
