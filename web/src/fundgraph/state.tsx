"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { UserProfile } from "@/fundgraph/types";
import { FundgraphUserResponse, getProfile, getUser } from "@/lib/fundgraph/client";
import { DEFAULT_STARTING_CREDITS, getLimits, getTier, Tier, TierLimits } from "@/lib/fundgraph/gamification.shared";
import { normalizeUserProfileInput } from "@/fundgraph/profilePreferences";

type ContributorLike = {
  userId?: string;
  credScore?: number;
  cred?: number;
  badgeTier?: string;
  badge?: string;
  gamification?: FundgraphUserResponse;
};

type ShortlistState = {
  fundIds: string[];
  signalIds: string[];
  themeKeys: string[];
};

type FundGraphState = {
  userId: string;
  userName: string;
  cred: number;
  badge: string;
  contributions: number;
  tier: Tier;
  limits: TierLimits;
  shortlist: ShortlistState;
  profilePreferences: UserProfile | null;
  shortlistFundIds: string[];
  isFundShortlisted: (fundId: string) => boolean;
  addFundToShortlist: (fundId: string) => void;
  removeFundFromShortlist: (fundId: string) => void;
  toggleFundShortlist: (fundId: string) => void;
  clearShortlistFunds: () => void;
  setProfilePreferences: (profile: UserProfile | null) => void;
  setIdentity: (input: { userId?: string; userName?: string }) => void;
  applyContributor: (contributor?: ContributorLike | null) => void;
  applyGamification: (snapshot?: FundgraphUserResponse | null) => void;
  refreshGamification: () => Promise<void>;
};

const STORAGE_KEY = "fundgraph_session_v3";
const DEFAULT_USER_ID = "demo";
const DEFAULT_USER_NAME = "Demo";
const MAX_SHORTLIST_FUNDS = 120;
const MAX_SHORTLIST_SIGNALS = 240;
const MAX_SHORTLIST_THEMES = 120;
const DEFAULT_SHORTLIST: ShortlistState = {
  fundIds: [],
  signalIds: [],
  themeKeys: [],
};

const FundGraphContext = createContext<FundGraphState | null>(null);

function badgeFromTier(tier: string | undefined, cred: number): string {
  if (tier === "insider") return "Insider";
  if (tier === "analyst") return "Analyst";
  if (tier === "contributor") return "Contributor";
  if (tier === "visitor") return "Visitor";
  if (tier === "HIGH_SIGNAL") return "High Signal";
  if (tier === "VERIFIER") return "Verifier";
  if (tier === "CONTRIBUTOR") return "Contributor";
  if (cred >= 30) return "High Signal";
  if (cred >= 15) return "Verifier";
  if (cred >= 5) return "Contributor";
  return "Visitor";
}

type PersistedState = {
  userId: string;
  userName: string;
  cred: number;
  badge: string;
  contributions: number;
  tier: Tier;
  limits: TierLimits;
  shortlist: ShortlistState;
  profilePreferences: UserProfile | null;
};

const DEFAULT_PERSISTED_STATE: PersistedState = {
  userId: DEFAULT_USER_ID,
  userName: DEFAULT_USER_NAME,
  cred: DEFAULT_STARTING_CREDITS,
  badge: "Visitor",
  contributions: 0,
  tier: "visitor",
  limits: getLimits("visitor"),
  shortlist: DEFAULT_SHORTLIST,
  profilePreferences: null,
};

function normalizeShortlist(raw: unknown): ShortlistState {
  if (!raw || typeof raw !== "object") return DEFAULT_SHORTLIST;
  const shortlist = raw as Partial<ShortlistState>;

  const clean = (values: unknown, limit: number): string[] => {
    if (!Array.isArray(values)) return [];
    return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean))).slice(0, limit);
  };

  return {
    fundIds: clean(shortlist.fundIds, MAX_SHORTLIST_FUNDS),
    signalIds: clean(shortlist.signalIds, MAX_SHORTLIST_SIGNALS),
    themeKeys: clean(shortlist.themeKeys, MAX_SHORTLIST_THEMES),
  };
}

function loadPersistedStateClient(): PersistedState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) throw new Error("missing");
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    const cred = typeof parsed.cred === "number" ? parsed.cred : DEFAULT_STARTING_CREDITS;
    const contributions = typeof parsed.contributions === "number" ? parsed.contributions : 0;
    const userId = typeof parsed.userId === "string" && parsed.userId.trim() ? parsed.userId.trim() : DEFAULT_USER_ID;
    const userName =
      typeof parsed.userName === "string" && parsed.userName.trim() ? parsed.userName.trim() : DEFAULT_USER_NAME;
    const profilePreferences =
      parsed.profilePreferences && typeof parsed.profilePreferences === "object"
        ? normalizeUserProfileInput(parsed.profilePreferences as Partial<UserProfile>, userId)
        : null;
    const tier =
      parsed.tier === "visitor" || parsed.tier === "contributor" || parsed.tier === "analyst" || parsed.tier === "insider"
        ? parsed.tier
        : getTier(contributions);

    return {
      userId,
      userName,
      cred,
      contributions,
      tier,
      limits: parsed.limits ?? getLimits(tier),
      badge: typeof parsed.badge === "string" && parsed.badge.trim() ? parsed.badge : badgeFromTier(tier, cred),
      shortlist: normalizeShortlist(parsed.shortlist),
      profilePreferences,
    };
  } catch {
    return DEFAULT_PERSISTED_STATE;
  }
}

export function FundGraphProvider({ children }: { children: React.ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [userId, setUserId] = useState(DEFAULT_PERSISTED_STATE.userId);
  const [userName, setUserName] = useState(DEFAULT_PERSISTED_STATE.userName);
  const [cred, setCred] = useState(DEFAULT_PERSISTED_STATE.cred);
  const [badge, setBadge] = useState(DEFAULT_PERSISTED_STATE.badge);
  const [contributions, setContributions] = useState(DEFAULT_PERSISTED_STATE.contributions);
  const [tier, setTier] = useState<Tier>(DEFAULT_PERSISTED_STATE.tier);
  const [limits, setLimits] = useState<TierLimits>(DEFAULT_PERSISTED_STATE.limits);
  const [shortlist, setShortlist] = useState<ShortlistState>(DEFAULT_PERSISTED_STATE.shortlist);
  const [profilePreferences, setProfilePreferencesState] = useState<UserProfile | null>(DEFAULT_PERSISTED_STATE.profilePreferences);
  const credRef = useRef(cred);
  const tierRef = useRef<Tier>(tier);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const timer = window.setTimeout(() => {
      const persisted = loadPersistedStateClient();
      setUserId(persisted.userId);
      setUserName(persisted.userName);
      setCred(persisted.cred);
      setBadge(persisted.badge);
      setContributions(persisted.contributions);
      setTier(persisted.tier);
      setLimits(persisted.limits);
      setShortlist(persisted.shortlist);
      setProfilePreferencesState(persisted.profilePreferences);
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    credRef.current = cred;
    tierRef.current = tier;
  }, [cred, tier]);

  useEffect(() => {
    if (typeof window === "undefined" || !hydrated) return;
    const payload: PersistedState = {
      userId,
      userName,
      cred,
      badge,
      contributions,
      tier,
      limits,
      shortlist,
      profilePreferences,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    window.localStorage.setItem(
      "fundgraph_session_v2",
      JSON.stringify({
        userId,
        userName,
        cred,
        badge,
      })
    );
  }, [userId, userName, cred, badge, contributions, tier, limits, shortlist, profilePreferences, hydrated]);

  const applyGamification = useCallback((snapshot?: FundgraphUserResponse | null) => {
    if (!snapshot) return;
    setUserId(snapshot.userId || DEFAULT_USER_ID);
    setCred(snapshot.credits ?? DEFAULT_STARTING_CREDITS);
    setContributions(snapshot.contributions ?? 0);
    setTier(snapshot.tier ?? getTier(snapshot.contributions ?? 0));
    setLimits(snapshot.limits ?? getLimits(snapshot.tier ?? "visitor"));
    setBadge(badgeFromTier(snapshot.tier, snapshot.credits ?? 0));
  }, []);

  const refreshGamification = useCallback(async () => {
    const snapshot = await getUser(userId);
    applyGamification(snapshot);
  }, [applyGamification, userId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!hydrated) return;
      try {
        const [userSnapshot, profile] = await Promise.all([
          getUser(userId),
          getProfile(userId, 1, false).catch(() => null),
        ]);
        if (cancelled) return;
        applyGamification(userSnapshot);
        if (profile?.profile) {
          setProfilePreferencesState(normalizeUserProfileInput(profile.profile, userSnapshot.userId || userId));
        } else {
          setProfilePreferencesState(null);
        }
        if (profile?.user?.name?.trim()) {
          setUserName(profile.user.name.trim());
        }
      } catch {
        // Keep local fallback values when APIs are unavailable.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyGamification, hydrated, userId]);

  const setProfilePreferences = useCallback(
    (profile: UserProfile | null) => {
      if (!profile) {
        setProfilePreferencesState(null);
        return;
      }
      const fallbackUserId = profile.userId?.trim() || userId;
      setProfilePreferencesState(normalizeUserProfileInput(profile, fallbackUserId));
    },
    [userId]
  );

  const setIdentity = useCallback((input: { userId?: string; userName?: string }) => {
    const nextUserId = input.userId?.trim();
    const nextUserName = input.userName?.trim();
    if (nextUserId) setUserId(nextUserId);
    if (nextUserName) setUserName(nextUserName);
  }, []);

  const applyContributor = useCallback((contributor?: ContributorLike | null) => {
    if (!contributor) return;
    if (contributor.gamification) {
      applyGamification(contributor.gamification);
      return;
    }
    if (contributor.userId?.trim()) {
      setUserId(contributor.userId.trim());
    }

    const nextCred =
      typeof contributor.credScore === "number"
        ? contributor.credScore
        : typeof contributor.cred === "number"
          ? contributor.cred
          : null;

    if (nextCred !== null) {
      setCred(nextCred);
      setBadge(badgeFromTier(contributor.badgeTier ?? contributor.badge ?? tierRef.current, nextCred));
    } else if (contributor.badgeTier || contributor.badge) {
      setBadge(badgeFromTier(contributor.badgeTier ?? contributor.badge, credRef.current));
    }
  }, [applyGamification]);

  const isFundShortlisted = useCallback(
    (fundId: string) => {
      const key = fundId.trim();
      return Boolean(key) && shortlist.fundIds.includes(key);
    },
    [shortlist.fundIds]
  );

  const addFundToShortlist = useCallback((fundId: string) => {
    const key = fundId.trim();
    if (!key) return;
    setShortlist((current) => {
      if (current.fundIds.includes(key)) return current;
      return { ...current, fundIds: [...current.fundIds, key].slice(0, MAX_SHORTLIST_FUNDS) };
    });
  }, []);

  const removeFundFromShortlist = useCallback((fundId: string) => {
    const key = fundId.trim();
    if (!key) return;
    setShortlist((current) => ({ ...current, fundIds: current.fundIds.filter((item) => item !== key) }));
  }, []);

  const toggleFundShortlist = useCallback((fundId: string) => {
    const key = fundId.trim();
    if (!key) return;
    setShortlist((current) => {
      if (current.fundIds.includes(key)) {
        return { ...current, fundIds: current.fundIds.filter((item) => item !== key) };
      }
      return { ...current, fundIds: [...current.fundIds, key].slice(0, MAX_SHORTLIST_FUNDS) };
    });
  }, []);

  const clearShortlistFunds = useCallback(() => {
    setShortlist((current) => ({ ...current, fundIds: [] }));
  }, []);

  const value = useMemo<FundGraphState>(
    () => ({
      userId,
      userName,
      cred,
      badge,
      contributions,
      tier,
      limits,
      shortlist,
      profilePreferences,
      shortlistFundIds: shortlist.fundIds,
      isFundShortlisted,
      addFundToShortlist,
      removeFundFromShortlist,
      toggleFundShortlist,
      clearShortlistFunds,
      setProfilePreferences,
      setIdentity,
      applyContributor,
      applyGamification,
      refreshGamification,
    }),
    [
      userId,
      userName,
      cred,
      badge,
      contributions,
      tier,
      limits,
      shortlist,
      profilePreferences,
      isFundShortlisted,
      addFundToShortlist,
      removeFundFromShortlist,
      toggleFundShortlist,
      clearShortlistFunds,
      setProfilePreferences,
      setIdentity,
      applyContributor,
      applyGamification,
      refreshGamification,
    ]
  );

  return <FundGraphContext.Provider value={value}>{children}</FundGraphContext.Provider>;
}

export function useFundGraphState(): FundGraphState {
  const ctx = useContext(FundGraphContext);
  if (!ctx) {
    throw new Error("useFundGraphState must be used within FundGraphProvider");
  }
  return ctx;
}
