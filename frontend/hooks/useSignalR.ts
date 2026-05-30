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

  const connect = useCallback(async () => {
    const token = localStorage.getItem('authToken');
    if (!token) return;

    const connection = new signalR.HubConnectionBuilder()
      .withUrl(HUB_URL, {
        accessTokenFactory: () => token,
        transport: signalR.HttpTransportType.WebSockets,
      })
      .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
      .configureLogging(signalR.LogLevel.Warning)
      .build();

    connection.on('ReceiveNotification', (notification: SignalRNotification) => {
      handlerRef.current(notification);
    });

    connection.onreconnecting(() => {
      setIsConnected(false);
    });

    connection.onreconnected(async () => {
      setIsConnected(true);
      // Re-join user group after reconnect
      const raw = localStorage.getItem('user');
      if (raw) {
        const user = JSON.parse(raw);
        const userId = user.id ?? user.Id;
        if (userId) await connection.invoke('JoinUserGroup', userId);
      }
    });

    try {
      await connection.start();
      setIsConnected(true);

      // Join user group for targeted notifications
      const raw = localStorage.getItem('user');
      if (raw) {
        const user = JSON.parse(raw);
        const userId = user.id ?? user.Id;
        if (userId) await connection.invoke('JoinUserGroup', userId);
      }

      connectionRef.current = connection;
    } catch {
      // connection failed — SignalR will retry automatically
    }
  }, []);

  useEffect(() => {
    connect();

    return () => {
      connectionRef.current?.stop();
      connectionRef.current = null;
      setIsConnected(false);
    };
  }, [connect]);

  const joinConversation = useCallback((id: number) => {
    connectionRef.current?.invoke('JoinConversation', id).catch(() => {});
  }, []);

  const leaveConversation = useCallback((id: number) => {
    connectionRef.current?.invoke('LeaveConversation', id).catch(() => {});
  }, []);

  return { isConnected, joinConversation, leaveConversation };
}
