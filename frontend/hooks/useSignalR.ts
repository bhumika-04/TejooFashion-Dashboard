'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import * as signalR from '@microsoft/signalr';

const BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api').replace(/\/api$/, '');
const HUB_URL = `${BASE}/hubs/notifications`;

export interface SignalRNotification {
  type: string;
  title: string;
  message: string;
  conversationId?: number;
  escalationId?: number;
  customerPhone?: string;
  customerName?: string;
  priority?: string;
  timestamp: string;
}

type NotificationHandler = (notification: SignalRNotification) => void;

export function useSignalR(onNotification: NotificationHandler): {
  isConnected: boolean;
  joinConversation: (id: number) => void;
  leaveConversation: (id: number) => void;
} {
  const [isConnected, setIsConnected] = useState(false);
  const connectionRef = useRef<signalR.HubConnection | null>(null);
  const handlerRef = useRef<NotificationHandler>(onNotification);

  // Keep handler ref fresh without re-running the effect
  useEffect(() => {
    handlerRef.current = onNotification;
  }, [onNotification]);

  useEffect(() => {
    const token = localStorage.getItem('authToken');
    if (!token) return;

    // Captured locally so cleanup can always stop THIS connection, even if it is torn
    // down (e.g. React Strict Mode double-mount) before start() resolves. Without this,
    // the connection would be orphaned and the user group would receive every push twice.
    let cancelled = false;
    const connection = new signalR.HubConnectionBuilder()
      .withUrl(HUB_URL, {
        accessTokenFactory: () => token,
        transport: signalR.HttpTransportType.WebSockets,
      })
      .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
      .configureLogging(signalR.LogLevel.Warning)
      .build();

    connectionRef.current = connection;

    const joinUserGroup = async () => {
      const raw = localStorage.getItem('user');
      if (!raw) return;
      const user = JSON.parse(raw);
      const userId = user.id ?? user.Id;
      if (userId) await connection.invoke('JoinUserGroup', userId);
    };

    connection.on('ReceiveNotification', (notification: SignalRNotification) => {
      handlerRef.current(notification);
    });

    connection.onreconnecting(() => setIsConnected(false));
    connection.onreconnected(async () => {
      setIsConnected(true);
      await joinUserGroup().catch(() => {});
    });

    (async () => {
      try {
        await connection.start();
        if (cancelled) {
          // Effect was already cleaned up while starting — stop and bail out
          await connection.stop();
          return;
        }
        setIsConnected(true);
        await joinUserGroup();
      } catch {
        // connection failed — SignalR will retry automatically
      }
    })();

    return () => {
      cancelled = true;
      connection.stop().catch(() => {});
      if (connectionRef.current === connection) connectionRef.current = null;
      setIsConnected(false);
    };
  }, []);

  const joinConversation = useCallback((id: number) => {
    connectionRef.current?.invoke('JoinConversation', id).catch(() => {});
  }, []);

  const leaveConversation = useCallback((id: number) => {
    connectionRef.current?.invoke('LeaveConversation', id).catch(() => {});
  }, []);

  return { isConnected, joinConversation, leaveConversation };
}
