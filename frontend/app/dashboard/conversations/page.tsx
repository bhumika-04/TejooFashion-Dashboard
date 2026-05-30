'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { conversationsApi, messagesApi, sessionsApi, usersApi, quickRepliesApi, tagsApi, customersApi } from '@/services/api';
import {
  Clock, CheckCircle2, AlertTriangle, AlertCircle, Phone,
  MessageSquare, Send, Search, X, UserCheck, BrainCircuit, RefreshCw,
  ChevronDown, ChevronLeft, Smile, Meh, Frown, Zap, Tag, Download, ArrowDown, Wifi, WifiOff,
  Paperclip, Image, Video, FileText, Music, XCircle,
} from 'lucide-react';
import { getRelativeTime, formatDate, parseUTCDate } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';
import { useSignalR, SignalRNotification } from '@/hooks/useSignalR';

type FilterTab = 'all' | 'escalated' | 'done' | 'ai';

export default function ConversationsPage() {
  const [conversations, setConversations] = useState<any[]>([]);
  const [selectedConv, setSelectedConv] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [sessionSearch, setSessionSearch] = useState('');
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  const [activeSessionId, setActiveSessionId] = useState<number | undefined>(undefined);
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list'); // mobile stack nav

  // Detect scoped roles — read localStorage only on client to avoid hydration mismatch
  const [currentUser] = useState(() => {
    if (typeof window === 'undefined') return {};
    try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; }
  });
  const isCRR = ['CRR', 'AGENT'].includes((currentUser.role ?? currentUser.Role ?? '').toUpperCase());
  const currentUserId: number | undefined = isCRR ? (currentUser.id ?? currentUser.Id) : undefined;
  const PAGE_SIZE = 100;
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [showAssignDropdown, setShowAssignDropdown] = useState(false);
  const assignDropdownRef = useRef<HTMLDivElement>(null);
  const [quickReplies, setQuickReplies] = useState<any[]>([]);
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const quickReplyRef = useRef<HTMLDivElement>(null);
  const [allConvTags, setAllConvTags] = useState<any[]>([]);    // conversation type tags
  const [allCustomerTags, setAllCustomerTags] = useState<any[]>([]); // customer type tags
  const [allTags, setAllTags] = useState<any[]>([]);  // kept for backward compat
  const [convTags, setConvTags] = useState<any[]>([]);
  const [customerTags, setCustomerTags] = useState<any[]>([]);
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [tagTab, setTagTab] = useState<'conv' | 'customer'>('conv');
  const [showTagMenu, setShowTagMenu] = useState(false);
  const tagMenuRef = useRef<HTMLDivElement>(null);

  // Attachment state — supports multiple files
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
  const [attachmentPreviews, setAttachmentPreviews] = useState<string[]>([]);
  const [attachmentType, setAttachmentType] = useState<string>('text');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  // Forward message
  const [forwardMsg, setForwardMsg] = useState<any>(null);
  const [forwardSearch, setForwardSearch] = useState('');
  const [forwardTargets, setForwardTargets] = useState<Set<number>>(new Set());
  const [forwarding, setForwarding] = useState(false);
  // Legacy aliases for backward compat with existing JSX
  const attachmentFile = attachmentFiles[0] ?? null;
  const attachmentPreview = attachmentPreviews[0] ?? null;
  const attachMenuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Close assign dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (assignDropdownRef.current && !assignDropdownRef.current.contains(e.target as Node)) {
        setShowAssignDropdown(false);
      }
    };
    if (showAssignDropdown) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showAssignDropdown]);
  const [summary, setSummary] = useState<any | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [showSummaryPanel, setShowSummaryPanel] = useState(false);
  const [hasNewMessage, setHasNewMessage] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const selectedConvRef = useRef<any>(null);
  const shouldScrollRef = useRef(true);
  const isAtBottomRef = useRef(true);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { showToast } = useToast();

  useEffect(() => { selectedConvRef.current = selectedConv; }, [selectedConv]);
  useEffect(() => {
    if (!shouldScrollRef.current) return;
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    shouldScrollRef.current = false;
  }, [messages]);

  const handleNotification = useCallback((notification: SignalRNotification) => {
    if (notification.type === 'new_message' && notification.conversationId) {
      setConversations(prev => {
        const idx = prev.findIndex(c => c.id === notification.conversationId);
        if (idx === -1) {
          // New conversation not yet in the list — reload the full list to include it
          loadConversations();
          return prev;
        }
        const updated = {
          ...prev[idx],
          lastMessagePreview: notification.message,
          lastMessageAt: notification.timestamp,
        };
        return [updated, ...prev.filter((_, i) => i !== idx)];
      });

      if (selectedConvRef.current?.id === notification.conversationId) {
        // Only auto-scroll if the user is already at the bottom
        shouldScrollRef.current = isAtBottomRef.current;
        if (!isAtBottomRef.current) setHasNewMessage(true);
        loadMessages(notification.conversationId);
      } else {
        const preview = notification.message?.slice(0, 50);
        showToast(`${notification.customerName ?? notification.customerPhone}: ${preview}`, 'info');
      }
    }

    if (notification.type === 'escalation' && notification.conversationId) {
      setConversations(prev =>
        prev.map(c => c.id === notification.conversationId ? { ...c, status: 'Escalated' } : c)
      );
      showToast(notification.message, 'error');
    }

    if (notification.type === 'conversation_assigned' && notification.conversationId) {
      showToast(`A conversation was assigned to you`, 'info');
      // Refresh so the assignment reflects in the list
      loadConversations();
    }
  }, []);

  const { isConnected, joinConversation, leaveConversation } = useSignalR(handleNotification);

  useEffect(() => {
    loadConversations();
    loadSessions();
    loadUsers();
    quickRepliesApi.getAll().then(r => setQuickReplies(r.data ?? [])).catch(() => {});
    tagsApi.getAll('conversation').then(r => { setAllConvTags(r.data ?? []); setAllTags(r.data ?? []); }).catch(() => {});
    tagsApi.getAll('customer').then(r => setAllCustomerTags(r.data ?? [])).catch(() => {});
  }, []);

  // Close tag menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (tagMenuRef.current && !tagMenuRef.current.contains(e.target as Node))
        setShowTagMenu(false);
    };
    if (showTagMenu) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showTagMenu]);

  // Close quick-reply popover on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (quickReplyRef.current && !quickReplyRef.current.contains(e.target as Node))
        setShowQuickReplies(false);
    };
    if (showQuickReplies) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showQuickReplies]);

  // Close attach menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target as Node))
        setShowAttachMenu(false);
    };
    if (showAttachMenu) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showAttachMenu]);

  const loadConversations = async (sessionId?: number) => {
    setLoading(true);
    try {
      const response = await conversationsApi.getAll(undefined, currentUserId, sessionId, PAGE_SIZE, 0);
      setConversations(response.data);
      setHasMore(response.data.length === PAGE_SIZE);
    } catch {
      showToast('Failed to load conversations', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadMoreConversations = async () => {
    setLoadingMore(true);
    try {
      const response = await conversationsApi.getAll(undefined, currentUserId, activeSessionId, PAGE_SIZE, conversations.length);
      setConversations(prev => [...prev, ...response.data]);
      setHasMore(response.data.length === PAGE_SIZE);
    } catch {
      showToast('Failed to load more conversations', 'error');
    } finally {
      setLoadingMore(false);
    }
  };

  const handleSessionFilter = (sessionId: number) => {
    const next = activeSessionId === sessionId ? undefined : sessionId;
    setActiveSessionId(next);
    setSelectedConv(null);
    setMessages([]);
    // Clear any active search when switching sessions
    setSearchQuery('');
    setSearchResults(null);
    loadConversations(next);
  };

  const loadSessions = async () => {
    try {
      const response = await sessionsApi.getAll();
      setSessions(response.data);
    } catch {
      // silently ignore
    }
  };

  const loadUsers = async () => {
    try {
      const response = await usersApi.getAll(true);
      setUsers(response.data);
    } catch {
      // silently ignore
    }
  };

  const loadMessages = async (convId: number) => {
    try {
      const response = await messagesApi.getByConversation(convId);
      setMessages(response.data);
    } catch {
      showToast('Failed to load messages', 'error');
    }
  };

  const handleSelectConversation = (conv: any) => {
    // Leave previous conversation's real-time group, join new one
    if (selectedConvRef.current?.id && selectedConvRef.current.id !== conv.id) {
      leaveConversation(selectedConvRef.current.id);
    }
    joinConversation(conv.id);
    setMobileView('chat'); // push to chat on mobile

    setSelectedConv(conv);
    setReplyText('');
    clearAttachment();
    setSummary(null);
    setShowSummaryPanel(false);
    setShowAssignDropdown(false);
    setShowTagMenu(false);
    setConvTags([]);
    setHasNewMessage(false);
    shouldScrollRef.current = true;
    isAtBottomRef.current = true;
    loadMessages(conv.id);
    tagsApi.getByConversation(conv.id).then(r => setConvTags(r.data ?? [])).catch(() => {});
    // Load customer tags
    setCustomerTags([]);
    setCustomerId(null);
    setTagTab('conv');
    customersApi.getByPhone(conv.customerPhone)
      .then(r => {
        if (r.data?.id) {
          setCustomerId(r.data.id);
          customersApi.getTags(r.data.id).then(tr => setCustomerTags(tr.data ?? [])).catch(() => {});
        }
      }).catch(() => {});
    conversationsApi.getSummary(conv.id)
      .then(r => setSummary(r.data))
      .catch(() => {/* no summary yet */});
  };

  const handleToggleTag = async (tag: any) => {
    if (!selectedConv) return;
    const isActive = convTags.some((t: any) => t.id === tag.id);
    try {
      if (isActive) {
        await tagsApi.removeFromConversation(selectedConv.id, tag.id);
        setConvTags(prev => prev.filter((t: any) => t.id !== tag.id));
      } else {
        await tagsApi.addToConversation(selectedConv.id, tag.id);
        setConvTags(prev => [...prev, tag]);
      }
    } catch {
      showToast('Failed to update tag', 'error');
    }
  };

  const handleExport = () => {
    if (!selectedConv || messages.length === 0) return;

    const escape = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;

    const headers = ['Message ID', 'Timestamp', 'Direction', 'Sender', 'Content', 'AI Generated', 'Conversation ID', 'Customer Phone', 'Customer Name', 'Status'];

    const rows = messages.map((m: any) => [
      m.id,
      formatDate(m.createdAt),
      m.direction,
      m.direction === 'inbound' ? (selectedConv.customerName ?? selectedConv.customerPhone) : (m.isAiGenerated ? 'AI' : 'Agent'),
      m.content,
      m.isAiGenerated ? 'Yes' : 'No',
      selectedConv.id,
      selectedConv.customerPhone,
      selectedConv.customerName ?? '',
      selectedConv.status,
    ].map(escape).join(','));

    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `conversation-${selectedConv.id}-${selectedConv.customerPhone}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const clearAttachment = () => {
    setAttachmentFiles([]);
    setAttachmentPreviews([]);
    setAttachmentType('text');
    setUploadProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleForward = async () => {
    if (!forwardMsg || forwardTargets.size === 0) return;
    setForwarding(true);
    try {
      await Promise.all([...forwardTargets].map(convId =>
        conversationsApi.sendMessage(
          convId,
          forwardMsg.content || '',
          forwardMsg.messageType || 'text',
          forwardMsg.mediaUrl || undefined
        )
      ));
      showToast(`Forwarded to ${forwardTargets.size} conversation(s)`, 'success');
      setForwardMsg(null);
      setForwardTargets(new Set());
      setForwardSearch('');
    } catch { showToast('Failed to forward message', 'error'); }
    finally { setForwarding(false); }
  };

  // WhatsApp Business API file size limits
  const MEDIA_LIMITS: Record<string, number> = {
    image:    5  * 1024 * 1024,   // 5 MB
    video:    16 * 1024 * 1024,   // 16 MB
    audio:    16 * 1024 * 1024,   // 16 MB
    document: 100 * 1024 * 1024, // 100 MB
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, type: string) => {
    const allFiles = Array.from(e.target.files ?? []);
    if (!allFiles.length) return;

    // Enforce WhatsApp size limits
    const limit = MEDIA_LIMITS[type] ?? 16 * 1024 * 1024;
    const oversized = allFiles.filter(f => f.size > limit);
    if (oversized.length > 0) {
      const mb = (limit / 1024 / 1024).toFixed(0);
      showToast(`${oversized.length} file(s) exceed the ${mb}MB limit for ${type}s and were removed`, 'error');
    }
    const valid = allFiles.filter(f => f.size <= limit).slice(0, 10);
    if (!valid.length) return;
    if (allFiles.length > 10) showToast(`Only first 10 files selected`, 'info');

    setShowAttachMenu(false);
    setAttachmentFiles(valid);
    setAttachmentType(type);

    if (type === 'image') {
      // Generate previews for all selected images
      const previews: string[] = [];
      valid.forEach((file: File, i: number) => {
        const reader = new FileReader();
        reader.onload = ev => {
          previews[i] = ev.target?.result as string;
          if (previews.filter(Boolean).length === valid.length)
            setAttachmentPreviews([...previews]);
        };
        reader.readAsDataURL(file);
      });
    } else {
      setAttachmentPreviews([]);
    }
  };

  const handleSendReply = async () => {
    if (!selectedConv) return;
    const hasText = replyText.trim().length > 0;
    const hasFiles = attachmentFiles.length > 0;
    if (!hasText && !hasFiles) return;

    setSending(true);
    try {
      if (hasFiles) {
        setUploading(true);
        // Warn if too many files — Interakt rate limits ~5 req/sec
        const MAX_BATCH = 10;
        const files = attachmentFiles.slice(0, MAX_BATCH);
        if (attachmentFiles.length > MAX_BATCH)
          showToast(`Sending first ${MAX_BATCH} of ${attachmentFiles.length} files (batch limit)`, 'info');

        for (let i = 0; i < files.length; i++) {
          setUploadProgress(Math.round(((i) / files.length) * 100));
          const uploadRes = await conversationsApi.uploadMedia(selectedConv.id, files[i]);
          const { url, messageType } = uploadRes.data;
          // Attach caption to the last file only
          const caption = i === files.length - 1 ? replyText.trim() : '';
          await conversationsApi.sendMessage(selectedConv.id, caption, messageType, url);
          // Small delay between sends to avoid Interakt rate limiting
          if (i < files.length - 1) await new Promise(r => setTimeout(r, 300));
        }
        setUploadProgress(100);
        setUploading(false);
        clearAttachment();
      } else {
        await conversationsApi.sendMessage(selectedConv.id, replyText.trim());
      }
      setReplyText('');
      shouldScrollRef.current = true;
      await loadMessages(selectedConv.id);
    } catch {
      showToast('Failed to send message', 'error');
      setUploading(false);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendReply();
    }
  };

  const handleEscalate = async () => {
    if (!selectedConv) return;
    try {
      await conversationsApi.updateStatus(selectedConv.id, 'Escalated');
      showToast('Conversation escalated', 'success');
      loadConversations();
      setSelectedConv({ ...selectedConv, status: 'Escalated' });
    } catch {
      showToast('Failed to escalate', 'error');
    }
  };

  const handleMarkResolved = async () => {
    if (!selectedConv) return;
    try {
      await conversationsApi.close(selectedConv.id);
      showToast('Conversation resolved', 'success');
      loadConversations();
      setSelectedConv({ ...selectedConv, status: 'Closed' });
    } catch {
      showToast('Failed to resolve', 'error');
    }
  };

  const handleAssign = async (userId: number, userName: string) => {
    if (!selectedConv) return;
    try {
      await conversationsApi.assign(selectedConv.id, userId);
      setSelectedConv({ ...selectedConv, assignedUserId: userId, assignedUserName: userName });
      setShowAssignDropdown(false);
      showToast(`Assigned to ${userName}`, 'success');
      loadConversations();
    } catch {
      showToast('Failed to reassign', 'error');
    }
  };

  const handleGenerateSummary = async () => {
    if (!selectedConv) return;
    setSummaryLoading(true);
    setShowSummaryPanel(true);
    try {
      const response = await conversationsApi.generateSummary(selectedConv.id);
      setSummary(response.data);
      showToast('Summary generated', 'success');
    } catch {
      showToast('Failed to generate summary — check OpenAI config', 'error');
      setShowSummaryPanel(false);
    } finally {
      setSummaryLoading(false);
    }
  };

  // Debounced search
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (!value.trim()) {
      setSearchResults(null);
      return;
    }
    searchDebounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        if (activeSessionId) {
          // Session selected → search only within that session
          const response = await conversationsApi.getAll(undefined, currentUserId, activeSessionId, 100, 0);
          const q = value.trim().toLowerCase();
          const filtered = (response.data as any[]).filter(c =>
            c.customerPhone?.includes(q) ||
            c.customerName?.toLowerCase().includes(q)
          );
          setSearchResults(filtered);
        } else {
          // All Sessions → global search across everything
          const response = await conversationsApi.search(value.trim(), 50, currentUserId);
          setSearchResults(response.data);
        }
      } catch {
        // silently ignore
      } finally {
        setSearching(false);
      }
    }, 300);
  };

  const clearSearch = () => {
    setSearchQuery('');
    setSearchResults(null);
  };

  const getInitials = (name: string | undefined, phone: string) => {
    if (name) return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    return phone.slice(-2);
  };

  const getAvatarColor = (id: number) => {
    const colors = ['bg-blue-100 text-blue-700', 'bg-green-100 text-green-700', 'bg-orange-100 text-orange-700', 'bg-purple-100 text-purple-700', 'bg-pink-100 text-pink-700', 'bg-indigo-100 text-indigo-700'];
    return colors[id % colors.length];
  };

  const getFilteredConversations = () => {
    if (searchResults !== null) return searchResults;
    switch (activeFilter) {
      case 'escalated': return conversations.filter(c => c.status === 'Escalated');
      case 'done': return conversations.filter(c => c.status === 'Closed');
      case 'ai': return conversations.filter(c => c.hasAiMessages);
      default: return conversations;
    }
  };

  const getSentimentIcon = (score: number | null) => {
    if (score === null) return <Meh className="h-4 w-4 text-gray-400" />;
    if (score >= 0.3) return <Smile className="h-4 w-4 text-green-500" />;
    if (score <= -0.3) return <Frown className="h-4 w-4 text-red-500" />;
    return <Meh className="h-4 w-4 text-yellow-500" />;
  };

  const filteredConversations = getFilteredConversations();
  const highPriorityConvs = searchResults ? [] : filteredConversations.filter(c => c.status === 'Escalated');
  const activeConvs = searchResults ? filteredConversations : filteredConversations.filter(c => c.status === 'Open' && c.status !== 'Escalated');
  const closedConvs = searchResults ? [] : filteredConversations.filter(c => c.status === 'Closed');
  const isClosed = selectedConv?.status === 'Closed';

  return (
    <div className="flex flex-col h-screen bg-white overflow-hidden">
      {/* Top Navigation Bar — hidden on mobile when in chat view */}
      <div className={`bg-white border-b border-gray-100 px-3 sm:px-6 py-2 sm:py-3 flex items-center justify-between shadow-sm ${mobileView === 'chat' ? 'hidden sm:flex' : 'flex'}`}>
        <div className="flex items-center gap-1.5">
          {([
            { key: 'all',       label: 'All',       icon: null },
            { key: 'escalated', label: 'Escalated', icon: AlertTriangle },
            { key: 'done',      label: 'Done',       icon: CheckCircle2 },
            { key: 'ai',        label: 'AI Turn',    icon: null },
          ] as { key: FilterTab; label: string; icon: any }[]).map(({ key, label, icon: Icon }) => (
            <button key={key}
              onClick={() => { setActiveFilter(key); clearSearch(); }}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-medium rounded-lg
                transition-all duration-150 active:scale-95 ${
                activeFilter === key
                  ? key === 'escalated' ? 'bg-orange-600 text-white shadow-sm'
                  : key === 'done'      ? 'bg-green-600 text-white shadow-sm'
                  : 'bg-indigo-700 text-white shadow-sm'
                  : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'
              }`}>
              {Icon && <Icon className="h-3.5 w-3.5" />}
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-4 text-sm text-gray-400">
          <span className="flex items-center gap-1.5" title={isConnected ? 'Real-time connected' : 'Connecting…'}>
            {isConnected
              ? <Wifi className="h-3.5 w-3.5 text-green-500" />
              : <WifiOff className="h-3.5 w-3.5 text-gray-300" />}
          </span>
          {isCRR && (
            <span className="flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 border border-indigo-100 rounded-lg text-xs font-medium text-indigo-700">
              <UserCheck className="h-3.5 w-3.5" />
              My Conversations
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <MessageSquare className="h-3.5 w-3.5" />
            <span className="font-medium text-gray-700">{conversations.length}</span> Total
          </span>
          <span className="flex items-center gap-1.5">
            <AlertCircle className="h-3.5 w-3.5 text-orange-500" />
            <span className="font-medium text-orange-600">{conversations.filter(c => c.status === 'Escalated').length}</span> Escalated
          </span>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* Left Side - Sessions List (hidden for CRR) */}
        <div className={`${isCRR ? 'hidden' : 'hidden xl:flex xl:flex-col'} w-60 border-r border-gray-200 bg-white overflow-y-auto flex-shrink-0`}>
          <div className="h-[57px] flex-shrink-0 flex items-center gap-2 px-3 border-b border-gray-200 bg-white">
            <Phone className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Search sessions…"
                value={sessionSearch}
                onChange={e => setSessionSearch(e.target.value)}
                className="w-full pl-6 pr-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-300 bg-gray-50"
              />
            </div>
          </div>
          <div className="py-1">
            {/* All Sessions row */}
            <div onClick={() => { setActiveSessionId(undefined); setSelectedConv(null); setMessages([]); loadConversations(undefined); }}
              className={`px-3 py-2.5 mx-1.5 my-0.5 rounded-xl cursor-pointer transition-all duration-150 flex items-center justify-between ${
                activeSessionId === undefined ? 'bg-indigo-50 border border-indigo-200' : 'hover:bg-gray-50 border border-transparent'
              }`}>
              <span className={`text-xs font-semibold ${activeSessionId === undefined ? 'text-indigo-700' : 'text-gray-500'}`}>
                All Sessions
              </span>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${activeSessionId === undefined ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-600'}`}>
                {conversations.length}
              </span>
            </div>
            {sessions.filter(s =>
              !sessionSearch ||
              s.phoneNumber?.includes(sessionSearch) ||
              s.assignedUserName?.toLowerCase().includes(sessionSearch.toLowerCase())
            ).map((session) => (
              <div key={session.id} onClick={() => handleSessionFilter(session.id)}
                className={`px-3 py-3 mx-1.5 my-0.5 rounded-xl cursor-pointer transition-all duration-150 group ${
                  activeSessionId === session.id
                    ? 'bg-indigo-50 border border-indigo-200 shadow-sm'
                    : 'hover:bg-gray-50 border border-transparent'
                }`}>
                <div className="flex items-center gap-2.5">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${
                    activeSessionId === session.id ? 'bg-indigo-100' : session.isConnected ? 'bg-green-100' : 'bg-gray-100'
                  }`}>
                    <Phone className={`h-4 w-4 ${
                      activeSessionId === session.id ? 'text-indigo-600' : session.isConnected ? 'text-green-600' : 'text-gray-400'
                    }`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <p className={`text-xs font-semibold truncate ${activeSessionId === session.id ? 'text-indigo-700' : 'text-gray-900'}`}>
                        {session.phoneNumber}
                      </p>
                      {session.isConnected && <div className="w-1.5 h-1.5 bg-green-400 rounded-full pulse-dot flex-shrink-0" />}
                    </div>
                    <div className="flex items-center justify-between">
                      <p className={`text-xs truncate ${activeSessionId === session.id ? 'text-indigo-500' : 'text-gray-400'}`}>
                        {session.assignedUserName || 'Unassigned'}
                      </p>
                      {(() => {
                        const count = conversations.filter(c => c.sessionId === session.id).length;
                        return count > 0 ? (
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                            activeSessionId === session.id ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-600'
                          }`}>{count}</span>
                        ) : null;
                      })()}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Conversation List — hidden on mobile when chat is open */}
        <div className={`${mobileView === 'chat' ? 'hidden sm:flex' : 'flex'} w-full sm:w-72 lg:w-80 border-r border-gray-200 bg-white flex-shrink-0 flex-col overflow-hidden`}>
          {/* Search Bar — same h-[57px] as sessions header so border-b lines align */}
          <div className="h-[57px] flex-shrink-0 flex items-center px-3 border-b border-gray-200 bg-white">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => handleSearchChange(e.target.value)}
                placeholder={activeSessionId ? 'Search in this session…' : 'Search all sessions…'}
                className="w-full pl-9 pr-8 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-gray-50"
              />
              {searchQuery && (
                <button onClick={clearSearch} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
          {(searching || searchQuery) && (
            <div className="px-4 py-1 bg-gray-50 border-b border-gray-100">
              {searching
                ? <p className="text-xs text-gray-400">{activeSessionId ? 'Searching this session…' : 'Searching all sessions…'}</p>
                : <p className="text-xs text-indigo-500">{activeSessionId ? 'Showing results for this session' : 'Showing results across all sessions'}</p>
              }
            </div>
          )}

          {loading ? (
            <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3.5">
                  <div className="skeleton h-10 w-10 rounded-full flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="skeleton h-3 w-28 rounded" />
                    <div className="skeleton h-3 w-40 rounded" />
                  </div>
                  <div className="skeleton h-3 w-10 rounded" />
                </div>
              ))}
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto min-h-0">
              {/* Search results mode */}
              {searchResults !== null ? (
                <div>
                  <div className="px-4 py-2 bg-indigo-50 border-b border-indigo-100">
                    <h3 className="text-xs font-semibold text-indigo-900 uppercase">
                      Results ({searchResults.length})
                    </h3>
                  </div>
                  {searchResults.length === 0 ? (
                    <div className="text-center py-8 text-gray-500 text-sm">No results found</div>
                  ) : (
                    searchResults.map(conv => (
                      <ConversationItem
                        key={conv.id}
                        conv={conv}
                        selectedConv={selectedConv}
                        onSelect={handleSelectConversation}
                        getInitials={getInitials}
                        getAvatarColor={getAvatarColor}
                      />
                    ))
                  )}
                </div>
              ) : (
                <>
                  {highPriorityConvs.length > 0 && (
                    <div>
                      <div className="px-4 py-2 bg-orange-50 border-b border-orange-100 sticky top-0 z-20">
                        <h3 className="text-xs font-semibold text-orange-700 uppercase tracking-wide flex items-center gap-1.5">
                          <AlertTriangle className="h-3 w-3" />
                          Escalated ({highPriorityConvs.length})
                        </h3>
                      </div>
                      {highPriorityConvs.map(conv => (
                        <ConversationItem key={conv.id} conv={conv} selectedConv={selectedConv}
                          onSelect={handleSelectConversation} getInitials={getInitials}
                          getAvatarColor={getAvatarColor} isHighPriority showSession={!activeSessionId} />
                      ))}
                    </div>
                  )}
                  {activeConvs.length > 0 && (
                    <div>
                      <div className="px-4 py-2 bg-indigo-50 border-b border-indigo-100 sticky top-0 z-20">
                        <h3 className="text-xs font-semibold text-indigo-700 uppercase tracking-wide">Active ({activeConvs.length})</h3>
                      </div>
                      {activeConvs.map(conv => (
                        <ConversationItem key={conv.id} conv={conv} selectedConv={selectedConv}
                          onSelect={handleSelectConversation} getInitials={getInitials}
                          getAvatarColor={getAvatarColor} showSession={!activeSessionId} />
                      ))}
                    </div>
                  )}
                  {closedConvs.length > 0 && activeFilter === 'all' && (
                    <div>
                      <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 sticky top-0 z-20">
                        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Closed ({closedConvs.length})</h3>
                      </div>
                      {closedConvs.map(conv => (
                        <ConversationItem key={conv.id} conv={conv} selectedConv={selectedConv}
                          onSelect={handleSelectConversation} getInitials={getInitials}
                          getAvatarColor={getAvatarColor} showSession={!activeSessionId} />
                      ))}
                    </div>
                  )}
                  {filteredConversations.length === 0 && (
                    <div className="text-center py-12 text-gray-400 px-4">
                      <MessageSquare className="h-8 w-8 mx-auto mb-3 opacity-30" />
                      {activeSessionId
                        ? <><p className="text-sm font-medium text-gray-500">No conversations on this number</p><p className="text-xs mt-1">All incoming messages go to the first active session.<br/>Click the session again to see all conversations.</p></>
                        : <p className="text-sm">No conversations yet</p>
                      }
                    </div>
                  )}
                  {hasMore && !searchResults && (
                    <div className="p-3 border-t border-gray-100">
                      <button
                        onClick={loadMoreConversations}
                        disabled={loadingMore}
                        className="w-full text-xs text-indigo-600 hover:text-indigo-800 py-2 rounded-lg hover:bg-indigo-50 transition disabled:opacity-50"
                      >
                        {loadingMore ? 'Loading…' : `Load more (showing ${conversations.length})`}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Chat View — always visible on sm+, visible on mobile only when mobileView=chat */}
        <div className={`${mobileView === 'chat' ? 'flex' : 'hidden sm:flex'} flex-1 flex-col bg-white min-w-0 overflow-hidden`}>
          {selectedConv ? (
            <>
              {/* Chat Header — min-h-[57px] matches sessions/conv-list headers for aligned border-b */}
              <div className="bg-white border-b border-gray-200 px-4 py-0 min-h-[57px] flex items-center">
                <div className="flex items-center gap-2 sm:gap-3 w-full">
                  {/* Back button — mobile only */}
                  <button
                    onClick={() => { setMobileView('list'); leaveConversation(selectedConv.id); }}
                    className="sm:hidden flex items-center justify-center h-9 w-9 rounded-xl hover:bg-gray-100 text-gray-500 flex-shrink-0 active:scale-95"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>

                  <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full ${getAvatarColor(selectedConv.id)} flex items-center justify-center font-medium flex-shrink-0 text-sm sm:text-base`}>
                    {getInitials(selectedConv.customerName, selectedConv.customerPhone)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 sm:mb-1">
                      <h3 className="font-semibold text-sm sm:text-base text-gray-900 truncate">
                        {selectedConv.customerName || selectedConv.customerPhone || 'Unknown Customer'}
                      </h3>
                      {selectedConv.status === 'Escalated' && (
                        <Badge className="text-xs bg-orange-500 flex-shrink-0">
                          <AlertTriangle className="h-3 w-3 mr-1" />Escalated
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
                      <span>{selectedConv.customerPhone}</span>
                      <span className="flex items-center gap-1">
                        <div className={`w-2 h-2 rounded-full ${selectedConv.status === 'Open' ? 'bg-green-500' : 'bg-gray-400'}`}></div>
                        {selectedConv.status === 'Open' ? 'Active' : selectedConv.status}
                      </span>
                      {convTags.map((t: any) => (
                        <span key={t.id} className="flex items-center gap-1 px-2 py-0.5 rounded-full text-white text-[11px] font-medium"
                          style={{ backgroundColor: t.color }}>
                          {t.name}
                        </span>
                      ))}
                      {customerTags.map((t: any) => (
                        <span key={`c-${t.id}`} className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border"
                          style={{ color: t.color, borderColor: t.color + '66', backgroundColor: t.color + '18' }}
                          title="Customer tag">
                          {t.name}
                        </span>
                      ))}

                      {/* Assign dropdown */}
                      <div className="relative" ref={assignDropdownRef}>
                        <button
                          onClick={() => setShowAssignDropdown(!showAssignDropdown)}
                          className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 border border-indigo-200 rounded px-2 py-0.5 bg-indigo-50"
                        >
                          <UserCheck className="h-3 w-3" />
                          {selectedConv.assignedUserName || 'Assign'}
                          <ChevronDown className="h-3 w-3" />
                        </button>
                        {showAssignDropdown && (
                          <div className="absolute top-full left-0 mt-1 w-52 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
                            <div className="py-1 max-h-56 overflow-y-auto">
                              {selectedConv.assignedUserId > 0 && (
                                <button
                                  onClick={() => handleAssign(0, '')}
                                  className="w-full text-left px-3 py-2 text-sm hover:bg-red-50 flex items-center gap-2 border-b border-gray-100 text-red-500"
                                >
                                  <X className="h-4 w-4" />
                                  <span className="text-xs font-medium">Unassign</span>
                                </button>
                              )}
                              {users.map(user => {
                                const isCurrent = user.id === selectedConv.assignedUserId;
                                return (
                                  <button
                                    key={user.id}
                                    onClick={() => handleAssign(user.id, user.fullName)}
                                    className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 ${isCurrent ? 'bg-indigo-50' : 'hover:bg-gray-50'}`}
                                  >
                                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs flex-shrink-0 ${isCurrent ? 'bg-indigo-200 text-indigo-800' : 'bg-slate-100 text-slate-700'}`}>
                                      {user.fullName?.[0] ?? '?'}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className={`font-medium text-xs truncate ${isCurrent ? 'text-indigo-700' : 'text-gray-900'}`}>{user.fullName}</p>
                                      <p className="text-gray-400 text-xs">{user.role}</p>
                                    </div>
                                    {isCurrent && <CheckCircle2 className="h-3.5 w-3.5 text-indigo-500 flex-shrink-0" />}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Quick Actions — ml-auto pushes to far right */}
                  <div className="flex gap-1.5 sm:gap-2 flex-shrink-0 ml-auto">
                    {/* Click-to-Call — opens phone dialer on mobile */}
                    <a
                      href={`tel:${selectedConv.customerPhone}`}
                      className="flex items-center justify-center h-8 w-8 sm:h-9 sm:w-9 rounded-lg border border-green-200 bg-green-50 text-green-600 hover:bg-green-100 transition-colors"
                      title={`Call ${selectedConv.customerPhone}`}
                    >
                      <Phone className="h-4 w-4" />
                    </a>
                    {/* Tag menu */}
                    <div className="relative" ref={tagMenuRef}>
                      <Button size="sm" variant="outline"
                        onClick={() => setShowTagMenu(v => !v)}
                        className="text-indigo-600 border-indigo-200 hover:bg-indigo-50" title="Tags">
                        <Tag className="h-4 w-4" />
                      </Button>
                      {showTagMenu && (
                        <div className="absolute top-full right-0 mt-1 w-52 bg-white border border-gray-200 rounded-xl shadow-lg z-50">
                          {/* Tabs */}
                          <div className="flex border-b border-gray-100 text-xs font-semibold">
                            <button
                              onClick={() => setTagTab('conv')}
                              className={`flex-1 px-3 py-2 rounded-tl-xl transition-colors ${tagTab === 'conv' ? 'bg-indigo-50 text-indigo-700' : 'text-gray-500 hover:bg-gray-50'}`}
                            >
                              Conversation
                            </button>
                            <button
                              onClick={() => setTagTab('customer')}
                              className={`flex-1 px-3 py-2 rounded-tr-xl transition-colors ${tagTab === 'customer' ? 'bg-indigo-50 text-indigo-700' : 'text-gray-500 hover:bg-gray-50'}`}
                            >
                              Customer
                            </button>
                          </div>
                          {/* Tag list */}
                          <div className="py-1 max-h-48 overflow-y-auto">
                            {(tagTab === 'conv' ? allConvTags : allCustomerTags).length === 0 ? (
                              <p className="text-xs text-gray-400 px-3 py-2">No tags configured</p>
                            ) : (tagTab === 'conv' ? allConvTags : allCustomerTags).map((tag: any) => {
                              const active = tagTab === 'conv'
                                ? convTags.some((t: any) => t.id === tag.id)
                                : customerTags.some((t: any) => t.id === tag.id);
                              return (
                                <button key={tag.id}
                                  onClick={async () => {
                                    if (tagTab === 'conv') {
                                      handleToggleTag(tag);
                                    } else if (customerId) {
                                      try {
                                        if (active) {
                                          await customersApi.removeTag(customerId, tag.id);
                                          setCustomerTags(prev => prev.filter((t: any) => t.id !== tag.id));
                                        } else {
                                          await customersApi.addTag(customerId, tag.id);
                                          setCustomerTags(prev => [...prev, tag]);
                                        }
                                      } catch { showToast('Failed to update customer tag', 'error'); }
                                    }
                                  }}
                                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 flex items-center gap-2">
                                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }} />
                                  <span className={active ? 'font-semibold text-gray-900' : 'text-gray-600'}>{tag.name}</span>
                                  {active && <CheckCircle2 className="h-3.5 w-3.5 text-green-500 ml-auto" />}
                                </button>
                              );
                            })}
                          </div>
                          {/* Customer tag hint */}
                          {tagTab === 'customer' && !customerId && (
                            <p className="text-[10px] text-gray-400 px-3 py-1.5 border-t border-gray-50">Customer record not found</p>
                          )}
                        </div>
                      )}
                    </div>
                    <Button size="sm" variant="outline" onClick={handleExport}
                      className="text-gray-600 border-gray-200 hover:bg-gray-50" title="Export conversation">
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => { setShowSummaryPanel(!showSummaryPanel); }}
                      className="text-purple-600 border-purple-200 hover:bg-purple-50"
                      title="AI Summary"
                    >
                      <BrainCircuit className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="outline" onClick={handleMarkResolved}
                      disabled={isClosed} className="text-green-600 border-green-200 hover:bg-green-50">
                      <CheckCircle2 className="h-4 w-4 mr-1" />Resolve
                    </Button>
                    <Button size="sm" variant="outline" onClick={handleEscalate}
                      disabled={selectedConv.status === 'Escalated' || isClosed}
                      className="text-orange-600 border-orange-200 hover:bg-orange-50">
                      <AlertTriangle className="h-4 w-4 mr-1" />Escalate
                    </Button>
                  </div>
                </div>
              </div>

              <div className="flex flex-1 overflow-hidden">
                {/* Messages area */}
                <div className="flex flex-col flex-1 min-w-0">
                  <div
                    ref={messagesContainerRef}
                    className="flex-1 overflow-y-auto p-6 space-y-4 bg-gray-50 relative"
                    onScroll={(e) => {
                      const el = e.currentTarget;
                      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
                      isAtBottomRef.current = atBottom;
                      if (atBottom && hasNewMessage) setHasNewMessage(false);
                    }}
                  >
                    {hasNewMessage && (
                      <button
                        onClick={() => {
                          shouldScrollRef.current = true;
                          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
                          setHasNewMessage(false);
                        }}
                        className="sticky top-2 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-full shadow-lg hover:bg-indigo-700 transition-all"
                      >
                        <ArrowDown className="h-3 w-3" />
                        New message
                      </button>
                    )}
                    {messages.length === 0 ? (
                      <div className="text-center py-12 text-gray-500">No messages in this conversation</div>
                    ) : (
                      messages.map((msg) => {
                        const isInbound = msg.direction === 'inbound';
                        return (
                          <div key={msg.id} className={`group flex items-end gap-1.5 ${isInbound ? 'justify-start' : 'justify-end'}`}>
                            {isInbound && (
                              <div className={`w-8 h-8 rounded-full ${getAvatarColor(selectedConv.id)} flex items-center justify-center text-xs font-medium flex-shrink-0`}>
                                {getInitials(selectedConv.customerName, selectedConv.customerPhone)}
                              </div>
                            )}
                            <div className={`max-w-[70%] ${isInbound ? '' : 'items-end'} flex flex-col gap-1`}>

                              <div className={`flex items-center gap-2 ${isInbound ? '' : 'justify-end'}`}>
                                <span className="text-xs text-gray-400">{getRelativeTime(msg.createdAt)}</span>
                                {msg.isAiGenerated && (
                                  <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">AI</Badge>
                                )}
                              </div>
                              <div className={`rounded-2xl overflow-hidden ${isInbound ? 'bg-white border border-gray-200 rounded-tl-none text-gray-800' : 'bg-blue-600 text-white rounded-br-none'}`}>
                                {msg.mediaUrl && (() => {
                                  // Local files are on the backend server — prepend backend base URL
                                  const BACKEND = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api').replace(/\/api$/, '');
                                  const src = msg.mediaUrl.startsWith('/') ? `${BACKEND}${msg.mediaUrl}` : msg.mediaUrl;
                                  return (
                                    <>
                                      {msg.messageType === 'image' && (
                                        <a href={src} target="_blank" rel="noreferrer">
                                          {/* eslint-disable-next-line @next/next/no-img-element */}
                                          <img src={src} alt="image" className="max-w-[260px] max-h-[200px] object-cover w-full"
                                            onError={e => { (e.target as HTMLImageElement).style.display='none'; }} />
                                        </a>
                                      )}
                                      {msg.messageType === 'video' && (
                                        <video controls className="max-w-[280px] max-h-[220px] w-full rounded-xl">
                                          <source src={src} type="video/mp4" />
                                          <source src={src} type="video/quicktime" />
                                          <source src={src} type="video/3gpp" />
                                          <a href={src} target="_blank" rel="noreferrer" className="px-4 py-2 text-sm underline">Open video</a>
                                        </video>
                                      )}
                                      {(msg.messageType === 'audio' || msg.messageType === 'voice') && (
                                        <AudioPlayer src={src} isInbound={isInbound} />
                                      )}
                                      {msg.messageType === 'document' && (
                                        <a href={src} target="_blank" rel="noreferrer"
                                          className={`flex items-center gap-2 px-4 py-3 hover:opacity-80 ${isInbound ? 'text-indigo-700' : 'text-white'}`}>
                                          <FileText className="h-5 w-5 flex-shrink-0" />
                                          <span className="text-sm font-medium truncate">{src.split('/').pop()}</span>
                                          <Download className="h-4 w-4 flex-shrink-0 ml-auto" />
                                        </a>
                                      )}
                                    </>
                                  );
                                })()}
                                {msg.content && (
                                  <p className="text-sm leading-relaxed px-4 py-2.5">{msg.content}</p>
                                )}
                              </div>
                            </div>
                            {!isInbound && (
                              <div className="w-8 h-8 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center text-xs font-medium flex-shrink-0">
                                {msg.isAiGenerated ? 'AI' : 'ME'}
                              </div>
                            )}
                            {/* Forward button — inside group div, appears on hover */}
                            <button
                              onClick={() => { setForwardMsg(msg); setForwardTargets(new Set()); setForwardSearch(''); }}
                              className={`self-center opacity-0 group-hover:opacity-100 flex-shrink-0 h-7 w-7 rounded-full bg-white border border-gray-200 shadow-sm flex items-center justify-center text-gray-400 hover:text-indigo-600 hover:border-indigo-200 transition-all ${isInbound ? '' : 'order-first'}`}
                              title="Forward"
                            >
                              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M13 9l3 3m0 0l-3 3m3-3H8m13 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            </button>
                          </div>
                        );
                      })
                    )}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* Reply Input — sticky bottom on mobile */}
                  <div className="bg-white border-t border-gray-200 p-3 sticky bottom-0 sm:relative">
                    {isClosed ? (
                      <p className="text-sm text-center text-gray-400 py-1">This conversation is closed</p>
                    ) : (
                      <div className="space-y-2">

                        {/* Attachment preview — supports multiple files */}
                        {attachmentFiles.length > 0 && (
                          <div className="bg-gray-50 rounded-xl border border-gray-200 p-3">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-semibold text-gray-600">
                                {attachmentFiles.length > 1
                                  ? `${attachmentFiles.length} ${attachmentType}s selected`
                                  : attachmentFile?.name}
                              </span>
                              <button onClick={clearAttachment} className="p-0.5 rounded-full hover:bg-gray-200 text-gray-400 hover:text-gray-600">
                                <XCircle className="h-4 w-4" />
                              </button>
                            </div>
                            {/* Image grid preview */}
                            {attachmentType === 'image' && attachmentPreviews.length > 0 ? (
                              <div className={`grid gap-1 ${attachmentFiles.length === 1 ? 'grid-cols-1' : attachmentFiles.length <= 4 ? 'grid-cols-4' : 'grid-cols-5'}`}>
                                {attachmentPreviews.map((src, i) => (
                                  <div key={i} className="relative group">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={src} alt={`preview ${i+1}`}
                                      className="w-full h-16 object-cover rounded-lg border border-gray-200" />
                                    <button
                                      onClick={() => {
                                        const newFiles = attachmentFiles.filter((_, idx) => idx !== i);
                                        const newPreviews = attachmentPreviews.filter((_, idx) => idx !== i);
                                        if (newFiles.length === 0) { clearAttachment(); }
                                        else { setAttachmentFiles(newFiles); setAttachmentPreviews(newPreviews); }
                                      }}
                                      className="absolute top-0.5 right-0.5 h-4 w-4 bg-red-500 text-white rounded-full items-center justify-center text-[10px] hidden group-hover:flex"
                                    >×</button>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              /* Non-image single file preview */
                              <div className="flex items-center gap-2">
                                {attachmentType === 'video' ? <Video className="h-5 w-5 text-blue-500" /> :
                                 attachmentType === 'audio' ? <Music className="h-5 w-5 text-purple-500" /> :
                                 <FileText className="h-5 w-5 text-orange-500" />}
                                <span className="text-xs text-gray-500 truncate">
                                  {attachmentFile?.name} · {((attachmentFile?.size ?? 0) / 1024).toFixed(0)} KB
                                </span>
                              </div>
                            )}
                            {/* Upload progress bar */}
                            {uploading && (
                              <div className="mt-2">
                                <div className="flex items-center justify-between text-[10px] text-gray-500 mb-1">
                                  <span>Uploading {attachmentFiles.length > 1 ? `${attachmentFiles.length} files` : ''}…</span>
                                  <span>{uploadProgress}%</span>
                                </div>
                                <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                  <div className="h-full bg-indigo-500 rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Toolbar row */}
                        <div className="flex items-center gap-1.5">
                          {/* Quick replies */}
                          <div className="relative" ref={quickReplyRef}>
                            <button
                              onClick={() => setShowQuickReplies(v => !v)}
                              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg border border-indigo-200 active:scale-95 transition-all"
                              title="Quick replies"
                            >
                              <Zap className="h-3.5 w-3.5" />
                              Quick Replies
                            </button>
                            {showQuickReplies && quickReplies.length > 0 && (() => {
                              const grouped: Record<string, any[]> = {};
                              quickReplies.forEach((qr: any) => {
                                const cat = qr.category ?? 'General';
                                if (!grouped[cat]) grouped[cat] = [];
                                grouped[cat].push(qr);
                              });
                              return (
                                <div className="absolute bottom-full mb-2 left-0 w-80 bg-white rounded-xl border border-gray-200 shadow-xl z-30 max-h-72 overflow-y-auto">
                                  {Object.entries(grouped).map(([cat, items]) => (
                                    <div key={cat}>
                                      <p className="px-3 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest bg-gray-50 border-b border-gray-100 sticky top-0">{cat}</p>
                                      {items.map((qr: any) => (
                                        <button key={qr.id}
                                          onClick={() => { setReplyText(qr.content); setShowQuickReplies(false); }}
                                          className="w-full text-left px-3 py-2.5 hover:bg-indigo-50 transition-colors border-b border-gray-50 last:border-0">
                                          <p className="text-xs font-semibold text-gray-800">{qr.title}</p>
                                          <p className="text-xs text-gray-400 truncate mt-0.5">{qr.content}</p>
                                        </button>
                                      ))}
                                    </div>
                                  ))}
                                </div>
                              );
                            })()}
                            {showQuickReplies && quickReplies.length === 0 && (
                              <div className="absolute bottom-full mb-2 left-0 w-64 bg-white rounded-xl border border-gray-200 shadow-lg z-30 p-4 text-center">
                                <p className="text-xs text-gray-400">No quick replies configured yet.</p>
                              </div>
                            )}
                          </div>

                          {/* Attachment picker */}
                          <div className="relative" ref={attachMenuRef}>
                            <button
                              onClick={() => setShowAttachMenu(v => !v)}
                              className={`p-1.5 rounded-lg border transition-all ${showAttachMenu || attachmentFile ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700'}`}
                              title="Attach file"
                            >
                              <Paperclip className="h-4 w-4" />
                            </button>
                            {showAttachMenu && (
                              <div className="absolute bottom-full mb-2 left-0 w-44 bg-white rounded-xl border border-gray-200 shadow-xl z-30 py-1 overflow-hidden">
                                {[
                                  { label: 'Image',    icon: Image,    accept: 'image/*',  type: 'image'    },
                                  { label: 'Video',    icon: Video,    accept: 'video/*',  type: 'video'    },
                                  { label: 'Audio',    icon: Music,    accept: 'audio/*',  type: 'audio'    },
                                  { label: 'Document', icon: FileText, accept: '.pdf,.doc,.docx,.xls,.xlsx', type: 'document' },
                                ].map(({ label, icon: Icon, accept, type }) => {
                                  const limitLabel = type === 'image' ? '5 MB' : type === 'document' ? '100 MB' : '16 MB';
                                  return (
                                  <button key={type}
                                    onClick={() => {
                                      if (fileInputRef.current) {
                                        fileInputRef.current.accept = accept;
                                        fileInputRef.current.dataset.filetype = type;
                                        fileInputRef.current.click();
                                      }
                                    }}
                                    className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                                    <Icon className="h-4 w-4 text-gray-500" />
                                    <span className="flex-1 text-left">{label}</span>
                                    <span className="text-[10px] text-gray-400">max {limitLabel}</span>
                                  </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>

                          {/* Hidden file input — multiple allowed for images */}
                          <input
                            ref={fileInputRef}
                            type="file"
                            className="hidden"
                            multiple
                            onChange={e => handleFileSelect(e, fileInputRef.current?.dataset.filetype ?? 'document')}
                          />
                        </div>

                        {/* Text + send row */}
                        <div className="flex items-end gap-2">
                          <textarea
                            value={replyText}
                            onChange={e => setReplyText(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder={attachmentFile ? 'Add a caption… (optional)' : 'Type a message… (Enter to send, Shift+Enter for new line)'}
                            rows={2}
                            className="flex-1 resize-none rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                          />
                          <Button
                            onClick={handleSendReply}
                            disabled={(!replyText.trim() && attachmentFiles.length === 0) || sending || uploading}
                            className="bg-indigo-700 hover:bg-indigo-800 text-white rounded-xl h-10 w-10 p-0 flex items-center justify-center flex-shrink-0"
                          >
                            {uploading
                              ? <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              : <Send className="h-4 w-4" />
                            }
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Summary Panel */}
                {showSummaryPanel && (
                  <div className="w-72 border-l border-gray-200 bg-gray-50 flex flex-col flex-shrink-0">
                    <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-white">
                      <div className="flex items-center gap-2">
                        <BrainCircuit className="h-5 w-5 text-purple-600" />
                        <h3 className="text-sm font-semibold text-gray-900">AI Summary</h3>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={handleGenerateSummary}
                          disabled={summaryLoading}
                          className="p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-700"
                          title="Regenerate summary"
                        >
                          <RefreshCw className={`h-4 w-4 ${summaryLoading ? 'animate-spin' : ''}`} />
                        </button>
                        <button
                          onClick={() => setShowSummaryPanel(false)}
                          className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                      {summaryLoading ? (
                        <div className="flex items-center justify-center py-12">
                          <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
                        </div>
                      ) : summary ? (
                        <>
                          {/* Sentiment */}
                          <div className="bg-white rounded-lg border border-gray-200 p-3">
                            <p className="text-xs font-medium text-gray-500 uppercase mb-2">Sentiment</p>
                            <div className="flex items-center gap-2">
                              {getSentimentIcon(summary.sentimentScore)}
                              <span className="text-sm font-medium text-gray-700">
                                {summary.sentimentScore !== null
                                  ? summary.sentimentScore >= 0.3 ? 'Positive'
                                  : summary.sentimentScore <= -0.3 ? 'Negative'
                                  : 'Neutral'
                                  : '—'}
                              </span>
                              {summary.sentimentScore !== null && (
                                <span className="text-xs text-gray-400 ml-auto">
                                  {Number(summary.sentimentScore).toFixed(2)}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Key Topics */}
                          {summary.keyTopics && (
                            <div className="bg-white rounded-lg border border-gray-200 p-3">
                              <p className="text-xs font-medium text-gray-500 uppercase mb-2">Key Topics</p>
                              <div className="flex flex-wrap gap-1.5">
                                {summary.keyTopics.split(',').map((t: string, i: number) => (
                                  <span key={i} className="text-xs bg-purple-100 text-purple-700 rounded-full px-2.5 py-0.5">
                                    {t.trim()}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Summary Text */}
                          <div className="bg-white rounded-lg border border-gray-200 p-3">
                            <p className="text-xs font-medium text-gray-500 uppercase mb-2">Summary</p>
                            <p className="text-sm text-gray-700 leading-relaxed">{summary.summaryText}</p>
                          </div>

                          <p className="text-xs text-gray-400 text-center">
                            Updated {getRelativeTime(summary.lastUpdatedAt)}
                          </p>
                        </>
                      ) : (
                        <div className="text-center py-8">
                          <BrainCircuit className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                          <p className="text-sm text-gray-500 mb-4">No summary yet</p>
                          <Button
                            size="sm"
                            onClick={handleGenerateSummary}
                            className="bg-indigo-700 hover:bg-indigo-800 text-white gap-2"
                          >
                            <BrainCircuit className="h-4 w-4" />
                            Generate Summary
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500">
              <div className="text-center">
                <Clock className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                <p>Select a conversation to view messages</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Forward Message Modal ── */}
      {forwardMsg && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setForwardMsg(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-sm font-bold text-gray-900">Forward Message</h2>
                <p className="text-xs text-gray-400 mt-0.5 line-clamp-1 max-w-xs">
                  {forwardMsg.messageType !== 'text' ? `📎 ${forwardMsg.messageType}` : forwardMsg.content?.slice(0, 60)}
                </p>
              </div>
              <button onClick={() => setForwardMsg(null)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-4 pt-3 pb-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input autoFocus type="text" placeholder="Search conversations…"
                  value={forwardSearch} onChange={e => setForwardSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </div>
            </div>
            <div className="max-h-64 overflow-y-auto px-2 pb-2">
              {conversations
                .filter(c => c.id !== selectedConv?.id &&
                  (!forwardSearch || c.customerName?.toLowerCase().includes(forwardSearch.toLowerCase()) || c.customerPhone?.includes(forwardSearch))
                ).map(c => (
                  <label key={c.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer hover:bg-gray-50">
                    <input type="checkbox" checked={forwardTargets.has(c.id)}
                      onChange={() => setForwardTargets(prev => { const n = new Set(prev); n.has(c.id) ? n.delete(c.id) : n.add(c.id); return n; })}
                      className="h-4 w-4 rounded border-gray-300 text-indigo-600" />
                    <div className={`h-8 w-8 rounded-full ${getAvatarColor(c.id)} flex items-center justify-center text-xs font-medium flex-shrink-0`}>
                      {getInitials(c.customerName, c.customerPhone)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{c.customerName || c.customerPhone}</p>
                      <p className="text-xs text-gray-400 truncate">{c.customerPhone}</p>
                    </div>
                  </label>
                ))}
            </div>
            <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100">
              <span className="text-xs text-gray-400">{forwardTargets.size > 0 ? `${forwardTargets.size} selected` : 'Select conversations'}</span>
              <div className="flex gap-2">
                <button onClick={() => setForwardMsg(null)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">Cancel</button>
                <button onClick={handleForward} disabled={forwardTargets.size === 0 || forwarding}
                  className="px-4 py-2 text-sm bg-indigo-700 text-white rounded-lg hover:bg-indigo-800 disabled:opacity-50 font-medium">
                  {forwarding ? 'Forwarding…' : `Forward${forwardTargets.size > 0 ? ` (${forwardTargets.size})` : ''}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const SLA_WARN_MINUTES = 10;
const SLA_BREACH_MINUTES = 30;

// ── Custom Audio Player ──────────────────────────────────────────────────────
function AudioPlayer({ src, isInbound }: { src: string; isInbound: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (playing) { audioRef.current.pause(); }
    else { audioRef.current.play(); }
    setPlaying(!playing);
  };

  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    audioRef.current.currentTime = ratio * duration;
  };

  const bubbleBg  = isInbound ? 'bg-white border border-gray-200' : 'bg-blue-500';
  const iconColor = isInbound ? 'text-indigo-600' : 'text-white';
  const barBg     = isInbound ? 'bg-gray-200' : 'bg-blue-300';
  const barFill   = isInbound ? 'bg-indigo-500' : 'bg-white';
  const timeColor = isInbound ? 'text-gray-400' : 'text-blue-100';

  return (
    <div className={`flex items-center gap-2.5 px-3 py-2.5 rounded-2xl min-w-[200px] max-w-[260px] ${bubbleBg}`}>
      <audio ref={audioRef}
        onTimeUpdate={() => {
          if (!audioRef.current) return;
          setCurrentTime(audioRef.current.currentTime);
          setProgress((audioRef.current.currentTime / (audioRef.current.duration || 1)) * 100);
        }}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration ?? 0)}
        onEnded={() => { setPlaying(false); setProgress(0); setCurrentTime(0); }}
      >
        <source src={src} type="audio/ogg" />
        <source src={src} type="audio/mpeg" />
        <source src={src} />
      </audio>

      {/* Play/pause */}
      <button onClick={togglePlay}
        className={`h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0 transition-all active:scale-95 ${
          isInbound ? 'bg-indigo-50 hover:bg-indigo-100' : 'bg-white/20 hover:bg-white/30'
        }`}>
        {playing
          ? <span className={`text-lg leading-none ${iconColor}`}>⏸</span>
          : <span className={`text-lg leading-none ml-0.5 ${iconColor}`}>▶</span>
        }
      </button>

      {/* Progress + time */}
      <div className="flex-1 min-w-0">
        {/* Progress bar */}
        <div className={`h-1.5 rounded-full cursor-pointer ${barBg}`} onClick={handleSeek}>
          <div className={`h-full rounded-full transition-all ${barFill}`} style={{ width: `${progress}%` }} />
        </div>
        {/* Time */}
        <div className={`flex justify-between text-[10px] mt-1 ${timeColor}`}>
          <span>{fmt(currentTime)}</span>
          <span>{duration ? fmt(duration) : '0:00'}</span>
        </div>
      </div>

      {/* Download */}
      <a href={src} download className={`flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity ${iconColor}`}>
        <Download className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}

function SlaTimer({ lastMessageAt, status }: { lastMessageAt: string | null; status: string }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (status !== 'Open' && status !== 'Escalated') return;
    const t = setInterval(() => setTick(n => n + 1), 60_000);
    return () => clearInterval(t);
  }, [status]);

  if (!lastMessageAt || (status !== 'Open' && status !== 'Escalated')) return null;
  const mins = Math.floor((Date.now() - (parseUTCDate(lastMessageAt)?.getTime() ?? Date.now())) / 60_000);
  if (mins < SLA_WARN_MINUTES) return null;

  const breached = mins >= SLA_BREACH_MINUTES;
  const label = mins >= 60
    ? `${Math.floor(mins / 60)}h ${mins % 60}m`
    : `${mins}m`;

  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
      breached ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'
    }`}>
      <Clock className="h-2.5 w-2.5" />
      {label}
    </span>
  );
}

function ConversationItem({
  conv, selectedConv, onSelect, getInitials, getAvatarColor, isHighPriority = false, showSession = false
}: {
  conv: any;
  selectedConv: any;
  onSelect: (conv: any) => void;
  getInitials: (name: string | undefined, phone: string) => string;
  getAvatarColor: (id: number) => string;
  isHighPriority?: boolean;
  showSession?: boolean;
}) {
  return (
    <div
      onClick={() => onSelect(conv)}
      className={`p-4 cursor-pointer hover:bg-gray-50 transition border-b border-gray-100 ${
        selectedConv?.id === conv.id ? 'bg-indigo-50' : ''
      } ${isHighPriority ? 'bg-orange-50/30' : ''}`}
    >
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-full ${getAvatarColor(conv.id)} flex items-center justify-center font-medium text-sm flex-shrink-0 relative`}>
          {getInitials(conv.customerName, conv.customerPhone)}
          {isHighPriority && (
            <div className="absolute -top-1 -right-1 w-5 h-5 bg-orange-500 rounded-full flex items-center justify-center">
              <AlertCircle className="h-3 w-3 text-white" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-semibold text-sm text-gray-900 truncate">
              {conv.customerName || conv.customerPhone || 'Unknown Customer'}
            </h3>
          </div>
          <p className="text-xs text-gray-500 mb-0.5">{conv.customerPhone}</p>
          {showSession && conv.businessPhone && (
            <p className="text-[10px] text-indigo-500 font-medium mb-0.5 flex items-center gap-1">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-indigo-400" />
              {conv.businessPhone}
            </p>
          )}
          <p className="text-sm text-gray-600 truncate mb-1">{conv.lastMessagePreview}</p>
          <div className="flex items-center justify-between gap-1 flex-wrap">
            <p className="text-xs text-gray-400">
              {conv.lastMessageAt ? getRelativeTime(conv.lastMessageAt) : 'No messages'}
            </p>
            <div className="flex items-center gap-1">
              <SlaTimer lastMessageAt={conv.lastMessageAt} status={conv.status} />
              <Badge
                variant={conv.status === 'Open' ? 'success' : conv.status === 'Escalated' ? 'warning' : 'secondary'}
                className="text-xs"
              >
                {conv.status}
              </Badge>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
