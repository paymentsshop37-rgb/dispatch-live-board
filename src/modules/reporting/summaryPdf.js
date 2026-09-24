import autoTable from "jspdf-autotable";
import { reportSummarySections, formatSummaryCell } from "./reportSummary.js";

export function appendSummaryPdf(doc, summary, { startY, top = 42, bottom = 48 } = {}) {
  let y = startY ?? ((doc.lastAutoTable?.finalY || top) + 24);
  const height = doc.internal.pageSize.getHeight();
  for (const section of reportSummarySections(summary)) {
    if (y > height - bottom - 85) { doc.addPage(); y = top; }
    doc.setFont("helvetica", "bold"); doc.setFontSize(section.title === "SUMMARY & STATISTICS" ? 16 : 10);
    doc.setTextColor(22, 58, 99); doc.text(section.title, 30, y);
    autoTable(doc, { startY: y + 10, margin: { left: 30, right: 30, top, bottom },
      head: [section.headers], body: section.rows.map(row => row.map((value, i) => formatSummaryCell(value, section.formats[i]))),
      theme: "striped", rowPageBreak: "avoid",
      styles: { font: "helvetica", fontSize: 9, cellPadding: 5, overflow: "linebreak" },
      headStyles: { fillColor: [22, 58, 99] }, alternateRowStyles: { fillColor: [241, 245, 249] },
      columnStyles: Object.fromEntries(section.headers.map((_, i) => [i, { halign: i ? "right" : "left" }])),
      // AutoTable applies columnStyles only to body cells. Align the headings
      // explicitly so each numeric heading sits above its right-aligned values.
      didParseCell: ({ cell, column }) => { cell.styles.halign = column.index ? "right" : "left"; },
    });
    y = doc.lastAutoTable.finalY + 24;
  }
  return y;
}
