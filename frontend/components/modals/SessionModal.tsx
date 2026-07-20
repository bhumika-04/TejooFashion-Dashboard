'use client';

import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, Wifi, Copy, ExternalLink, ChevronDown, Eye, EyeOff } from 'lucide-react';
import { sessionsApi } from '@/services/api';
import { useToast } from '@/components/ui/toast';

interface SessionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: SessionFormData) => Promise<void>;
  session?: any;
  users?: any[];
}

export interface SessionFormData {
  phoneNumber: string;
  provider: 'Interakt' | 'Meta';
  apiKey: string;
  assignedUserId: number | null;
  autoReplyEnabled: boolean;
  connectionVerified: boolean;
}

type ConnectionStatus = 'idle' | 'testing' | 'success' | 'error';

export function SessionModal({ open, onOpenChange, onSubmit, session, users = [] }: SessionModalProps) {
  const [loading, setLoading] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle');
  const [connectionMessage, setConnectionMessage] = useState('');
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const { showToast } = useToast();

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
        setUserSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);
  const [formData, setFormData] = useState<SessionFormData>({
    phoneNumber: '',
    provider: 'Interakt',
    apiKey: '',
    assignedUserId: null,
    autoReplyEnabled: false,
    connectionVerified: false,
  });

  const ngrokBase = (process.env.NEXT_PUBLIC_NGROK_URL || '').replace(/\/$/, '');
  // When editing an existing session, append ?sid={id} so Interakt routes to the correct session
  const sidParam = session?.id ? `?sid=${session.id}` : '';
  const webhookUrl = formData.provider === 'Interakt'
    ? `${ngrokBase}/api/webhook/interakt${sidParam}`
    : `${ngrokBase}/api/webhook/meta${sidParam}`;

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    showToast(`${label} copied to clipboard`, 'success');
  };

  useEffect(() => {
    if (session) {
      setFormData({
        phoneNumber: session.phoneNumber || '',
        provider: session.provider || 'Interakt',
        apiKey: session.apiKey || '',
        assignedUserId: session.assignedUserId || null,
        autoReplyEnabled: session.autoReplyEnabled ?? true,
        connectionVerified: session.isConnected ?? false,
      });
    } else {
      setFormData({
        phoneNumber: '',
        provider: 'Interakt',
        apiKey: '',
        assignedUserId: null,
        autoReplyEnabled: false,
        connectionVerified: false,
      });
    }
    setConnectionStatus('idle');
    setConnectionMessage('');
    setShowApiKey(false);
  }, [session, open]);

  const handleTestConnection = async () => {
    if (!formData.apiKey) {
      setConnectionStatus('error');
      setConnectionMessage('Please enter an API key');
      return;
    }

    setConnectionStatus('testing');
    setConnectionMessage('Testing connection...');

    try {
      const payload: any = { Provider: formData.provider };

      if (formData.provider === 'Interakt') {
        payload.ApiKey = formData.apiKey;
      } else if (formData.provider === 'Meta') {
        payload.MetaPhoneNumberId = formData.apiKey;
        payload.MetaBusinessAccountId = '';
        payload.MetaAccessToken = formData.apiKey;
      }

      const response = await sessionsApi.testConnection(payload);

      if (response.data.success) {
        setConnectionStatus('success');
        setConnectionMessage(response.data.message || 'Connection successful! API credentials are valid.');
        setFormData(prev => ({ ...prev, connectionVerified: true }));
      } else {
        setConnectionStatus('error');
        setConnectionMessage(response.data.message || 'Connection failed');
        setFormData(prev => ({ ...prev, connectionVerified: false }));
      }
    } catch (error: any) {
      setConnectionStatus('error');
      setConnectionMessage(
        error.response?.data?.message ||
        'Failed to connect. Please check your API key and try again.'
      );
      setFormData(prev => ({ ...prev, connectionVerified: false }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onSubmit(formData);
      onOpenChange(false);
    } catch {
      // parent handles error via toast
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader onClose={() => onOpenChange(false)}>
          <DialogTitle>{session ? 'Edit Session' : 'Add New Session'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <DialogBody>
            <div className="space-y-4">
              {/* Phone Number */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Phone Number <span className="text-red-500">*</span>
                </label>
                <Input
                  type="text"
                  value={formData.phoneNumber}
                  onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
                  placeholder="e.g., +919876543210"
                  required
                  disabled={loading}
                />
              </div>

              {/* Provider */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Provider <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="radio"
                      name="provider"
                      value="Interakt"
                      checked={formData.provider === 'Interakt'}
                      onChange={(e) => {
                        setFormData({ ...formData, provider: e.target.value as 'Interakt' | 'Meta' });
                        setConnectionStatus('idle');
                      }}
                      className="w-4 h-4 text-blue-600 mr-2"
                      disabled={loading}
                    />
                    <Badge variant="outline">Interakt</Badge>
                  </label>
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="radio"
                      name="provider"
                      value="Meta"
                      checked={formData.provider === 'Meta'}
                      onChange={(e) => {
                        setFormData({ ...formData, provider: e.target.value as 'Interakt' | 'Meta' });
                        setConnectionStatus('idle');
                      }}
                      className="w-4 h-4 text-blue-600 mr-2"
                      disabled={loading}
                    />
                    <Badge variant="outline">Meta</Badge>
                  </label>
                </div>
              </div>

              {/* Webhook URL Display */}
              <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-100">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Webhook URL</p>
                    <p className="text-xs text-gray-600 mt-1">Configure this URL in your {formData.provider} dashboard</p>
                  </div>
                  <a
                    href={formData.provider === 'Interakt' ? 'https://app.interakt.ai/' : 'https://developers.facebook.com/'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-700"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <code className="flex-1 bg-white px-3 py-2 rounded-lg text-xs font-mono text-gray-700 border border-gray-300 break-all">
                    {webhookUrl}
                  </code>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(webhookUrl, 'Webhook URL')}
                    className="flex-shrink-0"
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
                {!session?.id && (
                  <p className="text-[11px] text-amber-600 mt-2 bg-amber-50 px-2 py-1 rounded-lg border border-amber-100">
                    ⚠ After saving, copy the final URL from the session card — it will include <strong>?sid=N</strong> needed for correct routing.
                  </p>
                )}
              </div>

              {/* API Key with Test Connection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  API Key <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      type={showApiKey ? 'text' : 'password'}
                      value={formData.apiKey}
                      onChange={(e) => {
                        setFormData({ ...formData, apiKey: e.target.value, connectionVerified: false });
                        setConnectionStatus('idle');
                      }}
                      placeholder="Enter API key"
                      required
                      disabled={loading}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                      tabIndex={-1}
                      aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
                    >
                      {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleTestConnection}
                    disabled={loading || connectionStatus === 'testing' || !formData.apiKey}
                    className="flex items-center gap-2 whitespace-nowrap"
                  >
                    <Wifi className="h-4 w-4" />
                    {connectionStatus === 'testing' ? 'Testing...' : 'Test Connection'}
                  </Button>
                </div>

                {/* Connection Status Message */}
                {connectionStatus !== 'idle' && (
                  <div
                    className={`mt-2 p-3 rounded-lg flex items-start gap-2 animate-in slide-in-from-top ${
                      connectionStatus === 'success'
                        ? 'bg-green-50 border-2 border-green-200'
                        : connectionStatus === 'error'
                        ? 'bg-red-50 border-2 border-red-200'
                        : 'bg-indigo-50 border border-indigo-100'
                    }`}
                  >
                    {connectionStatus === 'success' && (
                      <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                    )}
                    {connectionStatus === 'error' && (
                      <XCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                    )}
                    {connectionStatus === 'testing' && (
                      <Wifi className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5 animate-pulse" />
                    )}
                    <p
                      className={`text-sm font-medium ${
                        connectionStatus === 'success'
                          ? 'text-green-700'
                          : connectionStatus === 'error'
                          ? 'text-red-700'
                          : 'text-blue-700'
                      }`}
                    >
                      {connectionMessage}
                    </p>
                  </div>
                )}
              </div>

              {/* Assigned User */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Assign to User
                </label>
                <div className="relative" ref={userMenuRef}>
                  <button
                    type="button"
                    onClick={() => { if (!loading) { setShowUserMenu(v => !v); setUserSearch(''); } }}
                    disabled={loading}
                    className="w-full flex items-center justify-between px-4 py-2.5 border-2 border-gray-200 rounded-lg text-sm
                      hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500
                      disabled:opacity-50 disabled:bg-gray-50 bg-white text-left"
                  >
                    <span className={formData.assignedUserId ? 'text-gray-900' : 'text-gray-400'}>
                      {formData.assignedUserId
                        ? users.find(u => u.id === formData.assignedUserId)
                            ? `${users.find(u => u.id === formData.assignedUserId)!.fullName} (${users.find(u => u.id === formData.assignedUserId)!.role})`
                            : 'Select User'
                        : 'Select User'}
                    </span>
                    <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${showUserMenu ? 'rotate-180' : ''}`} />
                  </button>
                  {showUserMenu && (() => {
                    const q = userSearch.trim().toLowerCase();
                    const filtered = q
                      ? users.filter(u => `${u.fullName} ${u.role} ${u.email ?? ''}`.toLowerCase().includes(q))
                      : users;
                    return (
                    <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg">
                      {/* Search inside dropdown */}
                      <div className="p-2 border-b border-gray-100">
                        <input
                          type="text"
                          placeholder="Search user…"
                          autoFocus
                          value={userSearch}
                          onChange={e => setUserSearch(e.target.value)}
                          onClick={e => e.stopPropagation()}
                          className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-300"
                        />
                      </div>
                      <div className="max-h-48 overflow-y-auto">
                        {!q && (
                          <button
                            type="button"
                            onClick={() => { setFormData({ ...formData, assignedUserId: null }); setShowUserMenu(false); setUserSearch(''); }}
                            className="w-full text-left px-4 py-2.5 text-sm text-gray-400 hover:bg-gray-50"
                          >
                            — None —
                          </button>
                        )}
                        {filtered.map((user) => (
                          <button
                            key={user.id}
                            type="button"
                            onClick={() => { setFormData({ ...formData, assignedUserId: user.id }); setShowUserMenu(false); setUserSearch(''); }}
                            className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                              formData.assignedUserId === user.id
                                ? 'bg-indigo-50 text-indigo-700 font-medium'
                                : 'text-gray-700 hover:bg-gray-50'
                            }`}
                          >
                            {user.fullName} <span className="text-gray-400">({user.role})</span>
                            {user.email && <span className="block text-[11px] text-gray-400">{user.email}</span>}
                          </button>
                        ))}
                        {filtered.length === 0 && (
                          <p className="px-4 py-3 text-sm text-gray-400 text-center">No users match “{userSearch}”</p>
                        )}
                      </div>
                    </div>
                    );
                  })()}
                </div>
              </div>

              {/* Auto Reply Toggle */}
              <div className="flex items-center justify-between p-4 bg-indigo-50 rounded-xl border border-indigo-100">
                <div>
                  <p className="font-semibold text-gray-900">Auto Reply</p>
                  <p className="text-sm text-gray-600">Enable AI-powered automatic responses</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.autoReplyEnabled}
                    onChange={(e) => setFormData({ ...formData, autoReplyEnabled: e.target.checked })}
                    className="sr-only peer"
                    disabled={loading}
                  />
                  <div className="w-14 h-7 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-indigo-700 shadow-inner"></div>
                </label>
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Saving...' : session ? 'Update Session' : 'Create Session'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
