/**
 * Template and data download generators for all import types.
 * Uses SheetJS (xlsx) to build .xlsx files client-side.
 */
import { utils, writeFile } from 'xlsx';
import { getSupabase } from './supabase';
import { fetchAll } from './fetchAll';
import { VALID_CATEGORY_CODES } from './materials/classify.js';

// =============================================================================
// TEMPLATE DEFINITIONS
// =============================================================================

const TEMPLATES = {
  iso_register: {
    sheetName: 'ISO Register',
    columns: ['FAST NUMBER', 'ISO DRAWING', 'MATERIAL', 'SHEET NO', 'REV', 'FLUID CODE', 'SERVICE', 'PIPING CLASS', 'SIZE (NPS)', 'PED CATEGORY', 'NOTES', 'Entry_Status'],
    widths:   [12, 30, 15, 10, 6, 12, 18, 14, 12, 14, 25, 14],
    sample:   ['101', 'APP-11-EKG61-BR001-DA1-N', 'SA 106B', '1', '0', 'NAT GAS', 'NATURAL GAS', 'A1A', '14"', 'III', '', ''],
    table: 'iso_register',
    dataSelect: 'fast_no, drawing_no, material, sheet, revision, fluid_code, system, piping_class, size_nps, ped_category, notes',
    dataMap: r => [r.fast_no, r.drawing_no, r.material, r.sheet, r.revision, r.fluid_code, r.system, r.piping_class, r.size_nps, r.ped_category, r.notes, ''],
  },

  welders: {
    sheetName: 'Welder Register',
    columns: ['WELDER ID / STAMP', 'FULL NAME', 'WPS / PROCESS QUAL.', 'EXPIRY DATE', 'STATUS', 'Entry_Status'],
    widths:   [18, 25, 25, 14, 10, 14],
    sample:   ['W01', 'John Smith', 'WPS-001, WPS-002', '2026-12-31', 'Yes', ''],
    table: 'welders',
    dataSelect: 'stamp, name, qualified_wps, qualification_exp, active',
    dataMap: r => [r.stamp, r.name, (r.qualified_wps || []).join(', '), r.qualification_exp, r.active ? 'Yes' : 'No', ''],
  },

  documents: {
    sheetName: 'Register',
    columns: ['SERIAL NUMBER', 'DOCUMENT ID', 'DOCUMENT TITLE', 'DOCUMENT CATEGORY', 'DOCUMENT PURPOSE', 'REVISION', 'INTERNAL/ PROJECT ID', 'ISSUE DATE', 'REVISION DATE', 'DISCIPLINE', 'D. CODE', 'OWNER', 'APPROVED BY', 'REVISION STATUS', 'TRANSMITTAL IN', 'TRANSMITTAL IN DATE', 'TRANSMITTAL OUT', 'TRANSMITTAL OUT DATE', 'Entry_Status'],
    widths:   [12, 20, 30, 18, 18, 8, 20, 12, 12, 14, 8, 14, 14, 14, 16, 16, 16, 16, 14],
    sample:   ['1', 'DOC-PIP-001', 'Piping Specification', 'Engineering', 'IFC', '0', 'KD-0025-DOC-001', '2025-01-15', '2025-01-15', 'Piping', 'PIP', 'Engineering', 'PM', 'IFC', 'TR-IN-001', '2025-01-10', 'TR-OUT-001', '2025-01-20', ''],
    table: 'documents',
    dataSelect: 'serial_number, doc_no, title, file_type, document_purpose, revision, internal_project_id, uploaded_at, revision_date, discipline, discipline_code, owner_name, approved_by, revision_status, transmittal_in, transmittal_in_date, transmittal_out, transmittal_out_date',
    dataMap: r => [r.serial_number, r.doc_no, r.title, r.file_type, r.document_purpose, r.revision, r.internal_project_id, fmtDate(r.uploaded_at), fmtDate(r.revision_date), r.discipline, r.discipline_code, r.owner_name, r.approved_by, r.revision_status, r.transmittal_in, fmtDate(r.transmittal_in_date), r.transmittal_out, fmtDate(r.transmittal_out_date), ''],
  },

  wps_list: {
    sheetName: 'WPS Register',
    columns: ['S/N', 'WPS No', 'REVISION', 'WPS Standard', 'PQR / WPAR', 'PQR / WPAR standard', 'Welding processes', 'Joints', 'Parent Materials No1', 'Parent Materials P No/ G No', 'Filler material No1', 'F NUMBER', 'A NUMBER', 'Thickness range (mm)', 'Maximum Thickness Deposit per Process Range', 'OD range (mm)', 'Qualification positions', 'Preheat', 'Post Heat', 'PWHT', 'Interpass T\u00B0', 'Date', 'Remarks', 'Entry_Status'],
    widths:   [6, 25, 8, 25, 20, 25, 18, 8, 18, 22, 18, 10, 10, 20, 35, 16, 22, 12, 10, 8, 14, 12, 20, 14],
    sample:   ['1', 'WPS KAPPA/04-2025', '0', 'ASME IX and PED 2014/68/EU', '42002/00.319.655', 'ASME IX and PED 2014/68/EU', '141 (GTAW)', 'BW', 'SA 106B', 'P No 1 / G No 1', 'ESAB OK TIGROD 12.64', '6', '1', '2,58mm \u2013 10,32mm', '10,32mm', 'All Diameters', 'ALL POSITIONS UPHILL', '\u226510\u00B0C', 'N/A', 'N/A', '\u2264350\u00B0C', '2025-03-03', '', ''],
    table: 'wps_list',
    dataSelect: 'serial_no, wps_no, revision, wps_standard, pqr_wpar, pqr_wpar_standard, welding_processes, joints, parent_material_1, parent_material_pno_gno, filler_material, f_number, a_number, thickness_range_mm, max_thickness_deposit, od_range_mm, qualification_positions, preheat, post_heat, pwht, interpass_temp, qualified_date, remarks',
    dataMap: r => [r.serial_no, r.wps_no, r.revision, r.wps_standard, r.pqr_wpar, r.pqr_wpar_standard, r.welding_processes, r.joints, r.parent_material_1, r.parent_material_pno_gno, r.filler_material, r.f_number, r.a_number, r.thickness_range_mm, r.max_thickness_deposit, r.od_range_mm, r.qualification_positions, r.preheat, r.post_heat, r.pwht, r.interpass_temp, r.qualified_date, r.remarks, ''],
  },

  spools: {
    sheetName: 'Spool DMP',
    columns: ['SPOOL NO', 'FN', 'SHOP/FIELD', 'MATERIAL CHECKED', 'MATERIAL CHECK DATE', 'FAB STARTED', 'FAB START DATE', 'FABRICATED', 'FABRICATED DATE', 'QC RELEASED', 'QC RELEASE DATE', 'SENT TO PAINT', 'SENT TO PAINT DATE', 'PAINTED', 'PAINTED DATE', 'AT LAYDOWN', 'LAYDOWN DATE', 'ERECTED', 'ERECTED DATE', 'NOTES', 'Entry_Status'],
    widths:   [12, 8, 12, 16, 18, 12, 14, 12, 16, 12, 16, 14, 18, 10, 14, 12, 14, 10, 14, 25, 14],
    sample:   ['SP01', '101', 'shop', 'Yes', '2025-04-01', 'Yes', '2025-04-05', 'No', '', 'No', '', 'No', '', 'No', '', 'No', '', 'No', '', '', ''],
    table: 'spools',
    dataSelect: 'spool_no, iso_id, shop_field, material_checked, material_check_date, fab_started, fab_start_date, fabricated, fabricated_date, qc_released, qc_release_date, sent_to_paint, sent_to_paint_date, painted, painted_date, at_laydown, laydown_date, erected, erected_date, notes',
    dataMap: r => [r.spool_no, '', r.shop_field, yn(r.material_checked), fmtDate(r.material_check_date), yn(r.fab_started), fmtDate(r.fab_start_date), yn(r.fabricated), fmtDate(r.fabricated_date), yn(r.qc_released), fmtDate(r.qc_release_date), yn(r.sent_to_paint), fmtDate(r.sent_to_paint_date), yn(r.painted), fmtDate(r.painted_date), yn(r.at_laydown), fmtDate(r.laydown_date), yn(r.erected), fmtDate(r.erected_date), r.notes, ''],
  },

  weld_log: {
    sheetName: 'Weld Log',
    columns: ['FN_WELD', 'FN', 'SPOOL ID', 'JOINT TYPE', 'SHOP / FIELD', 'WELD INCHES', 'THICKNESS/ SCHEDULE', 'FIT-UP DATE', 'WELDING DATE', 'WELDED', 'REPAIR', 'PWHT Y/N', 'WPS', 'WELDER', 'Entry_Status'],
    widths:   [14, 8, 12, 12, 12, 12, 18, 14, 14, 8, 8, 10, 12, 10, 14],
    sample:   ['FN101-S1', '101', 'SP01', 'BW', 'shop', '14"', '10', '2025-04-01', '2025-04-03', 'Yes', '', 'No', 'WPS-001', 'W01', ''],
    table: 'weld_log',
    dataSelect: 'weld_id, iso_id, spool_id, joint_type, shop_field, dia_inch, thickness, fit_up_date, weld_date, welded, reject_count, pwht_required, notes',
    dataMap: r => [r.weld_id, '', '', r.joint_type, r.shop_field, r.dia_inch, r.thickness, fmtDate(r.fit_up_date), fmtDate(r.weld_date), yn(r.welded), r.reject_count > 0 ? 'Yes' : '', yn(r.pwht_required), '', '', ''],
  },

  supports_list: {
    sheetName: 'List',
    columns: ['SUPPORT UNIQUE NN', 'EIDOS STIRIGMATOS', 'IS FIELD?', 'QTY.', 'WEIGHT', 'FIT-UP DATE', 'WELD DATE', 'WELDER', 'NOTES', 'Entry_Status'],
    widths:   [20, 20, 10, 8, 10, 14, 14, 10, 25, 14],
    sample:   ['101_20', 'TYPE A', 'No', '1', '25.5', '2025-04-01', '2025-04-03', 'W01', '', ''],
    table: 'supports_list',
    dataSelect: 'support_mark, eidos, is_field, qty, weight_kg, fitup_date, weld_date, notes',
    dataMap: r => [r.support_mark, r.eidos, yn(r.is_field), r.qty, r.weight_kg, fmtDate(r.fitup_date), fmtDate(r.weld_date), '', r.notes, ''],
  },

  testpacks: {
    sheetName: 'Testpack Register',
    columns: ['TESTPACK NO', 'SYSTEM', 'SUB SYSTEM', 'FLUID', 'TEST MEDIUM', 'TEST PRESSURE', 'DESIGN PRESSURE', 'LINE CHECK DONE', 'LINE CHECK DATE', 'BLINDING DONE', 'BLINDING DATE', 'TEST DATE', 'TEST RESULT', 'REINSTATEMENT DONE', 'REINSTATEMENT DATE', 'STATUS', 'Entry_Status'],
    widths:   [14, 14, 14, 12, 14, 14, 16, 16, 16, 14, 14, 12, 12, 18, 18, 12, 14],
    sample:   ['TP-001', 'NAT GAS', 'SYS-A', 'Natural Gas', 'Water', '45', '30', 'No', '', 'No', '', '', 'PENDING', 'No', '', 'draft', ''],
    table: 'testpacks',
    dataSelect: 'testpack_no, system, sub_system, fluid, test_medium, test_pressure_bar, design_pressure_bar, line_check_done, line_check_date, blinding_done, blinding_date, test_date, test_result, reinstatement_done, reinstatement_date, status',
    dataMap: r => [r.testpack_no, r.system, r.sub_system, r.fluid, r.test_medium, r.test_pressure_bar, r.design_pressure_bar, yn(r.line_check_done), fmtDate(r.line_check_date), yn(r.blinding_done), fmtDate(r.blinding_date), fmtDate(r.test_date), r.test_result, yn(r.reinstatement_done), fmtDate(r.reinstatement_date), r.status, ''],
  },

  materials_bom: {
    sheetName: 'MATERIAL LIST',
    columns: ['PROJECT_ID', 'FN_Pos', 'FN', 'System', 'System Code', 'ISO', 'Sheet', 'Revision', 'pos', 'Description', 'nd', 'qty', 'Category Code', 'Entry_Status'],
    widths:   [14, 10, 8, 16, 14, 30, 8, 8, 6, 35, 10, 10, 14, 14],
    sample:   ['KD-0025', '101_1', '101', 'NATURAL GAS', 'EKG61', 'APP-11-EKG61-BR001-DA1-N', '1', 'R0', '1', 'PIPE SMLS, SA 106B, 14", SCH 40', '14"', '0.5M', '', ''],
    hasCategoryCodeDropdown: true,
    categoryCodeColIndex: 12,
    table: 'materials_bom',
    dataSelect: 'fn_text, pos, revision, description, nd, qty_raw, system, system_code, sheet, category_code, iso_id',
    dataMap: r => ['', '', r.fn_text || '', r.system, r.system_code, '', r.sheet, r.revision, r.pos, r.description, r.nd, r.qty_raw, r.category_code, ''],
  },

  materials_catalogue: {
    sheetName: 'ALL MTOS',
    columns: ['Part No#', 'Product', 'Spec', 'ND', 'Cat', 'Category Code', 'Qty (for Procurement)', 'received', 'UoM', 'Weight (Kg)', 'Unit Price (\u20AC)', 'Origin', 'Mill', 'Delivery time', 'Long Code', 'Entry_Status'],
    widths:   [16, 35, 14, 10, 10, 14, 20, 10, 8, 12, 14, 12, 12, 14, 30, 14],
    sample:   ['PSV-00001', 'PIPE SMLS SA 106B 14" SCH 40', 'SA 106B', '14"', 'Pipe', '', '500', '200', 'm', '1250', '45.00', 'EU', 'ArcelorMittal', '8 weeks', 'APP-11-EKG61-JDI-PSV-00001', ''],
    hasCategoryCodeDropdown: true,
    categoryCodeColIndex: 5,
    table: 'materials_catalogue',
    dataSelect: 'part_no, description, spec, nd, category, category_code, qty_ordered, qty_received_mto, unit_of_measure, weight_kg, unit_price_eur, origin, mill, delivery_time, long_code',
    dataMap: r => [r.part_no, r.description, r.spec, r.nd, r.category, r.category_code, r.qty_ordered, r.qty_received_mto, r.unit_of_measure, r.weight_kg, r.unit_price_eur, r.origin, r.mill, r.delivery_time, r.long_code, ''],
  },

  materials_delivery: {
    sheetName: 'Delivery',
    columns: ['Item Code', 'English Description', 'Qty', 'Total Weight', 'SSCC', 'Pick Number', 'Heat Number', 'Manufacturer/Origin', 'Entry_Status'],
    widths:   [16, 35, 8, 14, 16, 14, 16, 20, 14],
    sample:   ['PSV-00001', 'PIPE SMLS SA 106B 14" SCH 40', '50', '625', 'SSCC-001', 'PK-001', 'HT-2025-001', 'ArcelorMittal / EU', ''],
    table: 'materials_delivery_items',
    dataSelect: 'item_code, description, qty, weight_total_kg, sscc, pick_number, heat_number, manufacturer_origin',
    dataMap: r => [r.item_code, r.description, r.qty, r.weight_total_kg, r.sscc, r.pick_number, r.heat_number, r.manufacturer_origin, ''],
  },
};

// =============================================================================
// HELPERS
// =============================================================================

function fmtDate(v) {
  if (!v) return '';
  return String(v).split('T')[0];
}

function yn(v) {
  if (v === true) return 'Yes';
  if (v === false) return 'No';
  return '';
}

function todayStr() {
  return new Date().toISOString().split('T')[0].replace(/-/g, '');
}

function buildWorkbook(def, dataRows) {
  const rows = [def.columns];
  if (dataRows && dataRows.length > 0) {
    for (const r of dataRows) rows.push(r);
  } else {
    rows.push(def.sample);
  }

  const ws = utils.aoa_to_sheet(rows);

  // Column widths
  ws['!cols'] = def.widths.map(w => ({ wch: w }));

  const wb = utils.book_new();
  utils.book_append_sheet(wb, ws, def.sheetName);

  // Category Code dropdown via hidden Codes sheet
  if (def.hasCategoryCodeDropdown) {
    const codes = [...VALID_CATEGORY_CODES].sort();
    const codesData = [['Code'], ...codes.map(c => [c])];
    const codesWs = utils.aoa_to_sheet(codesData);
    utils.book_append_sheet(wb, codesWs, 'Codes');

    // Hide the Codes sheet
    if (!wb.Workbook) wb.Workbook = {};
    if (!wb.Workbook.Sheets) wb.Workbook.Sheets = [];
    // Ensure sheet metadata entries exist
    while (wb.Workbook.Sheets.length < wb.SheetNames.length) {
      wb.Workbook.Sheets.push({});
    }
    // Hide last sheet (Codes)
    wb.Workbook.Sheets[wb.SheetNames.length - 1].Hidden = 1;

    // Data validation on Category Code column (rows 2-10000)
    const colLetter = utils.encode_col(def.categoryCodeColIndex);
    if (!ws['!dataValidation']) ws['!dataValidation'] = [];
    ws['!dataValidation'].push({
      sqref: `${colLetter}2:${colLetter}10000`,
      type: 'list',
      formula1: 'Codes!$A$2:$A$31',
    });
  }

  return wb;
}

// =============================================================================
// PUBLIC API
// =============================================================================

export async function downloadTemplate(importKey) {
  const def = TEMPLATES[importKey];
  if (!def) { console.error(`[downloadTemplate] unknown key: ${importKey}`); return; }

  const wb = buildWorkbook(def, null);
  writeFile(wb, `${importKey}_template.xlsx`);
}

export async function downloadData(importKey, projectId) {
  const def = TEMPLATES[importKey];
  if (!def) { console.error(`[downloadData] unknown key: ${importKey}`); return; }

  const sb = getSupabase();
  let dataRows = [];

  try {
    // Special handling for delivery items (no project_id column, goes through parent)
    if (importKey === 'materials_delivery') {
      const deliveries = await fetchAll(sb.from('materials_deliveries').select('id').eq('project_id', projectId));
      const delIds = deliveries.map(d => d.id);
      if (delIds.length > 0) {
        const items = await fetchAll(sb.from('materials_delivery_items').select(def.dataSelect).in('delivery_id', delIds));
        dataRows = items.map(def.dataMap);
      }
    } else {
      const rows = await fetchAll(sb.from(def.table).select(def.dataSelect).eq('project_id', projectId));
      dataRows = rows.map(def.dataMap);
    }
  } catch (err) {
    console.error(`[downloadData] fetch error for ${importKey}:`, err);
  }

  const wb = buildWorkbook(def, dataRows.length > 0 ? dataRows : null);
  writeFile(wb, `${importKey}_data_${todayStr()}.xlsx`);
}
