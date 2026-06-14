"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { api, Property } from "@/lib/api";
import { formatUsd, timeAgo } from "@/lib/utils";
import { StatusBadge, ScrapeBadge } from "@/components/Badges";
import Card from "@/components/Card";
import Button from "@/components/Button";
import { PageLoader } from "@/components/Spinner";
import { Plus, RefreshCw, Search } from "lucide-react";

export default function PropertiesPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    api.properties.list()
      .then(setProperties)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = properties.filter(p => {
    const q = filter.toLowerCase();
    return (
      p.geo_id.toLowerCase().includes(q) ||
      (p.display_address ?? "").toLowerCase().includes(q) ||
      (p.display_city ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text)]">Properties</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-0.5">{properties.length} assets</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={load} loading={loading}>
            <RefreshCw size={13} />
            Refresh
          </Button>
          <Link href="/properties/new">
            <Button variant="primary" size="sm">
              <Plus size={13} />
              Add Property
            </Button>
          </Link>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
        <input
          type="text"
          placeholder="Search by address, city, geo ID…"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          className="w-full bg-[var(--color-surface-page)] border border-[var(--color-border)] rounded-lg pl-9 pr-4 py-2 text-sm text-[var(--color-text)] placeholder-zinc-600 focus:outline-none focus:border-[var(--color-blue)]"
        />
      </div>

      {/* List */}
      {loading ? (
        <PageLoader />
      ) : filtered.length === 0 ? (
        <Card>
          <p className="text-sm text-[var(--color-text-muted)] text-center py-6">
            {filter ? "No properties match your search." : (
              <>
                No properties yet.{" "}
                <Link href="/properties/new" className="text-emerald-600 hover:underline">
                  Add your first property →
                </Link>
              </>
            )}
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(prop => (
            <Link key={prop.geo_id} href={`/properties/${prop.geo_id}`}>
              <Card className="hover:border-[var(--color-border)] transition-colors cursor-pointer">
                <div className="flex items-center gap-4">
                  {/* Left: address info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <p className="text-sm font-medium text-[var(--color-text)] truncate">
                        {prop.display_address || prop.geo_id}
                      </p>
                      <StatusBadge status={prop.status} />
                    </div>
                    <div className="flex items-center gap-3 text-xs text-[var(--color-text-muted)]">
                      <span>
                        {[prop.display_city, prop.display_state].filter(Boolean).join(", ") || "—"}
                      </span>
                      {prop.property_type && <span>· {prop.property_type}</span>}
                      <span>· <ScrapeBadge status={prop.scrape_status} /></span>
                    </div>
                  </div>

                  {/* Right: value + token chips */}
                  <div className="text-right shrink-0 space-y-1">
                    <p className="text-sm font-semibold text-[var(--color-text)]">{formatUsd(prop.primary_value)}</p>
                    <div className="flex items-center gap-1 justify-end flex-wrap">
                      {prop.property_token_address && (
                        <span className="text-[10px] bg-emerald-500/10 text-emerald-600 px-1.5 py-0.5 rounded">
                          PropertyToken
                        </span>
                      )}
                      {prop.security_token_address && (
                        <span className="text-[10px] bg-purple-500/10 text-purple-600 px-1.5 py-0.5 rounded">
                          SecurityToken
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[var(--color-text-muted)]">{timeAgo(prop.updated_at)}</p>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
