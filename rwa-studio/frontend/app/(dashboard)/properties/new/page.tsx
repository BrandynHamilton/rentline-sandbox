"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import Card, { CardHeader } from "@/components/Card";
import Button from "@/components/Button";
import { ArrowLeft, Link2, PenLine } from "lucide-react";
import Link from "next/link";

type Mode = "url" | "manual";

export default function NewPropertyPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("url");
  const [url, setUrl] = useState("");
  const [value, setValue] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const [beds, setBeds] = useState("");
  const [baths, setBaths] = useState("");
  const [sqft, setSqft] = useState("");
  const [propType, setPropType] = useState("");
  const [yearBuilt, setYearBuilt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (mode === "url") {
        if (!url.trim()) { setError("URL is required"); setLoading(false); return; }
        const prop = await api.properties.create({
          source_url: url.trim(),
          primary_value: value ? parseFloat(value) : undefined,
        });
        router.push(`/properties/${prop.geo_id}`);
      } else {
        const fullAddress = [address, city, state, zip].filter(Boolean).join(", ");
        const prop = await api.properties.create({
          primary_value: value ? parseFloat(value) : undefined,
          metadata: {
            address: { street: address, city, state, zip_code: zip, full_address: fullAddress },
            property_details: {
              bedrooms: beds ? parseInt(beds) : 0,
              bathrooms: baths ? parseFloat(baths) : 0,
              sqft: sqft ? parseInt(sqft) : 0,
              year_built: yearBuilt ? parseInt(yearBuilt) : 0,
              property_type: propType,
              lot_size: "", style: "", stories: 0,
            },
          },
        });
        router.push(`/properties/${prop.geo_id}`);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/properties" className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text)]">Add Property</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-0.5">Create a new tokenizable real estate asset</p>
        </div>
      </div>

      {/* Mode toggle */}
      <div className="flex rounded-lg border border-[var(--color-border)] p-1 gap-1 w-fit">
        {([["url", "Scrape from URL", Link2], ["manual", "Enter manually", PenLine]] as const).map(([m, label, Icon]) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm transition-colors cursor-pointer
              ${mode === m ? "bg-[var(--color-surface)] text-[var(--color-text)]" : "text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"}`}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader
            title={mode === "url" ? "Property URL" : "Property Details"}
            subtitle={
              mode === "url"
                ? "Paste a Zillow or MLS listing URL. A scrape job will extract the data automatically."
                : "Enter property details manually. You can update them later."
            }
          />

          <div className="space-y-4">
            {mode === "url" ? (
              <div>
                <label className="block text-xs text-[var(--color-text-secondary)] mb-1">Listing URL *</label>
                <input
                  type="url"
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  placeholder="https://www.zillow.com/homedetails/..."
                  className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text)] placeholder-zinc-600 focus:outline-none focus:border-[var(--color-blue)]"
                />
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-xs text-[var(--color-text-secondary)] mb-1">Street Address</label>
                  <input
                    value={address}
                    onChange={e => setAddress(e.target.value)}
                    placeholder="123 Main St"
                    className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text)] placeholder-zinc-600 focus:outline-none focus:border-[var(--color-blue)]"
                  />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-[var(--color-text-secondary)] mb-1">City</label>
                    <input value={city} onChange={e => setCity(e.target.value)} placeholder="Miami"
                      className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text)] placeholder-zinc-600 focus:outline-none focus:border-[var(--color-blue)]" />
                  </div>
                  <div>
                    <label className="block text-xs text-[var(--color-text-secondary)] mb-1">State</label>
                    <input value={state} onChange={e => setState(e.target.value)} placeholder="FL"
                      className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text)] placeholder-zinc-600 focus:outline-none focus:border-[var(--color-blue)]" />
                  </div>
                  <div>
                    <label className="block text-xs text-[var(--color-text-secondary)] mb-1">ZIP</label>
                    <input value={zip} onChange={e => setZip(e.target.value)} placeholder="33101"
                      className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text)] placeholder-zinc-600 focus:outline-none focus:border-[var(--color-blue)]" />
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs text-[var(--color-text-secondary)] mb-1">Beds</label>
                    <input type="number" value={beds} onChange={e => setBeds(e.target.value)} placeholder="3"
                      className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text)] placeholder-zinc-600 focus:outline-none focus:border-[var(--color-blue)]" />
                  </div>
                  <div>
                    <label className="block text-xs text-[var(--color-text-secondary)] mb-1">Baths</label>
                    <input type="number" step="0.5" value={baths} onChange={e => setBaths(e.target.value)} placeholder="2"
                      className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text)] placeholder-zinc-600 focus:outline-none focus:border-[var(--color-blue)]" />
                  </div>
                  <div>
                    <label className="block text-xs text-[var(--color-text-secondary)] mb-1">Sqft</label>
                    <input type="number" value={sqft} onChange={e => setSqft(e.target.value)} placeholder="1500"
                      className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text)] placeholder-zinc-600 focus:outline-none focus:border-[var(--color-blue)]" />
                  </div>
                  <div>
                    <label className="block text-xs text-[var(--color-text-secondary)] mb-1">Year Built</label>
                    <input type="number" value={yearBuilt} onChange={e => setYearBuilt(e.target.value)} placeholder="1995"
                      className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text)] placeholder-zinc-600 focus:outline-none focus:border-[var(--color-blue)]" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-[var(--color-text-secondary)] mb-1">Property Type</label>
                  <select value={propType} onChange={e => setPropType(e.target.value)}
                    className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-blue)]">
                    <option value="">Select type…</option>
                    <option value="Single Family">Single Family</option>
                    <option value="Multi Family">Multi Family</option>
                    <option value="Condo">Condo</option>
                    <option value="Townhouse">Townhouse</option>
                    <option value="Commercial">Commercial</option>
                    <option value="Mixed Use">Mixed Use</option>
                    <option value="Industrial">Industrial</option>
                    <option value="Land">Land</option>
                  </select>
                </div>
              </>
            )}

            {/* Value — shown in both modes */}
            <div>
              <label className="block text-xs text-[var(--color-text-secondary)] mb-1">
                Initial Valuation (USD){mode === "url" ? " — optional, overrides scrape" : ""}
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] text-sm">$</span>
                <input
                  type="number"
                  value={value}
                  onChange={e => setValue(e.target.value)}
                  placeholder="850000"
                  className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg pl-7 pr-4 py-2 text-sm text-[var(--color-text)] placeholder-zinc-600 focus:outline-none focus:border-[var(--color-blue)]"
                />
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Link href="/properties">
                <Button variant="ghost">Cancel</Button>
              </Link>
              <Button type="submit" variant="primary" loading={loading}>
                {mode === "url" ? "Create & Scrape" : "Create Property"}
              </Button>
            </div>
          </div>
        </Card>
      </form>
    </div>
  );
}
