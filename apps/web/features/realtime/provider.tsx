"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  useCallback,
  type ReactNode,
} from "react";
import { WSClient } from "@multica/sdk";
import type { WSEventType } from "@multica/types";
import { useAuthStore } from "@/features/auth";
import { useWorkspaceStore } from "@/features/workspace";
import { useRealtimeSync } from "./use-realtime-sync";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8080/ws";

type EventHandler = (payload: unknown) => void;

interface WSContextValue {
  subscribe: (event: WSEventType, handler: EventHandler) => () => void;
}

const WSContext = createContext<WSContextValue | null>(null);

export function WSProvider({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const workspace = useWorkspaceStore((s) => s.workspace);
  const [wsClient, setWsClient] = useState<WSClient | null>(null);
  const wsRef = useRef<WSClient | null>(null);

  useEffect(() => {
    if (!user || !workspace) return;

    const token = localStorage.getItem("multica_token");
    if (!token) return;

    const ws = new WSClient(WS_URL);
    ws.setAuth(token, workspace.id);
    wsRef.current = ws;
    setWsClient(ws);
    ws.connect();

    return () => {
      ws.disconnect();
      wsRef.current = null;
      setWsClient(null);
    };
  }, [user, workspace]);

  // Centralized WS → store sync (uses state so it re-subscribes when WS changes)
  useRealtimeSync(wsClient);

  const subscribe = useCallback(
    (event: WSEventType, handler: EventHandler) => {
      const ws = wsRef.current;
      if (!ws) return () => {};
      return ws.on(event, handler);
    },
    [],
  );

  return (
    <WSContext.Provider value={{ subscribe }}>
      {children}
    </WSContext.Provider>
  );
}

export function useWS() {
  const ctx = useContext(WSContext);
  if (!ctx) throw new Error("useWS must be used within WSProvider");
  return ctx;
}
