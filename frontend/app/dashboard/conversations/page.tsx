'use client';

import { useEffect, useState, useRef, useCallback, Fragment } from 'react';
import { createPortal } from 'react-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { conversationsApi, messagesApi, sessionsApi, usersApi, quickRepliesApi, tagsApi, customersApi, escalationsApi, catalogsApi } from '@/services/api';
import {
  Clock, CheckCircle2, AlertTriangle, AlertCircle, Phone,
  MessageSquare, Send, Search, X, UserCheck, BrainCircuit, RefreshCw,
  ChevronDown, ChevronLeft, ChevronRight, Smile, Meh, Frown, Zap, Tag, Download, ArrowDown, Wifi, WifiOff,
  Paperclip, Image, Video, FileText, Music, XCircle, Check, Bookmark, Plus, Layers, Edit, MoreVertical,
} from 'lucide-react';
import { getRelativeTime, formatDate, parseUTCDate, formatDayLabel, formatMessageTime } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';
import { Pagination } from '@/components/ui/pagination';
import { useSignalR, SignalRNotification } from '@/hooks/useSignalR';

type FilterTab = 'all' | 'escalated' | 'done';

// ── Media album grouping (WhatsApp-style) ────────────────────────────────────
const MEDIA_BACKEND_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api').replace(/\/api$/, '');
const ALBUM_GAP_MS = 60_000; // consecutive images within this gap are treated as one album

function resolveMediaUrl(url?: string | null): string {
  if (!url) return '';
  return url.startsWith('/') ? `${MEDIA_BACKEND_BASE}${url}` : url;
}

type MessageGroup = { kind: 'album'; items: any[] } | { kind: 'single'; msg: any };

/** Collapses runs of consecutive same-direction image messages (sent close together) into albums. */
function buildMessageGroups(msgs: any[]): MessageGroup[] {
  const groups: MessageGroup[] = [];
  let album: any[] = [];

  const flush = () => {
    if (album.length === 1) groups.push({ kind: 'single', msg: album[0] });
    else if (album.length > 1) groups.push({ kind: 'album', items: album });
    album = [];
  };

  const ms = (v: any) => parseUTCDate(v)?.getTime() ?? 0;

  for (const m of msgs) {
    const isImage = m.messageType === 'image' && m.mediaUrl;
    const prev = album[album.length - 1];
    const continues =
      !!prev &&
      prev.direction === m.direction &&
      Math.abs(ms(m.createdAt) - ms(prev.createdAt)) <= ALBUM_GAP_MS;

    if (isImage && (!prev || continues)) {
      album.push(m);
    } else {
      flush();
      if (isImage) album.push(m);
      else groups.push({ kind: 'single', msg: m });
    }
  }
  flush();
  return groups;
}

export default function ConversationsPage() {
  const [conversations, setConversations] = useState<any[]>([]);
  const [selectedConv, setSelectedConv] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [sessionSearch, setSessionSearch] = useState('');
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const pageRef = useRef(1);
  const activeFilterRef = useRef<FilterTab>('all');
  const [counts, setCounts] = useState<{ total: number; open: number; escalated: number; closed: number; unread: number } | null>(null);
  const [sessionCounts, setSessionCounts] = useState<Record<number, number>>({});
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  // A "view" = show only chats carrying this tag (a conversation tag, or the customer's tag like VIP).
  const [activeTagId, setActiveTagId] = useState<number | undefined>(undefined);
  const activeTagIdRef = useRef<number | undefined>(undefined);
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
  // AI copilot suggestion for the open chat
  const [suggestion, setSuggestion] = useState<any | null>(null);
  const [suggestionBusy, setSuggestionBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [showAssignDropdown, setShowAssignDropdown] = useState(false);
  const assignDropdownRef = useRef<HTMLDivElement>(null);
  const [quickReplies, setQuickReplies] = useState<any[]>([]);
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const quickReplyRef = useRef<HTMLDivElement>(null);

  // Catalog send
  const [catalogPickerOpen, setCatalogPickerOpen] = useState(false);
  const [catalogList, setCatalogList] = useState<any[]>([]);
  const [catalogView, setCatalogView] = useState<any | null>(null);      // opened catalog detail
  const [catalogSelUrls, setCatalogSelUrls] = useState<Set<string>>(new Set());
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogSending, setCatalogSending] = useState(false);
  const catalogResolveUrl = (u?: string | null) => {
    if (!u) return '';
    const base = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api').replace(/\/api$/, '');
    return u.startsWith('/') ? `${base}${u}` : u;
  };
  const openCatalogPicker = async () => {
    setCatalogPickerOpen(true); setCatalogView(null); setCatalogSelUrls(new Set());
    setCatalogLoading(true);
    try { const r = await catalogsApi.getAll(); setCatalogList(r.data ?? []); }
    catch { showToast('Failed to load catalogs', 'error'); }
    finally { setCatalogLoading(false); }
  };
  const openCatalogView = async (c: any) => {
    setCatalogLoading(true); setCatalogSelUrls(new Set());
    try { const r = await catalogsApi.getById(c.id); setCatalogView(r.data); }
    catch { showToast('Failed to open catalog', 'error'); }
    finally { setCatalogLoading(false); }
  };
  const toggleCatalogImg = (url: string) => {
    setCatalogSelUrls(prev => {
      const next = new Set(prev);
      if (next.has(url)) { next.delete(url); return next; }
      if (next.size >= 30) { showToast('You can send up to 30 images at once', 'info'); return prev; }
      next.add(url); return next;
    });
  };
  const sendCatalog = async () => {
    if (!catalogView || !selectedConv || catalogSelUrls.size === 0) return;
    setCatalogSending(true);
    try {
      const res = await catalogsApi.send(catalogView.id, selectedConv.id, [...catalogSelUrls]);
      showToast(`Queued ${res.data.queued} image${res.data.queued === 1 ? '' : 's'} to send`, 'success');
      setCatalogPickerOpen(false); setCatalogView(null); setCatalogSelUrls(new Set());
    } catch { showToast('Failed to send catalog', 'error'); }
    finally { setCatalogSending(false); }
  };
  const [allConvTags, setAllConvTags] = useState<any[]>([]);    // conversation type tags
  const [allCustomerTags, setAllCustomerTags] = useState<any[]>([]); // customer type tags
  // Bulk multi-select (Admin/HOD/Manager only)
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkMenu, setBulkMenu] = useState<'none' | 'assign' | 'tag'>('none');
  const [bulkBusy, setBulkBusy] = useState(false);
  const bulkMenuRef = useRef<HTMLDivElement>(null);
  const [convTags, setConvTags] = useState<any[]>([]);
  const [customerTags, setCustomerTags] = useState<any[]>([]);
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [tagTab, setTagTab] = useState<'conv' | 'customer'>('conv');
  const [showTagMenu, setShowTagMenu] = useState(false);
  const [showKebab, setShowKebab] = useState(false); // header "more actions" menu (Call · Tags · AI Summary · Export)
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
  // Image lightbox/gallery — browse all photos of an album
  const [gallery, setGallery] = useState<{ images: string[]; index: number } | null>(null);
  const activeThumbRef = useRef<HTMLButtonElement | null>(null);
  const swipeStartX = useRef<number | null>(null);
  // Legacy aliases for backward compat with existing JSX
  const attachmentFile = attachmentFiles[0] ?? null;
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
  const [showNotesPanel, setShowNotesPanel] = useState(false);
  const [notes, setNotes] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesLoading, setNotesLoading] = useState(false);
  const [hasNewMessage, setHasNewMessage] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const selectedConvRef = useRef<any>(null);
  const activeSessionIdRef = useRef<number | undefined>(undefined);
  const reloadDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldScrollRef = useRef(true);
  const isAtBottomRef = useRef(true);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { showToast } = useToast();

  useEffect(() => { selectedConvRef.current = selectedConv; }, [selectedConv]);
  useEffect(() => { activeFilterRef.current = activeFilter; }, [activeFilter]);
  useEffect(() => { activeSessionIdRef.current = activeSessionId; }, [activeSessionId]);
  useEffect(() => {
    if (!shouldScrollRef.current) return;
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    shouldScrollRef.current = false;
  }, [messages]);

  // Keyboard navigation for the image gallery (Esc to close, ←/→ to move)
  useEffect(() => {
    if (!gallery) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setGallery(null);
      else if (e.key === 'ArrowLeft') setGallery(g => (g && g.index > 0 ? { ...g, index: g.index - 1 } : g));
      else if (e.key === 'ArrowRight') setGallery(g => (g && g.index < g.images.length - 1 ? { ...g, index: g.index + 1 } : g));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [gallery]);

  // Keep the active thumbnail scrolled into view in the gallery filmstrip
  useEffect(() => {
    activeThumbRef.current?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [gallery?.index]);

  const handleNotification = useCallback((notification: SignalRNotification) => {
    if (notification.type === 'new_message' && notification.conversationId) {
      setConversations(prev => {
        const idx = prev.findIndex(c => c.id === notification.conversationId);
        if (idx === -1) {
          // New conversation not yet in the list — refresh quietly (and debounced,
          // so a burst of messages doesn't repeatedly flash/reset the list).
          if (reloadDebounceRef.current) clearTimeout(reloadDebounceRef.current);
          reloadDebounceRef.current = setTimeout(
            () => loadConversations(activeSessionIdRef.current, true),
            800
          );
          return prev;
        }
        const updated = {
          ...prev[idx],
          lastMessagePreview: notification.message,
          lastMessageAt: notification.timestamp,
          // Mark unread unless the agent is currently viewing this conversation
          isUnread: selectedConvRef.current?.id !== notification.conversationId,
        };
        return [updated, ...prev.filter((_, i) => i !== idx)];
      });

      if (selectedConvRef.current?.id === notification.conversationId) {
        // Only auto-scroll if the user is already at the bottom
        shouldScrollRef.current = isAtBottomRef.current;
        if (!isAtBottomRef.current) setHasNewMessage(true);
        loadMessages(notification.conversationId);
        pollSuggestion(notification.conversationId); // draft is generated a beat after the message arrives
      } else {
        const preview = notification.message?.slice(0, 50);
        showToast(`${notification.customerName ?? notification.customerPhone}: ${preview}`, 'info');
      }
    }

    // A reply sent from the phone / Interakt web console (captured via webhook echo). Reflect it live:
    // bump the row, update the preview, and CLEAR unread since the business has now replied.
    if (notification.type === 'outbound_message' && notification.conversationId) {
      setConversations(prev => {
        const idx = prev.findIndex(c => c.id === notification.conversationId);
        if (idx === -1) {
          if (reloadDebounceRef.current) clearTimeout(reloadDebounceRef.current);
          reloadDebounceRef.current = setTimeout(
            () => loadConversations(activeSessionIdRef.current, true),
            800
          );
          return prev;
        }
        const updated = {
          ...prev[idx],
          lastMessagePreview: notification.message,
          lastMessageAt: notification.timestamp,
          isUnread: false,
        };
        return [updated, ...prev.filter((_, i) => i !== idx)];
      });
      if (selectedConvRef.current?.id === notification.conversationId) {
        shouldScrollRef.current = isAtBottomRef.current;
        loadMessages(notification.conversationId);
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
      // Refresh quietly so the assignment reflects in the list without flicker
      loadConversations(activeSessionIdRef.current, true);
    }
  }, []);

  const { isConnected, joinConversation, leaveConversation } = useSignalR(handleNotification);

  useEffect(() => {
    loadConversations();
    loadSessions();
    loadUsers();
    quickRepliesApi.getAll().then(r => setQuickReplies(r.data ?? [])).catch(() => {});
    tagsApi.getAll('conversation').then(r => setAllConvTags(r.data ?? [])).catch(() => {});
    tagsApi.getAll('customer').then(r => setAllCustomerTags(r.data ?? [])).catch(() => {});
    return () => { if (reloadDebounceRef.current) clearTimeout(reloadDebounceRef.current); };
  }, []);

  // Close the header "more actions" menu and tag menu on outside click (both live in the same container)
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (tagMenuRef.current && !tagMenuRef.current.contains(e.target as Node)) {
        setShowTagMenu(false);
        setShowKebab(false);
      }
    };
    if (showTagMenu || showKebab) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showTagMenu, showKebab]);

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

  // Server-side status for the active tab so pagination is correct per tab.
  // 'all' shows every status (sectioned).
  const statusForFilter = (f: FilterTab): string | undefined =>
    f === 'escalated' ? 'Escalated' : f === 'done' ? 'Closed' : undefined;

  const loadConversations = async (sessionId?: number, silent = false, pg: number = pageRef.current) => {
    // `silent` skips the loading skeleton so background refreshes (e.g. a new
    // message arriving for an off-page conversation) don't flash/reset the list.
    if (!silent) setLoading(true);
    pageRef.current = pg;
    setPage(pg);
    try {
      const status = statusForFilter(activeFilterRef.current);
      const response = await conversationsApi.getAll(status, currentUserId, sessionId, PAGE_SIZE, (pg - 1) * PAGE_SIZE, activeTagIdRef.current);
      setConversations(response.data);
      // Real totals (not capped at the 100-row page) for the count badges
      conversationsApi.getCounts(currentUserId, sessionId)
        .then(r => setCounts(r.data))
        .catch(() => {});
      // Accurate per-session conversation counts (the loaded page only shows a slice)
      conversationsApi.getCountsBySession(currentUserId)
        .then(r => setSessionCounts(Object.fromEntries((r.data ?? []).map((x: any) => [x.sessionId, x.count]))))
        .catch(() => {});
    } catch {
      if (!silent) showToast('Failed to load conversations', 'error');
    } finally {
      if (!silent) setLoading(false);
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
    loadConversations(next, false, 1);   // reset to first page for the new session
  };

  // Navigate to a specific page of conversations and scroll the list to top.
  const goToPage = (p: number) => {
    loadConversations(activeSessionId, false, p);
    document.getElementById('conv-list-scroll')?.scrollTo({ top: 0 });
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
    // Refresh the AI copilot draft. If none is stored, generate one on demand so chats that never
    // received a live draft (older/seeded, or arrived before suggest-mode) still get a suggestion.
    // The backend returns null without spending tokens when there's nothing to suggest (closed,
    // we already replied, AI off/bypassed for the number, or media with no readable text).
    try {
      const r = await conversationsApi.getSuggestion(convId);
      if (r.data) { setSuggestion(r.data); return; }
      setSuggestion(null);
      const g = await conversationsApi.generateSuggestion(convId);
      if (selectedConvRef.current?.id === convId && g.data) setSuggestion(g.data);
    } catch { setSuggestion(null); }
  };

  // The AI draft is generated a couple of seconds AFTER the inbound-message notification (async in
  // the background processor), so a single fetch on message-arrival misses it. Re-poll a few times
  // (only while this conversation stays open) so the suggestion card appears without a manual reopen.
  const pollSuggestion = (convId: number) => {
    [1500, 4000, 8000, 13000].forEach(delay => {
      setTimeout(() => {
        if (selectedConvRef.current?.id !== convId) return;
        conversationsApi.getSuggestion(convId)
          .then(r => { if (selectedConvRef.current?.id === convId && r.data) setSuggestion(r.data); })
          .catch(() => {});
      }, delay);
    });
  };

  // ── AI copilot actions ──
  const sendSuggestion = async () => {
    if (!suggestion || !selectedConv) return;
    setSuggestionBusy(true);
    try {
      await conversationsApi.sendMessage(selectedConv.id, suggestion.suggestedText);
      await conversationsApi.resolveSuggestion(selectedConv.id, suggestion.id, 'Sent');
      setSuggestion(null);
      loadMessages(selectedConv.id);
    } catch { showToast('Failed to send', 'error'); }
    finally { setSuggestionBusy(false); }
  };
  const editSuggestion = () => {
    if (!suggestion || !selectedConv) return;
    setReplyText(suggestion.suggestedText);
    conversationsApi.resolveSuggestion(selectedConv.id, suggestion.id, 'Edited').catch(() => {});
    setSuggestion(null);
  };
  const dismissSuggestion = () => {
    if (!suggestion || !selectedConv) return;
    conversationsApi.resolveSuggestion(selectedConv.id, suggestion.id, 'Dismissed').catch(() => {});
    setSuggestion(null);
  };

  const handleSelectConversation = (conv: any) => {
    // Leave previous conversation's real-time group, join new one
    if (selectedConvRef.current?.id && selectedConvRef.current.id !== conv.id) {
      leaveConversation(selectedConvRef.current.id);
    }
    joinConversation(conv.id);
    setMobileView('chat'); // push to chat on mobile

    // Mark read for this user. Optimistically clear the badge if it was unread; always record the
    // view server-side (covers deep-links opened via getById, which don't carry an isUnread flag).
    if (conv.isUnread) {
      setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, isUnread: false } : c));
    }
    conversationsApi.markViewed(conv.id).catch(() => {});

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

  // Deep-link: open a specific conversation when navigated to with ?id=N
  // (from the Customers page "View" links and the notification bell).
  const deepLinkHandledRef = useRef<string | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const id = new URLSearchParams(window.location.search).get('id');
    if (!id || deepLinkHandledRef.current === id) return;
    const numId = Number(id);
    if (!numId) return;
    deepLinkHandledRef.current = id;

    (async () => {
      const existing = conversations.find((c: any) => c.id === numId);
      if (existing) { handleSelectConversation(existing); return; }
      try {
        const res = await conversationsApi.getById(numId);
        const d: any = res.data;
        if (d?.id) {
          // Detail DTO nests the assignee; the header reads flat fields — normalize.
          handleSelectConversation({
            ...d,
            assignedUserName: d.assignedUserName ?? d.assignedUser?.fullName ?? '',
            assignedUserId: d.assignedUserId ?? d.assignedUser?.id ?? 0,
          });
        } else {
          showToast('Conversation not found', 'error');
        }
      } catch {
        showToast('Could not open that conversation', 'error');
      }
    })();
  }, [conversations]);

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
    const valid = allFiles.filter(f => f.size <= limit).slice(0, 30);
    if (!valid.length) return;
    if (allFiles.length > 30) showToast(`Only first 30 files selected (WhatsApp limit)`, 'info');

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
        // WhatsApp lets you attach up to 30 media at once. Each is sent as a separate API
        // message with a small delay to stay under Interakt's rate limit (~5 req/sec).
        const MAX_BATCH = 30;
        const files = attachmentFiles.slice(0, MAX_BATCH);
        if (attachmentFiles.length > MAX_BATCH)
          showToast(`Sending first ${MAX_BATCH} of ${attachmentFiles.length} files (WhatsApp limit)`, 'info');

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
    } catch (err: any) {
      showToast(err?.response?.data?.error ?? 'Failed to send message', 'error');
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
      // Creates a real escalation record (server picks the next-level user) and engages the
      // CRR→Manager→HOD timeout matrix — not just a status label change.
      const res = await escalationsApi.escalateConversation(selectedConv.id);
      const to = res.data?.escalatedTo;
      showToast(to ? `Escalated to ${to}` : 'Conversation escalated', 'success');
      loadConversations();
      setSelectedConv({ ...selectedConv, status: 'Escalated' });
    } catch (e: any) {
      showToast(e?.response?.data?.error || 'Failed to escalate', 'error');
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

  // Notes — fetch the latest saved note when opening the panel (list rows don't carry it).
  const handleOpenNotes = async () => {
    if (!selectedConv) return;
    setShowSummaryPanel(false);
    setShowNotesPanel(true);
    setNotesLoading(true);
    try {
      const r = await conversationsApi.getById(selectedConv.id);
      setNotes(r.data?.notes ?? '');
    } catch { setNotes(''); }
    finally { setNotesLoading(false); }
  };
  const handleSaveNotes = async () => {
    if (!selectedConv) return;
    setSavingNotes(true);
    try {
      await conversationsApi.updateNotes(selectedConv.id, notes);
      showToast('Notes saved', 'success');
    } catch { showToast('Failed to save notes', 'error'); }
    finally { setSavingNotes(false); }
  };

  // CRR called the customer directly instead of replying — record as a reply (counts for SLA) and close.
  const handleResolveViaCall = async () => {
    if (!selectedConv) return;
    if (!confirm('Mark this chat as resolved via a phone call? It will be recorded as a reply and closed.')) return;
    try {
      await conversationsApi.resolveViaCall(selectedConv.id);
      showToast('Resolved via call', 'success');
      setSelectedConv({ ...selectedConv, status: 'Closed' });
      loadConversations();
      loadMessages(selectedConv.id);
    } catch {
      showToast('Failed to resolve via call', 'error');
    }
  };

  const handleReopen = async () => {
    if (!selectedConv) return;
    try {
      await conversationsApi.updateStatus(selectedConv.id, 'Open');
      showToast('Conversation reopened', 'success');
      setSelectedConv({ ...selectedConv, status: 'Open' });
      loadConversations();
    } catch {
      showToast('Failed to reopen conversation', 'error');
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
    const colors = ['bg-blue-100 text-blue-700', 'bg-green-100 text-green-700', 'bg-orange-100 text-orange-700', 'bg-purple-100 text-purple-700', 'bg-pink-100 text-pink-700', 'bg-emerald-100 text-emerald-700'];
    return colors[id % colors.length];
  };

  const getFilteredConversations = () => {
    if (searchResults !== null) return searchResults;
    switch (activeFilter) {
      case 'escalated': return conversations.filter(c => c.status === 'Escalated');
      case 'done': return conversations.filter(c => c.status === 'Closed');
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

  // Collapse messages older than 30 days into the conversation summary (display-only — the messages
  // stay in the DB; the retention job is what actually deletes them). Shows the summary banner + only
  // the last 30 days of messages, which is what "messages before 30 days are summarised" looks like.
  const RETENTION_DAYS = 30;
  const olderCutoffTs = Date.now() - RETENTION_DAYS * 86_400_000;
  const recentMessages = messages.filter((m: any) => {
    const t = parseUTCDate(m.createdAt)?.getTime();
    return t == null || t >= olderCutoffTs;
  });
  // Collapse the OLD part of a conversation into the summary only when:
  //  - the messages were actually hard-deleted by retention (summaryArchivedAt), OR
  //  - there is BOTH an old part AND a recent part loaded (a long, still-active chat).
  // A conversation that is ENTIRELY older than 30 days (e.g. opened from Customers → View) must keep
  // showing all its messages, or you couldn't read the archived chat at all.
  const hasRecent = recentMessages.length > 0;
  const hasOlderLoaded = messages.length > recentMessages.length;
  const showOlderSummary =
    !!summary?.summaryText && (!!summary?.summaryArchivedAt || (hasOlderLoaded && hasRecent));
  const displayMessages = showOlderSummary ? recentMessages : messages;

  // ── Bulk multi-select helpers ──
  const toggleSelectId = (conv: any) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(conv.id)) next.delete(conv.id); else next.add(conv.id);
      return next;
    });
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
    setBulkMenu('none');
  };

  const selectAllVisible = () => {
    // Match whatever the list is actually showing (search results vs the filtered list).
    const visible = searchResults !== null ? searchResults : filteredConversations;
    const ids = visible.map(c => c.id);
    setSelectedIds(prev => (prev.size === ids.length && ids.length > 0 ? new Set() : new Set(ids)));
  };

  const runBulk = async (action: 'close' | 'assign' | 'tag', opts: { userId?: number; tagId?: number } = {}) => {
    if (selectedIds.size === 0) return;
    setBulkBusy(true);
    try {
      const res = await conversationsApi.bulkAction([...selectedIds], action, opts);
      showToast(`${action === 'close' ? 'Closed' : action === 'assign' ? 'Assigned' : 'Tagged'} ${res.data.affected} conversation${res.data.affected === 1 ? '' : 's'}`, 'success');
      exitSelectMode();
      loadConversations(activeSessionId, true);
      if (selectedConv) loadMessages(selectedConv.id);
    } catch {
      showToast('Bulk action failed', 'error');
    } finally {
      setBulkBusy(false);
    }
  };

  // Close the bulk assign/tag popover on outside click
  useEffect(() => {
    if (bulkMenu === 'none') return;
    const handler = (e: MouseEvent) => {
      if (bulkMenuRef.current && !bulkMenuRef.current.contains(e.target as Node)) setBulkMenu('none');
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [bulkMenu]);

  // ── Tag views: show only chats carrying a chosen tag (a conversation tag, or the
  //    customer's tag like "VIP"). Choosing a tag reloads the list filtered server-side. ──
  const [showSavedMenu, setShowSavedMenu] = useState(false);
  const savedMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (savedMenuRef.current && !savedMenuRef.current.contains(e.target as Node)) setShowSavedMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Every tag the user can pick as a view (conversation tags + customer tags like VIP).
  const viewTags = [...allConvTags, ...allCustomerTags];
  const activeTag = viewTags.find((t: any) => t.id === activeTagId);

  const applyTagView = (tagId?: number) => {
    setShowSavedMenu(false);
    setActiveTagId(tagId);
    activeTagIdRef.current = tagId;
    setSearchQuery(''); setSearchResults(null);
    setSelectedConv(null); setMessages([]);
    loadConversations(activeSessionId, false, 1);
  };

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden">
      {/* Top Navigation Bar — hidden on mobile when in chat view; flex-shrink-0 so it never gets squeezed */}
      <div className={`bg-white border-b border-gray-100 px-3 sm:px-6 py-2 sm:py-2.5 flex items-center justify-between gap-3 shadow-sm flex-shrink-0 ${mobileView === 'chat' ? 'hidden sm:flex' : 'flex'}`}>
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1">
          {([
            { key: 'all',       label: 'All',       icon: null },
            { key: 'escalated', label: 'Escalated', icon: AlertTriangle },
            { key: 'done',      label: 'Done',       icon: CheckCircle2 },
          ] as { key: FilterTab; label: string; icon: any }[]).map(({ key, label, icon: Icon }) => (
            <button key={key}
              onClick={() => { setActiveFilter(key); activeFilterRef.current = key; clearSearch(); loadConversations(activeSessionId, false, 1); }}
              className={`flex items-center gap-1.5 px-3 sm:px-3.5 py-1.5 text-sm font-medium rounded-lg flex-shrink-0 whitespace-nowrap
                transition-all duration-150 active:scale-95 ${
                activeFilter === key
                  ? key === 'escalated' ? 'bg-orange-600 text-white shadow-sm'
                  : key === 'done'      ? 'bg-green-100 text-green-700 shadow-sm'
                  : 'bg-emerald-100 text-emerald-700 shadow-sm'
                  : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'
              }`}>
              {Icon && <Icon className="h-3.5 w-3.5" />}
              {label}
              {(() => {
                const n = key === 'all' ? counts?.unread
                        : key === 'escalated' ? counts?.escalated
                        : key === 'done' ? counts?.closed
                        : undefined;
                if (!n) return null;
                return (
                  <span className={`ml-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none ${
                    activeFilter === key
                      ? key === 'escalated' ? 'bg-white/30 text-white'      // dark (orange) active tab
                        : key === 'done' ? 'bg-green-600 text-white'         // light active tabs → solid chip
                        : 'bg-emerald-600 text-white'
                    : key === 'all' ? 'bg-red-500 text-white'                // unread = attention
                    : 'bg-gray-200 text-gray-600'
                  }`}>{n}</span>
                );
              })()}
            </button>
          ))}
          {/* Views — filter the list to one tag (e.g. VIP customers) */}
          <div className="relative flex-shrink-0 ml-1" ref={savedMenuRef}>
            <button onClick={() => setShowSavedMenu(v => !v)}
              className={`flex items-center gap-1 px-2.5 py-1.5 text-sm font-medium rounded-lg whitespace-nowrap ${
                activeTag ? 'bg-emerald-100 text-emerald-700 shadow-sm' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'
              }`}>
              <Bookmark className="h-3.5 w-3.5" />
              {activeTag ? activeTag.name : 'Views'}
              <ChevronDown className={`h-3 w-3 transition-transform ${showSavedMenu ? 'rotate-180' : ''}`} />
            </button>
            {showSavedMenu && (
              <div className="absolute left-0 mt-1 w-56 bg-white border border-gray-200 rounded-xl shadow-lg z-30 py-1 max-h-80 overflow-y-auto">
                <p className="px-3 pt-1.5 pb-1 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Filter by tag</p>
                <button onClick={() => applyTagView(undefined)}
                  className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-50 flex items-center gap-2 ${!activeTagId ? 'font-semibold text-emerald-600' : 'text-gray-700'}`}>
                  <Layers className="h-3.5 w-3.5" /> All chats
                </button>
                {viewTags.length > 0 && <div className="border-t border-gray-100 my-1" />}
                {viewTags.map((t: any) => (
                  <button key={`${t.type}-${t.id}`} onClick={() => applyTagView(t.id)}
                    className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 flex items-center gap-2 ${activeTagId === t.id ? 'font-semibold text-emerald-600 bg-emerald-50' : 'text-gray-700'}`}>
                    <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: t.color || '#9ca3af' }} />
                    <span className="flex-1 truncate">{t.name}</span>
                    <span className="text-[10px] text-gray-400 flex-shrink-0">{t.type === 'customer' ? 'customer' : 'chat'}</span>
                  </button>
                ))}
                {viewTags.length === 0 && <p className="px-3 py-2 text-[11px] text-gray-400">No tags yet</p>}
              </div>
            )}
          </div>
          {activeTag && (
            <button onClick={() => applyTagView(undefined)} title="Clear tag view"
              className="flex items-center gap-1 px-2 py-1.5 text-xs text-gray-400 hover:text-red-500 flex-shrink-0">
              <X className="h-3.5 w-3.5" /> Clear
            </button>
          )}
        </div>
        <div className="hidden md:flex items-center gap-4 text-sm text-gray-400 flex-shrink-0 pl-3">
          <span className="flex items-center gap-1.5" title={isConnected ? 'Real-time connected' : 'Connecting…'}>
            {isConnected
              ? <Wifi className="h-3.5 w-3.5 text-green-500" />
              : <WifiOff className="h-3.5 w-3.5 text-gray-300" />}
          </span>
          {isCRR && (
            <span className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 border border-emerald-100 rounded-lg text-xs font-medium text-emerald-700">
              <UserCheck className="h-3.5 w-3.5" />
              My Conversations
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <MessageSquare className="h-3.5 w-3.5" />
            <span className="font-medium text-gray-700">{counts?.total ?? conversations.length}</span> Total
          </span>
          <span className="flex items-center gap-1.5">
            <AlertCircle className="h-3.5 w-3.5 text-orange-500" />
            <span className="font-medium text-orange-600">{counts?.escalated ?? conversations.filter(c => c.status === 'Escalated').length}</span> Escalated
          </span>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* Left Side - Sessions List (hidden for CRR). overflow-hidden + a flex column so the search
            header stays pinned and only the session list below it scrolls. */}
        <div className={`${isCRR ? 'hidden' : 'hidden xl:flex xl:flex-col'} w-60 border-r border-beige-200 bg-beige overflow-hidden flex-shrink-0`}>
          <div className="h-[57px] flex-shrink-0 flex items-center px-3 border-b border-gray-200 bg-white">
            <div className="relative w-full">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Search sessions…"
                value={sessionSearch}
                onChange={e => setSessionSearch(e.target.value)}
                className="w-full pl-8 pr-7 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-300 bg-gray-50"
              />
              {sessionSearch && (
                <button onClick={() => setSessionSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto min-h-0 py-1">
            {/* All Sessions row */}
            <div onClick={() => { setActiveSessionId(undefined); setSelectedConv(null); setMessages([]); loadConversations(undefined); }}
              className={`px-3 py-2.5 mx-1.5 my-0.5 rounded-xl cursor-pointer transition-all duration-150 flex items-center justify-between ${
                activeSessionId === undefined ? 'bg-emerald-50 border border-emerald-200' : 'hover:bg-gray-50 border border-transparent'
              }`}>
              <span className={`text-xs font-semibold ${activeSessionId === undefined ? 'text-emerald-700' : 'text-gray-500'}`}>
                All Sessions
              </span>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${activeSessionId === undefined ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-600'}`}>
                {counts?.total ?? conversations.length}
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
                    ? 'bg-emerald-50 border border-emerald-200 shadow-sm'
                    : 'hover:bg-gray-50 border border-transparent'
                }`}>
                <div className="flex items-center gap-2.5">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${
                    activeSessionId === session.id ? 'bg-emerald-100' : session.isConnected ? 'bg-green-100' : 'bg-gray-100'
                  }`}>
                    <Phone className={`h-4 w-4 ${
                      activeSessionId === session.id ? 'text-emerald-600' : session.isConnected ? 'text-green-600' : 'text-gray-400'
                    }`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <p className={`text-xs font-semibold truncate ${activeSessionId === session.id ? 'text-emerald-700' : 'text-gray-900'}`}>
                        {session.phoneNumber}
                      </p>
                      {session.isConnected && <div className="w-1.5 h-1.5 bg-green-400 rounded-full pulse-dot flex-shrink-0" />}
                    </div>
                    <div className="flex items-center justify-between">
                      <p className={`text-xs truncate ${activeSessionId === session.id ? 'text-emerald-500' : 'text-gray-400'}`}>
                        {session.assignedUserName || 'Unassigned'}
                      </p>
                      {(() => {
                        // Accurate total from the server; fall back to the loaded-page count if not yet fetched
                        const count = sessionCounts[session.id] ?? conversations.filter(c => c.sessionId === session.id).length;
                        return count > 0 ? (
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                            activeSessionId === session.id ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-600'
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
        <div className={`${mobileView === 'chat' ? 'hidden sm:flex' : 'flex'} w-full sm:w-72 lg:w-80 border-r border-beige-200 bg-beige flex-shrink-0 flex-col overflow-hidden`}>
          {/* Mobile/tablet session switcher — the full session panel is xl-only, so this lets
              smaller screens change which WhatsApp number's conversations are shown (non-CRR only). */}
          {!isCRR && (
            <div className="xl:hidden flex items-center gap-2 px-3 py-2 border-b border-gray-200 bg-white flex-shrink-0">
              <Phone className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
              <select
                value={activeSessionId ?? ''}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === '') { setActiveSessionId(undefined); setSelectedConv(null); setMessages([]); loadConversations(undefined); }
                  else handleSessionFilter(Number(v));
                }}
                className="flex-1 min-w-0 text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-400"
              >
                <option value="">All Sessions ({counts?.total ?? conversations.length})</option>
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>{s.phoneNumber}{s.assignedUserName ? ` · ${s.assignedUserName}` : ''}</option>
                ))}
              </select>
            </div>
          )}
          {/* Search Bar — same h-[57px] as sessions header so border-b lines align */}
          <div className="h-[57px] flex-shrink-0 flex items-center px-3 border-b border-gray-200 bg-white">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => handleSearchChange(e.target.value)}
                placeholder={activeSessionId ? 'Search in this session…' : 'Search all sessions…'}
                className="w-full pl-9 pr-8 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-gray-50"
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
                : <p className="text-xs text-emerald-500">{activeSessionId ? 'Showing results for this session' : 'Showing results across all sessions'}</p>
              }
            </div>
          )}

          {/* Bulk select toolbar (Admin/HOD/Manager) */}
          {!isCRR && (
            !selectMode ? (
              <div className="flex items-center justify-end px-3 py-1.5 border-b border-gray-100 bg-white">
                <button
                  onClick={() => setSelectMode(true)}
                  className="flex items-center gap-1.5 text-[11px] font-medium text-gray-500 hover:text-emerald-600 px-2 py-1 rounded-lg hover:bg-emerald-50 transition-colors"
                >
                  <Check className="h-3.5 w-3.5" /> Select
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 px-3 py-2 border-b border-emerald-100 bg-emerald-50/60 flex-wrap">
                <button onClick={selectAllVisible} className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-900 px-1.5">
                  {(() => {
                    const vis = searchResults !== null ? searchResults : filteredConversations;
                    return selectedIds.size === vis.length && vis.length > 0 ? 'Clear' : 'All';
                  })()}
                </button>
                <span className="text-[11px] font-medium text-gray-600">{selectedIds.size} selected</span>
                <div className="flex-1" />
                {/* Close */}
                <button
                  onClick={() => runBulk('close')}
                  disabled={selectedIds.size === 0 || bulkBusy}
                  className="flex items-center gap-1 text-[11px] font-medium text-gray-600 hover:text-green-700 px-2 py-1 rounded-lg hover:bg-green-50 disabled:opacity-40"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" /> Close
                </button>
                {/* Assign */}
                <div className="relative" ref={bulkMenu === 'assign' ? bulkMenuRef : undefined}>
                  <button
                    onClick={() => setBulkMenu(m => m === 'assign' ? 'none' : 'assign')}
                    disabled={selectedIds.size === 0 || bulkBusy}
                    className="flex items-center gap-1 text-[11px] font-medium text-gray-600 hover:text-emerald-700 px-2 py-1 rounded-lg hover:bg-emerald-50 disabled:opacity-40"
                  >
                    <UserCheck className="h-3.5 w-3.5" /> Assign
                  </button>
                  {bulkMenu === 'assign' && (
                    <div className="absolute right-0 mt-1 w-52 max-h-56 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-lg z-50 py-1">
                      {users.map((u: any) => (
                        <button key={u.id} onClick={() => runBulk('assign', { userId: u.id })}
                          className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 flex items-center gap-2">
                          <span className="h-5 w-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[9px] font-bold flex-shrink-0">
                            {(u.fullName ?? '?').charAt(0)}
                          </span>
                          <span className="truncate">{u.fullName} <span className="text-gray-400">({u.role})</span></span>
                        </button>
                      ))}
                      {users.length === 0 && <p className="px-3 py-2 text-xs text-gray-400">No users</p>}
                    </div>
                  )}
                </div>
                {/* Tag */}
                <div className="relative" ref={bulkMenu === 'tag' ? bulkMenuRef : undefined}>
                  <button
                    onClick={() => setBulkMenu(m => m === 'tag' ? 'none' : 'tag')}
                    disabled={selectedIds.size === 0 || bulkBusy}
                    className="flex items-center gap-1 text-[11px] font-medium text-gray-600 hover:text-purple-700 px-2 py-1 rounded-lg hover:bg-purple-50 disabled:opacity-40"
                  >
                    <Tag className="h-3.5 w-3.5" /> Tag
                  </button>
                  {bulkMenu === 'tag' && (
                    <div className="absolute right-0 mt-1 w-48 max-h-56 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-lg z-50 py-1">
                      {allConvTags.map((t: any) => (
                        <button key={t.id} onClick={() => runBulk('tag', { tagId: t.id })}
                          className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: t.color || '#10b981' }} />
                          <span className="truncate">{t.name}</span>
                        </button>
                      ))}
                      {allConvTags.length === 0 && <p className="px-3 py-2 text-xs text-gray-400">No tags</p>}
                    </div>
                  )}
                </div>
                <button onClick={exitSelectMode} className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100">
                  <X className="h-4 w-4" />
                </button>
              </div>
            )
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
            <>
            <div id="conv-list-scroll" className="flex-1 overflow-y-auto min-h-0">
              {/* Search results mode */}
              {searchResults !== null ? (
                <div>
                  <div className="px-4 py-2 bg-emerald-50 border-b border-emerald-100">
                    <h3 className="text-xs font-semibold text-emerald-900 uppercase">
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
                        selectMode={selectMode}
                        selected={selectedIds.has(conv.id)}
                        onToggleSelect={toggleSelectId}
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
                          Escalated ({searchResults ? highPriorityConvs.length : (counts?.escalated ?? highPriorityConvs.length)})
                        </h3>
                      </div>
                      {highPriorityConvs.map(conv => (
                        <ConversationItem key={conv.id} conv={conv} selectedConv={selectedConv}
                          onSelect={handleSelectConversation} getInitials={getInitials}
                          getAvatarColor={getAvatarColor} isHighPriority showSession={!activeSessionId}
                          selectMode={selectMode} selected={selectedIds.has(conv.id)} onToggleSelect={toggleSelectId} />
                      ))}
                    </div>
                  )}
                  {activeConvs.length > 0 && (
                    <div>
                      <div className="px-4 py-2 bg-emerald-50 border-b border-emerald-100 sticky top-0 z-20">
                        <h3 className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">Active ({searchResults ? activeConvs.length : (counts?.open ?? activeConvs.length)})</h3>
                      </div>
                      {activeConvs.map(conv => (
                        <ConversationItem key={conv.id} conv={conv} selectedConv={selectedConv}
                          onSelect={handleSelectConversation} getInitials={getInitials}
                          getAvatarColor={getAvatarColor} showSession={!activeSessionId}
                          selectMode={selectMode} selected={selectedIds.has(conv.id)} onToggleSelect={toggleSelectId} />
                      ))}
                    </div>
                  )}
                  {closedConvs.length > 0 && (activeFilter === 'all' || activeFilter === 'done') && (
                    <div>
                      <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 sticky top-0 z-20">
                        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Closed ({closedConvs.length})</h3>
                      </div>
                      {closedConvs.map(conv => (
                        <ConversationItem key={conv.id} conv={conv} selectedConv={selectedConv}
                          onSelect={handleSelectConversation} getInitials={getInitials}
                          getAvatarColor={getAvatarColor} showSession={!activeSessionId}
                          selectMode={selectMode} selected={selectedIds.has(conv.id)} onToggleSelect={toggleSelectId} />
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
                </>
              )}
            </div>
            {/* Pagination (hidden in search mode) */}
            {searchResults === null && (
              <Pagination
                page={page}
                totalPages={Math.max(1, Math.ceil(
                  ((activeFilter === 'escalated' ? counts?.escalated
                    : activeFilter === 'done' ? counts?.closed
                    : counts?.total) ?? 0) / PAGE_SIZE))}
                onChange={goToPage}
              />
            )}
            </>
          )}
        </div>

        {/* Chat View — always visible on sm+, visible on mobile only when mobileView=chat */}
        <div className={`${mobileView === 'chat' ? 'flex' : 'hidden sm:flex'} flex-1 flex-col bg-white min-w-0 overflow-hidden`}>
          {selectedConv ? (
            <>
              {/* Chat Header — min-h-[57px] matches sessions/conv-list headers for aligned border-b */}
              <div className="bg-white border-b border-gray-200 px-4 py-0 min-h-[57px] flex items-center flex-shrink-0">
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
                        <Badge className="hidden sm:inline-flex text-xs bg-orange-500 flex-shrink-0">
                          <AlertTriangle className="h-3 w-3 mr-1" />Escalated
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 sm:gap-3 text-xs text-gray-500 flex-wrap">
                      {/* Phone: shown in the title already; repeat here only on sm+ when a distinct name is set (keeps the mobile header to one compact meta line) */}
                      {selectedConv.customerName && selectedConv.customerName !== selectedConv.customerPhone && (
                        <span className="hidden sm:inline truncate max-w-[130px]">{selectedConv.customerPhone}</span>
                      )}
                      <span className="flex items-center gap-1">
                        <div className={`w-2 h-2 rounded-full ${selectedConv.status === 'Open' ? 'bg-green-500' : 'bg-gray-400'}`}></div>
                        {selectedConv.status === 'Open' ? 'Active' : selectedConv.status}
                      </span>
                      {convTags.map((t: any) => (
                        <span key={t.id} className="hidden sm:flex items-center gap-1 px-2 py-0.5 rounded-full text-white text-[11px] font-medium"
                          style={{ backgroundColor: t.color }}
                          title={t.isAuto ? 'AI-suggested tag' : undefined}>
                          {t.isAuto && <span className="text-[9px] leading-none opacity-90" aria-label="AI">✨</span>}
                          {t.name}
                        </span>
                      ))}
                      {customerTags.map((t: any) => (
                        <span key={`c-${t.id}`} className="hidden sm:flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border"
                          style={{ color: t.color, borderColor: t.color + '66', backgroundColor: t.color + '18' }}
                          title="Customer tag">
                          {t.name}
                        </span>
                      ))}

                      {/* Assign dropdown */}
                      <div className="relative" ref={assignDropdownRef}>
                        <button
                          onClick={() => setShowAssignDropdown(!showAssignDropdown)}
                          className="flex items-center gap-1 max-w-[150px] text-xs text-emerald-600 hover:text-emerald-800 border border-emerald-200 rounded px-2 py-0.5 bg-emerald-50"
                        >
                          <UserCheck className="h-3 w-3 flex-shrink-0" />
                          <span className="hidden sm:inline truncate">{selectedConv.assignedUserName || 'Assign'}</span>
                          <ChevronDown className="h-3 w-3 flex-shrink-0" />
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
                                    className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 ${isCurrent ? 'bg-emerald-50' : 'hover:bg-gray-50'}`}
                                  >
                                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs flex-shrink-0 ${isCurrent ? 'bg-emerald-200 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>
                                      {user.fullName?.[0] ?? '?'}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className={`font-medium text-xs truncate ${isCurrent ? 'text-emerald-700' : 'text-gray-900'}`}>{user.fullName}</p>
                                      <p className="text-gray-400 text-xs">{user.role}</p>
                                    </div>
                                    {isCurrent && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Quick Actions — ml-auto pushes to far right. Resolve + Escalate stay primary;
                      Call · Tags · AI Summary · Export collapse into the ⋮ menu. */}
                  <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0 ml-auto">
                    <Button size="sm" variant="outline" onClick={handleMarkResolved}
                      disabled={isClosed} title="Resolve" className="text-green-600 border-green-200 hover:bg-green-50">
                      <CheckCircle2 className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline">Resolve</span>
                    </Button>
                    <Button size="sm" variant="outline" onClick={handleEscalate}
                      disabled={selectedConv.status === 'Escalated' || isClosed}
                      title="Escalate" className="text-orange-600 border-orange-200 hover:bg-orange-50">
                      <AlertTriangle className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline">Escalate</span>
                    </Button>

                    {/* More actions: Call · Tags · AI Summary · Export */}
                    <div className="relative" ref={tagMenuRef}>
                      <Button size="sm" variant="outline"
                        onClick={() => { setShowKebab(v => !v); setShowTagMenu(false); }}
                        className="text-gray-600 border-gray-200 hover:bg-gray-50" title="More actions">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                      {showKebab && (
                        <div className="absolute top-full right-0 mt-1 w-48 bg-white border border-gray-200 rounded-xl shadow-lg z-50 py-1">
                          <a href={`tel:${selectedConv.customerPhone}`} onClick={() => setShowKebab(false)}
                            className="flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                            <Phone className="h-4 w-4 text-green-600" /> Call
                          </a>
                          <button onClick={() => { setShowKebab(false); setTagTab('conv'); setShowTagMenu(true); }}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                            <Tag className="h-4 w-4 text-emerald-600" /> Tags
                          </button>
                          <button onClick={() => { setShowKebab(false); setShowNotesPanel(false); setShowSummaryPanel(true); }}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                            <BrainCircuit className="h-4 w-4 text-purple-600" /> AI Summary
                          </button>
                          <button onClick={() => { setShowKebab(false); handleOpenNotes(); }}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                            <FileText className="h-4 w-4 text-blue-600" /> Notes
                          </button>
                          <button onClick={() => { setShowKebab(false); handleExport(); }}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                            <Download className="h-4 w-4 text-gray-500" /> Export
                          </button>
                          {!isClosed && (
                            <button onClick={() => { setShowKebab(false); handleResolveViaCall(); }}
                              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-emerald-700 hover:bg-emerald-50 border-t border-gray-100 mt-1 pt-2">
                              <Phone className="h-4 w-4 text-emerald-600" /> Resolve via call
                            </button>
                          )}
                        </div>
                      )}
                      {/* Tag menu (opened from the ⋮ menu) */}
                      {showTagMenu && (
                        <div className="absolute top-full right-0 mt-1 w-52 bg-white border border-gray-200 rounded-xl shadow-lg z-50">
                          {/* Tabs */}
                          <div className="flex border-b border-gray-100 text-xs font-semibold">
                            <button
                              onClick={() => setTagTab('conv')}
                              className={`flex-1 px-3 py-2 rounded-tl-xl transition-colors ${tagTab === 'conv' ? 'bg-emerald-50 text-emerald-700' : 'text-gray-500 hover:bg-gray-50'}`}
                            >
                              Conversation
                            </button>
                            <button
                              onClick={() => setTagTab('customer')}
                              className={`flex-1 px-3 py-2 rounded-tr-xl transition-colors ${tagTab === 'customer' ? 'bg-emerald-50 text-emerald-700' : 'text-gray-500 hover:bg-gray-50'}`}
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
                  </div>
                </div>
              </div>

              <div className="flex flex-1 overflow-hidden min-h-0">
                {/* Messages area — min-h-0 lets the scroll region shrink so the composer stays pinned in view */}
                <div className="flex flex-col flex-1 min-w-0 min-h-0">
                  <div
                    ref={messagesContainerRef}
                    className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-4 bg-gray-50 relative"
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
                        className="sticky top-2 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 px-3 py-1.5 bg-emerald-100 text-emerald-700 text-xs font-medium rounded-full shadow-lg hover:bg-emerald-200 transition-all"
                      >
                        <ArrowDown className="h-3 w-3" />
                        New message
                      </button>
                    )}
                    {/* Messages older than 30 days are collapsed into this summary (shown above the recent chat) */}
                    {showOlderSummary && (
                      <div className="mx-auto max-w-2xl mb-3 rounded-xl border border-amber-200 bg-amber-50/70 p-3.5">
                        <p className="flex items-center gap-1.5 text-[11px] font-bold text-amber-700 uppercase tracking-wide mb-1.5">
                          <Clock className="h-3.5 w-3.5" /> Summary of older messages
                        </p>
                        <p className="text-sm text-gray-700 whitespace-pre-wrap">{summary.summaryText}</p>
                        {summary.keyTopics && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {String(summary.keyTopics).split(',').map((t: string, i: number) => t.trim() && (
                              <span key={i} className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-white text-amber-700 border border-amber-200">{t.trim()}</span>
                            ))}
                          </div>
                        )}
                        <p className="text-[10px] text-amber-600/80 mt-2">
                          {summary.summaryArchivedAt
                            ? `Messages before ${formatDate(summary.summaryArchivedAt)} were archived to this summary.`
                            : `Messages older than ${RETENTION_DAYS} days are summarised here; the recent chat is shown below.`}
                        </p>
                      </div>
                    )}
                    {displayMessages.length === 0 && !showOlderSummary ? (
                      <div className="text-center py-12 text-gray-500">No messages in this conversation</div>
                    ) : (
                      buildMessageGroups(displayMessages).map((group, gi, arr) => {
                        // WhatsApp-style centered date chip when the day changes
                        const gm: any = group.kind === 'album' ? group.items[0] : group.msg;
                        const prev: any = arr[gi - 1];
                        const prevGm: any = prev ? (prev.kind === 'album' ? prev.items[0] : prev.msg) : null;
                        const dayLabel = formatDayLabel(gm.createdAt);
                        const showSep = !prevGm || formatDayLabel(prevGm.createdAt) !== dayLabel;
                        const separator = showSep ? (
                          <div className="flex justify-center my-3">
                            <span className="text-[11px] font-medium text-gray-500 bg-gray-100/90 px-3 py-1 rounded-full shadow-sm">{dayLabel}</span>
                          </div>
                        ) : null;
                        if (group.kind === 'album') {
                          const items = group.items;
                          const albumInbound = items[0].direction === 'inbound';
                          const caption = items.map((x: any) => x.content).filter(Boolean).pop();
                          const shown = items.slice(0, 4);
                          const extra = items.length - shown.length;
                          const lastMsg = items[items.length - 1];
                          return (
                            <Fragment key={`album-${items[0].id}`}>
                            {separator}
                            <div className={`group flex items-end gap-1.5 ${albumInbound ? 'justify-start' : 'justify-end'}`}>
                              {albumInbound && (
                                <div className={`w-8 h-8 rounded-full ${getAvatarColor(selectedConv.id)} flex items-center justify-center text-xs font-medium flex-shrink-0`}>
                                  {getInitials(selectedConv.customerName, selectedConv.customerPhone)}
                                </div>
                              )}
                              <div className="max-w-[85%] sm:max-w-[70%] min-w-0 flex flex-col gap-1">
                                <div className={`flex items-center gap-2 ${albumInbound ? '' : 'justify-end'}`}>
                                  <span className="text-xs text-gray-400">{formatMessageTime(lastMsg.createdAt)}</span>
                                  <Badge variant="outline" className="text-xs bg-gray-50 text-gray-500 border-gray-200">{items.length} photos</Badge>
                                </div>
                                <div className={`rounded-2xl overflow-hidden max-w-full min-w-0 ${albumInbound ? 'bg-white border border-gray-200 rounded-tl-none text-gray-800' : 'bg-emerald-100 text-gray-800 rounded-br-none'}`}>
                                  <div className="grid grid-cols-2 gap-0.5 w-[min(72vw,264px)]">
                                    {shown.map((m: any, idx: number) => {
                                      const src = resolveMediaUrl(m.mediaUrl);
                                      const showOverlay = idx === shown.length - 1 && extra > 0;
                                      // 3-image album: first photo spans the full width so no empty cell is left.
                                      const span = shown.length === 3 && idx === 0 ? 'col-span-2' : '';
                                      return (
                                        <button key={m.id} type="button"
                                          onClick={() => setGallery({ images: items.map((x: any) => resolveMediaUrl(x.mediaUrl)), index: idx })}
                                          className={`relative block bg-gray-100 cursor-pointer ${span}`}>
                                          {/* placeholder shown only if the image fails to load */}
                                          <span className="absolute inset-0 flex items-center justify-center text-gray-300">
                                            <Image className="h-6 w-6" />
                                          </span>
                                          {/* eslint-disable-next-line @next/next/no-img-element */}
                                          <img src={src} alt="image" className="relative w-full h-[130px] object-cover"
                                            onError={e => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }} />
                                          {showOverlay && (
                                            <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-white text-2xl font-bold">+{extra}</div>
                                          )}
                                        </button>
                                      );
                                    })}
                                  </div>
                                  {caption && <p className="text-sm leading-relaxed px-4 py-2.5 max-w-[min(72vw,264px)] whitespace-pre-wrap break-words">{caption}</p>}
                                </div>
                              </div>
                              {!albumInbound && (
                                <div className="w-8 h-8 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center text-xs font-medium flex-shrink-0">ME</div>
                              )}
                              <button
                                onClick={() => { setForwardMsg(lastMsg); setForwardTargets(new Set()); setForwardSearch(''); }}
                                className={`self-center opacity-0 group-hover:opacity-100 flex-shrink-0 h-7 w-7 rounded-full bg-white border border-gray-200 shadow-sm flex items-center justify-center text-gray-400 hover:text-emerald-600 hover:border-emerald-200 transition-all ${albumInbound ? '' : 'order-first'}`}
                                title="Forward"
                              >
                                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 9l3 3m0 0l-3 3m3-3H8m13 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                              </button>
                            </div>
                            </Fragment>
                          );
                        }
                        const msg = group.msg;
                        const isInbound = msg.direction === 'inbound';
                        return (
                          <Fragment key={msg.id}>
                          {separator}
                          <div className={`group flex items-end gap-1.5 ${isInbound ? 'justify-start' : 'justify-end'}`}>
                            {isInbound && (
                              <div className={`w-8 h-8 rounded-full ${getAvatarColor(selectedConv.id)} flex items-center justify-center text-xs font-medium flex-shrink-0`}>
                                {getInitials(selectedConv.customerName, selectedConv.customerPhone)}
                              </div>
                            )}
                            <div className={`max-w-[85%] sm:max-w-[70%] min-w-0 ${isInbound ? '' : 'items-end'} flex flex-col gap-1`}>

                              <div className={`flex items-center gap-2 ${isInbound ? '' : 'justify-end'}`}>
                                <span className="text-xs text-gray-400">{formatMessageTime(msg.createdAt)}</span>
                                {msg.isAiGenerated && (
                                  <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">AI</Badge>
                                )}
                              </div>
                              <div className={`rounded-2xl overflow-hidden max-w-full min-w-0 ${isInbound ? 'bg-white border border-gray-200 rounded-tl-none text-gray-800' : 'bg-emerald-100 text-gray-800 rounded-br-none'}`}>
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
                                          className={`flex items-center gap-2 px-4 py-3 max-w-[260px] hover:opacity-80 text-emerald-700`}>
                                          <FileText className="h-5 w-5 flex-shrink-0" />
                                          <span className="text-sm font-medium truncate min-w-0">{src.split('/').pop()?.split('?')[0]}</span>
                                          <Download className="h-4 w-4 flex-shrink-0 ml-auto" />
                                        </a>
                                      )}
                                    </>
                                  );
                                })()}
                                {msg.content && (
                                  <p className={`text-sm leading-relaxed px-4 py-2.5 whitespace-pre-wrap break-words ${msg.mediaUrl ? 'max-w-[260px]' : ''}`}>{msg.content}</p>
                                )}
                                {msg.transcript && (
                                  <p className="text-xs px-4 pb-2.5 pt-0.5 max-w-[280px] flex items-start gap-1 text-gray-500 italic">
                                    <span className="not-italic flex-shrink-0">🎙</span>
                                    <span className="whitespace-pre-wrap break-words">{msg.transcript}</span>
                                  </p>
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
                              className={`self-center opacity-0 group-hover:opacity-100 flex-shrink-0 h-7 w-7 rounded-full bg-white border border-gray-200 shadow-sm flex items-center justify-center text-gray-400 hover:text-emerald-600 hover:border-emerald-200 transition-all ${isInbound ? '' : 'order-first'}`}
                              title="Forward"
                            >
                              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M13 9l3 3m0 0l-3 3m3-3H8m13 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            </button>
                          </div>
                          </Fragment>
                        );
                      })
                    )}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* Reply Input — sticky bottom on mobile */}
                  <div className="bg-white border-t border-gray-200 p-3 sticky bottom-0 sm:relative flex-shrink-0">
                    {/* AI copilot suggestion — CRR can Send as-is, Edit, or Dismiss */}
                    {suggestion && !isClosed && (
                      <div className="mb-2 rounded-xl border border-violet-200 bg-violet-50/70 p-3">
                        <div className="flex items-center justify-between mb-1.5 gap-2">
                          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                            <span className="flex items-center gap-1 text-[11px] font-bold text-violet-700"><BrainCircuit className="h-3.5 w-3.5" /> AI Suggestion</span>
                            {suggestion.intent && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600">{suggestion.intent}</span>}
                            {suggestion.confidence != null && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600">{Math.round(suggestion.confidence * 100)}% confident</span>}
                          </div>
                          <button onClick={dismissSuggestion} className="text-gray-400 hover:text-gray-600 flex-shrink-0" title="Dismiss"><X className="h-4 w-4" /></button>
                        </div>
                        <p className="text-sm text-gray-800 whitespace-pre-wrap break-words mb-2.5 max-h-40 overflow-y-auto">{suggestion.suggestedText}</p>
                        <div className="flex items-center gap-2">
                          <button onClick={sendSuggestion} disabled={suggestionBusy}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200 disabled:opacity-50">
                            <Send className="h-3.5 w-3.5" /> {suggestionBusy ? 'Sending…' : 'Send'}
                          </button>
                          <button onClick={editSuggestion} disabled={suggestionBusy}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-violet-700 bg-white border border-violet-200 rounded-lg hover:bg-violet-50 disabled:opacity-50">
                            <Edit className="h-3.5 w-3.5" /> Edit
                          </button>
                          <button onClick={dismissSuggestion} disabled={suggestionBusy}
                            className="px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-700">Dismiss</button>
                        </div>
                      </div>
                    )}
                    {isClosed ? (
                      <div className="flex flex-col sm:flex-row items-center justify-center gap-2 py-1">
                        <p className="text-sm text-gray-400">This conversation is closed.</p>
                        <button onClick={handleReopen}
                          className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200 active:scale-95 transition-all">
                          <RefreshCw className="h-3.5 w-3.5" /> Reopen to reply
                        </button>
                      </div>
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
                                  <div className="h-full bg-emerald-500 rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
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
                              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg border border-emerald-200 active:scale-95 transition-all"
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
                                          className="w-full text-left px-3 py-2.5 hover:bg-emerald-50 transition-colors border-b border-gray-50 last:border-0">
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

                          {/* Catalog */}
                          <button
                            onClick={openCatalogPicker}
                            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg border border-amber-200 active:scale-95 transition-all"
                            title="Send images from a catalog"
                          >
                            <Layers className="h-3.5 w-3.5" />
                            Catalog
                          </button>

                          {/* Attachment picker */}
                          <div className="relative" ref={attachMenuRef}>
                            <button
                              onClick={() => setShowAttachMenu(v => !v)}
                              className={`p-1.5 rounded-lg border transition-all ${showAttachMenu || attachmentFile ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : 'border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700'}`}
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

                        {/* Text + send row — items-center so the send button sits centred against the
                            fixed-height input (items-end left it hanging at the bottom, looking misaligned) */}
                        <div className="flex items-center gap-2">
                          <textarea
                            value={replyText}
                            onChange={e => setReplyText(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder={attachmentFile ? 'Add a caption… (optional)' : 'Type a message…'}
                            rows={2}
                            className="flex-1 resize-none rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                          />
                          <Button
                            onClick={handleSendReply}
                            disabled={(!replyText.trim() && attachmentFiles.length === 0) || sending || uploading}
                            className="bg-emerald-100 hover:bg-emerald-200 text-emerald-700 rounded-xl h-10 w-10 p-0 flex items-center justify-center flex-shrink-0"
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
                          <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
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
                            className="bg-emerald-100 hover:bg-emerald-200 text-emerald-700 gap-2"
                          >
                            <BrainCircuit className="h-4 w-4" />
                            Generate Summary
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {showNotesPanel && (
                  <div className="w-72 border-l border-gray-200 bg-gray-50 flex flex-col flex-shrink-0">
                    <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-white">
                      <div className="flex items-center gap-2">
                        <FileText className="h-5 w-5 text-blue-600" />
                        <h3 className="text-sm font-semibold text-gray-900">Notes</h3>
                      </div>
                      <button
                        onClick={() => setShowNotesPanel(false)}
                        className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 flex flex-col">
                      <p className="text-xs text-gray-500 mb-2">
                        Private notes for this chat — visible to the team, never sent to the customer.
                      </p>
                      {notesLoading ? (
                        <div className="flex items-center justify-center py-12">
                          <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
                        </div>
                      ) : (
                        <>
                          <textarea
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            placeholder="e.g. Customer wants pastel sets under ₹800, called on 9-16, will confirm order tomorrow…"
                            className="flex-1 min-h-[200px] w-full resize-none rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400"
                          />
                          <Button
                            size="sm"
                            onClick={handleSaveNotes}
                            disabled={savingNotes}
                            className="mt-3 bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
                          >
                            {savingNotes ? (
                              <><RefreshCw className="h-4 w-4 animate-spin" /> Saving…</>
                            ) : (
                              <><Check className="h-4 w-4" /> Save Notes</>
                            )}
                          </Button>
                        </>
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

      {/* ── Image Gallery / Lightbox ── (portaled to body so it sits above the app header/chrome) */}
      {gallery && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[200] bg-black/90 flex flex-col select-none"
          onClick={() => setGallery(null)}>
          {/* Top bar — counter (centre) + download/close (right); own row so nothing overlaps the image */}
          <div className="relative flex-shrink-0 h-14 flex items-center justify-center px-3" onClick={e => e.stopPropagation()}>
            <span className="text-white/90 text-sm font-medium">{gallery.index + 1} / {gallery.images.length}</span>
            <div className="absolute right-3 flex items-center gap-2">
              <a href={gallery.images[gallery.index]} target="_blank" rel="noreferrer" download
                className="h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center">
                <Download className="h-5 w-5" />
              </a>
              <button onClick={() => setGallery(null)} aria-label="Close"
                className="h-10 w-10 rounded-full bg-white/15 hover:bg-white/30 text-white flex items-center justify-center ring-1 ring-white/30">
                <X className="h-6 w-6" />
              </button>
            </div>
          </div>

          {/* Image area — flex-1 so the image fits between the top bar and filmstrip without overlap */}
          <div className="flex-1 min-h-0 relative flex items-center justify-center px-2">
            {gallery.index > 0 && (
              <button onClick={e => { e.stopPropagation(); setGallery(g => g && { ...g, index: g.index - 1 }); }}
                className="absolute left-2 sm:left-6 z-10 h-11 w-11 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center">
                <ChevronLeft className="h-7 w-7" />
              </button>
            )}
            {/* current image — supports swipe left/right on touch devices */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={gallery.images[gallery.index]} alt={`photo ${gallery.index + 1}`}
              onClick={e => e.stopPropagation()}
              onTouchStart={e => { swipeStartX.current = e.touches[0].clientX; }}
              onTouchEnd={e => {
                const start = swipeStartX.current;
                swipeStartX.current = null;
                if (start == null) return;
                const dx = e.changedTouches[0].clientX - start;
                if (Math.abs(dx) < 40) return;
                setGallery(g => {
                  if (!g) return g;
                  if (dx < 0 && g.index < g.images.length - 1) return { ...g, index: g.index + 1 };
                  if (dx > 0 && g.index > 0) return { ...g, index: g.index - 1 };
                  return g;
                });
              }}
              className="max-h-full max-w-full object-contain rounded-lg shadow-2xl" />
            {gallery.index < gallery.images.length - 1 && (
              <button onClick={e => { e.stopPropagation(); setGallery(g => g && { ...g, index: g.index + 1 }); }}
                className="absolute right-2 sm:right-6 z-10 h-11 w-11 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center">
                <ChevronRight className="h-7 w-7" />
              </button>
            )}
          </div>

          {/* thumbnail filmstrip — its own row at the bottom */}
          {gallery.images.length > 1 && (
            <div className="flex-shrink-0 bg-black/50 px-3 py-2.5 overflow-x-auto"
              onClick={e => e.stopPropagation()}>
              <div className="flex gap-2 w-max mx-auto">
                {gallery.images.map((img, i) => (
                  <button key={i} type="button"
                    ref={i === gallery.index ? activeThumbRef : null}
                    onClick={() => setGallery(g => g && { ...g, index: i })}
                    className={`relative flex-shrink-0 h-14 w-14 rounded-md overflow-hidden border-2 transition-all ${
                      i === gallery.index
                        ? 'border-green-400 ring-2 ring-green-400/40'
                        : 'border-transparent opacity-50 hover:opacity-100'
                    }`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img} alt={`thumbnail ${i + 1}`} className="w-full h-full object-cover"
                      onError={e => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }} />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>,
        document.body
      )}

      {/* ── Forward Message Modal ── (portaled so it sits above the app header/chrome) */}
      {forwardMsg && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 bg-black/50 z-[190] flex items-center justify-center p-4" onClick={() => setForwardMsg(null)}>
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
                  className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400" />
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
                      className="h-4 w-4 rounded border-gray-300 text-emerald-600" />
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
                  className="px-4 py-2 text-sm bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200 disabled:opacity-50 font-medium">
                  {forwarding ? 'Forwarding…' : `Forward${forwardTargets.size > 0 ? ` (${forwardTargets.size})` : ''}`}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Catalog send picker ── */}
      {catalogPickerOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[190] flex items-center justify-center p-4" onClick={() => setCatalogPickerOpen(false)}>
          <div className="w-full max-w-3xl max-h-[88vh] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-amber-50">
              <div className="flex items-center gap-2 min-w-0">
                {catalogView && (
                  <button onClick={() => { setCatalogView(null); setCatalogSelUrls(new Set()); }} className="text-amber-700 hover:text-amber-900" title="Back">
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                )}
                <Layers className="h-4 w-4 text-amber-600 flex-shrink-0" />
                <h3 className="text-base font-bold text-amber-700 truncate">
                  {catalogView ? catalogView.name : 'Send from Catalog'}
                </h3>
              </div>
              <button onClick={() => setCatalogPickerOpen(false)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-4">
              {catalogLoading ? (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="aspect-square rounded-xl bg-gray-100 animate-pulse" />)}</div>
              ) : !catalogView ? (
                // Catalog list
                catalogList.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <Layers className="h-9 w-9 text-gray-300 mb-2" />
                    <p className="text-sm font-semibold text-gray-700">No catalogs yet</p>
                    <p className="text-xs text-gray-400">Create catalogs from the Gallery → Catalogs tab</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {catalogList.map((c: any) => (
                      <button key={c.id} onClick={() => openCatalogView(c)}
                        className="group text-left rounded-xl border border-gray-200 bg-white overflow-hidden hover:shadow-md hover:border-amber-300 transition-all">
                        <div className="aspect-[4/3] bg-gray-100 relative">
                          {c.coverUrl ? <img src={catalogResolveUrl(c.coverUrl)} alt="" className="h-full w-full object-cover" /> : <div className="h-full w-full flex items-center justify-center"><Layers className="h-7 w-7 text-gray-300" /></div>}
                          <span className="absolute bottom-1.5 left-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-black/60 text-white">{c.itemCount}</span>
                        </div>
                        <div className="p-2.5">
                          <p className="text-sm font-semibold text-gray-900 truncate">{c.name}</p>
                          {c.info && <p className="text-[11px] text-gray-400 truncate">{c.info}</p>}
                        </div>
                      </button>
                    ))}
                  </div>
                )
              ) : (
                // Catalog images with selection
                catalogView.items.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <Layers className="h-9 w-9 text-gray-300 mb-2" />
                    <p className="text-sm font-semibold text-gray-700">This catalog has no images</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                    {catalogView.items.map((it: any) => {
                      const sel = catalogSelUrls.has(it.mediaUrl);
                      return (
                        <button key={it.id} onClick={() => toggleCatalogImg(it.mediaUrl)}
                          className={`group relative aspect-square rounded-xl overflow-hidden bg-gray-100 border transition-all ${sel ? 'border-amber-500 ring-2 ring-amber-400' : 'border-gray-200 hover:border-amber-300'}`}>
                          <img src={catalogResolveUrl(it.mediaUrl)} alt="" loading="lazy" className="h-full w-full object-cover" />
                          <span className={`absolute bottom-1.5 right-1.5 h-5 w-5 rounded-md flex items-center justify-center border-2 ${sel ? 'bg-amber-500 border-amber-500' : 'bg-white/70 border-white'}`}>
                            {sel && <Check className="h-3.5 w-3.5 text-white" />}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )
              )}
            </div>

            {/* Footer (only in catalog view) */}
            {catalogView && catalogView.items.length > 0 && (
              <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-gray-100 bg-gray-50">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCatalogSelUrls(catalogSelUrls.size === Math.min(catalogView.items.length, 30) ? new Set() : new Set(catalogView.items.slice(0, 30).map((i: any) => i.mediaUrl)))}
                    className="text-xs font-medium text-gray-600 hover:text-gray-800">
                    {catalogSelUrls.size >= Math.min(catalogView.items.length, 30) ? 'Clear' : 'Select all (max 30)'}
                  </button>
                  <span className="text-xs text-gray-400">{catalogSelUrls.size} selected</span>
                </div>
                <button onClick={sendCatalog} disabled={catalogSelUrls.size === 0 || catalogSending}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-amber-100 text-amber-700 rounded-lg hover:bg-amber-200 disabled:opacity-50">
                  <Send className="h-4 w-4" />
                  {catalogSending ? 'Queuing…' : `Send ${catalogSelUrls.size > 0 ? catalogSelUrls.size : ''} to chat`}
                </button>
              </div>
            )}
          </div>
        </div>,
        document.body
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

  const bubbleBg  = isInbound ? 'bg-white border border-gray-200' : 'bg-emerald-100';
  const iconColor = isInbound ? 'text-emerald-600' : 'text-emerald-700';
  const barBg     = isInbound ? 'bg-gray-200' : 'bg-emerald-200';
  const barFill   = isInbound ? 'bg-emerald-500' : 'bg-emerald-500';
  const timeColor = isInbound ? 'text-gray-400' : 'text-gray-500';

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
          isInbound ? 'bg-emerald-50 hover:bg-emerald-100' : 'bg-emerald-200 hover:bg-emerald-300'
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
  const label = mins >= 1440           // ≥ 24h → days + hours
    ? `${Math.floor(mins / 1440)}d ${Math.floor((mins % 1440) / 60)}h`
    : mins >= 60                        // ≥ 1h → hours + minutes
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
  conv, selectedConv, onSelect, getInitials, getAvatarColor, isHighPriority = false, showSession = false,
  selectMode = false, selected = false, onToggleSelect
}: {
  conv: any;
  selectedConv: any;
  onSelect: (conv: any) => void;
  getInitials: (name: string | undefined, phone: string) => string;
  getAvatarColor: (id: number) => string;
  isHighPriority?: boolean;
  showSession?: boolean;
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (conv: any) => void;
}) {
  return (
    <div
      onClick={() => (selectMode ? onToggleSelect?.(conv) : onSelect(conv))}
      className={`p-4 cursor-pointer hover:bg-gray-50 transition border-b border-gray-100 ${
        selected ? 'bg-emerald-100/60' : selectedConv?.id === conv.id ? 'bg-emerald-50' : ''
      } ${isHighPriority ? 'bg-orange-50/30' : ''}`}
    >
      <div className="flex items-start gap-3">
        {selectMode && (
          <div className={`mt-1 h-5 w-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
            selected ? 'bg-emerald-600 border-emerald-600' : 'border-gray-300 bg-white'
          }`}>
            {selected && <Check className="h-3.5 w-3.5 text-white" />}
          </div>
        )}
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
            <h3 className={`text-sm truncate ${conv.isUnread ? 'font-semibold text-gray-900' : 'font-normal text-gray-700'}`}>
              {conv.customerName || conv.customerPhone || 'Unknown Customer'}
            </h3>
            {conv.isUnread && <span className="ml-2 flex-shrink-0 h-2.5 w-2.5 rounded-full bg-emerald-600" />}
          </div>
          <p className="text-xs text-gray-500 mb-0.5">{conv.customerPhone}</p>
          {showSession && conv.businessPhone && (
            <p className="text-[10px] text-emerald-500 font-medium mb-0.5 flex items-center gap-1">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400" />
              {conv.businessPhone}
            </p>
          )}
          <p className={`text-sm truncate mb-1 ${conv.isUnread ? 'text-gray-800' : 'text-gray-600'}`}>{conv.lastMessagePreview}</p>
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
