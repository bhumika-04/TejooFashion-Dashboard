# Tejoo WhatsApp AI Automation Platform

Enterprise-grade WhatsApp orchestration dashboard for Tejoo Fashions — managing business numbers, AI-driven replies, hierarchical escalation, and real-time conversation management.

## Architecture

```
Customer → WhatsApp → BSP (Interakt/Meta) → Webhook → Backend (ASP.NET Core)
                                                            ↓
                                                    SQL-backed Message Queue
                                                            ↓
                                                    WhatsApp Orchestrator
                                                    ├── Business Hours Gate
                                                    ├── AI Router → Specialist Prompts (OpenAI)
                                                    ├── Escalation Service
                                                    └── Notification Hub (SignalR)
                                                            ↓
                                                    Next.js Dashboard (Frontend)
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind CSS |
| Backend | ASP.NET Core (.NET 10), raw ADO.NET (`Microsoft.Data.SqlClient`) |
| Migrations | DbUp — auto-runs embedded SQL scripts on startup |
| Database | SQL Server Express (`AAD87525\SQLEXPRESS`, DB: `Tejoo`) |
| AI | OpenAI GPT-4o-mini |
| Real-time | SignalR (`NotificationHub`) |
| WhatsApp | Interakt + Meta (WhatsApp Cloud API) |
| Auth | JWT + BCrypt |

## Project Structure

```
TejooFashion(Dashboard)/
├── backend/
│   ├── Controllers/        # 23 API controllers
│   ├── Services/           # Business logic + background services
│   ├── AI/                 # PromptLoader, PromptRouter, OpenAiClient
│   ├── Repositories/       # 21 data repositories (raw ADO.NET via DatabaseHelper)
│   ├── Models/
│   │   ├── Entities/       # DB models
│   │   └── DTOs/           # API contracts
│   ├── Security/           # HMAC webhook validation
│   ├── Utilities/          # DatabaseHelper, Logger
│   ├── Program.cs
│   └── appsettings.json
├── frontend/
│   ├── app/dashboard/      # 19 pages
│   ├── components/         # UI, layout, modals
│   ├── services/api.ts     # All API endpoints
│   └── hooks/              # usePermissions, useSignalR
└── docs/                   # Deployment checklist + client deck (.pptx)
```

> **Note:** the `database/migrations/` folder has been removed — the schema is fully applied to the live DB; regenerate a full script from the live database when standing up a new environment (DbUp still runs any `..\database\migrations\*.sql` it finds at build time, currently none). See *Pending / Known Limitations*.

## Getting Started

### Prerequisites
- .NET 10.0 SDK
- Node.js 18+
- SQL Server 2019+ (Express or full)
- OpenAI API Key
- Interakt or Meta WhatsApp API credentials

### 1. Configure Backend

The real `backend/appsettings.json` is gitignored (it holds secrets). Copy the template and fill in your values:

```bash
cp backend/appsettings.example.json backend/appsettings.json
```

Then edit `backend/appsettings.json`:

```json
{
  "ConnectionStrings": {
    "DefaultConnection": "Data Source=YOUR_SERVER;Initial Catalog=Tejoo;Integrated Security=True;TrustServerCertificate=True"
  },
  "OpenAI": {
    "ApiKey": "sk-your-openai-key",
    "Model": "gpt-4o-mini"
  },
  "Jwt": {
    "SecretKey": "your-32-char-secret-key",
    "Issuer": "TejooWhatsApp",
    "Audience": "TejooWhatsAppClient",
    "ExpiryMinutes": 480
  },
  "Database": {
    "RunMigrationsOnStartup": true
  },
  "ExternalApis": {
    "PublicBaseUrl": "https://your-ngrok-or-public-url"
  }
}
```

> `ExternalApis:PublicBaseUrl` must point to a publicly reachable URL (ngrok in dev). It is used for inbound webhooks and so the WhatsApp BSP can fetch agent-sent media. Free ngrok URLs change on every restart — update this and restart the backend when that happens.

### 2. Database Setup

The schema is already applied to the live DB, and **the `database/migrations/` SQL scripts have been removed**. DbUp still runs on startup (`Database:RunMigrationsOnStartup`, default on) but now finds no embedded scripts, so it no-ops.

- **Existing database:** nothing to do — point `DefaultConnection` at your server and run the backend.
- **Fresh / new database:** there are no migration scripts to build the schema automatically. First generate a full script from the live `Tejoo` database (SSMS → *Tasks → Generate Scripts*, or `mssql-scripter -S "AAD87525\SQLEXPRESS" -d Tejoo --schema-and-data > tejoo_full.sql`), run it against the new DB, **then** start the backend.

To disable the (currently no-op) DbUp pass, set `Database:RunMigrationsOnStartup` to `false`.

### 3. Run Backend

```bash
cd backend
dotnet restore
dotnet run
# API available at http://localhost:5000
```

### 4. Run Frontend

```bash
cd frontend
npm install
npm run dev
# Dashboard at http://localhost:3000
```

## Dashboard Pages

| Page | Route | Access |
|------|-------|--------|
| Overview | `/dashboard/overview` | All roles |
| Sessions | `/dashboard/sessions` | Admin, HOD, Manager |
| Conversations | `/dashboard/conversations` | All roles |
| Customers | `/dashboard/customers` | All roles (CRR: own) |
| Gallery | `/dashboard/gallery` | All roles (CRR: own media) |
| Escalations | `/dashboard/escalations` | All roles |
| Reports & Analytics | `/dashboard/reports` | Admin, HOD, Manager |
| Performance | `/dashboard/performance` | Admin, HOD, Manager |
| Quick Replies | `/dashboard/quick-replies` | All roles |
| Teams | `/dashboard/teams` | Admin, HOD, Manager |
| Users | `/dashboard/users` | Admin, HOD |
| Role Management | `/dashboard/role-management` | Admin only |
| Settings | `/dashboard/settings` | All roles (own profile) |
| Notifications | `/dashboard/notifications` | All roles |
| AI Prompts | `/dashboard/ai-prompts` | Admin only |

## API Endpoints

### Webhooks
```
POST /api/webhook/interakt     Interakt incoming messages
POST /api/webhook/meta         Meta incoming messages
GET  /api/webhook/meta         Meta webhook verification
```

### Conversations
```
GET  /api/conversations?status=&limit=100&offset=  List (paged; status filters server-side; CRR scoped to own)
GET  /api/conversations/count                  Open/Escalated/Closed/Unread counts (same filters)
GET  /api/conversations/search?q=              Search (CRR scoped server-side)
GET  /api/conversations/{id}                   Get details (CRR: 404 if not theirs)
POST /api/conversations/{id}/send-message      Send manual message
PUT  /api/conversations/{id}/status            Update status
POST /api/conversations/{id}/close             Mark resolved
POST /api/conversations/{id}/assign            Assign to user
POST /api/conversations/bulk                   Bulk close/assign/tag (Admin/HOD/Manager)
GET  /api/conversations/{id}/summary           AI-generated summary
```
Bulk body: `{ ids:[…], action:"close"|"assign"|"tag", userId?, tagId? }`. Bulk close updates status only — the background summarizer generates summaries (no per-item OpenAI call).

### Escalations
```
GET  /api/escalations              List escalations
POST /api/escalations              Create escalation
POST /api/escalations/{id}/resolve Resolve escalation
GET  /api/escalation-rules         List rules
POST /api/escalation-rules         Create rule
PUT  /api/escalation-rules/{id}    Update rule
```

### Sessions
```
GET    /api/whatsappsessions           List sessions
POST   /api/whatsappsessions           Add session
PUT    /api/whatsappsessions/{id}      Update session
DELETE /api/whatsappsessions/{id}      Remove session
POST   /api/whatsappsessions/test-connection  Test API key
```

### Users & Teams
```
GET    /api/users               List users
POST   /api/users               Create user
PUT    /api/users/{id}          Update user
DELETE /api/users/{id}          Delete user
POST   /api/users/login         Login
PUT    /api/users/{id}/password Change password

GET    /api/teams               List teams
POST   /api/teams               Create team
POST   /api/teams/{id}/members  Add member
DELETE /api/teams/{id}/members/{userId}  Remove member
GET    /api/teams/{id}/hierarchy  Team hierarchy
```

### Customers
```
GET /api/customers?search=&page=1&pageSize=20&tagId=  List customers (search + tag filter)
GET /api/customers/{id}                               Get customer
GET /api/customers/{id}/conversations                 Customer conversation history
PUT /api/customers/{id}                               Update name/email/notes
GET /api/customers/stats                              Customer KPIs
POST   /api/customers/{id}/tags/{tagId}               Add customer tag
DELETE /api/customers/{id}/tags/{tagId}               Remove customer tag
POST   /api/customers/bulk-tag                         Bulk add/remove a tag on selected customers
```
The Customers page is a **table** (Sr. No. · Mobile · Name · Total Conv · Conv Tag · Customer Tag · Last Status); the list query also returns `TagsRaw` (customer tags), `ConvTagsRaw` (distinct tags across the customer's conversations) and `LastStatus` (status of the latest conversation). A single toolbar holds **search + a Filter dropdown** (the `customer`-type tags as chips → passes `tagId` server-side) **+ CSV Export** (all matching rows). Clicking a row opens the detail in a **popup modal** (portaled above the chrome); paging is server-side via the shared `Pagination` control.

### Gallery
```
GET /api/gallery?type=image&page=1&pageSize=102   Paged media gallery, newest first (CRR scoped to own conversations' media)
```
Returns `{ items:[{ id, mediaUrl, messageType, direction, content, createdAt, conversationId, customerName, customerPhone }], total, page, pageSize }`. `pageSize` is capped at 200. The page renders a responsive thumbnail grid with a lightbox (keyboard nav, "Open chat", "Full size") and server-side paging (102/page). Local `/media/...` URLs are served by the backend; inbound provider (CDN) URLs are returned as-is.

### Reports & Performance
```
GET /api/reports/dashboard                       Dashboard statistics
GET /api/reports/conversation-trends?days=7      Conversation trends (zero-filled date series)
GET /api/reports/hourly-distribution?days=7      Message Activity by Hour (24-row heatmap, IST)
GET /api/reports/top-customers?days=7&top=10     Most active customers
GET /api/reports/response-sla?days=7&slaMinutes=30  First-response-time SLA (overall + per-agent)
GET /api/reports/intent-trends?days=7            Conversation-tag (intent) distribution
GET /api/reports/tag-distribution?type=conversation|customer&days=7  Tag-wise report (conversation or customer tags)
GET /api/reports/resolution?days=7               Resolution & handling: AI/human/no-reply split, escalation rate, by reason/level
GET /api/reports/period-comparison?days=7        Current vs previous window (conversations, inbound, AI, new customers) for ▲/▼ KPI deltas
GET /api/reports/performance?period=today|week|month  Agent performance
```
The "Message Activity by Hour" heatmap has its own **Last 7 / 30 / 90 days** selector (independent of the page-level period). All date/hour reporting buckets in **IST** (UTC + 5:30). The SLA report separates **unanswered** (no recorded outbound — usually replied on the Interakt mobile app) from genuine **late breaches**; unanswered is NOT a breach.

### System / Ops (Admin, HOD)
```
GET  /api/system/queue-health           Inbox queue status + ngrok/public-URL health
POST /api/system/queue/{id}/retry       Re-queue a dead-lettered job
POST /api/system/queue/{id}/discard     Set aside a dead letter (status → Discarded)
```
Surfaces the `InboxMessages` queue: Pending / Processing / Retrying / DeadLetter / Done-today counts, oldest-unprocessed backlog age, and a dead-letter table. The processor auto-reclaims rows stuck in `Processing` for >5 min (crash recovery; safe via `ProviderMessageId` dedup). Processed rows (`Done`/`Discarded`) older than 7 days are purged daily by `MediaCleanupService` so the queue table stays bounded; active rows and dead-letters are kept.

### Settings
```
GET /api/settings/escalation-policy   Get escalation policy
PUT /api/settings/escalation-policy   Save escalation policy
GET /api/settings/business-hours      Get business hours
PUT /api/settings/business-hours      Save business hours
GET /api/settings/auto-close          Get auto-close config
PUT /api/settings/auto-close          Save auto-close config
```

### Quick Replies
```
GET    /api/quickreplies         List templates
POST   /api/quickreplies         Create template
PUT    /api/quickreplies/{id}    Update template
DELETE /api/quickreplies/{id}    Delete template
```

## Key Features

### 1. Multi-Number WhatsApp Management
- Multiple business numbers (Interakt + Meta)
- Per-session auto-reply toggle
- HMAC webhook signature validation

### 2. SQL-Backed Message Queue (Outbox Pattern)
- `InboxMessages` table with atomic batch pickup (UPDLOCK/READPAST)
- Status lifecycle: Pending → Processing → Done / Failed (retries up to MaxRetries) → DeadLetter; admins can Retry or Discard dead letters
- Stale `Processing` rows (>5 min) auto-reclaimed on next pickup (crash recovery)
- Processed rows purged after 7 days to keep the table bounded
- Prevents duplicate processing under load (`ProviderMessageId` idempotency)

### 3. AI-Powered Routing
- Router prompt classifies intent (general, followup, order_status, payment_query)
- Specialist prompts per intent with Tejoo brand knowledge
- Confidence threshold triggers automatic escalation
- Prompt cache with atomic reference swap (thread-safe)

### 4. Hierarchical Escalation
```
CRR → Manager → HOD → Admin
```
- Automatic escalation on low AI confidence
- Manual escalation by any user
- Fallback to first available agent when conversation is unassigned
- Policy persisted to `SystemSettings` table

### 5. Business Hours Gate
- Configurable open/close times with timezone support
- AI auto-reply disabled outside business hours
- Business hours stored in `SystemSettings`

### 6. Auto-Close Conversations
- `ConversationAutoCloseService` runs hourly (background service)
- Configurable inactivity threshold
- Settings stored in `SystemSettings`

### 7. Real-Time Notifications
- SignalR hub for live updates
- Notification bell with unread count
- Full notification page with filtering

### 8. Role-Based Access Control
- Permission matrix per role (Admin/HOD/Manager/CRR/Agent)
- Page-level visibility control stored in `RolePermissions` table
- Admin always has full access

## Database Tables (19 total)

| Table | Purpose |
|-------|---------|
| Users | Team members |
| Teams | Team groupings |
| TeamMembers | User-team relationships |
| WhatsAppSessions | Business phone numbers |
| Conversations | Chat threads |
| Messages | All messages (immutable) |
| Escalations | Escalation tracking |
| EscalationRules | Auto-escalation rule definitions |
| AiPrompts | AI system prompts (cached) |
| ConversationSummaries | AI-generated summaries |
| ConversationViews | Unread tracking per user |
| RolePermissions | Page access control matrix |
| Notifications | User notifications |
| InboxMessages | SQL message queue (outbox) |
| SystemSettings | Key-value config store |
| QuickReplies | Message templates |
| WebhookLogs | Webhook audit trail |

## Webhook Configuration

**Interakt Webhook URL:**
```
https://your-domain.com/api/webhook/interakt
```

**Meta Webhook URL:**
```
https://your-domain.com/api/webhook/meta
```

**Meta Verify Token:** `tejoo_webhook_verify_token_2026`

## Security

- HMAC-SHA256 webhook signature validation (Interakt + Meta)
- BCrypt password hashing
- JWT authentication (configured, enforce in middleware for production)
- Parameterized queries via `Microsoft.Data.SqlClient` (no SQL injection)
- `appsettings.json` (secrets) is gitignored; commit only `appsettings.example.json`

## Production Checklist

Before going live, see `docs/DEPLOYMENT_CHECKLIST.md`. Key items:
- [ ] Enable JWT auth in `middleware.ts` (currently bypassed for dev)
- [ ] Remove `<DevRoleSwitcher />` from dashboard layout
- [ ] Remove `ensureDevUser()` from dashboard layout
- [ ] Provide a production `backend/appsettings.json` with real keys (gitignored — never committed)
- [ ] Set `ExternalApis:PublicBaseUrl` to a stable public domain (not ngrok)
- [ ] Set `ASPNETCORE_ENVIRONMENT=Production`
- [ ] Configure HTTPS

## Troubleshooting

**Webhook not receiving messages:**
1. Check `WebhookLogs` table for errors
2. Verify provider webhook URL is set correctly
3. Check HMAC secret configuration

**AI not responding:**
1. Verify OpenAI API key in `appsettings.json`
2. Check `AutoReplyEnabled` on WhatsApp session
3. Check `businessHours.enabled` in SystemSettings
4. Review AI prompt in `AiPrompts` table

**Database connection issues:**
1. Verify SQL Server is running: `services.msc`
2. Check connection string in `appsettings.json`
3. Test: `sqlcmd -S "AAD87525\SQLEXPRESS" -d Tejoo -Q "SELECT 1"`

---

## Pending / Known Limitations

- **WhatsApp two-way sync — pending Interakt feature (`smb_message_echoes`).** Today we cannot capture messages an agent sends from the **WhatsApp Business mobile app** (only customer-inbound + our own API/template sends are visible), so the dashboard isn't a complete mirror of every conversation. Interakt's product team has **accepted** the `smb_message_echoes` webhook (Meta **Coexistence** — echoes app-sent messages back to the webhook); **ETA ~2–3 weeks** as of Jun 2026. When it lands we must: (1) subscribe to/relay `smb_message_echoes` and store the echoed outbound messages, and (2) optionally subscribe to the separate Coexistence **`history`** webhook to back-fill past chats (fires on the business approving chat-history sharing). Interim: agents reply via the dashboard/API (those are captured). Numbers must be **Coexistence-enabled**, and Interakt must **forward** these events to our webhook URL.
- **Inbound media is not re-hosted locally.** Incoming media is stored as Interakt's CDN URL directly on the message (`Messages.MediaUrl`); we rely on Interakt's CDN expiry. `MediaStorageService.DownloadAndSaveAsync` (download + re-host under `wwwroot/media/`) is built and DI-registered but **not wired into the inbound flow**. Wire it into `WhatsAppOrchestrator` before `SaveInboundMessageAsync` so media is permanent and independent of Interakt's CDN. **Becomes required** once `smb_message_echoes` / Coexistence `history` webhooks land — Meta media URLs are short-lived (≈minutes) and must be downloaded on receipt.

---

**Tejoo Fashions — Internal Use Only**
