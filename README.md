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
| Backend | ASP.NET Core 8.0, Dapper |
| Database | SQL Server Express (`AAD87525\SQLEXPRESS`, DB: `Tejoo`) |
| AI | OpenAI GPT-4o-mini |
| Real-time | SignalR (`NotificationHub`) |
| WhatsApp | Interakt + Meta (WhatsApp Cloud API) |
| Auth | JWT + BCrypt |

## Project Structure

```
TejooFashion(Dashboard)/
├── backend/
│   ├── Controllers/        # 14 API controllers
│   ├── Services/           # Business logic + background services
│   ├── AI/                 # PromptLoader, PromptRouter, OpenAiClient
│   ├── Repositories/       # 16 Dapper repositories
│   ├── Models/
│   │   ├── Entities/       # 13 DB models
│   │   └── DTOs/           # API contracts
│   ├── Security/           # HMAC webhook validation
│   ├── Utilities/          # DatabaseHelper, Logger
│   ├── Program.cs
│   └── appsettings.json
├── frontend/
│   ├── app/dashboard/      # 13 pages
│   ├── components/         # UI, layout, modals
│   ├── services/api.ts     # All API endpoints
│   └── hooks/              # usePermissions, useSignalR
├── database/
│   └── migrations/         # 12 numbered SQL migrations (all applied)
└── docs/                   # Deployment & implementation guides
```

## Getting Started

### Prerequisites
- .NET 8.0 SDK
- Node.js 18+
- SQL Server 2019+ (Express or full)
- OpenAI API Key
- Interakt or Meta WhatsApp API credentials

### 1. Database Setup

Run migrations in order using sqlcmd:

```bash
# Connect to your SQL Server instance
sqlcmd -S "YOUR_SERVER\SQLEXPRESS" -d Tejoo -i database/migrations/003_add_phone_teamid_to_users.sql
# ... continue through 014_QuickReplies.sql
```

Current server: `AAD87525\SQLEXPRESS`

### 2. Configure Backend

Update `backend/appsettings.json`:

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
  }
}
```

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
| Escalations | `/dashboard/escalations` | All roles |
| Reports & Analytics | `/dashboard/reports` | Admin, HOD, Manager |
| Performance | `/dashboard/performance` | Admin, HOD, Manager |
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
GET  /api/conversations                        List conversations
GET  /api/conversations/{id}                   Get details
POST /api/conversations/{id}/send-message      Send manual message
PUT  /api/conversations/{id}/status            Update status
POST /api/conversations/{id}/close             Mark resolved
POST /api/conversations/{id}/assign            Assign to user
GET  /api/conversations/{id}/summary           AI-generated summary
```

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

### Reports & Performance
```
GET /api/reports/dashboard           Dashboard statistics
GET /api/reports/conversation-trends Conversation trends
GET /api/reports/performance?period=today|week|month  Agent performance
```

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
- Status lifecycle: Pending → Processing → Done/Failed/DeadLetter
- Prevents duplicate processing under load

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
- Parameterized queries via Dapper (no SQL injection)

## Production Checklist

Before going live, see `docs/DEPLOYMENT_CHECKLIST.md`. Key items:
- [ ] Enable JWT auth in `middleware.ts` (currently bypassed for dev)
- [ ] Remove `<DevRoleSwitcher />` from dashboard layout
- [ ] Remove `ensureDevUser()` from dashboard layout
- [ ] Move OpenAI API key to environment variable / Azure Key Vault
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

**Tejoo Fashions — Internal Use Only**
