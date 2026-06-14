/**
 * Typed API client for the RWA Studio backend.
 * All requests go through a single base URL (configurable via env).
 */

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const API  = `${BASE}/api/v1`;
const ADMIN_KEY = process.env.NEXT_PUBLIC_ADMIN_API_KEY ?? "";

// ── Types ─────────────────────────────────────────────────────────────────────

export type PropertyStatus    = "draft" | "scraping" | "ready" | "deployed";
export type ScrapeStatus      = "pending" | "running" | "done" | "failed";

export interface ValuationSource {
  id: number;
  source: string;        // scrape | zillow | attom | manual
  avm_value: number;
  is_primary: boolean;
  fetched_at: string;
}

export interface Property {
  id: number;
  geo_id: string;
  status: PropertyStatus;
  scrape_status: ScrapeStatus;
  source_url: string | null;
  primary_value: number | null;
  property_token_address: string | null;
  security_token_address: string | null;
  nft_token_address: string | null;
  display_address: string | null;
  display_city: string | null;
  display_state: string | null;
  property_type: string | null;
  created_at: string;
  updated_at: string;
  valuation_sources: ValuationSource[];
}

export interface PropertyMetadataAddress {
  street: string;
  city: string;
  state: string;
  zip_code: string;
  full_address: string;
}

export interface PropertyMetadataDetails {
  bedrooms: number;
  bathrooms: number;
  sqft: number;
  lot_size: string;
  year_built: number;
  property_type: string;
  style: string;
  stories: number;
}

export interface PropertyMetadata {
  price: string;
  address: PropertyMetadataAddress;
  property_details: PropertyMetadataDetails;
  financial: {
    price_per_sqft: number;
    hoa_fee: number;
    hoa_fee_frequency: string;
    taxes_annual: number;
    utilities_included: string[];
  };
  neighborhood: {
    name: string;
    description: string;
    schools: string[];
    walk_score: number;
    transit_score: number;
  };
  media: {
    photos: string[];
    virtual_tour_url: string;
    video_url: string;
  };
  features: {
    interior: string[];
    exterior: string[];
    amenities: string[];
    parking: string[];
  };
}

export interface CapitalStackConfig {
  id: number;
  property_id: number;
  preferred_return_bps: number;
  sponsor_promote_bps: number;
  waterfall_threshold: number;
  equity_raise_target: number | null;
  min_investment_usd: number | null;
  distribution_manager_address: string | null;
  investor_registry_address: string | null;
  created_at: string;
  updated_at: string;
}

export interface Portfolio {
  id: number;
  name: string;
  description: string | null;
  owner_address: string | null;
  aggregate_nav: number;
  property_count: number;
  created_at: string;
  properties?: Property[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const { headers: initHeaders, ...rest } = init ?? {};
  const res = await fetch(`${API}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(initHeaders ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  return res.json() as Promise<T>;
}

/** Same as req() but adds X-Admin-Key for protected deploy endpoints. */
async function adminReq<T>(path: string, init?: RequestInit): Promise<T> {
  const { headers: initHeaders, ...rest } = init ?? {};
  return req<T>(path, {
    ...rest,
    headers: {
      ...(initHeaders ?? {}),
      "X-Admin-Key": ADMIN_KEY,
    },
  });
}

// ── Properties ────────────────────────────────────────────────────────────────

export const api = {
  properties: {
    list: (status?: string) =>
      req<Property[]>(`/properties${status ? `?status=${status}` : ""}`),

    get: (geoId: string) =>
      req<Property>(`/properties/${geoId}`),

    status: (geoId: string) =>
      req<{ geo_id: string; status: string; scrape_status: string; primary_value: number | null }>
        (`/properties/${geoId}/status`),

    create: (body: { source_url?: string; primary_value?: number; metadata?: Partial<PropertyMetadata> }) =>
      req<Property>(`/properties`, { method: "POST", body: JSON.stringify(body) }),

    setValue: (geoId: string, value: number, reason?: string) =>
      req<Property>(`/properties/${geoId}/value`, {
        method: "PUT",
        body: JSON.stringify({ value, reason }),
      }),

    setMetadata: (geoId: string, metadata: Partial<PropertyMetadata>) =>
      req<Property>(`/properties/${geoId}/metadata`, {
        method: "PUT",
        body: JSON.stringify({ metadata }),
      }),

    retriggerScrape: (geoId: string) =>
      req<{ geo_id: string; message: string }>(`/properties/${geoId}/scrape`, { method: "POST" }),

    delete: (geoId: string) =>
      req<{ geo_id: string; deleted: boolean }>(`/properties/${geoId}`, { method: "DELETE" }),

    createRentline: (geoId: string) =>
      req<{ geo_id: string; rentline_property_id: string; rentline_response: unknown }>(
        `/properties/${geoId}/rentline/create`, { method: "POST" }
      ),
    
    /**
     * Create property in Rentline directly (bypasses RWA Studio backend).
     * Sends property metadata + Bearer token directly to Rentline API.
     */
    createRentlineDirectly: (geoId: string, name: string, wallet_address: string, street_address?: string, city?: string, state?: string, zip_code?: string) => {
      const token = localStorage.getItem("clerk_token");
      const rentlineUrl = process.env.NEXT_PUBLIC_RENTLINE_URL || "http://localhost:6531";
      return fetch(`${rentlineUrl}/api/properties`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "Authorization": `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          name,
          wallet_address,
          street_address: street_address || null,
          city: city || null,
          state: state || null,
          zip_code: zip_code || null,
        }),
      }).then(r => {
        if (!r.ok) throw new Error(`Rentline API error: ${r.status}`);
        return r.json();
      });
    },
  },

  valuations: {
    list: (geoId: string) =>
      req<ValuationSource[]>(`/valuations/${geoId}`),

    fetch: (geoId: string, address?: string, sources?: string[]) =>
      req<{ geo_id: string; address: string; message: string }>(`/valuations/${geoId}/fetch`, {
        method: "POST",
        body: JSON.stringify({ address, sources }),
      }),

    setPrimary: (geoId: string, valuationSourceId: number) =>
      req<ValuationSource>(`/valuations/${geoId}/primary`, {
        method: "PUT",
        body: JSON.stringify({ valuation_source_id: valuationSourceId }),
      }),

    addManual: (geoId: string, avm_value: number, notes?: string) =>
      req<ValuationSource>(`/valuations/${geoId}/manual`, {
        method: "POST",
        body: JSON.stringify({ avm_value, notes, set_primary: true }),
      }),
  },

  tokens: {
    info: (geoId: string) =>
      req<{
        geo_id: string;
        status: string;
        property_token_address: string | null;
        security_token_address: string | null;
        nft_token_address: string | null;
        token_uri: string;
        primary_value: number | null;
      }>(`/tokens/${geoId}`),

    deployProperty: (geoId: string, owner_address: string, usdc_address: string, initial_supply?: number) =>
      adminReq<{ geo_id: string; token_type: string; address: string; tx_hash: string; token_uri: string }>(
        `/tokens/${geoId}/deploy/property`,
        { method: "POST", body: JSON.stringify({ owner_address, usdc_address, initial_supply }) }
      ),

    deploySecurity: (geoId: string, body: { name: string; symbol: string; compliance_manager: string; governance_multisig: string }) =>
      adminReq<{ geo_id: string; token_type: string; address: string; tx_hash: string; token_uri: string }>(
        `/tokens/${geoId}/deploy/security`,
        { method: "POST", body: JSON.stringify(body) }
      ),

    deployNFT: (geoId: string, owner_address: string, usdc_address: string) =>
      adminReq<{ geo_id: string; token_type: string; address: string; tx_hash: string; token_uri: string }>(
        `/tokens/${geoId}/deploy/nft`,
        { method: "POST", body: JSON.stringify({ owner_address, usdc_address }) }
      ),

    register: (geoId: string, token_type: string, address: string, tx_hash?: string) =>
      req<{ geo_id: string; token_type: string; address: string; tx_hash: string | null }>(
        `/tokens/${geoId}/register`,
        { method: "POST", body: JSON.stringify({ token_type, address, tx_hash }) }
      ),

    verify: (geoId: string, token_type: string, address: string) =>
      req<{ geo_id: string; token_type: string; address: string; message: string }>(
        `/tokens/${geoId}/verify`,
        { method: "POST", body: JSON.stringify({ token_type, address }) }
      ),

    pushRentline: (geoId: string, rentline_property_id: string, token_address?: string) =>
      req<{ geo_id: string; rentline_property_id: string; token_address: string; rentline_response: unknown }>(
        `/tokens/${geoId}/push_rentline`,
        { method: "POST", body: JSON.stringify({ rentline_property_id, ...(token_address ? { token_address } : {}) }) }
      ),
  },

  capitalStack: {
    getConfig: (geoId: string) =>
      req<CapitalStackConfig>(`/capital_stack/${geoId}/config`),

    setConfig: (geoId: string, body: {
      preferred_return_bps: number;
      sponsor_promote_bps: number;
      waterfall_threshold: number;
      equity_raise_target?: number;
      min_investment_usd?: number;
    }) =>
      req<CapitalStackConfig>(`/capital_stack/${geoId}/config`, {
        method: "POST",
        body: JSON.stringify(body),
      }),

    deploy: (geoId: string, usdc_address: string, accreditation_verifier?: string) =>
      req<object>(`/capital_stack/${geoId}/deploy`, {
        method: "POST",
        body: JSON.stringify({ usdc_address, accreditation_verifier }),
      }),

    getState: (geoId: string) =>
      req<{
        total_distributed: number;
        preferred_return_paid: number;
        sponsor_promote_paid: number;
        investor_payout: number;
        last_distribution_time: number;
      }>(`/capital_stack/${geoId}/state`),
  },

  portfolios: {
    list: () => req<Portfolio[]>(`/portfolios`),

    get: (id: number) => req<Portfolio>(`/portfolios/${id}`),

    create: (body: { name: string; description?: string; owner_address?: string; property_geo_ids?: string[] }) =>
      req<Portfolio>(`/portfolios`, { method: "POST", body: JSON.stringify(body) }),

    addProperty: (id: number, geo_id: string) =>
      req<object>(`/portfolios/${id}/properties`, {
        method: "POST",
        body: JSON.stringify({ geo_id }),
      }),

    removeProperty: (id: number, geo_id: string) =>
      req<object>(`/portfolios/${id}/properties/${geo_id}`, { method: "DELETE" }),

    delete: (id: number) =>
      req<object>(`/portfolios/${id}`, { method: "DELETE" }),
  },

  metadata: {
    get: (geoId: string) =>
      fetch(`${BASE}/metadata/${geoId}`).then(r => r.json()),
  },
};
