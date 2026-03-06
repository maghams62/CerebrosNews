import { FormEvent } from "react";

const DEFAULT_EXAMPLES = [
  "path between OpenAI and Andreessen Horowitz",
  "how is Stripe connected to Sequoia Capital",
  "find connection from Databricks to Benchmark",
  "companies Lightspeed invested in",
  "what did YC invest in",
  "show me the portfolio of General Catalyst",
  "which companies does Accel back",
  "founders Sequoia Capital invested in",
  "path between Stripe and Sequoia Capital",
  "funds investing in AI",
  "who is active in developer tools",
  "companies linked to Anthropic",
  "who co-invests with Sequoia Capital",
  "startups around ElevenLabs",
  "companies funded by both Sequoia Capital and Andreessen Horowitz",
  "common investments between Accel and Benchmark",
  "portfolio overlap between First Round Capital and Bessemer Venture Partners",
];

export function GraphQueryBar({
  value,
  onChange,
  onRun,
  onUseExample,
  examples,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  onRun: () => void;
  onUseExample: (value: string) => void;
  examples?: string[];
  disabled?: boolean;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onRun();
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <form onSubmit={submit} className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <label className="block flex-1">
          <span className="text-[11px] font-semibold tracking-[0.08em] text-slate-500 uppercase">Query</span>
          <input
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder="path between OpenAI and Andreessen Horowitz"
            className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none focus:border-slate-400 focus:bg-white"
            disabled={disabled}
          />
        </label>

        <button
          type="submit"
          className="h-10 rounded-xl bg-slate-900 px-4 text-xs font-semibold text-white disabled:opacity-60"
          disabled={disabled || !value.trim()}
        >
          Run Query
        </button>
      </form>

      <div className="mt-3 flex flex-wrap gap-2">
        {(examples?.length ? examples : DEFAULT_EXAMPLES).map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => onUseExample(example)}
            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            disabled={disabled}
          >
            {example}
          </button>
        ))}
      </div>
    </section>
  );
}
