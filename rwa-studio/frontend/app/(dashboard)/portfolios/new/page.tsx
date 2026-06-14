"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, Property } from "@/lib/api";
import Card, { CardHeader } from "@/components/Card";
import Button from "@/components/Button";
import { PageLoader } from "@/components/Spinner";
import { ArrowLeft, Plus, X } from "lucide-react";
import { formatUsd } from "@/lib/utils";
import { StatusBadge } from "@/components/Badges";

export default function NewPortfolioPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [ownerAddr, setOwnerAddr] = useState("");
  const [allProperties, setAllProperties] = useState<Property[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [propsLoading, setPropsLoading] = useState(true);
  const [err, setErr] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    api.properties.list()
      .then(setAllProperties)
      .catch(console.error)
      .finally(() => setPropsLoading(false));
  }, []);

  const toggle = (geo_id: string) => {
    setSelected(prev =>
      prev.includes(geo_id) ? prev.filter(id => id !== geo_id) : [...prev, geo_id]
    );
  };

  const filtered = allProperties.filter(p => {
    const q = search.toLowerCase();
    return (p.display_address ?? "").toLowerCase().includes(q) || p.geo_id.includes(q);
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setErr("Name is required"); return; }
    setLoading(true); setErr("");
    try {
      const port = await api.portfolios.create({
        name: name.trim(),
        description: description || undefined,
        owner_address: ownerAddr || undefined,
        property_geo_ids: selected,
      });
      router.push(`/portfolios/${port.id}`);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/portfolios" className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text)]">New Portfolio</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-0.5">Group residential properties and track aggregate NAV</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Card>
          <CardHeader title="Portfolio Details" />
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-[var(--color-text-secondary)] mb-1">Name *</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Miami Beach Portfolio"
                className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text)] placeholder-zinc-600 focus:outline-none focus:border-[var(--color-blue)]" />
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-secondary)] mb-1">Description</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
                placeholder="Residential properties in Miami Beach area"
                className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text)] placeholder-zinc-600 focus:outline-none focus:border-[var(--color-blue)] resize-none" />
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-secondary)] mb-1">Owner Address (optional)</label>
              <input value={ownerAddr} onChange={e => setOwnerAddr(e.target.value)} placeholder="0x..."
                className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text)] placeholder-zinc-600 focus:outline-none focus:border-[var(--color-blue)] font-mono" />
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Add Properties"
            subtitle={`${selected.length} selected`}
          />
          {/* Selected chips */}
          {selected.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-4">
              {selected.map(id => {
                const p = allProperties.find(x => x.geo_id === id);
                return (
                  <span key={id} className="flex items-center gap-1 bg-emerald-500/10 text-emerald-600 text-xs px-2 py-0.5 rounded-full border border-emerald-700/30">
                    {p?.display_address?.split(",")[0] ?? id}
                    <button type="button" onClick={() => toggle(id)} className="hover:text-emerald-200 cursor-pointer">
                      <X size={10} />
                    </button>
                  </span>
                );
              })}
            </div>
          )}

          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search properties…"
            className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text)] placeholder-zinc-600 focus:outline-none focus:border-[var(--color-blue)] mb-3"
          />

          {propsLoading ? <PageLoader /> : filtered.length === 0 ? (
            <p className="text-xs text-[var(--color-text-muted)] text-center py-4">No properties found.</p>
          ) : (
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {filtered.map(p => {
                const isSelected = selected.includes(p.geo_id);
                return (
                  <button
                    key={p.geo_id}
                    type="button"
                    onClick={() => toggle(p.geo_id)}
                    className={`w-full flex items-center justify-between p-2.5 rounded-lg border text-left transition-colors cursor-pointer
                      ${isSelected ? "border-emerald-700 bg-emerald-500/5" : "border-[var(--color-border)] hover:border-[var(--color-border)]"}`}
                  >
                    <div>
                      <p className="text-sm text-[var(--color-text)]">{p.display_address || p.geo_id}</p>
                      <p className="text-xs text-[var(--color-text-muted)]">
                        {[p.display_city, p.display_state].filter(Boolean).join(", ")}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-sm font-semibold text-[var(--color-text)]">{formatUsd(p.primary_value)}</span>
                      <StatusBadge status={p.status} />
                      {isSelected && <span className="text-emerald-600 text-xs">✓</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </Card>

        {err && (
          <p className="text-sm text-red-600 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{err}</p>
        )}

        <div className="flex justify-end gap-2">
          <Link href="/portfolios"><Button variant="ghost" type="button">Cancel</Button></Link>
          <Button variant="primary" type="submit" loading={loading}>
            <Plus size={13} /> Create Portfolio
          </Button>
        </div>
      </form>
    </div>
  );
}
