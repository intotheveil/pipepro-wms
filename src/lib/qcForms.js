import { jsPDF } from 'jspdf';

// -- Common header ------------------------------------------------------------

function addHeader(doc, project, title, qcfId) {
  const pw = doc.internal.pageSize.getWidth();

  // Left: Company name (no logo for now)
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('KAPPADELTA', 14, 15);

  // Center: Project + Client
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(project.name || '', pw / 2, 12, { align: 'center' });
  doc.text(project.client || '', pw / 2, 17, { align: 'center' });

  // Right: Doc info
  doc.setFontSize(8);
  doc.text(`QCF ID: ${qcfId}`, pw - 14, 10, { align: 'right' });
  doc.text('Rev: 0', pw - 14, 14, { align: 'right' });
  doc.text('Page: 1/1', pw - 14, 18, { align: 'right' });

  // Line
  doc.setLineWidth(0.5);
  doc.line(14, 22, pw - 14, 22);

  // Title row
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(`QUALITY CONTROL FORM: ${title}`, 14, 28);

  return 34; // y position after header
}

// -- Common footer ------------------------------------------------------------

function addFooter(doc, y) {
  const pw = doc.internal.pageSize.getWidth();
  const colW = (pw - 28) / 3;

  y += 10;
  doc.setLineWidth(0.3);
  doc.line(14, y, pw - 14, y);
  y += 6;

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  ['CONSTRUCTION SUBCONTRACTOR', 'CONTRACTOR', 'CLIENT / NoBo'].forEach((label, i) => {
    const x = 14 + i * colW;
    doc.text(label, x + 2, y);
    doc.setFont('helvetica', 'normal');
    doc.text('Name:', x + 2, y + 8);
    doc.text('Signature:', x + 2, y + 16);
    doc.text('Date:', x + 2, y + 24);
    doc.setFont('helvetica', 'bold');
    // Draw box
    doc.rect(x, y + 2, colW - 4, 28);
  });
}

// -- Table helper -------------------------------------------------------------

function addTable(doc, y, headers, rows, colWidths) {
  const pw = doc.internal.pageSize.getWidth();
  const startX = 14;
  doc.setFontSize(7);

  // Header row
  doc.setFont('helvetica', 'bold');
  doc.setFillColor(240, 240, 240);
  doc.rect(startX, y, pw - 28, 8, 'F');
  let x = startX;
  headers.forEach((h, i) => {
    doc.text(h, x + 1, y + 5.5);
    x += colWidths[i];
  });
  y += 8;

  // Data rows
  doc.setFont('helvetica', 'normal');
  rows.forEach((row) => {
    if (y > 260) { doc.addPage(); y = 20; } // page break
    x = startX;
    row.forEach((cell, ci) => {
      doc.text(String(cell || ''), x + 1, y + 5);
      x += colWidths[ci];
    });
    doc.rect(startX, y, pw - 28, 7);
    y += 7;
  });

  return y;
}

// -- Form A: Dimensional Check ------------------------------------------------

export function generateDimCheck(project, spools, isoMap, welderMap) {
  const doc = new jsPDF({ orientation: 'landscape' });
  const qcfId = `QCF-DIM-${String(Date.now()).slice(-6)}`;
  let y = addHeader(doc, project, 'DIMENSIONAL CHECK', qcfId);

  const headers = ['N\u00B0', 'ISO Drawing', 'Sheet', 'Rev', 'Spool No', 'Welder', 'Heat No', 'Mat Check', 'Dim Check', 'Extra Length', 'Remarks'];
  const colWidths = [12, 50, 15, 12, 25, 20, 25, 22, 22, 22, 55];

  const rows = spools.map((s, i) => {
    const iso = isoMap[s.iso_id] || {};
    return [i + 1, iso.drawing_no || '', iso.sheet || '', iso.revision || '', s.spool_no, '', '', '\u2610 / \u2610', '\u2610 / \u2610', '', ''];
  });

  y = addTable(doc, y, headers, rows, colWidths);
  addFooter(doc, y);

  return { doc, qcfId, blob: doc.output('blob') };
}

// -- Form B: Release for Painting ---------------------------------------------

export function generatePaintRelease(project, spools, isoMap) {
  const doc = new jsPDF({ orientation: 'landscape' });
  const qcfId = `QCF-PNT-${String(Date.now()).slice(-6)}`;
  let y = addHeader(doc, project, 'RELEASE FOR PAINTING', qcfId);

  doc.setFontSize(9);
  doc.text(`Working Area: FABRICATION    QCF Date: ${new Date().toISOString().split('T')[0]}`, 14, y);
  y += 8;

  const headers = ['N\u00B0', 'ISO Drawing', 'Spool ID', 'Material', 'Release (Y/N)', 'Remarks'];
  const colWidths = [12, 60, 30, 40, 30, 108];

  const rows = spools.map((s, i) => {
    const iso = isoMap[s.iso_id] || {};
    return [i + 1, iso.drawing_no || '', s.spool_no, iso.material || '', '\u2610 Y  \u2610 N', ''];
  });

  y = addTable(doc, y, headers, rows, colWidths);
  addFooter(doc, y);

  return { doc, qcfId, blob: doc.output('blob') };
}

// -- Form C: Release for Site Transport ---------------------------------------

export function generateSiteRelease(project, spools, isoMap) {
  const doc = new jsPDF({ orientation: 'landscape' });
  const qcfId = `QCF-SHP-${String(Date.now()).slice(-6)}`;
  let y = addHeader(doc, project, 'RELEASE FOR SITE TRANSPORT', qcfId);

  const headers = ['N\u00B0', 'ISO Drawing', 'Rev', 'Area', 'Spool Item Number', 'To Ship \u2610', 'Missing \u2610', 'Notes'];
  const colWidths = [12, 55, 12, 25, 40, 25, 25, 86];

  const rows = spools.map((s, i) => {
    const iso = isoMap[s.iso_id] || {};
    return [i + 1, iso.drawing_no || '', iso.revision || '', '', s.spool_no, '\u2610', '\u2610', ''];
  });

  y = addTable(doc, y, headers, rows, colWidths);

  y += 8;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('SHIPPING:   \u2610 AUTHORIZED   \u2610 NOT AUTHORIZED', 14, y);
  y += 6;
  doc.text('REMARKS:', 14, y);
  doc.rect(14, y + 2, doc.internal.pageSize.getWidth() - 28, 15);
  y += 20;

  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text('NOTE (1) = ALL SPOOL TAGS HAVE TO BE FILLED IN', 14, y);
  doc.text('NOTE (2) = FLAG SPOOLS TO BE SHIPPED', 14, y + 4);
  doc.text('NOTE (3) = FLAG MISSING SPOOLS', 14, y + 8);
  y += 12;

  addFooter(doc, y);

  return { doc, qcfId, blob: doc.output('blob') };
}
