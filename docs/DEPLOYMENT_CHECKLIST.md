# Deployment Checklist — Tejoo WhatsApp AI Automation

Use this checklist before going live in production.

---

## 1. Database

- [ ] SQL Server 2019+ installed and running
- [ ] Database `Tejoo` created with base schema
- [ ] All 12 migrations applied (003 through 014)
- [ ] 19 tables exist and are populated correctly
- [ ] Connection string tested from backend

**Verify:**
```sql
-- Check table count (expect 19)
SELECT COUNT(*) FROM sys.tables;

-- Key row counts
SELECT 'Users' AS [Table], COUNT(*) AS Rows FROM Users
UNION ALL SELECT 'SystemSettings', COUNT(*) FROM SystemSettings
UNION ALL SELECT 'QuickReplies', COUNT(*) FROM QuickReplies
UNION ALL SELECT 'RolePermissions', COUNT(*) FROM RolePermissions
UNION ALL SELECT 'AiPrompts', COUNT(*) FROM AiPrompts;

-- Check indexes (expect 55)
SELECT COUNT(*) FROM sys.indexes WHERE name LIKE 'IX_%';
```

---

## 2. Backend

- [ ] `appsettings.Production.json` configured (or environment variables set)
- [ ] OpenAI API key moved out of `appsettings.json` into secrets / Key Vault
- [ ] JWT `SecretKey` changed from default (must be 32+ chars)
- [ ] `ASPNETCORE_ENVIRONMENT=Production` set
- [ ] HTTPS configured (certificate in place)
- [ ] `dotnet publish -c Release` runs without errors
- [ ] Health check returns 200: `GET /health`

**appsettings.Production.json template:**
```json
{
  "ConnectionStrings": {
    "DefaultConnection": "Data Source=PROD_SERVER;Initial Catalog=Tejoo;Integrated Security=True;TrustServerCertificate=True;Max Pool Size=200;"
  },
  "OpenAI": {
    "ApiKey": "USE_ENV_VAR_OR_KEY_VAULT",
    "Model": "gpt-4o-mini"
  },
  "Jwt": {
    "SecretKey": "CHANGE_THIS_TO_STRONG_32_CHAR_KEY",
    "Issuer": "TejooWhatsApp",
    "Audience": "TejooWhatsAppClient",
    "ExpiryMinutes": 480
  }
}
```

---

## 3. Frontend — Remove Dev Code

- [ ] **`middleware.ts`** — replace `NextResponse.next()` bypass with real JWT validation
- [ ] **`app/page.tsx`** — replace direct redirect with login check
- [ ] **`app/dashboard/layout.tsx`** — remove `ensureDevUser()` call
- [ ] **`app/dashboard/layout.tsx`** — remove `<DevRoleSwitcher />` component
- [ ] **`components/dev/DevRoleSwitcher.tsx`** — delete the file entirely

**Frontend production build:**
```bash
cd frontend
npm run build   # must complete with 0 errors
npm start
```

- [ ] Set `NEXT_PUBLIC_API_URL` to production backend URL
- [ ] Set `NEXT_PUBLIC_SIGNALR_URL` to production backend URL

---

## 4. Webhook Configuration

### Interakt
- [ ] Set webhook URL in Interakt dashboard: `https://your-domain.com/api/webhook/interakt`
- [ ] Set `InteraktSecret` in appsettings (HMAC secret from Interakt)
- [ ] Set `InteraktHmacSecret` if separate

### Meta / WhatsApp Cloud API
- [ ] Set webhook URL: `https://your-domain.com/api/webhook/meta`
- [ ] Set verify token: `tejoo_webhook_verify_token_2026` (or change and update appsettings)
- [ ] Set `MetaAppSecret` in appsettings
- [ ] Complete Meta app review if needed

---

## 5. SignalR (Real-time Notifications)

- [ ] SignalR hub accessible at `/hubs/notifications`
- [ ] CORS configured to allow frontend origin
- [ ] Sticky sessions / ARR affinity enabled if behind load balancer

---

## 6. Security

- [ ] All API endpoints require JWT (middleware enforced)
- [ ] Webhook signature validation enabled and tested
- [ ] SQL Server login uses minimum required permissions
- [ ] No API keys or secrets in source code or git history
- [ ] HTTPS enforced (HTTP redirects to HTTPS)

---

## 7. SystemSettings (configure via UI or SQL)

After deployment, verify these are set correctly in the `SystemSettings` table:

```sql
SELECT [Key], [Value] FROM SystemSettings ORDER BY [Key];
```

| Key | Recommended Production Value |
|-----|------------------------------|
| `businessHours.enabled` | `true` |
| `businessHours.start` | `09:00` |
| `businessHours.end` | `18:00` |
| `businessHours.timezone` | `Asia/Kolkata` |
| `escalation.enabled` | `true` |
| `escalation.confidenceThreshold` | `70` |
| `autoClose.enabled` | `true` |
| `autoClose.inactiveHours` | `48` |

---

## 8. Post-Deployment Smoke Test

- [ ] Login works with a real user account
- [ ] Webhook test message received and processed
- [ ] AI auto-reply triggers correctly
- [ ] Escalation routes to correct user
- [ ] Notifications appear in real-time
- [ ] Performance page loads with real data
- [ ] Role Management saves and takes effect on next load

---

## Rollback Plan

1. Restore previous backend publish folder
2. Restart IIS Application Pool
3. If DB migration caused issues: run rollback SQL (documented per migration)
