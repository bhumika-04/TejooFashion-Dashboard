// Report export helpers — CSV, Excel (multi-sheet), PDF and Word, with an embedded
// pie chart. Heavy libraries (xlsx / jspdf / docx) are dynamically imported inside each
// function so they stay OUT of the main bundle until the user actually exports.

export type Cell = string | number;
export type Row = Cell[];
export interface TableBlock { title: string; headers: string[]; rows: Row[]; }
export interface PieSlice { label: string; value: number; color: string; }
export interface PieBlock { title: string; slices: PieSlice[]; }
export interface Kpi { label: string; value: string; }
export interface ReportPayload {
  title: string;
  subtitle?: string;
  kpis?: Kpi[];
  pies?: PieBlock[];
  tables?: TableBlock[];
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ── CSV (single table) ──────────────────────────────────────────────────────
export function downloadCsv(filename: string, rows: Row[]) {
  const esc = (v: Cell) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = rows.map(r => r.map(esc).join(',')).join('\n');
  triggerDownload(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }), filename);
}

// ── Excel (one sheet per table block) ───────────────────────────────────────
export async function exportExcel(filename: string, tables: TableBlock[]) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  tables.forEach((t, i) => {
    const ws = XLSX.utils.aoa_to_sheet([t.headers, ...t.rows]);
    const safe = (t.title || `Sheet ${i + 1}`).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31).trim();
    XLSX.utils.book_append_sheet(wb, ws, safe || `Sheet ${i + 1}`);
  });
  XLSX.writeFile(wb, filename);
}

// ── Pie chart → PNG data URL (plain canvas, no extra dependency) ────────────
export function pieChartPng(slices: PieSlice[], size = 220): string {
  const legendW = 230;
  const W = size + legendW;
  const H = Math.max(size, slices.length * 24 + 24);
  const scale = 2; // retina-crisp in the exported doc
  const canvas = document.createElement('canvas');
  canvas.width = W * scale; canvas.height = H * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.scale(scale, scale);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);

  const total = slices.reduce((s, x) => s + x.value, 0) || 1;
  const cx = size / 2, cy = size / 2, r = size / 2 - 12;
  let start = -Math.PI / 2;
  slices.forEach(sl => {
    const ang = (sl.value / total) * Math.PI * 2;
    if (ang <= 0) return;
    ctx.beginPath(); ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, start, start + ang); ctx.closePath();
    ctx.fillStyle = sl.color; ctx.fill();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.stroke();
    start += ang;
  });

  ctx.textBaseline = 'middle';
  ctx.font = '13px Arial, sans-serif';
  let ly = 18;
  slices.forEach(sl => {
    const pct = ((sl.value / total) * 100).toFixed(0);
    ctx.fillStyle = sl.color; ctx.fillRect(size + 16, ly - 6, 12, 12);
    ctx.fillStyle = '#374151';
    ctx.fillText(`${sl.label}  ${sl.value.toLocaleString('en-IN')} (${pct}%)`, size + 34, ly);
    ly += 24;
  });
  return canvas.toDataURL('image/png');
}

// ── PDF ─────────────────────────────────────────────────────────────────────
export async function exportPdf(filename: string, p: ReportPayload) {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;

  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const M = 40;
  let y = 48;
  const ensure = (need: number) => { if (y + need > pageH - M) { doc.addPage(); y = 48; } };

  doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(30, 27, 75);
  doc.text(p.title, M, y); y += 20;
  if (p.subtitle) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(120, 120, 120);
    doc.text(p.subtitle, M, y); y += 16;
  }
  doc.setDrawColor(225, 225, 225); doc.line(M, y, pageW - M, y); y += 22;

  // KPI chips (4 per row)
  if (p.kpis?.length) {
    const perRow = Math.min(4, p.kpis.length);
    const colW = (pageW - M * 2) / perRow;
    p.kpis.forEach((k, i) => {
      const col = i % perRow;
      if (col === 0 && i > 0) y += 54;
      ensure(50);
      const x = M + col * colW;
      doc.setDrawColor(232, 232, 236); doc.setFillColor(248, 249, 252);
      doc.roundedRect(x, y, colW - 8, 44, 5, 5, 'FD');
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(140, 140, 140);
      doc.text(k.label.toUpperCase(), x + 10, y + 16);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(30, 27, 75);
      doc.text(k.value, x + 10, y + 34);
    });
    y += 62;
  }

  // Pie charts
  (p.pies ?? []).forEach(pie => {
    ensure(30);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(40, 40, 40);
    doc.text(pie.title, M, y); y += 12;
    const png = pieChartPng(pie.slices, 200);
    if (png) {
      const imgW = 360, imgH = imgW * (200 / (200 + 230));
      ensure(imgH + 10);
      doc.addImage(png, 'PNG', M, y, imgW, imgH); y += imgH + 20;
    }
  });

  // Tables
  (p.tables ?? []).forEach(t => {
    ensure(48);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(40, 40, 40);
    doc.text(t.title, M, y);
    autoTable(doc, {
      head: [t.headers],
      body: t.rows.map(r => r.map(c => String(c ?? ''))),
      startY: y + 8,
      margin: { left: M, right: M },
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 249, 252] },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 22;
  });

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(160, 160, 160);
    doc.text(`Tejoo Fashion · ${new Date().toLocaleDateString('en-IN')}`, M, pageH - 20);
    doc.text(`Page ${i} / ${pages}`, pageW - M, pageH - 20, { align: 'right' });
  }
  doc.save(filename);
}

// ── DOCX ────────────────────────────────────────────────────────────────────
export async function exportDocx(filename: string, p: ReportPayload) {
  const {
    Document, Packer, Paragraph, Table, TableRow, TableCell,
    TextRun, HeadingLevel, ImageRun, WidthType,
  } = await import('docx');

  const children: (InstanceType<typeof Paragraph> | InstanceType<typeof Table>)[] = [];
  children.push(new Paragraph({ text: p.title, heading: HeadingLevel.HEADING_1 }));
  if (p.subtitle) children.push(new Paragraph({ children: [new TextRun({ text: p.subtitle, color: '888888', size: 20 })] }));

  if (p.kpis?.length) {
    children.push(new Paragraph({ text: 'Summary', heading: HeadingLevel.HEADING_2 }));
    children.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({ children: p.kpis.map(k => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: k.label, bold: true, size: 16, color: '666666' })] })] })) }),
        new TableRow({ children: p.kpis.map(k => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: k.value, bold: true, size: 26, color: '1E1B4B' })] })] })) }),
      ],
    }));
    children.push(new Paragraph({ text: '' }));
  }

  for (const pie of p.pies ?? []) {
    children.push(new Paragraph({ text: pie.title, heading: HeadingLevel.HEADING_2 }));
    const png = pieChartPng(pie.slices, 220);
    if (png) {
      const bytes = Uint8Array.from(atob(png.split(',')[1]), c => c.charCodeAt(0));
      children.push(new Paragraph({
        children: [new ImageRun({ type: 'png', data: bytes, transformation: { width: 430, height: 200 } })],
      }));
    }
    children.push(new Paragraph({ text: '' }));
  }

  for (const t of p.tables ?? []) {
    children.push(new Paragraph({ text: t.title, heading: HeadingLevel.HEADING_2 }));
    children.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          tableHeader: true,
          children: t.headers.map(h => new TableCell({
            shading: { fill: '4F46E5' },
            children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, color: 'FFFFFF', size: 18 })] })],
          })),
        }),
        ...t.rows.map(r => new TableRow({
          children: r.map(c => new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: String(c ?? ''), size: 18 })] })],
          })),
        })),
      ],
    }));
    children.push(new Paragraph({ text: '' }));
  }

  const doc = new Document({ sections: [{ children }] });
  const blob = await Packer.toBlob(doc);
  triggerDownload(blob, filename);
}
