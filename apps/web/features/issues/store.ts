"use client";

import { create } from "zustand";
import type { Issue } from "@multica/types";
import { api } from "@/shared/api";

interface IssueState {
  issues: Issue[];
  loading: boolean;
  activeIssueId: string | null;
  fetch: () => Promise<void>;
  setIssues: (issues: Issue[]) => void;
  addIssue: (issue: Issue) => void;
  updateIssue: (id: string, updates: Partial<Issue>) => void;
  removeIssue: (id: string) => void;
  setActiveIssue: (id: string | null) => void;
}

export const useIssueStore = create<IssueState>((set) => ({
  issues: [],
  loading: true,
  activeIssueId: null,

  fetch: async () => {
    console.log("[issue-store] fetch start");
    set({ loading: true });
    try {
      const res = await api.listIssues({ limit: 200 });
      console.log("[issue-store] fetched", res.issues.length, "issues");
      set({ issues: res.issues, loading: false });
    } catch (err) {
      console.error("[issue-store] fetch failed", err);
      set({ loading: false });
    }
  },

  setIssues: (issues) => set({ issues }),
  addIssue: (issue) =>
    set((s) => ({
      issues: s.issues.some((i) => i.id === issue.id)
        ? s.issues
        : [...s.issues, issue],
    })),
  updateIssue: (id, updates) =>
    set((s) => ({
      issues: s.issues.map((i) => (i.id === id ? { ...i, ...updates } : i)),
    })),
  removeIssue: (id) =>
    set((s) => ({ issues: s.issues.filter((i) => i.id !== id) })),
  setActiveIssue: (id) => set({ activeIssueId: id }),
}));
