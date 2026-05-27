"use client"

import { useParams } from "next/navigation"

export default function GamePage() {
  const { id } = useParams<{ id: string }>()
  return (
    <main className="min-h-screen p-8">
      <p className="text-zinc-400 text-sm">Game board for game <code>{id}</code> — UI coming soon.</p>
    </main>
  )
}
