"use client";
import { useEffect, useState, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, Portfolio, Property } from "@/lib/api";
import { formatUsd, timeAgo } from "@/lib/utils";
import { AddressLink, truncateAddr } from "@/lib/explorer";
import { StatusBadge } from "@/components/Badges";
import Card, { CardHeader, Stat } from "@/components/Card";
import Button from "@/components/Button";
import Modal from "@/components/Modal";
import { PageLoader } from "@/components/Spinner";
import { ArrowLeft, Plus, X, Trash2, RefreshCw, Search } from "lucide-react";

export default function PortfolioDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const portId = parseInt(id);

  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [allProperties, setAllProperties] = useState<Property[]>([]);
  const [search, setSearch] = useState("");
  const [addSearch, setAddSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.portfolios.get(portId),
      api.properties.list(),
    ])
      .then(([port, props]) => { setPortfolio(port); setAllProperties(props); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [portId]);

  useEffect(() => { load(); }, [load]);

  const handleAddProperty = async (geo_id: string) => {
    setAdding(true);
    try { await api.portfolios.addProperty(portId, geo_id); load(); setAddOpen(false); }
    catch (e) { console.error(e); }
    finally { setAdding(false); }
  };

  const handleRemove = async (geo_id: string) => {
    setRemoving(geo_id);
    try { await api.portfolios.removeProperty(portId, geo_id); load(); }
    catch (e) { console.error(e); }
    finally { setRemoving(null); }
  };

  const handleDelete = async () => {
    if (!confirm("Delete this portfolio? Properties will not be affected.")) return;
    setDeleting(true);
    try { await api.portfolios.delete(portId); router.push("/portfolios"); }
    catch (e) { console.error(e); setDeleting(false); }
  };

  if (loading) return <PageLoader />;
  if (!portfolio) return <p className="text-[var(--color-text-muted)]">Portfolio not found.</p>;

  const currentIds = new Set((portfolio.properties ?? []).map(p => p.geo_id));
  const addable = allProperties.filter(p => !currentIds.has(p.geo_id));
  const filteredAddable = addable.filter(p => {
    const q = addSearch.toLowerCase();
    return (p.display_address ?? "").toLowerCase().includes(q) || p.geo_id.includes(q);
  });

  const filteredProps = (portfolio.properties ?? []).filter(p => {
    const q = search.toLowerCase();
    return (p.display_address ?? "").toLowerCase().includes(q) || p.geo_id.includes(q);
  });

  return (
    <div className="max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/portfolios" className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-[var(--color-text)]">{portfolio.name}</h1>
          {portfolio.description && (
            <p className="text-sm text-[var(--color-text-muted)] mt-0.5">{portfolio.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={load}><RefreshCw size={13} /></Button>
          <Button size="sm" variant="danger" onClick={handleDelete} loading={deleting}>
            <Trash2 size={13} />
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card><Stat label="Properties" value={portfolio.property_count} /></Card>
        <Card><Stat label="Aggregate NAV" value={formatUsd(portfolio.aggregate_nav)} /></Card>
        <Card>
          <Stat
            label="Owner"
            value={portfolio.owner_address ? <AddressLink address={portfolio.owner_address} /> : "—"}
          />
        </Card>
        <Card><Stat label="Created" value={timeAgo(portfolio.created_at)} /></Card>
      </div>

      {/* Properties table */}
      <Card>
        <CardHeader
          title="Properties"
          subtitle={`${portfolio.property_count} assets`}
          action={
            <Button size="sm" variant="primary" onClick={() => setAddOpen(true)}>
              <Plus size={12} /> Add Property
            </Button>
          }
        />

        {/* Search */}
        <div className="relative mb-4">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Filter properties…"
            className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg pl-8 pr-4 py-1.5 text-sm text-[var(--color-text)] placeholder-zinc-600 focus:outline-none focus:border-[var(--color-blue)]"
          />
        </div>

        {filteredProps.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)] text-center py-6">
            {search ? "No matching properties." : "No properties in this portfolio yet."}
          </p>
        ) : (
          <div className="space-y-2">
            {filteredProps.map(prop => (
              <div key={prop.geo_id} className="flex items-center gap-4 p-3 rounded-lg border border-[var(--color-border)] hover:border-[var(--color-border)] transition-colors">
                <Link href={`/properties/${prop.geo_id}`} className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-sm text-[var(--color-text)] truncate font-medium">
                      {prop.display_address || prop.geo_id}
                    </p>
                    <StatusBadge status={prop.status} />
                  </div>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    {[prop.display_city, prop.display_state].filter(Boolean).join(", ") || "—"}
                    {prop.property_type ? ` · ${prop.property_type}` : ""}
                  </p>
                </Link>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold text-[var(--color-text)]">{formatUsd(prop.primary_value)}</p>
                  <p className="text-xs text-[var(--color-text-muted)]">{prop.geo_id}</p>
                </div>
                <Button
                  size="sm" variant="ghost"
                  loading={removing === prop.geo_id}
                  onClick={() => handleRemove(prop.geo_id)}
                >
                  <X size={13} />
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Add property modal */}
      <Modal open={addOpen} onClose={() => { setAddOpen(false); setAddSearch(""); }} title="Add Property to Portfolio" width="max-w-xl">
        <div className="space-y-3">
          <input
            value={addSearch} onChange={e => setAddSearch(e.target.value)}
            placeholder="Search properties…"
            className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text)] placeholder-zinc-600 focus:outline-none focus:border-[var(--color-blue)]"
          />
          {filteredAddable.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)] text-center py-4">
              {addSearch ? "No matching properties." : "All properties already added."}
            </p>
          ) : (
            <div className="space-y-1.5 max-h-72 overflow-y-auto">
              {filteredAddable.map(p => (
                <button
                  key={p.geo_id}
                  type="button"
                  onClick={() => handleAddProperty(p.geo_id)}
                  disabled={adding}
                  className="w-full flex items-center justify-between p-2.5 rounded-lg border border-[var(--color-border)] hover:border-emerald-700 hover:bg-emerald-500/5 text-left transition-colors cursor-pointer disabled:opacity-50"
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
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
