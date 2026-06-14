'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useUser, UserButton } from '@clerk/nextjs';
import { cn } from '@/lib/utils';

interface GameNavProps {
  gameId?: string;
  gameName?: string;
  gameStatus?: string;
  currentTurn?: number;
  maxTurns?: number;
  fedRate?: number;
  mortgageRate?: number;
  rightSlot?: React.ReactNode;
}

export function GameNav({
  gameId,
  gameName,
  gameStatus,
  currentTurn,
  maxTurns,
  fedRate,
  mortgageRate,
  rightSlot,
}: GameNavProps) {
  const { user } = useUser();
  const pathname = usePathname();

  const statusDot =
    gameStatus === 'trading' ? 'bg-green-400' :
    gameStatus === 'lobby' ? 'bg-amber-400' :
    gameStatus === 'completed' ? 'bg-gray-400' : 'bg-gray-600';

  return (
    <div style={{ backgroundColor: 'var(--color-navy)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="max-w-[1400px] mx-auto px-4 py-2 flex items-center justify-between gap-3">

        {/* Left: logo + nav */}
        <div className="flex items-center gap-4 min-w-0">
          <Link href="/" className="font-display font-bold text-base text-white shrink-0 hidden sm:block">
            Rentline Sandbox
          </Link>

          <div className="flex items-center gap-1">
            <NavPill href="/lobby" label="Lobby" active={pathname === '/lobby'} />
            {user && (
              <NavPill
                href={`/u/${user.username ?? user.id}`}
                label="Profile"
                active={pathname.startsWith('/u/')}
              />
            )}
          </div>

          {/* Current game context */}
          {gameId && gameName && (
            <>
              <div className="h-4 w-px bg-white/20 hidden md:block shrink-0" />
              <div className="hidden md:flex items-center gap-2 min-w-0">
                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDot}`} />
                <p className="text-white/80 text-xs font-semibold truncate">{gameName}</p>
                {currentTurn != null && maxTurns != null && (
                  <span className="text-white/40 text-xs shrink-0">
                    T{currentTurn}/{maxTurns}
                  </span>
                )}
              </div>
            </>
          )}
        </div>

        {/* Center: Fed rates */}
        {fedRate != null && (
          <div className="hidden lg:flex items-center gap-5 shrink-0">
            <Stat label="Fed Rate" value={`${(fedRate * 100).toFixed(2)}%`} />
            {mortgageRate != null && (
              <Stat label="Mortgage" value={`${(mortgageRate * 100).toFixed(2)}%`} />
            )}
          </div>
        )}

        {/* Right: slot + user avatar (clicking opens Clerk settings modal) */}
        <div className="flex items-center gap-3 shrink-0">
          {rightSlot}
          <UserButton userProfileMode="modal" />
        </div>
      </div>
    </div>
  );
}

function NavPill({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={cn(
        'px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors',
        active
          ? 'bg-white/15 text-white'
          : 'text-white/50 hover:text-white hover:bg-white/8'
      )}
    >
      {label}
    </Link>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <p className="text-white/40 text-xs">{label}</p>
      <p className="text-white font-financial text-sm font-bold">{value}</p>
    </div>
  );
}
