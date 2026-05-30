'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { notificationsApi } from '@/services/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Bell,
  MessageSquare,
  AlertTriangle,
  UserPlus,
  Settings,
  CheckCheck,
  Check,
  Filter,
} from 'lucide-react';
import { getRelativeTime } from '@/lib/utils';

type FilterType = 'all' | 'unread' | 'new_message' | 'escalation' | 'assignment';

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

export default function NotificationsPage() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('all');
  const [markingAll, setMarkingAll] = useState(false);

  const getUserId = () => {
    try {
      const raw = localStorage.getItem('user');
      return raw ? JSON.parse(raw).id : null;
    } catch { return null; }
  };

  const load = useCallback(async () => {
    const userId = getUserId();
    if (!userId) return;
    setLoading(true);
    try {
      const res = await notificationsApi.getUserNotifications(userId, false, 100);
      setNotifications(res.data.notifications);
      setUnreadCount(res.data.unreadCount);
    } catch {
      // silently ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleMarkAsRead = async (n: Notification) => {
    if (!n.isRead) {
      await notificationsApi.markAsRead(n.id);
      setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, isRead: true } : x));
      setUnreadCount(c => Math.max(0, c - 1));
    }
    if (n.conversationId) router.push(`/dashboard/conversations?id=${n.conversationId}`);
    else if (n.escalationId) router.push('/dashboard/escalations');
  };

  const handleMarkAllRead = async () => {
    const userId = getUserId();
    if (!userId) return;
    setMarkingAll(true);
    try {
      await notificationsApi.markAllAsRead(userId);
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } finally {
      setMarkingAll(false);
    }
  };

  const filtered = notifications.filter(n => {
    if (filter === 'unread') return !n.isRead;
    if (filter === 'all') return true;
    return n.type === filter;
  });

  const getIcon = (type: string) => {
    switch (type) {
      case 'new_message': return <MessageSquare className="h-5 w-5 text-indigo-500" />;
      case 'escalation': return <AlertTriangle className="h-5 w-5 text-orange-500" />;
      case 'assignment': return <UserPlus className="h-5 w-5 text-green-500" />;
      default: return <Settings className="h-5 w-5 text-gray-400" />;
    }
  };

  const getPriorityStyle = (priority: string) => {
    switch (priority) {
      case 'High': return 'border-l-red-500 bg-red-50/30';
      case 'Normal': return 'border-l-blue-400';
      default: return 'border-l-gray-200';
    }
  };

  const filterTabs: { key: FilterType; label: string; count?: number }[] = [
    { key: 'all', label: 'All', count: notifications.length },
    { key: 'unread', label: 'Unread', count: unreadCount },
    { key: 'new_message', label: 'Messages', count: notifications.filter(n => n.type === 'new_message').length },
    { key: 'escalation', label: 'Escalations', count: notifications.filter(n => n.type === 'escalation').length },
    { key: 'assignment', label: 'Assignments', count: notifications.filter(n => n.type === 'assignment').length },
  ];

  return (
    <div className="bg-white min-h-screen flex flex-col">
      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
        {/* Actions bar */}
        {unreadCount > 0 && (
          <div className="flex justify-between items-center mb-4">
            <p className="text-sm text-gray-500">
              {unreadCount} unread notification{unreadCount > 1 ? 's' : ''}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleMarkAllRead}
              disabled={markingAll}
              className="text-indigo-600 border-indigo-200 hover:bg-indigo-50"
            >
              <CheckCheck className="h-4 w-4 mr-2" />
              Mark all as read
            </Button>
          </div>
        )}
        {/* Filter Tabs */}
        <div className="flex gap-2 mb-5 flex-wrap">
          {filterTabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                filter === tab.key
                  ? 'bg-indigo-700 text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Filter className="h-3 w-3" />
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span className={`ml-1 px-1.5 py-0.5 rounded-full text-xs font-bold ${
                  filter === tab.key ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Notification List */}
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-200">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <Bell className="h-12 w-12 mb-3 text-gray-200" />
              <p className="font-medium text-gray-500">No notifications</p>
              <p className="text-sm mt-1">You&apos;re all caught up!</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filtered.map(n => (
                <div
                  key={n.id}
                  onClick={() => handleMarkAsRead(n)}
                  className={`flex items-start gap-4 px-5 py-4 cursor-pointer hover:bg-gray-50 transition-colors border-l-4 ${getPriorityStyle(n.priority)} ${!n.isRead ? 'bg-indigo-50/40' : ''}`}
                >
                  <div className={`mt-0.5 flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${
                    n.type === 'new_message' ? 'bg-indigo-100' :
                    n.type === 'escalation' ? 'bg-orange-100' :
                    n.type === 'assignment' ? 'bg-green-100' : 'bg-gray-100'
                  }`}>
                    {getIcon(n.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-sm font-semibold ${!n.isRead ? 'text-gray-900' : 'text-gray-600'}`}>
                        {n.title}
                      </p>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {n.priority === 'High' && (
                          <Badge className="text-xs bg-red-100 text-red-700 border-red-200">High</Badge>
                        )}
                        {!n.isRead && <span className="h-2 w-2 rounded-full bg-indigo-500 flex-shrink-0" />}
                      </div>
                    </div>
                    <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{n.message}</p>
                    <div className="flex items-center gap-3 mt-1.5">
                      <span className="text-xs text-gray-400">{getRelativeTime(n.createdAt)}</span>
                      {n.conversationId && <span className="text-xs text-indigo-500">→ View conversation</span>}
                      {n.escalationId && <span className="text-xs text-orange-500">→ View escalation</span>}
                    </div>
                  </div>
                  {n.isRead && <Check className="h-4 w-4 text-gray-300 flex-shrink-0 mt-1" />}
                </div>
              ))}
            </div>
          )}
        </div>

        {filtered.length > 0 && (
          <p className="text-xs text-center text-gray-400 mt-4">
            Showing {filtered.length} of {notifications.length} notifications
          </p>
        )}
      </div>
    </div>
  );
}
