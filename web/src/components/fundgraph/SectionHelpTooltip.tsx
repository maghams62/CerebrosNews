"use client";

export function SectionHelpTooltip({
  text,
  ariaLabel,
}: {
  text: string;
  ariaLabel?: string;
}) {
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        aria-label={ariaLabel ?? "Section help"}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 bg-white text-[10px] font-bold leading-none text-slate-600 hover:bg-slate-50"
      >
        ?
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute top-full left-1/2 z-20 mt-1 hidden w-56 -translate-x-1/2 rounded-md border border-slate-200 bg-slate-900 px-2 py-1.5 text-[11px] font-medium leading-snug text-white shadow-lg group-hover:block group-focus-within:block"
      >
        {text}
      </span>
    </span>
  );
}
