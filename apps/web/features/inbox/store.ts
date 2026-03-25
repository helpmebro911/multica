"use client";

import { create } from "zustand";
import type { InboxItem } from "@multica/types";
import { api } from "@/shared/api";

interface InboxState {
  items: InboxItem[];
  loading: boolean;
  fetch: () => Promise<void>;
  setItems: (items: InboxItem[]) => void;
  addItem: (item: InboxItem) => void;
  markRead: (id: string) => void;
  archive: (id: string) => void;
  unreadCount: () => number;
}

export const useInboxStore = create<InboxState>((set, get) => ({
  items: [],
  loading: true,

  fetch: async () => {
    console.log("[inbox-store] fetch start");
    set({ loading: true });
    try {
      const data = await api.listInbox();
      console.log("[inbox-store] fetched", data.length, "items");
      set({ items: data, loading: false });
    } catch (err) {
      console.error("[inbox-store] fetch failed", err);
      set({ loading: false });
    }
  },

  setItems: (items) => set({ items }),
  addItem: (item) =>
    set((s) => ({
      items: s.items.some((i) => i.id === item.id)
        ? s.items
        : [item, ...s.items],
    })),
  markRead: (id) =>
    set((s) => ({
      items: s.items.map((i) => (i.id === id ? { ...i, read: true } : i)),
    })),
  archive: (id) =>
    set((s) => ({
      items: s.items.map((i) => (i.id === id ? { ...i, archived: true } : i)),
    })),
  unreadCount: () => get().items.filter((i) => !i.read && !i.archived).length,
}));
