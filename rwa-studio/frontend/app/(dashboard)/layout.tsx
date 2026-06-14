import Sidebar from "@/components/Sidebar";
import Web3Provider from "@/components/Web3Provider";
import AuthGuard from "@/components/AuthGuard";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <Web3Provider>
      <AuthGuard>
        <Sidebar />
        <main className="flex-1 ml-[216px] flex flex-col min-h-screen">
          <div className="flex-1 max-w-7xl w-full px-8 py-6">
            {children}
          </div>
          <footer className="border-t border-[var(--color-border)] py-4 text-center text-xs text-[var(--color-text-muted)]">
            Rentline Sandbox &middot; Robinhood Chain
          </footer>
        </main>
      </AuthGuard>
    </Web3Provider>
  );
}
