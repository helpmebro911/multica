"use client";

import { useEffect } from "react";
import type { WSClient } from "@multica/sdk";
import { toast } from "sonner";
import { useIssueStore } from "@/features/issues";
import { useInboxStore } from "@/features/inbox";
import { useWorkspaceStore } from "@/features/workspace";
import { useAuthStore } from "@/features/auth";
import type {
  IssueCreatedPayload,
  IssueUpdatedPayload,
  IssueDeletedPayload,
  AgentStatusPayload,
  AgentCreatedPayload,
  InboxNewPayload,
  InboxReadPayload,
  InboxArchivedPayload,
  WorkspaceUpdatedPayload,
  WorkspaceDeletedPayload,
  MemberAddedPayload,
  MemberUpdatedPayload,
  MemberRemovedPayload,
} from "@multica/types";

/**
 * Centralized WS → store sync. Called once from WSProvider.
 * Subscribes to all global WS events and dispatches to Zustand stores.
 * Comment events are NOT handled here — they stay per-page on issue detail.
 */
export function useRealtimeSync(ws: WSClient | null) {
  // Issue events → useIssueStore
  useEffect(() => {
    if (!ws) return;

    const unsubs = [
      ws.on("issue:created", (p) => {
        const { issue } = p as IssueCreatedPayload;
        useIssueStore.getState().addIssue(issue);
      }),
      ws.on("issue:updated", (p) => {
        const { issue } = p as IssueUpdatedPayload;
        useIssueStore.getState().updateIssue(issue.id, issue);
      }),
      ws.on("issue:deleted", (p) => {
        const { issue_id } = p as IssueDeletedPayload;
        useIssueStore.getState().removeIssue(issue_id);
      }),
    ];

    return () => unsubs.forEach((u) => u());
  }, [ws]);

  // Inbox events → useInboxStore
  useEffect(() => {
    if (!ws) return;

    const unsubs = [
      ws.on("inbox:new", (p) => {
        const { item } = p as InboxNewPayload;
        const myUserId = useAuthStore.getState().user?.id;
        // Only add if I'm the recipient (WS broadcasts to all workspace members)
        if (item.recipient_type === "member" && item.recipient_id === myUserId) {
          useInboxStore.getState().addItem(item);
        }
      }),
      ws.on("inbox:read", (p) => {
        const { item_id } = p as InboxReadPayload;
        useInboxStore.getState().markRead(item_id);
      }),
      ws.on("inbox:archived", (p) => {
        const { item_id } = p as InboxArchivedPayload;
        useInboxStore.getState().archive(item_id);
      }),
    ];

    return () => unsubs.forEach((u) => u());
  }, [ws]);

  // Agent events → workspace store
  useEffect(() => {
    if (!ws) return;

    const unsubs = [
      ws.on("agent:status", (p) => {
        const { agent } = p as AgentStatusPayload;
        useWorkspaceStore.getState().updateAgent(agent.id, agent);
      }),
      ws.on("agent:created", (p) => {
        const { agent } = p as AgentCreatedPayload;
        const agents = useWorkspaceStore.getState().agents;
        if (!agents.find((a) => a.id === agent.id)) {
          useWorkspaceStore.getState().refreshAgents();
        }
      }),
      ws.on("agent:deleted", () => {
        useWorkspaceStore.getState().refreshAgents();
      }),
    ];

    return () => unsubs.forEach((u) => u());
  }, [ws]);

  // Workspace + member events → useWorkspaceStore
  useEffect(() => {
    if (!ws) return;

    const unsubs = [
      ws.on("workspace:updated", (p) => {
        const { workspace } = p as WorkspaceUpdatedPayload;
        console.log("[realtime-sync] workspace:updated", workspace.name);
        useWorkspaceStore.getState().updateWorkspace(workspace);
      }),
      ws.on("workspace:deleted", (p) => {
        const { workspace_id } = p as WorkspaceDeletedPayload;
        const currentWs = useWorkspaceStore.getState().workspace;
        if (currentWs?.id === workspace_id) {
          console.log("[realtime-sync] current workspace deleted, switching away");
          toast.info("This workspace was deleted");
          useWorkspaceStore.getState().refreshWorkspaces();
        }
      }),
      ws.on("member:updated", (p) => {
        const payload = p as MemberUpdatedPayload;
        console.log("[realtime-sync] member:updated", payload.member.email, payload.member.role);
        useWorkspaceStore.getState().refreshMembers();
      }),
      ws.on("member:added", (p) => {
        const payload = p as MemberAddedPayload;
        const myUserId = useAuthStore.getState().user?.id;
        console.log("[realtime-sync] member:added", payload.member.email);
        if (payload.member.user_id === myUserId) {
          // I was invited to a workspace — refresh list so it appears
          useWorkspaceStore.getState().refreshWorkspaces();
        } else {
          useWorkspaceStore.getState().refreshMembers();
        }
      }),
      ws.on("member:removed", (p) => {
        const payload = p as MemberRemovedPayload;
        const myUserId = useAuthStore.getState().user?.id;
        console.log("[realtime-sync] member:removed user_id:", payload.user_id);
        if (payload.user_id === myUserId) {
          console.log("[realtime-sync] I was removed, switching away");
          toast.info("You were removed from this workspace");
          useWorkspaceStore.getState().refreshWorkspaces();
        } else {
          useWorkspaceStore.getState().refreshMembers();
        }
      }),
    ];

    return () => unsubs.forEach((u) => u());
  }, [ws]);

  // Reconnect → refetch all data to recover missed events
  useEffect(() => {
    if (!ws) return;

    const unsub = ws.onReconnect(async () => {
      console.log("[realtime-sync] reconnected, refetching all data");
      try {
        await Promise.all([
          useIssueStore.getState().fetch(),
          useInboxStore.getState().fetch(),
          useWorkspaceStore.getState().refreshAgents(),
        ]);
      } catch {
        // Silently fail; next reconnect will retry
      }
    });

    return unsub;
  }, [ws]);
}
