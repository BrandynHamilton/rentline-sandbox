"use client"

import { useEffect, useRef, useState } from "react"

type SandboxEvent =
  | "sandbox.turn_advanced"
  | "sandbox.game_completed"
  | "sandbox.player_joined"
  | "sandbox.player_ready"
  | "sandbox.trade"
  | "sandbox.mortgage_originated"
  | "sandbox.mortgage_refi"
  | "ping"

interface WsMessage {
  event: SandboxEvent | string
  data: Record<string, unknown>
  ts: number
}

export function useSandboxWs(
  token: string | null,
  onMessage: (msg: WsMessage) => void
) {
  const wsRef = useRef<WebSocket | null>(null)
  const onMessageRef = useRef(onMessage)
  onMessageRef.current = onMessage

  useEffect(() => {
    if (!token) return

    const base = (process.env.NEXT_PUBLIC_SANDBOX_API_URL ?? "http://localhost:6532")
      .replace(/^http/, "ws")

    const ws = new WebSocket(`${base}/api/ws?token=${encodeURIComponent(token)}`)
    wsRef.current = ws

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data) as WsMessage
        if (msg.event === "ping") {
          ws.send(JSON.stringify({ type: "pong" }))
          return
        }
        onMessageRef.current(msg)
      } catch {}
    }

    ws.onerror = () => {}
    ws.onclose = () => {}

    return () => {
      ws.close()
    }
  }, [token])
}
