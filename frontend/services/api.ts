import axios from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('authToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle errors
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Redirect to login
      if (typeof window !== 'undefined') {
        localStorage.removeItem('authToken');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default apiClient;

// API Service Methods
export const authApi = {
  login: (email: string, password: string) =>
    apiClient.post('/users/login', { email, password }),

  getCurrentUser: () =>
    apiClient.get('/users/me'),
};

export const dashboardApi = {
  getStats: () =>
    apiClient.get('/reports/dashboard'),

  getConversationTrends: (days: number = 7) =>
    apiClient.get(`/reports/conversation-trends?days=${days}`),

  getSessionActivity: () =>
    apiClient.get('/reports/session-activity'),

  getAgentStats: () =>
    apiClient.get('/reports/agent-stats'),

  getPerformance: (period: 'today' | 'week' | 'month' = 'today') =>
    apiClient.get(`/reports/performance?period=${period}`),

  getHourlyDistribution: (days: number = 7) =>
    apiClient.get(`/reports/hourly-distribution?days=${days}`),

  getTopCustomers: (days: number = 7, top: number = 10) =>
    apiClient.get(`/reports/top-customers?days=${days}&top=${top}`),
};

export const settingsApi = {
  getEscalationPolicy: () =>
    apiClient.get('/settings/escalation-policy'),

  updateEscalationPolicy: (mode: string, confidenceThreshold: number) =>
    apiClient.put('/settings/escalation-policy', { mode, confidenceThreshold }),

  getBusinessHours: () =>
    apiClient.get('/settings/business-hours'),

  updateBusinessHours: (data: { enabled: boolean; start: string; end: string; timezone: string }) =>
    apiClient.put('/settings/business-hours', data),

  getAutoClose: () =>
    apiClient.get('/settings/auto-close'),

  updateAutoClose: (enabled: boolean, inactiveHours: number) =>
    apiClient.put('/settings/auto-close', { enabled, inactiveHours }),
};

export const conversationsApi = {
  getAll: (status?: string, assignedUserId?: number, sessionId?: number, limit = 200, offset = 0) => {
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (assignedUserId) params.append('assignedUserId', assignedUserId.toString());
    if (sessionId) params.append('sessionId', sessionId.toString());
    params.append('limit', limit.toString());
    params.append('offset', offset.toString());
    return apiClient.get(`/conversations?${params}`);
  },

  getById: (id: number) =>
    apiClient.get(`/conversations/${id}`),

  sendMessage: (id: number, content: string, messageType: string = 'text', mediaUrl?: string) =>
    apiClient.post(`/conversations/${id}/send-message`, { content, messageType, mediaUrl }),

  uploadMedia: (id: number, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return apiClient.post(`/conversations/${id}/upload-media`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  updateStatus: (id: number, status: string) =>
    apiClient.put(`/conversations/${id}/status`, { status }),

  close: (id: number) =>
    apiClient.post(`/conversations/${id}/close`),

  assign: (id: number, assignedUserId: number) =>
    apiClient.put(`/conversations/${id}/assign`, { assignedUserId }),

  search: (q: string, limit: number = 30, assignedUserId?: number) => {
    const params = new URLSearchParams({ q, limit: limit.toString() });
    if (assignedUserId) params.append('assignedUserId', assignedUserId.toString());
    return apiClient.get(`/conversations/search?${params}`);
  },

  getSummary: (id: number) =>
    apiClient.get(`/conversations/${id}/summary`),

  generateSummary: (id: number) =>
    apiClient.post(`/conversations/${id}/summarize`),
};

export const messagesApi = {
  getByConversation: (conversationId: number, limit: number = 50) =>
    apiClient.get(`/messages/conversation/${conversationId}?limit=${limit}`),
};

export const escalationsApi = {
  getAll: (status?: string, escalatedToUserId?: number) => {
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (escalatedToUserId) params.append('escalatedToUserId', escalatedToUserId.toString());
    return apiClient.get(`/escalations?${params}`);
  },

  create: (data: any) =>
    apiClient.post('/escalations', data),

  resolve: (id: number, resolutionNotes?: string) =>
    apiClient.post(`/escalations/${id}/resolve`, { resolutionNotes }),
};

export const escalationRulesApi = {
  getAll: () =>
    apiClient.get('/escalationrules'),

  getById: (id: number) =>
    apiClient.get(`/escalationrules/${id}`),

  create: (data: any) =>
    apiClient.post('/escalationrules', data),

  update: (id: number, data: any) =>
    apiClient.put(`/escalationrules/${id}`, data),

  delete: (id: number) =>
    apiClient.delete(`/escalationrules/${id}`),

  toggleActive: (id: number, isActive: boolean) =>
    apiClient.patch(`/escalationrules/${id}/toggle`, { isActive }),
};

export const sessionsApi = {
  getAll: (isActive?: boolean, assignedUserId?: number) => {
    const p = new URLSearchParams();
    if (isActive !== undefined) p.append('isActive', isActive.toString());
    if (assignedUserId !== undefined) p.append('assignedUserId', assignedUserId.toString());
    const qs = p.toString();
    return apiClient.get(`/whatsappsessions${qs ? '?' + qs : ''}`);
  },

  getById: (id: number) =>
    apiClient.get(`/whatsappsessions/${id}`),

  create: (data: any) =>
    apiClient.post('/whatsappsessions', data),

  update: (id: number, data: any) =>
    apiClient.put(`/whatsappsessions/${id}`, data),

  delete: (id: number) =>
    apiClient.delete(`/whatsappsessions/${id}`),

  testConnection: (payload: any) =>
    apiClient.post('/whatsappsessions/test-connection', payload),

  sendTestMessage: (sessionId: number, phone: string, message: string) =>
    apiClient.post(`/whatsappsessions/${sessionId}/send-test`, { phone, message }),
};

export const usersApi = {
  getAll: (isActive?: boolean, role?: string) => {
    const params = new URLSearchParams();
    if (isActive !== undefined) params.append('isActive', isActive.toString());
    if (role) params.append('role', role);
    return apiClient.get(`/users?${params}`);
  },

  getById: (id: number) =>
    apiClient.get(`/users/${id}`),

  create: (data: any) =>
    apiClient.post('/users', data),

  update: (id: number, data: any) =>
    apiClient.put(`/users/${id}`, data),

  delete: (id: number) =>
    apiClient.delete(`/users/${id}`),

  updateProfile: (id: number, data: { fullName: string; email: string; phone?: string }) =>
    apiClient.put(`/users/${id}`, data),

  changePassword: (id: number, data: { currentPassword: string; newPassword: string }) =>
    apiClient.post(`/users/${id}/change-password`, data),
};

export const teamsApi = {
  getAll: (isActive?: boolean) => {
    const params = isActive !== undefined ? `?isActive=${isActive}` : '';
    return apiClient.get(`/teams${params}`);
  },

  getById: (id: number) =>
    apiClient.get(`/teams/${id}`),

  create: (data: any) =>
    apiClient.post('/teams', data),

  update: (id: number, data: any) =>
    apiClient.put(`/teams/${id}`, data),

  delete: (id: number) =>
    apiClient.delete(`/teams/${id}`),

  // Team Members Management
  getMembers: (teamId: number) =>
    apiClient.get(`/teams/${teamId}/members`),

  getAvailableUsers: (teamId: number) =>
    apiClient.get(`/teams/${teamId}/available-users`),

  addMember: (teamId: number, data: { userId: number; roleInTeam: string; managerId?: number }) =>
    apiClient.post(`/teams/${teamId}/members`, data),

  updateMember: (teamId: number, memberId: number, data: { roleInTeam?: string; managerId?: number | null; updateManager?: boolean }) =>
    apiClient.put(`/teams/${teamId}/members/${memberId}`, data),

  removeMember: (teamId: number, userId: number) =>
    apiClient.delete(`/teams/${teamId}/members/${userId}`),

  getHierarchy: (teamId: number) =>
    apiClient.get(`/teams/${teamId}/tree`),
};

export const aiPromptsApi = {
  getAll: () =>
    apiClient.get('/aiprompts'),

  update: (id: number, data: { systemPrompt: string; description?: string; isActive?: boolean }) =>
    apiClient.put(`/aiprompts/${id}`, data),

  toggle: (id: number, isActive: boolean) =>
    apiClient.post(`/aiprompts/${id}/toggle`, { isActive }),
};

export const quickRepliesApi = {
  getAll: () =>
    apiClient.get('/quickreplies'),

  create: (data: { title: string; content: string; category?: string }) =>
    apiClient.post('/quickreplies', data),

  update: (id: number, data: { title: string; content: string; category?: string }) =>
    apiClient.put(`/quickreplies/${id}`, data),

  delete: (id: number) =>
    apiClient.delete(`/quickreplies/${id}`),
};

export const rolePermissionsApi = {
  // Get all permissions grouped by role: { Admin: { overview: true, ... }, ... }
  getAll: () =>
    apiClient.get('/rolepermissions'),

  // Get accessible pages for a specific role
  getPages: (role: string) =>
    apiClient.get(`/rolepermissions/${encodeURIComponent(role)}/pages`),

  // Upsert a single permission
  upsert: (role: string, page: string, canAccess: boolean) =>
    apiClient.post('/rolepermissions', { role, page, canAccess }),

  // Bulk update all pages for a role
  bulkUpdate: (role: string, pageAccess: Record<string, boolean>) =>
    apiClient.put(`/rolepermissions/${encodeURIComponent(role)}`, pageAccess),
};

export const customersApi = {
  getAll: (search?: string, page = 1, pageSize = 50) => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (search) params.append('search', search);
    return apiClient.get(`/customers?${params}`);
  },
  getById: (id: number) => apiClient.get(`/customers/${id}`),
  getByPhone: (phone: string) => apiClient.get(`/customers/phone/${encodeURIComponent(phone)}`),
  getConversations: (id: number) => apiClient.get(`/customers/${id}/conversations`),
  update: (id: number, data: { name?: string; email?: string; notes?: string }) =>
    apiClient.put(`/customers/${id}`, data),
  getStats: () => apiClient.get('/customers/stats'),
  getTags:    (id: number) => apiClient.get(`/customers/${id}/tags`),
  addTag:     (id: number, tagId: number) => apiClient.post(`/customers/${id}/tags/${tagId}`),
  removeTag:  (id: number, tagId: number) => apiClient.delete(`/customers/${id}/tags/${tagId}`),
};

export const tagsApi = {
  getAll: (type?: 'conversation' | 'customer') => apiClient.get(`/tags${type ? `?type=${type}` : ''}`),
  create: (name: string, color?: string) => apiClient.post('/tags', { name, color }),
  delete: (id: number) => apiClient.delete(`/tags/${id}`),
  getByConversation: (conversationId: number) => apiClient.get(`/tags/conversation/${conversationId}`),
  addToConversation: (conversationId: number, tagId: number, userId?: number) =>
    apiClient.post(`/tags/conversation/${conversationId}/${tagId}${userId ? `?userId=${userId}` : ''}`),
  removeFromConversation: (conversationId: number, tagId: number) =>
    apiClient.delete(`/tags/conversation/${conversationId}/${tagId}`),
};

export const teamEscalationPoliciesApi = {
  getAll: () => apiClient.get('/team-escalation-policies'),
  upsert: (teamId: number, data: { crrTimeoutMinutes: number; managerTimeoutMinutes: number; hodTimeoutMinutes: number; isActive: boolean }) =>
    apiClient.put(`/team-escalation-policies/${teamId}`, data),
};

export const aiBypassApi = {
  getAll: () => apiClient.get('/aibypass'),
  add: (data: { phone: string; name?: string; reason?: string; type?: string }) =>
    apiClient.post('/aibypass', data),
  bulkAdd: (entries: { phone: string; name?: string; type?: string }[]) =>
    apiClient.post('/aibypass/bulk', { entries }),
  delete: (id: number) => apiClient.delete(`/aibypass/${id}`),
  toggle: (id: number, isActive: boolean) =>
    apiClient.patch(`/aibypass/${id}/toggle`, { isActive }),
};

export const auditLogsApi = {
  getAll: (params: { page?: number; pageSize?: number; action?: string; entityType?: string; userId?: number; from?: string; to?: string } = {}) => {
    const p = new URLSearchParams();
    if (params.page) p.append('page', String(params.page));
    if (params.pageSize) p.append('pageSize', String(params.pageSize));
    if (params.action) p.append('action', params.action);
    if (params.entityType) p.append('entityType', params.entityType);
    if (params.userId) p.append('userId', String(params.userId));
    if (params.from) p.append('from', params.from);
    if (params.to) p.append('to', params.to);
    return apiClient.get(`/auditlogs?${p}`);
  },
};

export const searchApi = {
  search: (q: string, limit = 20) =>
    apiClient.get(`/search?q=${encodeURIComponent(q)}&limit=${limit}`),
};

export const webhookLogsApi = {
  getAll: (params: { page?: number; pageSize?: number; provider?: string; success?: boolean } = {}) => {
    const p = new URLSearchParams();
    if (params.page) p.append('page', String(params.page));
    if (params.pageSize) p.append('pageSize', String(params.pageSize));
    if (params.provider) p.append('provider', params.provider);
    if (params.success !== undefined) p.append('success', String(params.success));
    return apiClient.get(`/webhooklogs?${p}`);
  },
};

// Notifications API
export const notificationsApi = {
  // Get notifications for a user
  getUserNotifications: (userId: number, unreadOnly: boolean = false, limit: number = 50) =>
    apiClient.get(`/notifications/user/${userId}?unreadOnly=${unreadOnly}&limit=${limit}`),

  // Get unread count
  getUnreadCount: (userId: number) =>
    apiClient.get(`/notifications/user/${userId}/unread-count`),

  // Mark single notification as read
  markAsRead: (notificationId: number) =>
    apiClient.post(`/notifications/${notificationId}/read`),

  // Mark all as read
  markAllAsRead: (userId: number) =>
    apiClient.post(`/notifications/user/${userId}/read-all`),

  // Mark conversation as viewed (for unread tracking)
  markConversationViewed: (conversationId: number, userId: number) =>
    apiClient.post(`/notifications/conversation/${conversationId}/view?userId=${userId}`),

  // Get unread message count for a conversation
  getConversationUnreadCount: (conversationId: number, userId: number) =>
    apiClient.get(`/notifications/conversation/${conversationId}/unread?userId=${userId}`),

  // Get all unread conversations for a user
  getUnreadConversations: (userId: number) =>
    apiClient.get(`/notifications/user/${userId}/unread-conversations`),
};
