"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { api, Portfolio } from "@/lib/api";
import { formatUsd, timeAgo } from "@/lib/utils";
import { AddressLink } from "@/lib/explorer";
import Card from "@/components/Card";
import Button from "@/components/Button";
import { PageLoader } from "@/components/Spinner";
import { Plus, RefreshCw, Layers, ArrowRight } from "lucide-react";

export default function PortfoliosPage() {
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api.portfolios.list()
      .then(setPortfolios)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const totalNAV = portfolios.reduce((s, p) => s + p.aggregate_nav, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text)]">Portfolios</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-0.5">
            {portfolios.length} portfolio{portfolios.length !== 1 ? "s" : ""} · {formatUsd(totalNAV)} total NAV
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={load} loading={loading}>
            <RefreshCw size={13} /> Refresh
          </Button>
          <Link href="/portfolios/new">
            <Button variant="primary" size="sm">
              <Plus size={13} /> New Portfolio
            </Button>
          </Link>
        </div>
      </div>

      {loading ? <PageLoader /> : portfolios.length === 0 ? (
        <Card>
          <div className="text-center py-8 space-y-3">
            <Layers size={32} className="mx-auto text-[var(--color-text-muted)]" />
            <p className="text-sm text-[var(--color-text-muted)]">No portfolios yet.</p>
            <Link href="/portfolios/new">
              <Button variant="primary" size="sm">
                <Plus size={13} /> Create your first portfolio
              </Button>
            </Link>
          </div>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {portfolios.map(port => (
            <Link key={port.id} href={`/portfolios/${port.id}`}>
              <Card className="hover:border-[var(--color-border)] transition-colors cursor-pointer h-full flex flex-col group">
                <div className="flex items-start justify-between mb-4">
                  <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center">
                    <Layers size={18} className="text-blue-600" />
                  </div>
                  <ArrowRight size={14} className="text-[var(--color-text-muted)] group-hover:text-[var(--color-text)] transition-colors mt-1" />
                </div>
                <h3 className="font-semibold text-sm text-[var(--color-text)] mb-1">{port.name}</h3>
                {port.description && (
                  <p className="text-xs text-[var(--color-text-muted)] mb-3 line-clamp-2">{port.description}</p>
                )}
                <div className="mt-auto space-y-2 pt-3 border-t border-[var(--color-border)]">
                  <div className="flex justify-between text-xs">
                    <span className="text-[var(--color-text-muted)]">Properties</span>
                    <span className="text-[var(--color-text)] font-medium">{port.property_count}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-[var(--color-text-muted)]">Aggregate NAV</span>
                    <span className="text-emerald-600 font-semibold">{formatUsd(port.aggregate_nav)}</span>
                  </div>
                  {port.owner_address && (
                    <div className="flex justify-between text-xs">
                      <span className="text-[var(--color-text-muted)]">Owner</span>
                      <span className="text-[var(--color-text-secondary)] font-mono"><AddressLink address={port.owner_address} /></span>
                    </div>
                  )}
                  <p className="text-[10px] text-[var(--color-text-muted)] pt-1">{timeAgo(port.created_at)}</p>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
