'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, MessageSquare, AlertTriangle, UserPlus, Settings, CheckCheck, Volume2, VolumeX, Monitor } from 'lucide-react';
import { notificationsApi } from '@/services/api';
import { formatDateOnly } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useSignalR, SignalRNotification } from '@/hooks/useSignalR';
import {
  playNotificationSound, showDesktopNotification, ensureDesktopPermission,
  getSoundEnabled, setSoundEnabled, getDesktopEnabled, setDesktopEnabled,
} from '@/lib/notify';

interface Notification {
  id: number;
  type: string;
  title: string;
  message: string;
  conversationId?: number;
  escalationId?: number;
  priority: string;
  isRead: boolean;
  createdAt: string;
}

export function NotificationBell() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(true);
  const [soundOn, setSoundOn] = useState(false);
  const [desktopOn, setDesktopOn] = useState(false);
  const soundRef = useRef(false);
  const desktopRef = useRef(false);

  useEffect(() => {
    const s = getSoundEnabled(); const d = getDesktopEnabled();
    setSoundOn(s); setDesktopOn(d); soundRef.current = s; desktopRef.current = d;
  }, []);

  const handleRealTimeNotification = useCallback((notification: SignalRNotification) => {
    if (!mountedRef.current) return;
    // Increment badge count immediately
    setUnreadCount(prev => prev + 1);
    // Audible + desktop alerts (refs so the stable callback reads current prefs)
    if (soundRef.current) playNotificationSound();
    if (desktopRef.current) {
      showDesktopNotification(
        notification.title || 'New message',
        notification.message || '',
        notification.conversationId ? () => router.push(`/dashboard/conversations?id=${notification.conversationId}`) : undefined
      );
    }
    // Prepend to dropdown list so it shows up instantly
    const inboxItem: Notification = {
      id: Date.now(), // temporary client-side id
      type: notification.type,
      title: notification.title,
      message: notification.message,
      conversationId: notification.conversationId,
      escalationId: notification.escalationId,
      priority: notification.priority ?? 'Normal',
      isRead: false,
      createdAt: notification.timestamp ?? new Date().toISOString(),
    };
    setNotifications(prev => [inboxItem, ...prev.slice(0, 19)]);
  }, [router]);

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next); soundRef.current = next; setSoundEnabled(next);
    if (next) playNotificationSound(); // confirm + unlock audio on this gesture
  };

  const toggleDesktop = async () => {
    const next = !desktopOn;
    if (next) {
      const ok = await ensureDesktopPermission();
      if (!ok) return; // permission denied — leave off
    }
    setDesktopOn(next); desktopRef.current = next; setDesktopEnabled(next);
  };

  useSignalR(handleRealTimeNotification);

  useEffect(() => {
    mountedRef.current = true;
    loadNotifications();
    // Keep a slow poll as a fallback (every 2 min instead of 30s — SignalR handles real-time)
    const interval = setInterval(loadUnreadCount, 120000);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    // Close dropdown when clicking outside
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getUserId = () => {
    try {
      const raw = localStorage.getItem('user');
      if (!raw) return null;
      const user = JSON.parse(raw);
      return user.id ?? user.Id ?? null;
    } catch { return null; }
  };

  const loadNotifications = async () => {
    const userId = getUserId();
    if (!userId) return;

    setLoading(true);
    try {
      const response = await notificationsApi.getUserNotifications(userId, false, 20);
      setNotifications(response.data.notifications);
      setUnreadCount(response.data.unreadCount);
    } catch {
      // silently ignore
    } finally {
      setLoading(false);
    }
  };

  const loadUnreadCount = async () => {
    const userId = getUserId();
    if (!userId) return;

    try {
      const response = await notificationsApi.getUnreadCount(userId);
      if (mountedRef.current) setUnreadCount(response.data.unreadCount);
    } catch {
      // silently ignore polling errors
    }
  };

  const handleMarkAsRead = async (notificationId: number) => {
    try {
      await notificationsApi.markAsRead(notificationId);
      setNotifications(prev =>
        prev.map(n => n.id === notificationId ? { ...n, isRead: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch {
      // silently ignore
    }
  };

  const handleMarkAllAsRead = async () => {
    const userId = getUserId();
    if (!userId) return;

    try {
      await notificationsApi.markAllAsRead(userId);
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch {
      // silently ignore
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'new_message':
        return <MessageSquare className="h-4 w-4 text-blue-500" />;
      case 'escalation':
        return <AlertTriangle className="h-4 w-4 text-orange-500" />;
      case 'assignment':
        return <UserPlus className="h-4 w-4 text-green-500" />;
      default:
        return <Settings className="h-4 w-4 text-gray-500" />;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'High':
        return 'border-l-red-500';
      case 'Normal':
        return 'border-l-indigo-400';
      default:
        return 'border-l-gray-300';
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return formatDateOnly(date);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen) loadNotifications();
        }}
        className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors"
      >
        <Bell className="h-5 w-5 text-gray-600" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center bg-red-500 text-white text-xs font-bold rounded-full">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-96 bg-white rounded-lg shadow-xl border border-gray-200 z-50 max-h-[500px] overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
            <h3 className="font-semibold text-gray-900">Notifications</h3>
            <div className="flex items-center gap-1">
              <button
                onClick={toggleSound}
                title={soundOn ? 'Sound on — click to mute' : 'Sound off — click to enable'}
                className={`p-1.5 rounded-lg transition-colors ${soundOn ? 'text-indigo-600 hover:bg-indigo-50' : 'text-gray-400 hover:bg-gray-100'}`}
              >
                {soundOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              </button>
              <button
                onClick={toggleDesktop}
                title={desktopOn ? 'Desktop alerts on' : 'Enable desktop alerts'}
                className={`p-1.5 rounded-lg transition-colors ${desktopOn ? 'text-indigo-600 hover:bg-indigo-50' : 'text-gray-400 hover:bg-gray-100'}`}
              >
                <Monitor className="h-4 w-4" />
              </button>
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleMarkAllAsRead}
                  className="text-blue-600 hover:text-blue-700 text-xs"
                >
                  <CheckCheck className="h-4 w-4 mr-1" />
                  Mark all read
                </Button>
              )}
            </div>
          </div>

          {/* Notifications List */}
          <div className="max-h-[400px] overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent"></div>
              </div>
            ) : notifications.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Bell className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                <p>No notifications</p>
              </div>
            ) : (
              notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`flex items-start gap-3 px-4 py-3 border-b border-gray-100 hover:bg-gray-50 cursor-pointer border-l-4 ${getPriorityColor(notification.priority)} ${
                    !notification.isRead ? 'bg-blue-50' : ''
                  }`}
                  onClick={() => {
                    if (!notification.isRead) {
                      handleMarkAsRead(notification.id);
                    }
                    // Navigate to conversation if applicable
                    if (notification.conversationId) {
                      router.push(`/dashboard/conversations?id=${notification.conversationId}`);
                    } else if (notification.escalationId) {
                      router.push('/dashboard/escalations');
                    }
                    setIsOpen(false);
                  }}
                >
                  <div className="flex-shrink-0 mt-1">
                    {getIcon(notification.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between">
                      <p className={`text-sm font-medium ${!notification.isRead ? 'text-gray-900' : 'text-gray-600'}`}>
                        {notification.title}
                      </p>
                      {!notification.isRead && (
                        <span className="h-2 w-2 rounded-full bg-blue-500 flex-shrink-0 ml-2 mt-1.5"></span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 truncate">{notification.message}</p>
                    <p className="text-xs text-gray-400 mt-1">{formatTime(notification.createdAt)}</p>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="px-4 py-2 border-t border-gray-200 bg-gray-50 text-center">
              <button
                onClick={() => {
                  router.push('/dashboard/notifications');
                  setIsOpen(false);
                }}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                View all notifications
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
