import Link from "next/link";
import { WatchlistAlertItem } from "@/components/fundgraph/forYouTypes";

function toneClass(tone: WatchlistAlertItem["tone"]): string {
  if (tone === "positive") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (tone === "warning") return "border-rose-200 bg-rose-50 text-rose-700";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

export function WatchlistAlerts({ alerts }: { alerts: WatchlistAlertItem[] }) {
  return (
    <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">Watchlist Alerts</div>
      <h2 className="mt-1 text-lg font-semibold text-slate-900">Personalized movement</h2>
      <p className="mt-1 text-sm text-slate-600">Signals tied to your tracked funds and themes.</p>

      <div className="mt-4 space-y-2.5">
        {alerts.length ? (
          alerts.map((alert) => (
            <Link
              key={alert.id}
              href={alert.href}
              className={`block rounded-xl border px-3 py-2.5 transition hover:shadow-sm ${toneClass(alert.tone)}`}
            >
              <p className="text-xs font-semibold">{alert.title}</p>
              <p className="mt-1 text-xs opacity-85">{alert.detail}</p>
            </Link>
          ))
        ) : (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
            Build watchlist activity by verifying signals or updating profile preferences.
          </div>
        )}
      </div>
    </aside>
  );
}
