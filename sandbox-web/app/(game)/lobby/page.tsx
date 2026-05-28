"use client"

import Link from "next/link"
import { Settings } from "lucide-react"

export default function LobbyPage() {
  return (
    <main className="min-h-screen p-8">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold mb-2">Rentline Sandbox</h1>
          <p className="text-zinc-400 text-sm">
            Real estate investment simulation — powered by Rentline.
          </p>
        </div>
        <Link
          href="/settings"
          className="inline-flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
        >
          <Settings size={14} />
          Settings
        </Link>
      </div>
      <p className="text-zinc-500 text-sm">
        Lobby UI coming soon. The API is live at{" "}
        <code className="text-emerald-400">
          {process.env.NEXT_PUBLIC_SANDBOX_API_URL ?? "http://localhost:6532"}
        </code>
      </p>
    </main>
  )
}
