"use client"

export default function LobbyPage() {
  return (
    <main className="min-h-screen p-8">
      <h1 className="text-2xl font-bold mb-2">Rentline Sandbox</h1>
      <p className="text-zinc-400 text-sm mb-8">
        Real estate investment simulation — powered by Rentline.
      </p>
      <p className="text-zinc-500 text-sm">
        Lobby UI coming soon. The API is live at{" "}
        <code className="text-emerald-400">
          {process.env.NEXT_PUBLIC_SANDBOX_API_URL ?? "http://localhost:6532"}
        </code>
      </p>
    </main>
  )
}
