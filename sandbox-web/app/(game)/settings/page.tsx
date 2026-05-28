"use client"

import { useEffect, useState } from "react"
import { useUser } from "@clerk/nextjs"
import Link from "next/link"
import { Copy, Check, Trash2, Plus, Key, Terminal, ArrowLeft, Loader2 } from "lucide-react"
import { useSandboxClient } from "@/lib/sandbox-client-context"
import type { ApiKey } from "@/lib/api"
import { cn } from "@/lib/cn"

// ---------------------------------------------------------------------------
// Small reusable primitives
// ---------------------------------------------------------------------------

function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("rounded-xl border border-zinc-800 bg-zinc-900/60 p-5", className)}>
      {children}
    </div>
  )
}

function Button({
  variant = "default",
  size = "md",
  disabled,
  onClick,
  className,
  children,
}: {
  variant?: "default" | "destructive" | "ghost" | "outline"
  size?: "sm" | "md"
  disabled?: boolean
  onClick?: () => void
  className?: string
  children: React.ReactNode
}) {
  const base =
    "inline-flex items-center gap-2 rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 disabled:opacity-40 disabled:pointer-events-none"
  const sizes = { sm: "px-3 py-1.5 text-sm", md: "px-4 py-2 text-sm" }
  const variants = {
    default: "bg-white text-zinc-900 hover:bg-zinc-100",
    destructive: "bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20",
    ghost: "text-zinc-400 hover:text-white hover:bg-zinc-800",
    outline: "border border-zinc-700 text-zinc-300 hover:bg-zinc-800",
  }
  return (
    <button
      className={cn(base, sizes[size], variants[variant], className)}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const handle = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button
      onClick={handle}
      className="ml-1 rounded p-1 text-zinc-500 hover:text-zinc-200 transition-colors"
      title="Copy to clipboard"
    >
      {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
    </button>
  )
}

// ---------------------------------------------------------------------------
// New-key banner — shown once after creation
// ---------------------------------------------------------------------------

function NewKeyBanner({ rawKey, onDismiss }: { rawKey: string; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(rawKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-5 space-y-3">
      <div className="flex items-center gap-2 text-emerald-400 font-medium text-sm">
        <Check size={16} />
        API key created — copy it now, it won&apos;t be shown again
      </div>
      <div className="flex items-center gap-2">
        <code className="flex-1 rounded-lg bg-zinc-950 border border-zinc-800 px-4 py-2.5 font-mono text-sm text-emerald-300 break-all">
          {rawKey}
        </code>
        <button
          onClick={copy}
          className="shrink-0 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-zinc-300 hover:bg-zinc-700 transition-colors flex items-center gap-2"
        >
          {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div className="rounded-lg bg-zinc-950 border border-zinc-800 p-3 font-mono text-xs text-zinc-400 space-y-1">
        <p className="text-zinc-500 mb-1"># Save credentials with the CLI:</p>
        <p>
          <span className="text-zinc-500">$</span>{" "}
          <span className="text-white">sandbox auth login</span>{" "}
          <span className="text-zinc-400">--key</span>{" "}
          <span className="text-emerald-300">{rawKey}</span>
        </p>
      </div>
      <button
        onClick={onDismiss}
        className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
      >
        Dismiss
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Key row
// ---------------------------------------------------------------------------

function KeyRow({
  apiKey,
  onRevoke,
  revoking,
}: {
  apiKey: ApiKey
  onRevoke: (id: string) => void
  revoking: boolean
}) {
  const created = new Date(apiKey.created_at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })

  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-zinc-800/60 last:border-0">
      <div className="flex items-center gap-3 min-w-0">
        <Key size={14} className="text-zinc-600 shrink-0" />
        <div className="min-w-0">
          <p className="text-sm text-zinc-200 font-medium truncate">{apiKey.name}</p>
          <p className="text-xs text-zinc-600 font-mono">{apiKey.key_prefix}</p>
        </div>
      </div>
      <div className="flex items-center gap-4 shrink-0">
        <span className="text-xs text-zinc-600 hidden sm:block">Created {created}</span>
        <Button
          variant="destructive"
          size="sm"
          disabled={revoking}
          onClick={() => onRevoke(apiKey.id)}
        >
          {revoking ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
          Revoke
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  const { user } = useUser()
  const { apiClient, isReady } = useSandboxClient()

  const [keys, setKeys] = useState<ApiKey[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [creating, setCreating] = useState(false)
  const [newKeyName, setNewKeyName] = useState("")
  const [showForm, setShowForm] = useState(false)
  const [newKeyResult, setNewKeyResult] = useState<ApiKey | null>(null)

  const [revokingId, setRevokingId] = useState<string | null>(null)

  // Load keys
  useEffect(() => {
    if (!isReady || !apiClient) return
    apiClient
      .listApiKeys()
      .then(setKeys)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [apiClient, isReady])

  const handleCreate = async () => {
    if (!apiClient || !newKeyName.trim()) return
    setCreating(true)
    setError(null)
    try {
      const created = await apiClient.createApiKey(newKeyName.trim())
      setNewKeyResult(created)
      setKeys((prev) => [{ ...created, raw_key: undefined }, ...prev])
      setNewKeyName("")
      setShowForm(false)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create key")
    } finally {
      setCreating(false)
    }
  }

  const handleRevoke = async (id: string) => {
    if (!apiClient) return
    setRevokingId(id)
    setError(null)
    try {
      await apiClient.revokeApiKey(id)
      setKeys((prev) => prev.filter((k) => k.id !== id))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to revoke key")
    } finally {
      setRevokingId(null)
    }
  }

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="max-w-2xl mx-auto px-4 py-10 space-y-8">

        {/* Header */}
        <div>
          <Link
            href="/lobby"
            className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors mb-5"
          >
            <ArrowLeft size={14} />
            Back to lobby
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          {user && (
            <p className="text-sm text-zinc-500 mt-1">
              {user.primaryEmailAddress?.emailAddress ?? user.fullName}
            </p>
          )}
        </div>

        {/* New key banner */}
        {newKeyResult?.raw_key && (
          <NewKeyBanner
            rawKey={newKeyResult.raw_key}
            onDismiss={() => setNewKeyResult(null)}
          />
        )}

        {/* Error */}
        {error && (
          <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* API Keys section */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold">API Keys</h2>
              <p className="text-xs text-zinc-500 mt-0.5">
                Use these keys to authenticate the CLI or MCP server.
              </p>
            </div>
            {!showForm && (
              <Button onClick={() => setShowForm(true)} size="sm">
                <Plus size={13} />
                New key
              </Button>
            )}
          </div>

          {/* Create form */}
          {showForm && (
            <div className="mb-4 flex gap-2">
              <input
                autoFocus
                type="text"
                placeholder="Key name, e.g. My laptop"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate()
                  if (e.key === "Escape") { setShowForm(false); setNewKeyName("") }
                }}
                className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500"
              />
              <Button
                onClick={handleCreate}
                disabled={creating || !newKeyName.trim()}
              >
                {creating ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                Create
              </Button>
              <Button
                variant="ghost"
                onClick={() => { setShowForm(false); setNewKeyName("") }}
              >
                Cancel
              </Button>
            </div>
          )}

          {/* Key list */}
          {loading ? (
            <div className="flex items-center gap-2 text-zinc-600 py-4 text-sm">
              <Loader2 size={14} className="animate-spin" />
              Loading keys…
            </div>
          ) : keys.length === 0 ? (
            <p className="text-sm text-zinc-600 py-2">
              No API keys yet. Create one to use the CLI.
            </p>
          ) : (
            <div>
              {keys.map((k) => (
                <KeyRow
                  key={k.id}
                  apiKey={k}
                  onRevoke={handleRevoke}
                  revoking={revokingId === k.id}
                />
              ))}
            </div>
          )}
        </Card>

        {/* CLI setup instructions */}
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <Terminal size={15} className="text-zinc-500" />
            <h2 className="text-base font-semibold">CLI Setup</h2>
          </div>
          <p className="text-sm text-zinc-400 mb-4">
            After creating a key above, authenticate the CLI with a single command:
          </p>
          <div className="space-y-2">
            <div className="rounded-lg bg-zinc-950 border border-zinc-800 px-4 py-3 font-mono text-sm">
              <div className="flex items-center justify-between gap-4">
                <code className="text-zinc-300">
                  <span className="text-zinc-600">$ </span>
                  sandbox auth login{" "}
                  <span className="text-zinc-500">--key</span>{" "}
                  <span className="text-emerald-400">sb_your_key_here</span>
                </code>
                <CopyButton text="sandbox auth login --key sb_your_key_here" />
              </div>
            </div>
            <div className="rounded-lg bg-zinc-950 border border-zinc-800 px-4 py-3 font-mono text-sm">
              <div className="flex items-center justify-between gap-4">
                <code className="text-zinc-300">
                  <span className="text-zinc-600">$ </span>
                  sandbox game list
                </code>
                <CopyButton text="sandbox game list" />
              </div>
            </div>
          </div>
          <p className="text-xs text-zinc-600 mt-3">
            The CLI is at{" "}
            <code className="text-zinc-400">sandbox-cli/</code> in this repo.
            Run <code className="text-zinc-400">npm install && npm run build && npm link</code> to install it globally.
          </p>
        </Card>

      </div>
    </main>
  )
}
