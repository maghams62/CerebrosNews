import Link from "next/link";

export function SectionHeader({
  title,
  subtitle,
  href,
  actionLabel,
}: {
  title: string;
  subtitle?: string;
  href?: string;
  actionLabel?: string;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        {subtitle ? <p className="text-sm text-slate-600">{subtitle}</p> : null}
      </div>
      {href && actionLabel ? (
        <Link href={href} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}
