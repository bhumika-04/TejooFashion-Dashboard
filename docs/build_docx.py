# -*- coding: utf-8 -*-
"""Generate Tejoo_Fashion_Project_Document.docx natively with python-docx."""
from docx import Document
from docx.shared import Pt, RGBColor, Inches, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

# ---------- palette ----------
INDIGO        = RGBColor(0x43, 0x38, 0xCA)
INDIGO_DARK   = RGBColor(0x37, 0x30, 0xA3)
INDIGO_MID    = RGBColor(0x4F, 0x46, 0xE5)
INDIGO_LIGHT  = RGBColor(0x63, 0x66, 0xF1)
WHITE         = RGBColor(0xFF, 0xFF, 0xFF)
INK           = RGBColor(0x1A, 0x1A, 0x2E)
GREY          = RGBColor(0x94, 0xA3, 0xB8)

# hex fills for shading
HDR_FILL   = "4338CA"   # table header
ALT_FILL   = "EEF2FF"   # zebra
WARN_FILL  = "FEF3C7"
DANGER_FILL= "FEE2E2"
SUCCESS_FILL="D1FAE5"
INFO_FILL  = "EEF2FF"
COVER_FILL = "312E81"
KEY_FILL   = "EEF2FF"

doc = Document()

# ---------- base style ----------
normal = doc.styles['Normal']
normal.font.name = 'Calibri'
normal.font.size = Pt(11)
normal.font.color.rgb = INK

for sec in doc.sections:
    sec.top_margin = Cm(2)
    sec.bottom_margin = Cm(2)
    sec.left_margin = Cm(2.3)
    sec.right_margin = Cm(2.3)

# ---------- helpers ----------
def set_cell_bg(cell, hex_fill):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement('w:shd')
    shd.set(qn('w:val'), 'clear')
    shd.set(qn('w:color'), 'auto')
    shd.set(qn('w:fill'), hex_fill)
    tcPr.append(shd)

def set_cell_border_color(cell, hexc="C7D2FE"):
    tcPr = cell._tc.get_or_add_tcPr()
    borders = OxmlElement('w:tcBorders')
    for edge in ('top', 'left', 'bottom', 'right'):
        el = OxmlElement(f'w:{edge}')
        el.set(qn('w:val'), 'single')
        el.set(qn('w:sz'), '4')
        el.set(qn('w:space'), '0')
        el.set(qn('w:color'), hexc)
        borders.append(el)
    tcPr.append(borders)

def shade_paragraph(p, hex_fill):
    pPr = p._p.get_or_add_pPr()
    shd = OxmlElement('w:shd')
    shd.set(qn('w:val'), 'clear')
    shd.set(qn('w:color'), 'auto')
    shd.set(qn('w:fill'), hex_fill)
    pPr.append(shd)

def left_bar(p, hexc):
    """add a thick left border to a paragraph (callout accent)."""
    pPr = p._p.get_or_add_pPr()
    pbdr = OxmlElement('w:pBdr')
    left = OxmlElement('w:left')
    left.set(qn('w:val'), 'single')
    left.set(qn('w:sz'), '24')
    left.set(qn('w:space'), '8')
    left.set(qn('w:color'), hexc)
    pbdr.append(left)
    pPr.append(pbdr)

def set_run(run, size=11, color=INK, bold=False, italic=False, name='Calibri'):
    run.font.size = Pt(size)
    run.font.color.rgb = color
    run.bold = bold
    run.italic = italic
    run.font.name = name

def add_heading(num_title, level=1):
    p = doc.add_paragraph()
    p.space_before = Pt(16)
    run = p.add_run(num_title)
    if level == 1:
        set_run(run, 20, INDIGO, bold=True)
        # bottom border
        pPr = p._p.get_or_add_pPr()
        pbdr = OxmlElement('w:pBdr')
        bottom = OxmlElement('w:bottom')
        bottom.set(qn('w:val'), 'single')
        bottom.set(qn('w:sz'), '18')
        bottom.set(qn('w:space'), '4')
        bottom.set(qn('w:color'), '4338CA')
        pbdr.append(bottom)
        pPr.append(pbdr)
        p.paragraph_format.space_before = Pt(18)
        p.paragraph_format.space_after = Pt(10)
    elif level == 2:
        set_run(run, 15, INDIGO_DARK, bold=True)
        left_bar(p, '6366F1')
        p.paragraph_format.space_before = Pt(14)
        p.paragraph_format.space_after = Pt(6)
    elif level == 3:
        set_run(run, 12.5, INDIGO_MID, bold=True)
        p.paragraph_format.space_before = Pt(10)
        p.paragraph_format.space_after = Pt(4)
    return p

def add_body(text, size=11, bold=False, italic=False, color=INK, align=None, space_after=8):
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(space_after)
    if align:
        p.alignment = align
    run = p.add_run(text)
    set_run(run, size, color, bold=bold, italic=italic)
    return p

def add_callout(kind, runs):
    """runs: list of (text, bold) tuples. kind in warning/danger/success/info."""
    fill = {'warning': WARN_FILL, 'danger': DANGER_FILL,
            'success': SUCCESS_FILL, 'info': INFO_FILL}[kind]
    bar  = {'warning': 'F59E0B', 'danger': 'EF4444',
            'success': '10B981', 'info': '6366F1'}[kind]
    # single-cell table for a clean shaded box
    tbl = doc.add_table(rows=1, cols=1)
    tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
    cell = tbl.cell(0, 0)
    set_cell_bg(cell, fill)
    # left accent border
    tcPr = cell._tc.get_or_add_tcPr()
    borders = OxmlElement('w:tcBorders')
    l = OxmlElement('w:left')
    l.set(qn('w:val'), 'single'); l.set(qn('w:sz'), '24'); l.set(qn('w:space'), '0'); l.set(qn('w:color'), bar)
    borders.append(l)
    for edge in ('top', 'bottom', 'right'):
        e = OxmlElement(f'w:{edge}')
        e.set(qn('w:val'), 'single'); e.set(qn('w:sz'), '2'); e.set(qn('w:space'), '0'); e.set(qn('w:color'), fill)
        borders.append(e)
    tcPr.append(borders)
    p = cell.paragraphs[0]
    p.paragraph_format.space_after = Pt(2)
    p.paragraph_format.space_before = Pt(2)
    for text, bold in runs:
        if text == '\n':
            p = cell.add_paragraph()
            continue
        r = p.add_run(text)
        set_run(r, 10.5, INK, bold=bold)
    doc.add_paragraph().paragraph_format.space_after = Pt(2)
    return tbl

def add_table(headers, rows, widths=None):
    tbl = doc.add_table(rows=1, cols=len(headers))
    tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
    tbl.autofit = True
    # header row
    hdr = tbl.rows[0].cells
    for i, h in enumerate(headers):
        set_cell_bg(hdr[i], HDR_FILL)
        set_cell_border_color(hdr[i], '4338CA')
        p = hdr[i].paragraphs[0]
        p.paragraph_format.space_after = Pt(2)
        p.paragraph_format.space_before = Pt(2)
        r = p.add_run(h)
        set_run(r, 10, WHITE, bold=True)
    # data rows
    for ridx, row in enumerate(rows):
        cells = tbl.add_row().cells
        for i, val in enumerate(row):
            set_cell_border_color(cells[i], 'C7D2FE')
            if ridx % 2 == 1:
                set_cell_bg(cells[i], ALT_FILL)
            p = cells[i].paragraphs[0]
            p.paragraph_format.space_after = Pt(2)
            p.paragraph_format.space_before = Pt(2)
            # support **bold** lead
            text = str(val)
            if text.startswith('**') and text.endswith('**') and text.count('**') == 2:
                r = p.add_run(text[2:-2]); set_run(r, 10, INK, bold=True)
            else:
                r = p.add_run(text); set_run(r, 10, INK)
    if widths:
        for i, w in enumerate(widths):
            for row in tbl.rows:
                row.cells[i].width = Inches(w)
    return tbl

def add_bullets(items):
    for it in items:
        p = doc.add_paragraph(style='List Bullet')
        p.paragraph_format.space_after = Pt(3)
        # handle leading bold
        if it.startswith('**'):
            end = it.index('**', 2)
            r = p.add_run(it[2:end]); set_run(r, 10.5, INK, bold=True)
            rest = it[end+2:]
            r2 = p.add_run(rest); set_run(r2, 10.5, INK)
        else:
            r = p.add_run(it); set_run(r, 10.5, INK)

def add_numbered(items):
    for it in items:
        p = doc.add_paragraph(style='List Number')
        p.paragraph_format.space_after = Pt(3)
        if it.startswith('**'):
            end = it.index('**', 2)
            r = p.add_run(it[2:end]); set_run(r, 10.5, INK, bold=True)
            r2 = p.add_run(it[end+2:]); set_run(r2, 10.5, INK)
        else:
            r = p.add_run(it); set_run(r, 10.5, INK)

def page_break():
    doc.add_page_break()

# ════════════════════════════ COVER PAGE ════════════════════════════
cover = doc.add_table(rows=1, cols=1)
ccell = cover.cell(0, 0)
set_cell_bg(ccell, COVER_FILL)
# remove default borders -> set to cover fill
set_cell_border_color(ccell, COVER_FILL)
cp = ccell.paragraphs[0]
cp.alignment = WD_ALIGN_PARAGRAPH.CENTER
for _ in range(2):
    ccell.add_paragraph()

def cover_line(cell, text, size, color, bold=False, before=4, after=4):
    p = cell.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_before = Pt(before)
    p.paragraph_format.space_after = Pt(after)
    r = p.add_run(text)
    set_run(r, size, color, bold=bold)
    return p

cover_line(ccell, "CONFIDENTIAL TECHNICAL DOCUMENT", 11, RGBColor(0xA5,0xB4,0xFC), bold=True, before=10)
cover_line(ccell, "TEJOO FASHION", 30, WHITE, bold=True, before=18)
cover_line(ccell, "AI WhatsApp Automation System", 18, RGBColor(0xC7,0xD2,0xFE), bold=True)
cover_line(ccell, "Phase 1 — Project Overview, Risks & Strategic Roadmap", 13, RGBColor(0xE0,0xE7,0xFF), before=8, after=14)
cover_line(ccell, "____________________________", 12, INDIGO_MID, after=12)
cover_line(ccell, "Prepared by:  INDAS Analytics", 12, RGBColor(0xE0,0xE7,0xFF))
cover_line(ccell, "Client:  Tejoo Fashions, Chandni Chowk, New Delhi", 12, RGBColor(0xE0,0xE7,0xFF))
cover_line(ccell, "Date:  May 2026", 12, RGBColor(0xE0,0xE7,0xFF))
cover_line(ccell, "Version:  1.0 — Phase 1 Delivery", 12, RGBColor(0xE0,0xE7,0xFF), after=14)
page_break()

# ════════════════════════════ TABLE OF CONTENTS ════════════════════════════
add_heading("Table of Contents", 2)
toc = [
    "1.  Executive Summary",
    "2.  About Tejoo Fashions",
    "3.  What We Built — Phase 1 Dashboard",
    "4.  ERP Integration Context",
    "5.  Benefits of Phase 1",
    "6.  Limitations — Honest Assessment",
    "7.  Risk Analysis",
    "8.  Strategic Recommendation — Mobile PWA Ecosystem",
    "9.  Phase 1 Technical Roadmap (Detailed)",
    "10. Technology Stack",
    "11. Proposed Phase 2 — 4 Mobile PWA Apps",
    "12. Comparison: Phase 1 vs Phase 2",
    "13. Roles & Responsibilities",
    "14. Conclusion",
]
for t in toc:
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(4)
    r = p.add_run(t); set_run(r, 11.5, INDIGO_DARK, bold=True)
page_break()

# ════════════════════════════ 1. EXEC SUMMARY ════════════════════════════
add_heading("1. Executive Summary", 1)
add_callout('info', [("Strategic Goal: ", True),
    ('"Before bringing customers into the App ecosystem, first make backend communication strong through WhatsApp + AI."', False)])
add_body("Tejoo Fashions is one of India's most prestigious wholesale ethnic wear brands, established in 1965, operating 50,000 sq.ft. from Chandni Chowk, Delhi. With 40–50 active WhatsApp numbers across Sales, CRR, NBD, Collection, Manager, and Return departments, communication was fragmented, manual, and untracked.")
p = doc.add_paragraph(); p.paragraph_format.space_after = Pt(8)
r = p.add_run("Phase 1 "); set_run(r, 11, INK, bold=True)
r = p.add_run("delivers a centralized AI-powered WhatsApp dashboard that brings all conversations under one roof, enables AI auto-responses, and provides real-time visibility for Admins and Managers."); set_run(r, 11, INK)
add_callout('warning', [("⚠ Important: ", True),
    ("While Phase 1 delivers significant value, this document provides an honest assessment of the limitations of the current WhatsApp API-first approach and presents a strategic recommendation to evolve into a Mobile PWA ecosystem in Phase 2.", False)])

# ════════════════════════════ 2. ABOUT ════════════════════════════
add_heading("2. About Tejoo Fashions", 1)
add_table(["Attribute", "Detail"], [
    ["Founded", "1965 — Chandni Chowk, Delhi"],
    ["Founders", "Sh. Tejoo Mal Ji, Sh. Siroo Mal Ji, Sh. Radha Kishan Dass Ji, Sh. Lakhmi Chand Ji"],
    ["Total Space", "50,000 sq.ft. (Chandni Chowk + Kundli Manufacturing)"],
    ["Products", "Sarees, Kurtis, Readymade Suits, Lehengas, Ethnic Gowns, Fabric"],
    ["ERP System", "Genesis ERP — barcode-based inventory, order, payment, dispatch tracking"],
    ["Brands", "Ikshita, Beu Bella, Samskriti (launched 2022)"],
    ["WhatsApp Numbers", "40–50 active (Sales, CRR, NBD, Collection, Manager, Return)"],
    ["B2B Platform", "www.tejoofashions.co.in + VRIDDHY App (Android / iOS)"],
], widths=[1.8, 4.5])
page_break()

# ════════════════════════════ 3. WHAT WE BUILT ════════════════════════════
add_heading("3. What We Built — Phase 1 Dashboard", 1)
add_body("The Phase 1 system is a full-stack web dashboard deployed on the internal network with the following capabilities:")
add_heading("3.1 Core Features Delivered", 3)
add_table(["Feature", "Description"], [
    ["Multi-Session WhatsApp", "Connect 40–50 WhatsApp numbers. Each session has its own webhook URL (?sid=N), auto-reply toggle, and assigned CRR."],
    ["Real-Time Conversations", "Live two-way messaging via SignalR. Messages appear instantly without refresh. Audio, video, image, document support."],
    ["AI Auto-Reply", "Multi-prompt architecture: Router detects intent → Specialist prompt generates reply. All responses in JSON format."],
    ["ERP Intent Engine", "7 AI specialists: General Query, Follow-Up, Order Status, Payment, Dispatch Info, Credit Limit, and custom intents."],
    ["Escalation System", "Time-based auto-escalation: AI → CRR (X min) → Manager → HOD. Per-team configurable timeouts."],
    ["Customer Management", "Customer profiles, tags (New Lead, VIP, Interested, etc.), conversation history, AI summaries."],
    ["Team & Role Management", "Admin, HOD, Manager, CRR roles. Team hierarchy, member management, escalation chains."],
    ["AI Bypass List", "Specific numbers (internal team, opted-out customers) can bypass AI entirely."],
    ["Reports & Analytics", "Daily message volume, AI vs Human split, message activity heatmap, agent performance, top customers."],
    ["Media Handling", "Images, videos, audio (voice notes), documents received and stored. Supports sending multiple images at once."],
    ["Mobile Responsive", "Dashboard works on mobile browsers with stack navigation (session → list → chat). Click-to-call support."],
], widths=[1.9, 4.4])
add_heading("3.2 Technical Stack (Deployed)", 3)
add_table(["Layer", "Technology"], [
    ["Backend", ".NET 8 (ASP.NET Core), C#, Dapper ORM"],
    ["Frontend", "Next.js 14, TypeScript, Tailwind CSS, ShadCN UI"],
    ["Database", "MS SQL Server 2022 (local: AAD87525\\SQLEXPRESS)"],
    ["Real-Time", "SignalR WebSockets"],
    ["AI", "OpenAI GPT-4o-mini (multi-prompt JSON architecture)"],
    ["WhatsApp API", "Interakt (primary) + Meta Cloud API (secondary)"],
    ["Auth", "JWT (8-hour expiry), role-based access control"],
    ["Ngrok", "Tunneling for webhook exposure (development)"],
], widths=[1.8, 4.5])
page_break()

# ════════════════════════════ 4. ERP ════════════════════════════
add_heading("4. ERP Integration Context", 1)
add_callout('info', [("Tejoo Fashions uses Genesis ERP", True),
    (" — a barcode-driven inventory and business management system. Each product has a unique barcode that serves as its primary key across all business operations.", False)])
add_heading("4.1 What Genesis ERP Tracks", 3)
add_table(["Module", "Data Available"], [
    ["Product / Barcode", "Barcode ID (A1201149), Product name, Fabric type, Colour, Size range (M to 3XL), Set quantity, WSP (Wholesale Price)"],
    ["Inventory", "Stock availability, Lot numbers, Reorder levels"],
    ["Orders", "Order number, Customer, Date, Status (Processing / Dispatched / Delivered), Items ordered"],
    ["Dispatch", "LR (Lorry Receipt) number, Courier name, Dispatch date, Tracking link"],
    ["Payments", "Outstanding amount, Pending bills, Payment history, Credit limit, Available balance"],
    ["Customers", "Customer ID, Phone, Address, Purchase history, Account statement"],
], widths=[1.8, 4.5])
add_heading("4.2 AI Integration with ERP", 3)
add_body("The AI system is designed to query Genesis ERP APIs and provide instant answers:")
add_bullets([
    '**"Is barcode A1201149 in stock?"** → AI fetches stock status from ERP',
    '**"What is my order status?"** → AI retrieves dispatch + LR details',
    '**"How much is my outstanding?"** → AI fetches payment balance',
    '**"Share new arrivals"** → AI fetches latest products with images from S3',
])
add_callout('warning', [("⚠ Current Status: ", True),
    ("ERP API integration is architecturally designed and ready in Phase 1 but requires Genesis ERP API access credentials from Tejoo Fashion team to activate live data responses. Currently, AI responses use prompt-based knowledge for general queries.", False)])
page_break()

# ════════════════════════════ 5. BENEFITS ════════════════════════════
add_heading("5. Benefits of Phase 1", 1)
add_callout('success', [("✅ What Phase 1 does well", True),
    (" — These are genuine, measurable benefits already working in production.", False)])
add_table(["#", "Benefit", "Business Impact"], [
    ["1", "Centralized visibility", "Admin can see ALL 40+ WhatsApp conversations in one screen. No more asking \"Did you reply to this customer?\""],
    ["2", "AI handles routine queries 24/7", "General questions (catalogue, pricing range, address, working hours) answered instantly, even at midnight."],
    ["3", "Response time tracking", "SLA timers on each conversation. If CRR doesn't reply in 30 min → auto-escalates to Manager."],
    ["4", "Team accountability", "Every message is logged with agent name, timestamp, and response time. Performance reports available."],
    ["5", "Customer tagging & history", "Tag customers as VIP, New Lead, Hot Lead. Full conversation history visible across all sessions."],
    ["6", "Media management", "Images, videos, voice notes all captured and stored. Agents can send multiple product images at once."],
    ["7", "Role-based access", "CRR sees only their assigned conversations. Manager sees their team. Admin sees everything."],
    ["8", "Forward & share", "Forward any message to multiple conversations — useful for sharing product images to many customers at once."],
    ["9", "Quick Replies", "Pre-defined templates for common responses. CRR can reply in 1 click."],
    ["10", "No customer app needed (yet)", "Customers continue using WhatsApp as normal. No learning curve, no app install required."],
], widths=[0.4, 2.0, 3.9])
page_break()

# ════════════════════════════ 6. LIMITATIONS ════════════════════════════
add_heading("6. Limitations — Honest Assessment", 1)
add_callout('danger', [("⚠ Read This Section Carefully. ", True),
    ("The following are genuine, architectural limitations of the WhatsApp API-first approach. These are not bugs — they are fundamental constraints of how WhatsApp Business API works.", False)])
add_heading("6.1 Critical Limitation: Agent Messages Not Captured", 2)
add_callout('danger', [
    ("🚨 THE MOST IMPORTANT LIMITATION:", True), ('\n', False),
    ("When a CRR or Sales person replies from their ", False), ("mobile phone WhatsApp app or Interakt's native dashboard", True),
    (", that reply is NOT captured in our system. Only messages sent through the Tejoo Dashboard are tracked.", False), ('\n', False),
    ("Why? ", True), ("Interakt does not provide any webhook or API to fetch messages sent by agents. This is a confirmed limitation of their platform — confirmed by their official API documentation and Postman collection.", False), ('\n', False),
    ("Business Impact: ", True), ("Performance metrics (response time, message count) are only accurate for agents who exclusively use the Tejoo Dashboard to reply. Agents on mobile create a \"blind spot\" in analytics.", False),
])
add_heading("6.2 All Limitations Summary", 2)
add_table(["#", "Limitation", "Root Cause", "Business Impact"], [
    ["1", "Agent mobile replies not tracked", "Interakt API does not expose outbound message webhooks", "🔴 High — performance data incomplete"],
    ["2", "No conversation history pull", "Interakt has no GET API for chat history. Only real-time webhooks.", "🔴 High — cannot see past conversations"],
    ["3", "Interakt cost increases with scale", "Interakt charges per session/message above threshold", "🟡 Medium — costs grow with volume"],
    ["4", "AI accuracy limited currently", "ERP APIs not yet connected. AI gives generic responses.", "🟡 Medium — reduces AI value proposition"],
    ["5", "Ngrok dependency", "Production requires a fixed public URL, not ngrok", "🟡 Medium — URL changes on restart"],
    ["6", "No WhatsApp voice/video calls", "Meta/WhatsApp Business API does not support voice/video calls", "🟡 Medium — agents must switch to phone"],
    ["7", "Media URLs expire", "Interakt CDN URLs have SAS tokens (currently valid till 2031)", "🟢 Low — not immediate but future risk"],
    ["8", "24-hour window restriction", "WhatsApp policy: cannot initiate messages unless customer messaged first within 24h", "🟡 Medium — limits outbound campaigns"],
    ["9", "No read receipts for all messages", "WhatsApp only sends delivery/read status for template messages via API", "🟢 Low — minor UX gap"],
    ["10", "Single-device limitation per number", "WhatsApp Business API and mobile app cannot run simultaneously on same number", "🟡 Medium — agents must choose one or the other"],
], widths=[0.35, 1.7, 2.3, 1.95])
page_break()

# ════════════════════════════ 7. RISK ════════════════════════════
add_heading("7. Risk Analysis", 1)
add_heading("7.1 Technical Risks", 2)
add_table(["Risk", "Probability", "Severity", "Mitigation"], [
    ["Interakt changes API or pricing model", "Medium", "High", "Design system to switch to Meta Cloud API directly"],
    ["WhatsApp account banned (spam detection)", "Low", "Critical", "Use only conversational messages, not bulk broadcast"],
    ["ERP API integration delays", "High", "High", "AI works in fallback mode until ERP APIs available"],
    ["Ngrok URL change breaks webhooks", "High", "Medium", "Deploy on AWS EC2 with fixed IP + proper domain"],
    ["Agent adoption resistance", "High", "High", "Training + making dashboard better than mobile app UX"],
], widths=[2.1, 1.0, 0.9, 2.3])
add_heading("7.2 Business Risks", 2)
add_table(["Risk", "Assessment"], [
    ["Dependency on third-party API (Interakt)", "🔴 HIGH RISK — any pricing change, outage, or policy update directly impacts the entire system"],
    ["Incomplete analytics due to mobile replies", "🟡 MEDIUM — management cannot make decisions based on incomplete data"],
    ["No customer-facing product experience", "🟡 MEDIUM — customers cannot browse, order, or track on their own"],
    ["Scalability ceiling", "🟡 MEDIUM — WhatsApp API limits concurrent messages; 40-50 numbers is manageable but growth requires more numbers"],
], widths=[2.3, 4.0])
page_break()

# ════════════════════════════ 8. RECOMMENDATION ════════════════════════════
add_heading("8. Strategic Recommendation — Mobile PWA Ecosystem", 1)
add_callout('info', [("Our Honest Recommendation: ", True),
    ("Phase 1 is a valuable foundation, but for long-term scalability, data ownership, and true digital transformation, Tejoo Fashion must evolve to a 4-App Mobile PWA Ecosystem in Phase 2.", False)])
add_heading("8.1 Why We Recommend the Shift", 2)
add_table(["Reason", "Explanation"], [
    ["Full data ownership", "With your own app, you own ALL data — conversations, orders, media, customer behavior. No third-party dependency."],
    ["All agent messages tracked", "Every reply from every agent goes through YOUR system. 100% accurate performance analytics."],
    ["No API cost escalation", "Your own backend. No per-message fees to Interakt. Cost is fixed (server hosting only)."],
    ["Richer customer experience", "Customers can browse catalogue, check order status, make payments — all from one app."],
    ["ERP deeply integrated", "Barcode scanning, real-time stock, order placement — all connected directly to Genesis ERP."],
    ["Voice & video calling", "WebRTC-based calling built into the app. No WhatsApp dependency for calls."],
    ["Offline capability", "PWA works offline. Sales reps can browse catalogue, take orders even without internet."],
    ["Push notifications", "Real push notifications to every agent's phone for new orders, payments, escalations."],
], widths=[1.9, 4.4])
page_break()

# ════════════════════════════ 9. PHASE 1 ROADMAP ════════════════════════════
add_heading("9. Phase 1 Technical Roadmap (Detailed)", 1)
add_heading("9.1 Scope & Deliverables", 2)
add_heading("Deliverable 1 — WhatsApp AI Automation System", 3)
add_bullets([
    "Multi-Number Integration: ≈ 40–50 active numbers (Sales, CRR, NBD, Collection, Manager, Return)",
    "Conversation-Based API: Two-way real-time messaging",
    "AI Chat Engine: Fetch ERP data for order status, payment reminders, dispatch, returns",
    "AI Training Set: 10 core intents (Order, Payment, Dispatch, Return, Credit Limit, Catalogue, Offer, New Arrival, Follow-up, General Query)",
    "Context Retention: Last 10 messages per thread (English + Hindi hybrid)",
    "Escalation Matrix: Auto-route unresolved queries to the right CRR / Sales / Manager",
    "Reporting: Daily conversation log + AI accuracy tracking (≥ 80%)",
])
add_heading("Deliverable 2 — Admin / Coordinator Dashboard", 3)
add_bullets([
    "QR Scan & Onboarding: Register each number to a role (Sales, CRR, Collection, etc.)",
    "Live Chat View: Connected status, pending replies, escalations",
    "User & Role Mapping: Customer ↔ CRR ↔ Sales ↔ Manager",
    "Action Center: Ping alerts for response delay (1/3 min)",
    "Analytics: Chat volume, response time, top queries for AI improvement",
])
add_heading("Deliverable 3 — ERP API Integration", 3)
add_bullets([
    "Connect to existing Genesis ERP APIs (order, payment, credit limit)",
    'Integrate data into AI replies ("Your order #1234 is dispatched")',
    "Target latency < 10 seconds end-to-end",
])
add_heading("Deliverable 4 — AI Context & Conversation Memory", 3)
add_bullets([
    "Redis-based session memory (stores last 10 messages per thread)",
    "Local SLM ready architecture for future on-prem deployment",
    "GPU workstation setup: 16 GB RAM + 8 GB GPU minimum",
])
add_heading("9.2 Execution Plan (4 Weeks)", 2)
add_table(["Week", "Focus Area", "Key Milestones"], [
    ["Week 1 (1–7 Nov)", "Foundation & Onboarding", "Finalize roles + customer matrix • QR scan & user creation module • Escalation matrix • Dashboard UI finalization"],
    ["Week 2 (8–14 Nov)", "WhatsApp API & AI Core", "Integrate conversation API • Chat reading engine • Train AI (10 intents) • Activate ERP (order, credit limit)"],
    ["Week 3 (15–21 Nov)", "Dashboard & Memory", "Coordinator dashboard • Redis session memory • ERP integration • UAT for Sales/CRR/Collection"],
    ["Week 4 (22–30 Nov)", "Testing & Stabilization", "End-to-end testing • Load 200 parallel chats • AI accuracy ≥ 80% • Phase 1 handover + demo"],
], widths=[1.3, 1.6, 3.4])
add_heading("9.3 Completion Criteria", 2)
add_bullets([
    "✅ All WhatsApp numbers connected via API",
    "✅ AI responds to basic queries from ERP data",
    "✅ Coordinator dashboard live with user + chat logs",
    "✅ Escalation matrix working across teams",
    "✅ AI accuracy ≥ 80%, latency ≤ 1 sec",
    "✅ Daily conversation report available",
])
add_heading("9.4 AI Implementation Approach", 2)
add_table(["Stage", "Method", "Details"], [
    ["Intent Detection", "Rule + LLM hybrid", "Regex first → LLM fallback for 10 intents. Returns JSON: {intent, reason, confidence}"],
    ["Response Generation", "Specialist prompt", "7 specialist prompts (general_query, follow_up, order_status, payment_outstanding, dispatch_info, credit_limit)"],
    ["Escalation Logic", "Confidence + Sentiment", "Escalate if confidence < 0.6 or negative tone detected"],
    ["Context Memory", "Redis List (10 entries)", "Maintains conversation continuity per thread"],
    ["Media Handling", "CDN URL storage", "Images/videos stored as Interakt CDN URLs (5-year expiry)"],
], widths=[1.4, 1.6, 3.3])
page_break()

# ════════════════════════════ 10. TECH STACK ════════════════════════════
add_heading("10. Technology Stack", 1)
add_table(["Layer", "Technology", "Purpose"], [
    ["Backend Framework", ".NET 8 (LTS)", "Core microservices for Gateway, AI Orchestrator, ERP Bridge"],
    ["Language", "C#", "High-performance, type-safe backend development"],
    ["Frontend", "Next.js 14 + React 18 + Tailwind + ShadCN UI", "Responsive Admin Dashboard optimized for tablet & desktop"],
    ["Database", "MS SQL Server 2022", "Main transaction DB (consistent with existing ERP stack)"],
    ["Cache / Memory", "Redis 7 LTS", "Chat context and session memory (10 messages per thread)"],
    ["Storage", "AWS S3 Buckets", "Full HD photo storage + tagging for recommendation engine"],
    ["AI Engine", "OpenAI GPT-4o mini", "Intent detection & response generation (multi-prompt JSON)"],
    ["Local AI Option", "Phi-3 / LLaMA 3 8B (Ollama)", "Future on-prem SLM for offline use and cost reduction"],
    ["Real-time Comms", "SignalR", "Live chat updates, escalation alerts, conversation group subscriptions"],
    ["Job Scheduler", "Hangfire / Quartz.NET", "Generate daily chat + sentiment reports"],
    ["Version Control", "GitHub + Docker", "CI/CD pipeline and containerized deployment"],
    ["Infrastructure", "AWS EC2 / On-prem GPU Server", "Host backend + Redis + local SLM models"],
    ["WhatsApp API", "Interakt + Meta Cloud API", "Webhook-based messaging (inbound + AI outbound)"],
], widths=[1.4, 2.1, 2.8])
add_heading("10.1 Backend Module Architecture", 2)
add_table(["Module", "Description"], [
    ["Indas.WhatsappGateway.Api", "Handles message ingestion + delivery to AI"],
    ["Indas.AIOrchestrator.Api", "Detects intent, fetches ERP data, creates response"],
    ["Indas.ErpBridge.Api", "Wraps Genesis ERP APIs (order, payment, credit)"],
    ["Indas.Shared", "DTOs, constants, result wrappers"],
    ["Indas.Infrastructure", "EF Core, Redis, logging, config management"],
], widths=[2.3, 4.0])
page_break()

# ════════════════════════════ 11. PHASE 2 PWA ════════════════════════════
add_heading("11. Proposed Phase 2 — 4 Mobile PWA Apps", 1)
add_callout('info', [("PWA (Progressive Web App) ", True),
    ("is a website that behaves like a native mobile app — installable from browser, works offline, supports push notifications, and costs significantly less than building separate Android/iOS apps.", False)])
add_heading("11.1 App 1 — Owner App", 2)
add_callout('success', [("User: ", True), ("Tejoo Fashion Owners / Directors / HODs", False)])
add_table(["Feature", "Description"], [
    ["Executive Dashboard", "Real-time revenue, top customers, team performance, daily order value"],
    ["All Conversations View", "Read-only access to all WhatsApp conversations across all teams"],
    ["AI Analytics", "AI accuracy, escalation rates, response times per team"],
    ["ERP Summary", "Today's orders, dispatch pending, payment outstanding, stock alerts"],
    ["Team Monitoring", "See which agents are online, response lag, unresolved escalations"],
    ["Reports", "PDF/Excel reports on demand — daily, weekly, monthly"],
    ["Notifications", "Push alerts for critical escalations, high-value customer queries, payment alerts"],
], widths=[1.9, 4.4])
add_heading("11.2 App 2 — Internal Team App", 2)
add_callout('success', [("Users: ", True), ("Sales Managers, CRR, Coordinators, Collection Team, Dispatch Team", False)])
add_table(["Feature", "Description"], [
    ["My Conversations", "See only assigned customer conversations. Reply from app — all messages tracked."],
    ["Quick Replies", "One-tap templates for common responses (dispatch update, payment reminder, catalogue share)"],
    ["Media Send", "Send product images/videos directly. Barcode scan to attach product details."],
    ["Barcode Scanner", "Scan product barcode → instantly see stock, sizes, WSP, availability"],
    ["Customer Profile", "Full customer history, tags, outstanding amount, previous orders"],
    ["Escalation Alerts", "Real push notifications when customer escalated to them. Timer visible."],
    ["Voice & Video Call", "WebRTC-based calling. Call customer directly from app — no number sharing needed."],
    ["Task Management", "Follow-up tasks, reminders, pending actions per customer"],
    ["Offline Mode", "Browse customer list and product catalogue offline. Sync when connected."],
], widths=[1.9, 4.4])
add_heading("11.3 App 3 — Vendor App", 2)
add_callout('success', [("Users: ", True), ("Wholesale Vendors, Shop Owners, Retail Buyers", False)])
add_table(["Feature", "Description"], [
    ["Product Catalogue", "Browse full catalogue with images, barcode, fabric, sizes, WSP. Filter by category/fabric/colour."],
    ["Barcode Lookup", "Scan or enter barcode → see product details, availability, price"],
    ["Order Placement", "Place orders directly. Select product, size, quantity. Submit to ERP."],
    ["Order Tracking", "Real-time status: Processing → Dispatched → LR Number → Delivered"],
    ["Payment", "View outstanding amount, pending bills, pay via UPI/NEFT. Upload payment proof."],
    ["Credit Limit", "See available credit balance, last payment date, account statement"],
    ["Chat with CRR", "In-app chat with assigned CRR. All messages tracked in the system."],
    ["New Arrivals", "Push notification when new collections arrive. Add to wishlist."],
    ["Return / Exchange", "Raise return request with photo evidence. Track return status."],
    ["Offline Catalogue", "Download catalogue for offline browsing. Useful during exhibitions."],
], widths=[1.9, 4.4])
add_heading("11.4 App 4 — Customer App", 2)
add_callout('success', [("Users: ", True), ("End Consumers, Retail Customers (Future Phase)", False)])
add_table(["Feature", "Description"], [
    ["Product Discovery", "Browse ethnic wear catalogue. AI-powered recommendations based on preferences."],
    ["Virtual Try-On (AI)", "AI suggests matching sets based on occasion, colour preference, budget"],
    ["Order & Track", "Place order, track delivery, view order history"],
    ["Chat Support", "Live chat with Tejoo team. AI handles routine queries, humans for complex ones."],
    ["Loyalty Program", "Points per purchase, referral rewards, special member discounts"],
    ["Wishlist & Reminders", "Save favourite products. Get notified when back in stock or on sale."],
], widths=[1.9, 4.4])
page_break()

# ════════════════════════════ 12. COMPARISON ════════════════════════════
add_heading("12. Comparison: Phase 1 (Current) vs Phase 2 (PWA)", 1)
add_table(["Feature / Capability", "Phase 1 (WhatsApp Dashboard)", "Phase 2 (PWA Ecosystem)"], [
    ["Agent messages tracked", "❌ Only if sent from dashboard", "✅ 100% — all via app"],
    ["Chat history", "❌ Only what webhook captured", "✅ Full history in DB"],
    ["Customer experience", "📱 WhatsApp only", "🌟 Dedicated app with catalogue, orders, tracking"],
    ["Voice/Video calls", "❌ Not possible via API", "✅ WebRTC built-in"],
    ["Performance analytics", "⚠ Partial (missing mobile replies)", "✅ Complete end-to-end"],
    ["ERP integration depth", "⚠ API-level, limited", "✅ Full barcode, stock, order integration"],
    ["Cost at scale", "🔴 Grows with Interakt usage", "✅ Fixed hosting cost"],
    ["Third-party dependency", "🔴 Interakt + Meta policies", "✅ Fully owned system"],
    ["Offline capability", "❌ Requires internet", "✅ PWA offline mode"],
    ["Push notifications", "⚠ Dashboard only (web push)", "✅ Native push on all devices"],
    ["Barcode scan", "❌ Not integrated", "✅ Built into all apps"],
    ["Data ownership", "⚠ Shared with Interakt", "✅ 100% owned by Tejoo"],
    ["Customer self-service", "❌ Requires agent intervention", "✅ Vendor App is fully self-service"],
    ["Time to build", "✅ Done (Phase 1 complete)", "⚠ 3–4 months per app"],
    ["Setup cost", "✅ Lower initial cost", "⚠ Higher initial investment"],
], widths=[2.1, 2.2, 2.0])
page_break()

# ════════════════════════════ 13. ROLES ════════════════════════════
add_heading("13. Roles & Responsibilities", 1)
add_table(["Entity", "Phase 1 Responsibility", "Phase 2 Responsibility"], [
    ["Tejoo Fashion", "Share WhatsApp number list, customer allocation matrix, Genesis ERP API access, nominate test users, train agents on dashboard", "Approve UI/UX designs, provide customer data for migration, test Vendor App with select vendors, share product catalogue data for PWA"],
    ["INDAS Analytics", "Develop WhatsApp AI tool & dashboard, integrate ERP APIs, train AI responses, conduct testing, provide training, maintain system", "Design and build 4 PWA apps, deep ERP integration, AI recommendations, barcode integration, deploy on production servers"],
], widths=[1.3, 2.5, 2.5])
add_heading("13.1 User Roles in Current System", 2)
add_table(["Role", "Access Level", "Scope"], [
    ["Admin", "Full access", "All sessions, all conversations, all settings, all reports"],
    ["HOD", "Team + full reports", "Their department + escalations to them"],
    ["Manager", "Team conversations + reports", "Assigned team's conversations and escalations"],
    ["CRR (Sales Rep)", "Own conversations only", "Only assigned conversations, no delete/edit controls"],
], widths=[1.4, 2.0, 2.9])
page_break()

# ════════════════════════════ 14. CONCLUSION ════════════════════════════
add_heading("14. Conclusion", 1)
add_heading("14.1 What Phase 1 Achieved", 2)
add_callout('success', [("Phase 1 successfully delivers a centralized, AI-powered communication hub for Tejoo Fashion's 40+ WhatsApp numbers. It eliminates conversation silos, provides management visibility, enables AI auto-responses, and creates accountability across teams. This is a strong foundation.", False)])
add_heading("14.2 The Hard Truth", 2)
add_callout('danger', [("Phase 1 is built on top of WhatsApp Business API via a third-party intermediary (Interakt). This means Tejoo Fashion is dependent on Interakt's pricing, policies, and API limitations — including the critical gap that ", False), ("mobile phone replies are invisible to the system", True), (". Agents who don't change their behavior make the analytics incomplete and the AI less effective.", False)])
add_heading("14.3 The Path Forward", 2)
p = doc.add_paragraph(); r = p.add_run("Our Recommendation:"); set_run(r, 11, INDIGO_DARK, bold=True)
add_numbered([
    "**Complete Phase 1 fully** — Connect all 40+ numbers, activate ERP APIs, train agents to use dashboard",
    "**Run Phase 1 for 3 months** — Collect data, identify patterns, prove ROI",
    "**Start Phase 2 design** — Begin with Internal Team App first (highest immediate value)",
    "**Roll out Vendor App** — Give vendors self-service capability",
    "**Phase 2 fully replaces Phase 1** — WhatsApp notifications become push notifications in the app",
])
add_heading("14.4 Key Message", 2)
# boxed key message
kt = doc.add_table(rows=1, cols=1)
kc = kt.cell(0, 0)
set_cell_bg(kc, KEY_FILL)
set_cell_border_color(kc, '6366F1')
for line in ['"WhatsApp is where your customers are today.',
             'Your own app is where your business needs to be tomorrow.',
             'Phase 1 builds the bridge. Phase 2 builds the destination."']:
    kp = kc.add_paragraph()
    kp.alignment = WD_ALIGN_PARAGRAPH.CENTER
    kp.paragraph_format.space_after = Pt(2)
    kr = kp.add_run(line)
    set_run(kr, 12.5, INDIGO, bold=True)
# remove the empty first paragraph in the cell
kc.paragraphs[0]._p.getparent().remove(kc.paragraphs[0]._p)

doc.add_paragraph()
foot = doc.add_paragraph()
foot.alignment = WD_ALIGN_PARAGRAPH.CENTER
r = foot.add_run("Prepared by INDAS Analytics  |  Confidential — For Tejoo Fashion Internal Use Only")
set_run(r, 9, GREY, bold=True)
foot2 = doc.add_paragraph()
foot2.alignment = WD_ALIGN_PARAGRAPH.CENTER
r = foot2.add_run("Document Version 1.0  |  May 2026  |  All technical specifications subject to change based on requirements")
set_run(r, 9, GREY)

out = r"e:\TejooFashion(Dashboard)\docs\Tejoo_Fashion_Project_Document.docx"
doc.save(out)
print("SAVED:", out)
