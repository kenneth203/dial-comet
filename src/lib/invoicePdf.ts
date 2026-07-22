import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

export type InvoiceLineItem = {
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
};

export type InvoicePdfData = {
  invoice_number: string;
  issued_at: string;
  due_at: string;
  service_type: string;
  package_name: string;
  subtotal: number;
  vat_rate: number;
  vat_amount: number;
  total: number;
  client_name?: string | null;
  company_name?: string | null;
  client_address?: string | null;
  notes?: string | null;
  reference?: string | null;
  line_items?: InvoiceLineItem[] | null;
};

const COMPANY = {
  name: "The VA Team Limited",
  region: "Berkshire",
  country: "UNITED KINGDOM",
  vat: "420509727",
  accountName: "The VA Team Limited",
  account: "93528582",
  sort: "51-81-22",
  reg: "13499178",
  regOffice:
    "Venture House, Arlington Square, Downshire Way, Bracknell, Berkshire, RG12 1WA, United Kingdom.",
  logoUrl: "/lovable-uploads/va-team-logo.png",
};

const NAVY: [number, number, number] = [28, 71, 122]; // #1c477a
const TEXT: [number, number, number] = [40, 40, 40];
const MUTED: [number, number, number] = [110, 110, 110];

async function loadLogo(): Promise<string | null> {
  try {
    const res = await fetch(COMPANY.logoUrl);
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

const fmtDate = (d: string) => {
  try { return format(new Date(d), "d MMM yyyy"); } catch { return d; }
};
const money = (n: number) => Number(n || 0).toFixed(2);

export async function buildInvoicePdf(inv: InvoicePdfData): Promise<Blob> {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 40;

  // Logo (top-right) — preserve native aspect ratio (1920x1199 ≈ 1.6:1)
  const logo = await loadLogo();
  const logoW = 95;
  const logoH = logoW * (1199 / 1920); // ≈ 59pt
  const logoY = margin - 6;
  if (logo) {
    try { doc.addImage(logo, "PNG", pageW - margin - logoW, logoY, logoW, logoH); } catch { /* ignore */ }
  }
  const companyTopY = logoY + logoH + 14;

  // TAX INVOICE title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(26);
  doc.setTextColor(...TEXT);
  doc.text("TAX INVOICE", margin, margin + 30);

  // Bill-to block
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...TEXT);
  const billTo: string[] = [];
  if (inv.company_name) billTo.push(inv.company_name);
  if (inv.client_name) billTo.push(`Attention: ${inv.client_name}`);
  if (inv.client_address) billTo.push(...inv.client_address.split("\n"));
  let by = margin + 60;
  billTo.forEach((line) => { doc.text(line, margin, by); by += 13; });

  // Meta column (centre)
  const metaX = 280;
  let my = margin + 60;
  const metaPair = (label: string, value: string) => {
    doc.setFont("helvetica", "bold"); doc.setFontSize(10);
    doc.text(label, metaX, my); my += 13;
    doc.setFont("helvetica", "normal");
    doc.text(value, metaX, my); my += 18;
  };
  metaPair("Invoice Date", fmtDate(inv.issued_at));
  metaPair("Invoice Number", inv.invoice_number);
  if (inv.reference) metaPair("Reference", inv.reference);
  metaPair("VAT Number", COMPANY.vat);

  // Right column — company
  const rx = pageW - margin;
  let ry = companyTopY;
  doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  [COMPANY.name, COMPANY.region, COMPANY.country].forEach((line) => {
    doc.text(line, rx, ry, { align: "right" }); ry += 13;
  });

  // Items table
  const startY = Math.max(by, my, ry) + 30;
  autoTable(doc, {
    startY,
    margin: { left: margin, right: margin },
    head: [["Description", "Quantity", "Unit Price", "VAT", "Amount GBP"]],
    body: (inv.line_items && inv.line_items.length > 0
      ? inv.line_items.map((li) => [
          li.description,
          Number(li.quantity || 1).toFixed(2),
          money(li.unit_price),
          `${Math.round((inv.vat_rate || 0) * 100)}%`,
          money(li.amount),
        ])
      : [[
          `${inv.package_name}${inv.service_type ? ` (${inv.service_type})` : ""}`,
          "1.00",
          money(inv.subtotal),
          `${Math.round((inv.vat_rate || 0) * 100)}%`,
          money(inv.subtotal),
        ]]),
    theme: "plain",
    styles: { fontSize: 10, cellPadding: 6, textColor: TEXT },
    headStyles: {
      fontStyle: "bold",
      fillColor: [255, 255, 255],
      textColor: TEXT,
      lineWidth: { bottom: 0.5 },
      lineColor: [200, 200, 200],
    },
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { halign: "right", cellWidth: 60 },
      2: { halign: "right", cellWidth: 70 },
      3: { halign: "right", cellWidth: 50 },
      4: { halign: "right", cellWidth: 80 },
    },
  });

  // Totals
  // @ts-ignore lastAutoTable available after autoTable
  let ty = (doc as any).lastAutoTable.finalY + 14;
  const totRight = pageW - margin;
  const totLabelX = pageW - margin - 90;
  doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  const totRow = (label: string, value: string, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.text(label, totLabelX, ty, { align: "right" });
    doc.text(`£${value}`, totRight, ty, { align: "right" });
    ty += 16;
  };
  totRow("Subtotal", money(inv.subtotal));
  totRow(`TOTAL VAT ${Math.round((inv.vat_rate || 0) * 100)}%`, money(inv.vat_amount));
  doc.setDrawColor(200); doc.line(totLabelX - 80, ty - 10, totRight, ty - 10);
  totRow("TOTAL GBP", money(inv.total), true);

  // Due date + banking
  let fy = ty + 20;
  doc.setFont("helvetica", "bold"); doc.setFontSize(11);
  doc.text(`Due Date: ${fmtDate(inv.due_at)}`, margin, fy); fy += 16;
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(...TEXT);
  [
    "All invoices are due within 7 days from the date shown on the invoice.",
    "Please note if this invoice is not settled within this period your services might be suspended.",
    "Our Banking Details:",
    `Account Name: ${COMPANY.accountName}`,
    `Account: ${COMPANY.account}`,
    `Sort code: ${COMPANY.sort}`,
  ].forEach((line) => { doc.text(line, margin, fy); fy += 14; });

  if (inv.notes) {
    fy += 6;
    doc.setFont("helvetica", "italic"); doc.setTextColor(...MUTED);
    doc.text(inv.notes, margin, fy, { maxWidth: pageW - margin * 2 });
  }

  // Footer
  const ph = doc.internal.pageSize.getHeight();
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...MUTED);
  doc.text(
    `Company Registration No: ${COMPANY.reg}. Registered Office: ${COMPANY.regOffice}`,
    margin, ph - 24, { maxWidth: pageW - margin * 2 }
  );

  return doc.output("blob");
}

export async function uploadInvoicePdf(invoiceId: string, invoiceNumber: string, blob: Blob): Promise<string> {
  const path = `${invoiceId}/${invoiceNumber}-${Date.now()}.pdf`;
  const { error } = await supabase.storage
    .from("invoice-pdfs")
    .upload(path, blob, { contentType: "application/pdf", upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from("invoice-pdfs").getPublicUrl(path);
  return data.publicUrl;
}

export function downloadInvoicePdfBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
