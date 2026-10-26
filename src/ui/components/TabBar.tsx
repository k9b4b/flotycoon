import { useSyncExternalStore, type ReactNode } from 'react';

export type Tab = 'map' | 'market' | 'fleet' | 'company' | 'log';

const QUERY = '(max-width: 720px)';

/** Układ z zakładkami tylko na wąskich ekranach; na komputerze cały dashboard naraz. */
export function useIsMobile(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(QUERY);
      mq.addEventListener('change', cb);
      return () => mq.removeEventListener('change', cb);
    },
    () => window.matchMedia(QUERY).matches,
  );
}

const ICONS: Record<Tab, ReactNode> = {
  map: (
    <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Zm0 0v14m6-12v14" />
  ),
  market: (
    <path d="M4 6h16M4 12h16M4 18h10" />
  ),
  fleet: (
    <path d="M3 7h11v9H3zM14 10h4l3 3v3h-7M7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm10 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
  ),
  company: (
    <path d="M4 20V10m6 10V4m6 16v-7m6 7H2" />
  ),
  log: (
    <path d="M5 5h14v10H9l-4 4V5Zm4 4h6m-6 3h4" />
  ),
};

const LABELS: Record<Tab, string> = {
  map: 'Mapa',
  market: 'Giełda',
  fleet: 'Flota',
  company: 'Firma',
  log: 'Dziennik',
};

export function TabBar({ tab, onTab, badges }: { tab: Tab; onTab: (t: Tab) => void; badges: Partial<Record<Tab, number>> }) {
  return (
    <nav className="tabbar" aria-label="Sekcje">
      {(Object.keys(LABELS) as Tab[]).map((t) => (
        <button key={t} className={tab === t ? 'on' : ''} aria-current={tab === t ? 'page' : undefined} onClick={() => onTab(t)}>
          <span className="tab-icon">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {ICONS[t]}
            </svg>
            {!!badges[t] && <span className="tab-badge">{badges[t]! > 99 ? '99+' : badges[t]}</span>}
          </span>
          <span className="tab-label">{LABELS[t]}</span>
        </button>
      ))}
    </nav>
  );
}
