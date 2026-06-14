"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, Property, Portfolio } from "@/lib/api";
import { formatUsd, timeAgo } from "@/lib/utils";
import { StatusBadge } from "@/components/Badges";
import Card, { Stat } from "@/components/Card";
import { PageLoader } from "@/components/Spinner";
import { ArrowRight, Building2, Layers } from "lucide-react";

export default function DashboardPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.properties.list(), api.portfolios.list()])
      .then(([props, ports]) => { setProperties(props); setPortfolios(ports); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <PageLoader />;

  const deployed  = properties.filter(p => p.status === "deployed").length;
  const ready     = properties.filter(p => p.status === "ready").length;
  const totalNAV  = properties.reduce((sum, p) => sum + (p.primary_value ?? 0), 0);
  const portNAV   = portfolios.reduce((sum, p) => sum + (p.aggregate_nav ?? 0), 0);

  const recent = [...properties]
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 6);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Dashboard</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          Rentline Sandbox is an onchain real estate environment on Robinhood Chain powered by Rentline Core. For investors, it is a turn-based simulation where you trade fractional property tokens with macro-driven real estate finance products like mortgages and liens. For developers, it is an RWA toolkit for token design, recurring cash flows, and fiat to stablecoin servicing conversion.
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <Stat label="Total Properties" value={properties.length} sub={`${deployed} deployed · ${ready} ready`} />
        </Card>
        <Card>
          <Stat label="Total Asset NAV" value={formatUsd(totalNAV)} />
        </Card>
        <Card>
          <Stat label="Portfolios" value={portfolios.length} sub={`${formatUsd(portNAV)} aggregate NAV`} />
        </Card>
        <Card>
          <Stat label="On-Chain Tokens" value={deployed} sub="PropertyToken / SecurityToken" />
        </Card>
      </div>

      {/* Quick actions */}
      <div className="grid sm:grid-cols-2 gap-4">
        <Link href="/properties/new">
          <Card className="hover:border-emerald-700 transition-colors cursor-pointer group">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                <Building2 size={20} className="text-emerald-600" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-sm text-[var(--color-text)]">Add Property</p>
                <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                  Paste a Zillow / MLS URL or enter details manually
                </p>
              </div>
              <ArrowRight size={16} className="text-[var(--color-text-muted)] group-hover:text-emerald-600 transition-colors" />
            </div>
          </Card>
        </Link>

        <Link href="/portfolios/new">
          <Card className="hover:border-blue-700 transition-colors cursor-pointer group">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                <Layers size={20} className="text-blue-600" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-sm text-[var(--color-text)]">New Portfolio</p>
                <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                  Group residential properties &amp; track aggregate NAV
                </p>
              </div>
              <ArrowRight size={16} className="text-[var(--color-text-muted)] group-hover:text-blue-600 transition-colors" />
            </div>
          </Card>
        </Link>
      </div>

      {/* Recent properties */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-sm text-[var(--color-text)]">Recent Properties</h2>
          <Link href="/properties" className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] flex items-center gap-1">
            View all <ArrowRight size={12} />
          </Link>
        </div>
        {recent.length === 0 ? (
          <Card>
            <p className="text-sm text-[var(--color-text-muted)] text-center py-4">
              No properties yet.{" "}
              <Link href="/properties/new" className="text-emerald-600 hover:underline">
                Add your first property →
              </Link>
            </p>
          </Card>
        ) : (
          <div className="space-y-2">
            {recent.map(prop => (
              <Link key={prop.geo_id} href={`/properties/${prop.geo_id}`}>
                <Card className="hover:border-[var(--color-border)] transition-colors cursor-pointer">
                  <div className="flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm font-medium text-[var(--color-text)] truncate">
                          {prop.display_address || prop.geo_id}
                        </p>
                        <StatusBadge status={prop.status} />
                      </div>
                      <p className="text-xs text-[var(--color-text-muted)] truncate">
                        {[prop.display_city, prop.display_state].filter(Boolean).join(", ") || "No address"}
                        {prop.property_type ? ` · ${prop.property_type}` : ""}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold text-[var(--color-text)]">{formatUsd(prop.primary_value)}</p>
                      <p className="text-xs text-[var(--color-text-muted)]">{timeAgo(prop.updated_at)}</p>
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
