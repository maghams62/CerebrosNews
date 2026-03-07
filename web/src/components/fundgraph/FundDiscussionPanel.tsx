"use client";

import { useEffect, useState } from "react";
import { FundDiscussionItem } from "@/components/fundgraph/fundProfileUtils";
import { relativeTimeFromIso } from "@/components/fundgraph/utils";
import { useFundGraphState } from "@/fundgraph/state";
import { contribute } from "@/lib/fundgraph/client";

export function FundDiscussionPanel({
  fundId,
  initialItems,
}: {
  fundId: string;
  initialItems: FundDiscussionItem[];
}) {
  const { userId, applyContributor } = useFundGraphState();
  const [items, setItems] = useState(initialItems);
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

  async function submitComment() {
    const value = draft.trim();
    if (value.length < 6 || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    const commentId = `comment-${Date.now()}`;

    setItems((prev) => [
      {
        id: commentId,
        user: "You",
        comment: value,
        timestamp: new Date().toISOString(),
        votes: 0,
        seeded: false,
      },
      ...prev,
    ]);
    setDraft("");
    try {
      const targetId = `fund:${fundId}:comment:${commentId}`;
      const snapshot = await contribute("add_comment", targetId, userId);
      applyContributor({ userId: snapshot.userId, gamification: snapshot });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to award comment credits.";
      setSubmitError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section id="fund-discussion" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition duration-150 hover:shadow-md">
      <h2 className="text-sm font-semibold text-slate-900">Signal Discussions</h2>
      <p className="mt-1 text-sm text-slate-600">Community context linked to the same fund-level signal stream.</p>

      <div className="mt-4 space-y-2">
        {items.length ? (
          items.map((item) => (
            <article key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="text-sm font-semibold text-slate-900">{item.user}</div>
                  {item.seeded ? (
                    <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-600">
                      Seeded baseline
                    </span>
                  ) : null}
                </div>
                <div className="text-xs text-slate-500">{relativeTimeFromIso(item.timestamp)}</div>
              </div>
              <p className="mt-1 text-sm text-slate-700">{item.comment}</p>
              <div className="mt-2 text-xs text-slate-500">Community engagement: {item.votes}</div>
            </article>
          ))
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-xs text-slate-600">
            No real discussion items yet for this fund.
          </div>
        )}
      </div>

      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
        <label className="text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">Add Comment</label>
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={3}
          placeholder="Share additional diligence context..."
          className="mt-2 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
        />
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={submitComment}
            disabled={submitting}
            className="h-8 rounded-full bg-slate-900 px-3 text-xs font-semibold text-white hover:bg-slate-800"
          >
            {submitting ? "Adding..." : "Add Comment"}
          </button>
        </div>
        {submitError ? <p className="mt-2 text-xs text-rose-700">{submitError}</p> : null}
      </div>
    </section>
  );
}
