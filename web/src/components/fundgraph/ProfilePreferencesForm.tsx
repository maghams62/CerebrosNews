"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { UnlockBanner } from "@/components/fundgraph/UnlockBanner";
import { useFundGraphState } from "@/fundgraph/state";
import { Fund, FundCategory, FundStage, RiskTolerance, UserProfile } from "@/fundgraph/types";
import { generateMemo, getProfile, saveProfile } from "@/lib/fundgraph/client";
import { getNextTier, getNextTierThreshold, TIER_THRESHOLDS, tierLabel } from "@/lib/fundgraph/gamification.shared";
import {
  listProfileFilterChips,
  normalizeUserProfileInput,
  profileHasActiveSignalFeedFilters,
} from "@/fundgraph/profilePreferences";

const ALL_SECTORS: FundCategory[] = [
  "AI",
  "Developer Tools",
  "Fintech",
  "Cloud",
  "Security",
  "Climate",
  "Bio",
  "Consumer",
  "Enterprise",
  "Web3",
];

const ALL_STAGES: FundStage[] = ["Pre-Seed", "Seed", "Series A", "Series B+"];
const ALL_GEOS = ["US", "Europe", "India", "APAC", "LatAm"];

type Recommendation = {
  fund: Fund;
  score: number;
  reason: string;
};

function defaultProfile(userId: string): UserProfile {
  return {
    userId,
    sectorFocus: [],
    stageFocus: [],
    geographyFocus: [],
    geographies: [],
    riskTolerance: "medium",
    checkSizeMinM: 0.5,
    checkSizeMaxM: 10,
    typicalCheckSizeM: 1,
    typicalCheckSizeKUsd: 1000,
    thesisKeywords: [],
  };
}

function normalizeProfileInput(profile: UserProfile, fallbackUserId: string): UserProfile {
  return normalizeUserProfileInput(profile, fallbackUserId);
}

function updateDraftCheckRange(current: UserProfile, nextMinM: number, nextMaxM: number): UserProfile {
  const min = Math.max(0.05, Number(nextMinM.toFixed(2)));
  const max = Math.max(min, Number(nextMaxM.toFixed(2)));
  const typical = Number(((min + max) / 2).toFixed(2));
  return {
    ...current,
    checkSizeMinM: min,
    checkSizeMaxM: max,
    typicalCheckSizeM: typical,
    typicalCheckSizeKUsd: Math.max(10, Math.round(typical * 1000)),
  };
}

function ToggleChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-9 items-center rounded-full border px-3 text-xs font-semibold transition ${
        active ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
      }`}
    >
      {label}
    </button>
  );
}

export function ProfilePreferencesForm() {
  const router = useRouter();
  const {
    userId,
    userName,
    tier,
    badge,
    cred,
    contributions,
    profilePreferences,
    setIdentity,
    setProfilePreferences,
    applyContributor,
    addFundToShortlist,
    isFundShortlisted,
  } = useFundGraphState();
  const [draft, setDraft] = useState<UserProfile>(() => defaultProfile(userId));
  const [savedProfile, setSavedProfile] = useState<UserProfile | null>(null);
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [memoLoading, setMemoLoading] = useState(false);
  const [memoError, setMemoError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ tone: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await getProfile(userId, 6);
        if (cancelled) return;
        const normalized = response.profile ? normalizeProfileInput(response.profile, userId) : defaultProfile(userId);
        setDraft(normalized);
        setSavedProfile(normalized);
        setProfilePreferences(normalized);
        setRecs((response.recommendations ?? []).map((item) => ({ fund: item.fund, score: item.score, reason: item.reason })));
        if (response.user?.name) {
          setIdentity({ userName: response.user.name });
        }
        applyContributor({
          userId: response.user?.id ?? userId,
          credScore: response.cred,
          badgeTier: response.user?.badgeTier,
        });
      } catch (loadError) {
        if (cancelled) return;
        const message = loadError instanceof Error ? loadError.message : "Failed to load profile.";
        setError(message);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyContributor, setIdentity, setProfilePreferences, userId]);

  const recommendationFundIds = useMemo(
    () => recs.map((rec) => rec.fund?.id).filter((id): id is string => Boolean(id)),
    [recs]
  );
  const memoLocked = tier !== "analyst" && tier !== "insider" && cred < 2;
  const nextTier = getNextTier(tier);
  const nextThreshold = getNextTierThreshold(tier);
  const tierFloor = TIER_THRESHOLDS[tier];
  const progressDenominator = nextThreshold ? Math.max(1, nextThreshold - tierFloor) : 1;
  const progressNumerator = nextThreshold ? Math.max(0, contributions - tierFloor) : 1;
  const tierProgress = nextThreshold ? Math.min(100, Math.round((progressNumerator / progressDenominator) * 100)) : 100;
  const activeSavedProfile = profilePreferences ?? savedProfile ?? draft;
  const activeProfileChips = useMemo(() => listProfileFilterChips(activeSavedProfile), [activeSavedProfile]);
  const draftProfileChips = useMemo(() => listProfileFilterChips(draft), [draft]);
  const filtersLinkedToFeeds = useMemo(
    () => profileHasActiveSignalFeedFilters(activeSavedProfile),
    [activeSavedProfile]
  );

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const normalizedDraft = normalizeProfileInput(draft, userId);
      const response = await saveProfile({
        userId,
        sectorFocus: normalizedDraft.sectorFocus,
        stageFocus: normalizedDraft.stageFocus,
        geographies: normalizedDraft.geographies,
        riskTolerance: normalizedDraft.riskTolerance,
        typicalCheckSizeM: normalizedDraft.typicalCheckSizeM,
        checkSizeMinM: normalizedDraft.checkSizeMinM,
        checkSizeMaxM: normalizedDraft.checkSizeMaxM,
        thesisKeywords: normalizedDraft.thesisKeywords ?? [],
      });
      const normalized = normalizeProfileInput(response.profile, userId);
      setDraft(normalized);
      setSavedProfile(normalized);
      setProfilePreferences(normalized);
      setRecs(response.recommendations.map((item) => ({ fund: item.fund, score: item.score, reason: item.reason })));
      applyContributor({
        userId: response.user?.id ?? userId,
        credScore: response.user?.credScore,
        badgeTier: response.user?.badgeTier,
      });
      setToast({ tone: "success", message: "Profile saved. Signals and feeds updated." });
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "Failed to save profile.";
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  async function generateProfileMemo() {
    if (memoLocked) {
      setMemoError("Generate memo requires Analyst tier or 2 credits.");
      setToast({ tone: "error", message: "Memo is locked for your current tier/credits." });
      return;
    }

    const topFundId = recommendationFundIds[0];
    if (!topFundId) {
      setMemoError("No recommended funds available for memo generation.");
      setToast({ tone: "error", message: "Pick at least one recommended fund first." });
      return;
    }
    if (tier !== "analyst" && tier !== "insider") {
      const confirmed = window.confirm("Generate memo for 2 credits?");
      if (!confirmed) return;
    }

    setMemoLoading(true);
    setMemoError(null);
    try {
      const generated = await generateMemo({
        userId,
        fundId: topFundId,
        memoType: "investment_memo",
        includeSignals: true,
        includePortfolio: true,
        includeGraphContext: true,
        includeCommunityDiscussion: true,
        timeWindow: "90d",
      });
      if (generated.gamification) {
        applyContributor({ userId: generated.gamification.userId, gamification: generated.gamification });
      }
      setToast({ tone: "success", message: "Memo ready. Opening memo page..." });
      router.push(`/cerebrosfund/memos/${generated.memoId}`);
    } catch (memoGenError) {
      console.error("profile_memo_generation_failed", memoGenError);
      const message = memoGenError instanceof Error ? memoGenError.message : "memo_generation_failed";
      const displayMessage =
        message === "request_timeout"
          ? "Memo generation timed out. Try again in a moment."
          : message;
      setMemoError(displayMessage);
      setToast({ tone: "error", message: `Memo generation failed: ${displayMessage}` });
    } finally {
      setMemoLoading(false);
    }
  }

  function toggleSector(sector: FundCategory) {
    setDraft((current) => ({
      ...current,
      sectorFocus: current.sectorFocus.includes(sector)
        ? current.sectorFocus.filter((x) => x !== sector)
        : [...current.sectorFocus, sector],
    }));
  }

  function toggleStage(stage: FundStage) {
    setDraft((current) => ({
      ...current,
      stageFocus: current.stageFocus.includes(stage)
        ? current.stageFocus.filter((x) => x !== stage)
        : [...current.stageFocus, stage],
    }));
  }

  function toggleGeo(geo: string) {
    setDraft((current) => {
      const geographies = current.geographies.includes(geo)
        ? current.geographies.filter((x) => x !== geo)
        : [...current.geographies, geo];
      return {
        ...current,
        geographies,
        geographyFocus: geographies,
      };
    });
  }

  function setRisk(risk: RiskTolerance) {
    setDraft((current) => ({ ...current, riskTolerance: risk }));
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
      {toast ? (
        <div
          className={`fixed top-5 right-5 z-50 rounded-xl px-3 py-2 text-xs font-semibold shadow ${
            toast.tone === "success" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
          }`}
        >
          {toast.message}
        </div>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="rounded-2xl border border-slate-200 bg-slate-50/90 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">Account Snapshot</p>
              <h2 className="mt-1 text-lg font-semibold text-slate-900">{userName || "Demo User"}</h2>
              <p className="text-sm text-slate-600">
                @{userId} · {badge}
              </p>
            </div>
            <div className="inline-flex h-8 items-center rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700">
              Tier: {tierLabel(tier)}
            </div>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
              <p className="text-[11px] font-semibold tracking-[0.08em] text-slate-500 uppercase">Token Balance</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{cred}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
              <p className="text-[11px] font-semibold tracking-[0.08em] text-slate-500 uppercase">Contributions</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{contributions}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
              <p className="text-[11px] font-semibold tracking-[0.08em] text-slate-500 uppercase">Next Tier</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{nextTier ? tierLabel(nextTier) : "Top tier reached"}</p>
            </div>
          </div>

          {nextThreshold ? (
            <>
              <div className="mt-3 h-2.5 w-full rounded-full bg-slate-200">
                <div className="h-2.5 rounded-full bg-slate-900 transition-all" style={{ width: `${tierProgress}%` }} />
              </div>
              <p className="mt-2 text-xs text-slate-600">
                {contributions}/{nextThreshold} contributions · {Math.max(0, nextThreshold - contributions)} to unlock {nextTier ? tierLabel(nextTier) : "next tier"}
              </p>
            </>
          ) : (
            <p className="mt-3 text-xs font-semibold text-emerald-700">Top tier reached. Full intelligence access is unlocked.</p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700">
              Signals + For You feed sync: {filtersLinkedToFeeds ? "Active" : "Awaiting LP tags"}
            </span>
            <Link
              href="/cerebrosfund/signals"
              className="inline-flex h-7 items-center rounded-full border border-slate-200 bg-white px-3 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
            >
              Open personalized signals
            </Link>
          </div>
        </div>

        <h3 className="mt-4 text-lg font-semibold text-slate-900">LP Preference Profile</h3>
        <p className="mt-1 text-sm text-slate-600">Saved preferences are persisted to CerebrosFund profile APIs and used for Signals + feed personalization.</p>
        {loading ? <p className="mt-3 text-sm text-slate-500">Loading profile…</p> : null}
        {error ? <p className="mt-3 text-sm text-rose-700">{error}</p> : null}

        <div className="mt-4 space-y-4">
          <div>
            <div className="text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">Sector Focus</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {ALL_SECTORS.map((sector) => (
                <ToggleChip key={sector} active={draft.sectorFocus.includes(sector)} label={sector} onClick={() => toggleSector(sector)} />
              ))}
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">Stage Focus</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {ALL_STAGES.map((stage) => (
                <ToggleChip key={stage} active={draft.stageFocus.includes(stage)} label={stage} onClick={() => toggleStage(stage)} />
              ))}
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">Geography</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {ALL_GEOS.map((geo) => (
                <ToggleChip key={geo} active={draft.geographies.includes(geo)} label={geo} onClick={() => toggleGeo(geo)} />
              ))}
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">Risk Tolerance</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {(["low", "medium", "high"] as RiskTolerance[]).map((risk) => (
                <ToggleChip key={risk} active={draft.riskTolerance === risk} label={risk} onClick={() => setRisk(risk)} />
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm text-slate-700">
              <span className="text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">Min Check ($M)</span>
              <input
                type="number"
                value={draft.checkSizeMinM}
                min={0}
                step={0.5}
                onChange={(e) => {
                  const nextMin = Number(e.target.value) || 0;
                  setDraft((current) => updateDraftCheckRange(current, nextMin, current.checkSizeMaxM));
                }}
                className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
              />
            </label>
            <label className="text-sm text-slate-700">
              <span className="text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">Max Check ($M)</span>
              <input
                type="number"
                value={draft.checkSizeMaxM}
                min={0}
                step={0.5}
                onChange={(e) => {
                  const nextMax = Number(e.target.value) || 0;
                  setDraft((current) => updateDraftCheckRange(current, current.checkSizeMinM, nextMax));
                }}
                className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
              />
            </label>
          </div>

          <div>
            <div className="text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">Current Draft Tags</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {draftProfileChips.length ? (
                draftProfileChips.map((chip) => (
                  <span key={chip} className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                    {chip}
                  </span>
                ))
              ) : (
                <span className="text-xs text-slate-500">Add sectors/stages/geographies to activate feed personalization.</span>
              )}
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save Profile"}
          </button>
          <button
            type="button"
            onClick={() => {
              setDraft(savedProfile ?? defaultProfile(userId));
              setError(null);
            }}
            className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Reset Draft
          </button>
          <span className="text-xs text-slate-500">Saving updates instantly tunes what appears in Signals and your For You feed.</span>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-base font-semibold text-slate-900">Personalized Output</h3>
        <p className="mt-1 text-sm text-slate-600">Returned by CerebrosFund recommendations API across tracked funds.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {activeProfileChips.length ? (
            activeProfileChips.map((chip) => (
              <span key={chip} className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800">
                {chip}
              </span>
            ))
          ) : (
            <span className="text-xs text-slate-500">No saved LP filters yet. Save profile preferences to personalize outputs.</span>
          )}
        </div>

        <div className="mt-4 space-y-3">
          {recs.map((rec) => (
            <div key={rec.fund.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center justify-between gap-2">
                <Link href={`/cerebrosfund/funds/${rec.fund.id}`} className="text-sm font-semibold text-slate-900 hover:text-slate-700">
                  {rec.fund.name}
                </Link>
                <span className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-slate-600">Score {Math.round(rec.score)}</span>
              </div>
              <p className="mt-1 text-xs text-slate-600">{rec.reason}</p>
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => addFundToShortlist(rec.fund.id)}
                  className={`inline-flex h-7 items-center rounded-full border px-3 text-[11px] font-semibold ${
                    isFundShortlisted(rec.fund.id)
                      ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {isFundShortlisted(rec.fund.id) ? "Saved" : "Save to Shortlist"}
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 border-t border-slate-200 pt-4">
          <button
            type="button"
            onClick={() => recs.slice(0, 3).forEach((rec) => addFundToShortlist(rec.fund.id))}
            className="mr-2 inline-flex items-center rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Save Top 3 to Shortlist
          </button>
          <button
            type="button"
            onClick={generateProfileMemo}
            disabled={memoLoading || !recommendationFundIds.length || memoLocked}
            className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {memoLoading ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : null}
            {memoLoading
              ? "Generating memo..."
              : tier === "analyst" || tier === "insider"
                ? "Generate Memo On Top Pick"
                : "Generate Memo On Top Pick (-2 credits)"}
          </button>
          {memoLocked ? (
            <div className="mt-3">
              <UnlockBanner title="Memo is locked for your tier." detail="Reach Analyst tier or earn 2 credits to generate memo." />
            </div>
          ) : null}
          {memoError ? <p className="mt-2 text-xs text-rose-700">{memoError}</p> : null}
        </div>
      </section>
    </div>
  );
}
