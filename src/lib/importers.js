/**
 * Import definitions for each supported sheet type.
 * Each importer defines: sheet detection, header row, column mapping, transforms.
 *
 * Also exports standalone material-module importers:
 *   importMaterialsBOM, importMaterialsCatalogue, importMaterialsDelivery
 */
import { read, utils } from 'xlsx';
import { getSupabase } from './supabase';
import { fetchAll } from './fetchAll';
import { normalizeND, normalizeCode } from './materials/normalize.js';
import { VALID_CATEGORY_CODES } from './materials/classify.js';
import { matchBomToCatalogue } from './materials/matcher.js';
export { matchBomToCatalogue };

// -- Parsing helpers ----------------------------------------------------------

function str(val) {
  if (val == null) return '';
  return String(val).trim();
}

function parseDate(val) {
  if (!val) return null;
  // JS Date object (how SheetJS returns Excel dates in browser)
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return null;
    return val.toISOString().split('T')[0];
  }
  // Numeric Excel serial date (SheetJS without cellDates)
  if (typeof val === 'number' && val > 10000 && val < 100000) {
    const d = new Date((val - 25569) * 86400 * 1000);
    return d.toISOString().split('T')[0];
  }
  const s = String(val).trim();
  if (!s || s === 'null' || s === 'undefined') return null;
  // ISO string with time: '2026-04-07T00:00:00.000Z'
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.split('T')[0];
  // Plain date string: '2026-04-07'
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // Datetime: '2026-04-07 00:00:00'
  if (/^\d{4}-\d{2}-\d{2} /.test(s)) return s.split(' ')[0];
  // Excel serial as string
  if (/^\d{5}$/.test(s)) {
    const d = new Date((Number(s) - 25569) * 86400 * 1000);
    return d.toISOString().split('T')[0];
  }
  // DD/MM/YYYY (European)
  const slashParts = s.split('/');
  if (slashParts.length === 3) {
    const [d, m, y] = slashParts;
    if (y && y.length === 4) return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return null;
}

function parseBool(val) {
  if (!val) return false;
  if (typeof val === 'boolean') return val;
  const s = String(val).trim().toLowerCase();
  return s === 'yes' || s === 'true' || s === '1' || s === 'y';
}

function parseStatus(val) {
  if (val == null || val === '') return 'NOT_STARTED';
  const s = String(val).trim().toUpperCase();
  const map = {
    'NOT STARTED': 'NOT_STARTED',
    'NOT_STARTED': 'NOT_STARTED',
    'IN PROGRESS': 'IN_PROGRESS',
    'IN_PROGRESS': 'IN_PROGRESS',
    'COMPLETE': 'COMPLETE',
    'COMPLETED': 'COMPLETE',
    'ON HOLD': 'ON_HOLD',
    'ON_HOLD': 'ON_HOLD',
    'HOLD': 'ON_HOLD',
  };
  return map[s] || 'NOT_STARTED';
}

function parseQualifiedWps(val) {
  if (val == null || val === '') return [];
  return String(val)
    .split(/[,\n;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// -- Header normalization -----------------------------------------------------

function normalizeHeader(h) {
  return String(h || '')
    .trim()
    .toUpperCase()
    .replace(/[\r\n]+/g, ' ');
}

function findColumn(headers, ...candidates) {
  for (const c of candidates) {
    const idx = headers.findIndex(
      (h) => normalizeHeader(h) === c.toUpperCase()
    );
    if (idx !== -1) return idx;
  }
  // Partial match fallback
  for (const c of candidates) {
    const upper = c.toUpperCase();
    const idx = headers.findIndex((h) => normalizeHeader(h).includes(upper));
    if (idx !== -1) return idx;
  }
  return -1;
}

function cellVal(row, idx) {
  if (idx < 0 || idx >= row.length) return null;
  return row[idx];
}

// -- Importer: ISO REGISTER ---------------------------------------------------

const isoRegisterImporter = {
  id: 'iso_register',
  label: 'ISO Register',
  table: 'iso_register',
  headerRow: 1,

  detect(sheetName) {
    const n = sheetName.toUpperCase();
    return n.includes('ISO') && n.includes('REGISTER');
  },

  mapRow(row, headers, projectId) {
    const col = (...names) => cellVal(row, findColumn(headers, ...names));

    const drawingNo = str(col('ISO DRAWING', 'DRAWING'));
    if (!drawingNo) return null; // skip blank rows

    return {
      project_id: projectId,
      fast_no: str(col('FAST NUMBER', 'FAST NO', 'FAST')),
      drawing_no: drawingNo,
      material: str(col('MATERIAL')),
      sheet: str(col('SHEET NO', 'SHEET')),
      revision: str(col('REV', 'REVISION')),
      fluid_code: str(col('FLUID CODE', 'FLUID')),
      system: str(col('SERVICE', 'SYSTEM')),
      piping_class: str(col('PIPING CLASS', 'CLASS')),
      size_nps: str(col('SIZE (NPS)', 'SIZE', 'NPS')),
      ped_category: str(col('PED', 'PED CATEGORY')),
      status: parseStatus(col('STATUS')),
      notes: str(col('NOTES', 'REMARKS')),
    };
  },

  previewColumns: ['drawing_no', 'fast_no', 'revision', 'fluid_code', 'piping_class', 'size_nps', 'status'],
};

// -- Importer: WELDER REGISTER ------------------------------------------------

const welderRegisterImporter = {
  id: 'welders',
  label: 'Welder Register',
  table: 'welders',
  headerRow: 1,

  detect(sheetName) {
    const n = sheetName.toUpperCase();
    return n.includes('WELDER') && n.includes('REGISTER');
  },

  mapRow(row, headers, projectId) {
    const col = (...names) => cellVal(row, findColumn(headers, ...names));

    const name = str(col('FULL NAME', 'NAME'));
    const stamp = str(col('WELDER ID / STAMP', 'WELDER ID', 'STAMP'));
    if (!name && !stamp) return null; // skip blank rows

    return {
      project_id: projectId,
      stamp: stamp,
      name: name || stamp, // fallback to stamp if no name
      qualified_wps: parseQualifiedWps(col('WPS / PROCESS QUAL.', 'WPS', 'PROCESS QUAL')),
      qualification_exp: parseDate(col('EXPIRY DATE', 'EXPIRY', 'EXP DATE')),
      active: parseBool(col('STATUS')),
    };
  },

  previewColumns: ['stamp', 'name', 'qualified_wps', 'qualification_exp', 'active'],
};

// -- Importer: DOCUMENT CONTROL REGISTER --------------------------------------

function parseInt2(val) {
  if (val == null || val === '') return null;
  const n = parseInt(String(val), 10);
  return isNaN(n) ? null : n;
}

const documentControlImporter = {
  id: 'documents',
  label: 'Document Control Register',
  table: 'documents',
  headerRow: 4,

  detect(sheetName) {
    const n = sheetName.toUpperCase().trim();
    return n === 'REGISTER';
  },

  mapRow(row, headers, projectId) {
    const col = (...names) => cellVal(row, findColumn(headers, ...names));

    const docNo = str(col('DOCUMENT ID', 'DOC ID'));
    const docTitle = str(col('DOCUMENT TITLE'));
    if (!docNo && !docTitle) return null; // skip blank rows

    return {
      project_id: projectId,
      doc_no: docNo,
      serial_number: parseInt2(col('SERIAL NUMBER', 'SERIAL NO', 'S/N')),
      notes: str(col('PROJECT DOC ID', 'PROJECT DOCUMENT ID')),
      title: docTitle || docNo,
      file_type: str(col('DOCUMENT CATEGORY', 'CATEGORY')),
      document_purpose: str(col('DOCUMENT PURPOSE', 'PURPOSE')),
      revision: str(col('REVISION', 'REV')),
      internal_project_id: str(col('INTERNAL/ PROJECT ID', 'INTERNAL/PROJECT ID', 'PROJECT ID', 'INTERNAL')),
      uploaded_at: parseDate(col('ISSUE DATE')),
      revision_date: parseDate(col('REVISION DATE', 'REV DATE')),
      discipline: str(col('DISCIPLINE')),
      discipline_code: str(col('D. CODE', 'D.CODE', 'DISCIPLINE CODE')),
      owner_name: str(col('OWNER')),
      approved_by: str(col('APPROVED BY')),
      revision_status: str(col('REVISION STATUS', 'REV STATUS')),
      transmittal_in: str(col('TRANSMITTAL IN')),
      transmittal_in_date: parseDate(col('TRANSMITTAL IN DATE')),
      transmittal_out: str(col('TRANSMITTAL OUT')),
      transmittal_out_date: parseDate(col('TRANSMITTAL OUT DATE')),
      file_url: str(col('FILE LOCATION', 'FILE PATH', 'FILE URL')),
      category_id: null,
      status: 'active',
    };
  },

  onConflict: 'doc_no,project_id',
  previewColumns: ['doc_no', 'serial_number', 'title', 'file_type', 'revision', 'revision_status', 'discipline'],
};

// -- Importer: WPS REGISTER ---------------------------------------------------

const wpsRegisterImporter = {
  id: 'wps_list',
  label: 'WPS Register',
  table: 'wps_list',
  headerRow: 1,

  detect(sheetName) {
    const n = sheetName.toUpperCase();
    return n.includes('WPS') && n.includes('REGISTER');
  },

  mapRow(row, headers, projectId) {
    const col = (...names) => cellVal(row, findColumn(headers, ...names));

    const wpsNo = str(col('WPS REF.', 'WPS REF', 'WPS NO', 'WPS'));
    if (!wpsNo) return null;

    // Validate process against CHECK constraint
    const rawProcess = str(col('PROCESS'));
    const VALID_PROCESS = ['GTAW', 'SMAW', 'FCAW', 'SAW'];
    const process = VALID_PROCESS.includes(rawProcess.toUpperCase())
      ? rawProcess.toUpperCase()
      : rawProcess || null;

    return {
      project_id: projectId,
      wps_no: wpsNo,
      process,
      p_numbers: str(col('BASE MATERIAL GROUP', 'BASE MATERIAL', 'P NUMBERS', 'P-NUMBERS')),
      thickness_range: str(col('THICKNESS RANGE', 'THICKNESS')),
      position: str(col('POSITION')),
    };
  },

  previewColumns: ['wps_no', 'process', 'p_numbers', 'thickness_range', 'position'],
};

// -- Importer: SPOOL DMP -----------------------------------------------------

const spoolDmpImporter = {
  id: 'spools',
  label: 'Spool DMP',
  table: 'spools',
  headerRow: 2, // 3-row header, data starts after row index 2

  detect(sheetName) {
    const n = sheetName.toUpperCase();
    return n.includes('SPOOL') && n.includes('DMP');
  },

  mapRow(row, headers, projectId) {
    const col = (...names) => cellVal(row, findColumn(headers, ...names));

    const spoolNo = str(col('SPOOL NO', 'SPOOL', 'SPOOL NUMBER', 'SPOOL ID'));
    if (!spoolNo) return null;

    const rawShopField = str(col('SHOP/FIELD', 'SHOP / FIELD', 'SHOP_FIELD', 'TYPE')).toLowerCase();
    const shop_field = rawShopField === 'shop' ? 'shop'
      : rawShopField === 'field' ? 'field'
      : null;

    return {
      project_id: projectId,
      spool_no: spoolNo,
      _rawFastNo: str(col('FN', 'FAST NO', 'FAST No', 'FAST No.', 'FAST_NO', 'FAST NUMBER', 'FAST')),
      shop_field,
      material_checked: parseBool(col('MATERIAL CHECKED', 'MAT CHECK', 'MAT CHECKED')),
      material_check_date: parseDate(col('MATERIAL CHECK DATE', 'MAT CHECK DATE')),
      fab_started: parseBool(col('FAB STARTED', 'FAB START')),
      fab_start_date: parseDate(col('FAB START DATE')),
      fabricated: parseBool(col('FABRICATED', 'FAB COMPLETE')),
      fabricated_date: parseDate(col('FABRICATED DATE', 'FAB COMPLETE DATE', 'FAB DATE')),
      qc_released: parseBool(col('QC RELEASED', 'QC RELEASE', 'QC')),
      qc_release_date: parseDate(col('QC RELEASE DATE', 'QC DATE')),
      sent_to_paint: parseBool(col('SENT TO PAINT')),
      sent_to_paint_date: parseDate(col('SENT TO PAINT DATE', 'PAINT SENT DATE')),
      painted: parseBool(col('PAINTED', 'PAINT COMPLETE')),
      painted_date: parseDate(col('PAINTED DATE', 'PAINT DATE')),
      at_laydown: parseBool(col('AT LAYDOWN', 'LAYDOWN')),
      laydown_date: parseDate(col('LAYDOWN DATE')),
      erected: parseBool(col('ERECTED', 'ERECTION')),
      erected_date: parseDate(col('ERECTED DATE', 'ERECTION DATE')),
      notes: str(col('NOTES', 'REMARKS')),
    };
  },

  previewColumns: ['spool_no', 'shop_field', 'fabricated', 'qc_released', 'painted', 'erected'],

  async resolveFK(mapped, projectId, supabase) {
    // Bulk lookup iso_id from fast_no (unique per project, unlike drawing_no)
    const fastNos = [...new Set(mapped.map((r) => r._rawFastNo).filter(Boolean))];
    const isoMap = {};
    if (fastNos.length > 0) {
      const { data } = await supabase
        .from('iso_register')
        .select('id, fast_no')
        .eq('project_id', projectId)
        .in('fast_no', fastNos);
      for (const r of data || []) isoMap[String(r.fast_no)] = r.id;
    }
    let missingFnCount = 0;
    for (const r of mapped) {
      const fn = String(r._rawFastNo || '');
      const isoId = isoMap[fn] || null;
      if (!isoId && fn) missingFnCount++;
      r.iso_id = isoId;
      delete r._rawFastNo;
    }
    if (missingFnCount > 0) {
      console.warn(`[spools import] ${missingFnCount} rows had a FAST NO that did not match any ISO`);
    }
  },
};

// -- Importer: WELD LOG -------------------------------------------------------

function parseNum(val) {
  if (val == null || val === '') return null;
  const n = Number(val);
  return isNaN(n) ? null : n;
}

const weldLogImporter = {
  id: 'weld_log',
  label: 'Weld Log',
  table: 'weld_log',
  headerRow: 1,

  detect(sheetName) {
    const n = sheetName.toUpperCase();
    return n.includes('WELD') && n.includes('LOG');
  },

  mapRow(row, headers, projectId) {
    const col = (...names) => cellVal(row, findColumn(headers, ...names));

    // Col B: FN_WELD is the unique ID (e.g. "FN101_S1")
    const weldId = str(col('FN_WELD', 'FN WELD', 'WELD ID', 'WELD NO'));
    if (!weldId) return null;

    // Col K: Shop / Field
    const rawSF = str(col('SHOP / FIELD', 'SHOP/FIELD', 'SHOP_FIELD')).toLowerCase();
    const shop_field = rawSF === 'shop' ? 'shop' : rawSF === 'field' ? 'field' : null;

    // Col L: Joint Type
    const rawJoint = str(col('JOINT TYPE', 'WELD TYPE')).toUpperCase();
    const VALID_JOINTS = ['BW', 'SW', 'FW', 'SOCKET'];
    const joint_type = VALID_JOINTS.includes(rawJoint)
      ? (rawJoint === 'SOCKET' ? 'socket' : rawJoint) : null;

    // Col M: WELD INCHES — strip " and take first number before X
    const rawInch = str(col('WELD INCHES', 'DIA (INCH)', 'DIA', 'DIAMETER'));
    const inchClean = rawInch.replace(/"/g, '').split(/[xX]/)[0].trim();
    const dia_inch = parseNum(inchClean);

    // Col N: Thickness/Schedule
    const thickness = parseNum(col('THICKNESS/ SCHEDULE', 'THICKNESS', 'THK', 'WALL'));

    // Col O: Fit-Up Date (JS Date object from SheetJS)
    const fit_up_date = parseDate(col('FIT-UP DATE', 'FIT UP DATE', 'FITUP DATE'));

    // Col R: Welding Date
    const weld_date = parseDate(col('WELDING DATE', 'WELD DATE', 'WELDED DATE'));

    // Col A}: Welded Y/N
    const welded = parseBool(col('WELDED', 'WELDED (Y/N)'));

    // Col S: Repair → reject_count
    const repairVal = str(col('REPAIR', 'REPAIR 1'));
    const reject_count = repairVal ? 1 : 0;

    // Col AO: PWHT Y/N
    const pwht_required = parseBool(col('PWHT Y/N', 'PWHT REQUIRED', 'PWHT'));

    // Status derived from dates
    const status = weld_date ? 'welded' : fit_up_date ? 'fit_up' : 'not_started';

    // Col Q: WELDER (store as text for now, no FK)
    const welderText = str(col('WELDER'));
    // Col P: WPS (store as text for now)
    const wpsText = str(col('WPS'));
    // Col D: SYSTEM
    const systemText = str(col('SYSTEM'));
    // Build notes from extra text fields
    const noteParts = [];
    if (wpsText) noteParts.push(`WPS:${wpsText}`);
    if (welderText) noteParts.push(`Welder:${welderText}`);
    if (systemText) noteParts.push(`System:${systemText}`);
    const notes = noteParts.join(' | ') || null;

    return {
      project_id: projectId,
      weld_id: weldId,
      _rawFastNo: str(col('FN', 'FAST NO', 'FAST No', 'FAST No.', 'FAST_NO', 'FAST NUMBER', 'FAST')),
      _rawSpoolNo: str(col('SPOOL ID', 'SPOOL', 'SPOOL NO')),
      joint_type,
      shop_field,
      dia_inch,
      thickness,
      fit_up_date,
      weld_date,
      welded,
      pwht_required,
      status,
      reject_count,
      notes,
    };
  },

  onConflict: 'project_id,weld_id',
  previewColumns: ['weld_id', 'joint_type', 'dia_inch', 'shop_field', 'status', 'weld_date'],

  async resolveFK(mapped, projectId, supabase) {
    // Bulk lookup iso_id from fast_no (unique per project, unlike drawing_no)
    const fastNos = [...new Set(mapped.map((r) => r._rawFastNo).filter(Boolean))];
    const isoMap = {};
    if (fastNos.length > 0) {
      const { data } = await supabase
        .from('iso_register')
        .select('id, fast_no')
        .eq('project_id', projectId)
        .in('fast_no', fastNos);
      for (const r of data || []) isoMap[String(r.fast_no)] = r.id;
    }

    // Bulk lookup spool_id from spool_no + iso_id
    const spoolKeys = [...new Set(mapped.map((r) => r._rawSpoolNo).filter(Boolean))];
    const spoolMap = {};
    if (spoolKeys.length > 0) {
      const { data } = await supabase
        .from('spools')
        .select('id, spool_no, iso_id')
        .eq('project_id', projectId)
        .in('spool_no', spoolKeys);
      for (const r of data || []) {
        spoolMap[`${r.spool_no}::${r.iso_id || ''}`] = r.id;
        if (!spoolMap[r.spool_no]) spoolMap[r.spool_no] = r.id;
      }
    }

    let missingFnCount = 0;
    for (const r of mapped) {
      const fn = String(r._rawFastNo || '');
      const isoId = isoMap[fn] || null;
      if (!isoId && fn) missingFnCount++;
      r.iso_id = isoId;
      r.spool_id = spoolMap[`${r._rawSpoolNo}::${isoId || ''}`]
        || spoolMap[r._rawSpoolNo]
        || null;
      delete r._rawFastNo;
      delete r._rawSpoolNo;
    }
    if (missingFnCount > 0) {
      console.warn(`[weld_log import] ${missingFnCount} rows had a FAST NO that did not match any ISO`);
    }
  },
};

// -- Importer: SUPPORTS LIST --------------------------------------------------

const supportsListImporter = {
  id: 'supports_list',
  label: 'Supports List',
  table: 'supports_list',
  headerRow: 1,

  detect(sheetName) {
    const n = sheetName.toUpperCase().trim();
    // Sheet is called "List" — match exactly or "SUPPORTS LIST"
    return n === 'LIST' || (n.includes('SUPPORT') && n.includes('LIST'));
  },

  mapRow(row, headers, projectId) {
    const col = (...names) => cellVal(row, findColumn(headers, ...names));

    // Actual Excel column: 'Support Unique NN'
    const supportMark = str(col('SUPPORT UNIQUE NN', 'SUPPORT MARK', 'SUPPORT NO', 'MARK', 'SUPPORT ID', 'SUPPORT'));
    if (!supportMark) return null;

    // is_field from 'Is field?' column — handles YES/Yes/yes/true/1
    const is_field = parseBool(col('IS FIELD?', 'IS FIELD', 'IS_FIELD'));

    // Derive shop_field from is_field
    const shop_field = is_field ? 'field' : 'shop';

    // Parse dates
    const fitup_date = parseDate(col('FIT-UP DATE', 'FITUP DATE', 'FIT UP DATE'));
    const weld_date = parseDate(col('WELD DATE', 'WELDED DATE'));

    // Status derived from dates
    const status = weld_date ? 'welded' : fitup_date ? 'fitup' : 'not_started';

    // Welder text goes to notes (no welder_id FK resolution yet)
    const welderText = str(col('WELDER', 'WELDER ID', 'STAMP'));
    const notesText = str(col('NOTES', 'REMARKS'));
    const notes = [welderText, notesText].filter(Boolean).join(' | ') || null;

    return {
      project_id: projectId,
      support_mark: supportMark,
      eidos: str(col('EIDOS STIRIGMATOS', 'EIDOS', 'TYPE EIDOS')),
      shop_field,
      qty: parseInt2(col('QTY.', 'QTY', 'QUANTITY')),
      weight_kg: parseNum(col('WEIGHT', 'WEIGHT (KG)', 'WEIGHT KG', 'WT')),
      fitup_date,
      weld_date,
      status,
      is_field,
      notes,
    };
  },

  previewColumns: ['support_mark', 'eidos', 'shop_field', 'qty', 'weight_kg', 'status'],
};

// -- Importer: TESTPACK REGISTER ----------------------------------------------

const testpackRegisterImporter = {
  id: 'testpacks',
  label: 'Testpack Register',
  table: 'testpacks',
  headerRow: 1,

  detect(sheetName) {
    const n = sheetName.toUpperCase();
    return n.includes('TESTPACK') && n.includes('REGISTER');
  },

  mapRow(row, headers, projectId) {
    const col = (...names) => cellVal(row, findColumn(headers, ...names));

    const testpackNo = str(col('TESTPACK NO', 'TESTPACK', 'TESTPACK ID', 'TEST PACK NO', 'TP NO'));
    if (!testpackNo) return null;

    // test_medium CHECK constraint
    const rawMedium = str(col('TEST MEDIUM', 'MEDIUM'));
    const VALID_MEDIUMS = ['Water', 'Air', 'Nitrogen', 'Service'];
    const test_medium = VALID_MEDIUMS.find((m) => m.toUpperCase() === rawMedium.toUpperCase()) || null;

    // test_result CHECK constraint
    const rawResult = str(col('TEST RESULT', 'RESULT')).toUpperCase();
    const VALID_RESULTS = ['PENDING', 'PASS', 'FAIL'];
    const test_result = VALID_RESULTS.includes(rawResult) ? rawResult : 'PENDING';

    // status CHECK constraint
    const rawStatus = str(col('STATUS')).toLowerCase().replace(/\s+/g, '_');
    const VALID_STATUSES = ['draft', 'line_check', 'blinding', 'testing', 'reinstatement', 'complete'];
    const status = VALID_STATUSES.includes(rawStatus) ? rawStatus : 'draft';

    return {
      project_id: projectId,
      testpack_no: testpackNo,
      system: str(col('SYSTEM')),
      sub_system: str(col('SUB SYSTEM', 'SUBSYSTEM', 'SUB-SYSTEM')),
      fluid: str(col('FLUID', 'FLUID CODE')),
      test_medium,
      test_pressure_bar: parseNum(col('TEST PRESSURE', 'TEST PRESSURE (BAR)', 'PRESSURE')),
      design_pressure_bar: parseNum(col('DESIGN PRESSURE', 'DESIGN PRESSURE (BAR)')),
      line_check_done: parseBool(col('LINE CHECK DONE', 'LINE CHECK')),
      line_check_date: parseDate(col('LINE CHECK DATE')),
      blinding_done: parseBool(col('BLINDING DONE', 'BLINDING')),
      blinding_date: parseDate(col('BLINDING DATE')),
      test_date: parseDate(col('TEST DATE')),
      test_result,
      reinstatement_done: parseBool(col('REINSTATEMENT DONE', 'REINSTATEMENT')),
      reinstatement_date: parseDate(col('REINSTATEMENT DATE')),
      punch_list_clear: parseBool(col('PUNCH LIST CLEAR', 'PUNCH CLEAR', 'PUNCHLIST CLEAR')),
      status,
    };
  },

  previewColumns: ['testpack_no', 'system', 'test_medium', 'test_result', 'status'],
};

// -- Importer: MATERIAL LIST --------------------------------------------------

const materialListImporter = {
  id: 'material_items',
  label: 'Material List',
  table: 'material_items',
  headerRow: 1,

  detect(sheetName) {
    const n = sheetName.toUpperCase();
    return n.includes('MATERIAL') && n.includes('LIST');
  },

  mapRow(row, headers, projectId) {
    const col = (...names) => cellVal(row, findColumn(headers, ...names));

    const desc = str(col('DESCRIPTION', 'DESC'));
    const pos = str(col('POS', 'POSITION'));
    if (!desc && !pos) return null;

    return {
      project_id: projectId,
      fn_pos: str(col('FN_POS', 'FN POS', 'FN_POS.')),
      fast_no: str(col('FN', 'FAST', 'FAST NO')),
      iso_drawing: str(col('ISO', 'ISO DRAWING')),
      sheet: str(col('SHEET', 'SHEET NO')),
      revision: str(col('REVISION', 'REV')),
      pos,
      description: desc,
      size_nd: str(col('ND', 'SIZE', 'SIZE ND')),
      qty_required: parseNum(col('QTY', 'QUANTITY', 'QTY REQUIRED')),
      unit: str(col('UNIT')),
      material_spec: str(col('MATERIAL SPEC', 'MATERIAL', 'SPEC')),
    };
  },

  previewColumns: ['fn_pos', 'iso_drawing', 'description', 'size_nd', 'qty_required', 'unit'],
};

// =============================================================================
// STANDALONE MATERIAL-MODULE IMPORTERS
// =============================================================================

const MAT_BATCH = 200;

function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = read(ev.target.result, { type: 'array', cellDates: true });
        resolve(wb);
      } catch (err) { reject(err); }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

function parseQty(raw) {
  if (raw == null || raw === '') return { qty_raw: '', qty_num: null, qty_unit: null };
  const s = String(raw).trim();
  const upper = s.toUpperCase();
  if (upper.endsWith('M')) {
    const n = parseFloat(s);
    return { qty_raw: s, qty_num: isNaN(n) ? null : n, qty_unit: 'm' };
  }
  if (upper.endsWith('KG')) {
    const n = parseFloat(s);
    return { qty_raw: s, qty_num: isNaN(n) ? null : n, qty_unit: 'kg' };
  }
  const n = Number(s);
  if (!isNaN(n)) return { qty_raw: s, qty_num: n, qty_unit: 'pcs' };
  return { qty_raw: s, qty_num: null, qty_unit: null };
}

// -- A) Materials BOM ---------------------------------------------------------

export async function importMaterialsBOM(file, projectId) {
  const wb = await readFile(file);
  const sheetName = wb.SheetNames.find(n => n.toUpperCase().includes('MATERIAL')) || wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rawRows = utils.sheet_to_json(ws, { header: 1, defval: '' });

  // Header on row 2 (index 1)
  if (rawRows.length < 3) return { total_rows: 0, inserted: 0, updated: 0, unmatched_fn_count: 0, unmatched_fns: [] };
  const headers = rawRows[1];
  const dataRows = rawRows.slice(2);

  const col = (row, ...names) => cellVal(row, findColumn(headers, ...names));

  // Filter phantom/empty rows BEFORE iterating.
  // A real BOM row must have both FN and pos.
  const realRows = dataRows.filter(row => {
    const fn = str(col(row, 'FN', 'FAST NO', 'FAST No', 'FAST No.', 'FAST_NO', 'FAST NUMBER', 'FAST'));
    const pos = col(row, 'POS', 'POSITION');
    return fn && (pos !== null && pos !== undefined && pos !== '');
  });
  console.info(`[importMaterialsBOM] filter: ${dataRows.length} raw rows → ${realRows.length} real rows with FN+pos`);

  const sb = getSupabase();

  // Build iso lookup by fast_no
  const isoData = await fetchAll(sb.from('iso_register').select('id, fast_no').eq('project_id', projectId));
  const isoMap = {};
  for (const r of isoData) isoMap[String(r.fast_no)] = r.id;

  const mapped = [];
  const unmatchedFns = new Set();
  let catCoded = 0;
  let catMissing = 0;

  for (const row of realRows) {
    const pos = col(row, 'POS', 'POSITION');
    const posNum = parseInt(String(pos), 10);
    if (isNaN(posNum)) continue;

    const fnRaw = str(col(row, 'FN', 'FAST NO', 'FAST No', 'FAST No.', 'FAST_NO', 'FAST NUMBER', 'FAST'));
    const isoId = isoMap[fnRaw] || null;
    if (!isoId && fnRaw) unmatchedFns.add(fnRaw);

    const rev = str(col(row, 'REVISION', 'REV')) || 'R0';
    const desc = str(col(row, 'DESCRIPTION', 'DESC'));
    const { qty_raw, qty_num, qty_unit } = parseQty(col(row, 'QTY', 'QUANTITY'));

    // Category code: Excel column only, no classifier fallback
    const rawCatCode = normalizeCode(col(row, 'CATEGORY CODE', 'CAT CODE', 'CAT_CODE', 'CATEGORY'));
    let category_code = null;
    if (rawCatCode && VALID_CATEGORY_CODES.has(rawCatCode)) {
      category_code = rawCatCode;
      catCoded++;
    } else if (rawCatCode) {
      console.warn(`[importMaterialsBOM] unknown category code "${rawCatCode}" at pos ${posNum}, leaving NULL`);
      catMissing++;
    } else {
      catMissing++;
    }

    mapped.push({
      project_id: projectId,
      iso_id: isoId,
      fn_text: isoId ? null : fnRaw || null,
      pos: posNum,
      revision: rev,
      is_current: true,
      description: desc || null,
      nd: str(col(row, 'ND', 'SIZE', 'SIZE ND')) || null,
      qty_raw: qty_raw || null,
      qty_num,
      qty_unit,
      system: str(col(row, 'SYSTEM')) || null,
      system_code: str(col(row, 'SYSTEM CODE', 'SYSTEM_CODE')) || null,
      sheet: str(col(row, 'SHEET', 'SHEET NO')) || null,
      category_code,
      imported_at: new Date().toISOString(),
      imported_from: file.name,
    });
  }

  // Dedup by composite key — last wins
  const bomByKey = new Map();
  for (const r of mapped) {
    const key = `${r.iso_id || r.fn_text}|${r.pos}|${r.revision}`;
    bomByKey.set(key, r);
  }
  const deduped = Array.from(bomByKey.values());
  console.info(`[importMaterialsBOM] dedup: ${mapped.length} mapped → ${deduped.length} unique (iso_id|pos|revision)`);

  // Revision supersede: mark old revisions as not current
  const revGroups = {};
  for (const r of deduped) {
    if (!r.iso_id) continue;
    const key = `${r.iso_id}::${r.revision}`;
    revGroups[key] = { iso_id: r.iso_id, revision: r.revision };
  }
  for (const { iso_id, revision } of Object.values(revGroups)) {
    await sb.from('materials_bom')
      .update({ is_current: false })
      .eq('project_id', projectId)
      .eq('iso_id', iso_id)
      .eq('is_current', true)
      .neq('revision', revision);
  }

  // Upsert in batches
  let inserted = 0;
  for (let i = 0; i < deduped.length; i += MAT_BATCH) {
    const batch = deduped.slice(i, i + MAT_BATCH);
    const { data, error } = await sb.from('materials_bom')
      .upsert(batch, { onConflict: 'project_id,iso_id,pos,revision' })
      .select('id');
    if (error) console.error('[importMaterialsBOM] batch error:', error.message);
    else if (data) inserted += data.length;
  }

  if (unmatchedFns.size > 0) {
    console.warn(`[importMaterialsBOM] ${unmatchedFns.size} FN values did not match any ISO`);
  }

  // Run matcher after import
  const matcher = await matchBomToCatalogue(projectId);
  console.info(`[importMaterialsBOM] done: ${deduped.length} rows, matcher linked ${matcher.matched} to catalogue`);

  return {
    total_rows: realRows.length,
    deduped_count: deduped.length,
    inserted,
    unmatched_fn_count: unmatchedFns.size,
    unmatched_fns: [...unmatchedFns].slice(0, 20),
    category_code_coded: catCoded,
    category_code_missing: catMissing,
    matcher,
  };
}

// -- B) Materials Catalogue (MTO) ---------------------------------------------

export async function importMaterialsCatalogue(file, projectId) {
  const wb = await readFile(file);

  // Find the right sheet: 'ALL MTOS' or first sheet not named 'Pivot'
  let sheetName = wb.SheetNames.find(n => n.toUpperCase() === 'ALL MTOS');
  if (!sheetName) sheetName = wb.SheetNames.find(n => n.toUpperCase() !== 'PIVOT') || wb.SheetNames[0];

  const ws = wb.Sheets[sheetName];
  const rawRows = utils.sheet_to_json(ws, { header: 1, defval: '' });

  // Header on row 2 (index 1)
  if (rawRows.length < 3) return { total_rows: 0, inserted: 0, updated: 0, skipped_no_partno: 0 };
  const headers = rawRows[1];
  const dataRows = rawRows.slice(2);

  const col = (row, ...names) => cellVal(row, findColumn(headers, ...names));

  // Filter phantom/empty rows BEFORE iterating.
  // A real row must have a non-empty part_no.
  const realRows = dataRows.filter(row => {
    const partNo = str(col(row, 'PART NO#', 'PART NO'));
    return partNo && partNo.toUpperCase() !== 'NAN' && partNo.trim() !== '';
  });
  console.info(`[importMaterialsCatalogue] filter: ${dataRows.length} raw rows → ${realRows.length} real rows with part_no`);

  // Canonical column indices (pre-compute for raw jsonb exclusion)
  const CANONICAL_NAMES = [
    'PART NO#', 'PART NO', 'PRODUCT', 'DESCRIPTION', 'SPEC', 'ND', 'CAT',
    'QTY (FOR PROCUREMENT)', 'QTY', 'RECEIVED', 'UOM',
    'WEIGHT (KG)', 'UNIT PRICE (\u20AC)', 'UNIT PRICE (EUR)',
    'ORIGIN', 'MILL', 'DELIVERY TIME', 'LONG CODE',
  ];
  const canonicalIndices = new Set();
  for (const name of CANONICAL_NAMES) {
    const idx = findColumn(headers, name);
    if (idx >= 0) canonicalIndices.add(idx);
  }

  const mapped = [];
  const SYSTEM_TOKEN_RE = /^APP-\d+-([A-Z0-9_]+)-/;
  let catCoded = 0;
  let catMissing = 0;

  for (const row of realRows) {
    const partNo = str(col(row, 'PART NO#', 'PART NO'));

    const longCode = str(col(row, 'LONG CODE')) || null;
    let systemToken = null;
    if (longCode) {
      const m = longCode.match(SYSTEM_TOKEN_RE);
      if (m) systemToken = m[1];
    }

    // Build raw jsonb from non-canonical columns
    const raw = {};
    for (let j = 0; j < row.length; j++) {
      if (!canonicalIndices.has(j) && headers[j] && row[j] !== '' && row[j] != null) {
        raw[str(headers[j])] = row[j];
      }
    }

    const desc = str(col(row, 'PRODUCT', 'DESCRIPTION')) || null;

    // Category code: Excel column only, no classifier fallback
    const rawCatCode = normalizeCode(col(row, 'CATEGORY CODE', 'CAT CODE', 'CAT_CODE', 'CATEGORY'));
    let catCode = null;
    if (rawCatCode && VALID_CATEGORY_CODES.has(rawCatCode)) {
      catCode = rawCatCode;
      catCoded++;
    } else if (rawCatCode) {
      console.warn(`[importMaterialsCatalogue] unknown category code "${rawCatCode}" for part ${partNo}, leaving NULL`);
      catMissing++;
    } else {
      catMissing++;
    }

    mapped.push({
      project_id: projectId,
      part_no: partNo,
      description: desc,
      spec: str(col(row, 'SPEC')) || null,
      nd: str(col(row, 'ND')) || null,
      category: str(col(row, 'CAT')) || null,
      category_code: catCode,
      qty_ordered: parseNum(col(row, 'QTY (FOR PROCUREMENT)', 'QTY')),
      qty_received_mto: parseNum(col(row, 'RECEIVED')),
      unit_of_measure: str(col(row, 'UOM')) || null,
      weight_kg: parseNum(col(row, 'WEIGHT (KG)')),
      unit_price_eur: parseNum(col(row, 'UNIT PRICE (\u20AC)', 'UNIT PRICE (EUR)')),
      origin: str(col(row, 'ORIGIN')) || null,
      mill: str(col(row, 'MILL')) || null,
      delivery_time: str(col(row, 'DELIVERY TIME')) || null,
      long_code: longCode,
      long_code_system_token: systemToken,
      raw: Object.keys(raw).length > 0 ? raw : null,
      imported_at: new Date().toISOString(),
      imported_from: file.name,
    });
  }

  // Dedup by part_no — aggregate numeric fields across duplicate rows
  const byPartNo = new Map();
  for (const row of mapped) {
    const existing = byPartNo.get(row.part_no);
    if (!existing) {
      byPartNo.set(row.part_no, { ...row });
    } else {
      // Sum quantities and weight across duplicate rows
      existing.qty_ordered      = (Number(existing.qty_ordered) || 0) + (Number(row.qty_ordered) || 0);
      existing.qty_received_mto = (Number(existing.qty_received_mto) || 0) + (Number(row.qty_received_mto) || 0);
      existing.weight_kg        = (Number(existing.weight_kg) || 0) + (Number(row.weight_kg) || 0);
      // unit_price_eur: DO NOT sum (per-unit price), keep first-seen
      // description, spec, nd, category, origin, mill, long_code: keep first-seen, warn on divergence
      if (row.description && existing.description && row.description !== existing.description) {
        console.warn(`[importMaterialsCatalogue] part_no ${row.part_no}: differing descriptions across rows — keeping first-seen`);
      }
    }
  }
  const deduped = Array.from(byPartNo.values());
  console.info(`[importMaterialsCatalogue] dedup: ${mapped.length} mapped rows → ${deduped.length} unique part_no (quantities aggregated)`);

  const sb = getSupabase();
  let inserted = 0;

  for (let i = 0; i < deduped.length; i += MAT_BATCH) {
    const batch = deduped.slice(i, i + MAT_BATCH);
    const { data, error } = await sb.from('materials_catalogue')
      .upsert(batch, { onConflict: 'project_id,part_no' })
      .select('id');
    if (error) console.error('[importMaterialsCatalogue] batch error:', error.message);
    else if (data) inserted += data.length;
  }

  // Run matcher after import
  const matcher = await matchBomToCatalogue(projectId);
  console.info(`[importMaterialsCatalogue] done: ${deduped.length} rows, matcher linked ${matcher.matched} to catalogue`);

  return {
    total_rows: realRows.length,
    deduped_count: deduped.length,
    inserted,
    updated: 0,
    category_code_coded: catCoded,
    category_code_missing: catMissing,
    matcher,
  };
}

// -- C) Materials Delivery (NOI) ----------------------------------------------

export async function importMaterialsDelivery(file, projectId, headerInfo) {
  const sb = getSupabase();

  // Step 1: Upsert delivery header
  const deliveryRow = {
    project_id: projectId,
    po_no: headerInfo.po_no,
    noi_no: headerInfo.noi_no || null,
    delivery_date: headerInfo.delivery_date || null,
    supplier: headerInfo.supplier || null,
    notes: headerInfo.notes || null,
    imported_at: new Date().toISOString(),
    imported_from: file.name,
  };

  const { data: delData, error: delErr } = await sb.from('materials_deliveries')
    .upsert(deliveryRow, { onConflict: 'project_id,po_no,noi_no' })
    .select('id')
    .single();

  if (delErr) throw new Error(`Failed to create delivery: ${delErr.message}`);
  const deliveryId = delData.id;

  // Delete existing items for this delivery (re-import replaces cleanly)
  const { error: clearErr } = await sb.from('materials_delivery_items')
    .delete()
    .eq('delivery_id', deliveryId);
  if (clearErr) throw new Error(`Failed to clear existing delivery items before re-import: ${clearErr.message}`);

  // Step 2: Read and parse the Excel
  const wb = await readFile(file);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rawRows = utils.sheet_to_json(ws, { header: 1, defval: '' });

  if (rawRows.length < 2) return { delivery_id: deliveryId, total_rows: 0, inserted: 0, unmatched_item_codes: [] };
  const headers = rawRows[0]; // row 1
  const dataRows = rawRows.slice(1);

  const col = (row, ...names) => cellVal(row, findColumn(headers, ...names));

  // Filter phantom/empty rows — a real delivery item must have an item code
  const realRows = dataRows.filter(row => {
    const ic = str(col(row, 'ITEM CODE'));
    return ic && ic.trim() !== '';
  });
  console.info(`[importMaterialsDelivery] filter: ${dataRows.length} raw rows → ${realRows.length} real rows with item_code`);

  // Build catalogue lookup by part_no
  const catData = await fetchAll(sb.from('materials_catalogue').select('id, part_no').eq('project_id', projectId));
  const catMap = {};
  for (const r of catData) catMap[String(r.part_no)] = r.id;

  // Canonical column indices for raw jsonb exclusion
  const CANONICAL_NAMES = [
    'ITEM CODE', 'ENGLISH DESCRIPTION', 'DESCRIPTION', 'QTY',
    'TOTAL WEIGHT', 'SSCC', 'PICK NUMBER', 'HEAT NUMBER',
    'MANUFACTURER/ORIGIN', 'MANUFACTURER / ORIGIN',
  ];
  const canonicalIndices = new Set();
  for (const name of CANONICAL_NAMES) {
    const idx = findColumn(headers, name);
    if (idx >= 0) canonicalIndices.add(idx);
  }

  const mapped = [];
  const unmatchedCodes = new Set();

  for (const row of realRows) {
    const itemCode = str(col(row, 'ITEM CODE'));
    const desc = str(col(row, 'ENGLISH DESCRIPTION', 'DESCRIPTION'));

    const catalogueId = itemCode ? (catMap[itemCode] || null) : null;
    if (itemCode && !catalogueId) unmatchedCodes.add(itemCode);

    // Build raw jsonb
    const raw = {};
    for (let j = 0; j < row.length; j++) {
      if (!canonicalIndices.has(j) && headers[j] && row[j] !== '' && row[j] != null) {
        raw[str(headers[j])] = row[j];
      }
    }

    mapped.push({
      delivery_id: deliveryId,
      catalogue_id: catalogueId,
      item_code: itemCode || null,
      description: desc || null,
      qty: parseNum(col(row, 'QTY')),
      weight_total_kg: parseNum(col(row, 'TOTAL WEIGHT')),
      sscc: str(col(row, 'SSCC')) || null,
      pick_number: str(col(row, 'PICK NUMBER')) || null,
      heat_number: str(col(row, 'HEAT NUMBER')) || null,
      manufacturer_origin: str(col(row, 'MANUFACTURER/ORIGIN', 'MANUFACTURER / ORIGIN')) || null,
      raw: Object.keys(raw).length > 0 ? raw : null,
    });
  }

  // Insert in batches
  let inserted = 0;
  for (let i = 0; i < mapped.length; i += MAT_BATCH) {
    const batch = mapped.slice(i, i + MAT_BATCH);
    const { data, error } = await sb.from('materials_delivery_items')
      .insert(batch)
      .select('id');
    if (error) console.error('[importMaterialsDelivery] batch error:', error.message);
    else if (data) inserted += data.length;
  }

  if (unmatchedCodes.size > 0) {
    console.warn(`[importMaterialsDelivery] ${unmatchedCodes.size} item codes did not match any catalogue entry`);
  }

  return {
    delivery_id: deliveryId,
    total_rows: mapped.length,
    inserted,
    unmatched_item_codes: [...unmatchedCodes].slice(0, 20),
  };
}

// -- Registry -----------------------------------------------------------------

export const IMPORTERS = [
  isoRegisterImporter,
  welderRegisterImporter,
  documentControlImporter,
  wpsRegisterImporter,
  spoolDmpImporter,
  weldLogImporter,
  supportsListImporter,
  testpackRegisterImporter,
  materialListImporter,
];

export function detectImporter(sheetName) {
  return IMPORTERS.find((imp) => imp.detect(sheetName)) || null;
}

export function parseSheet(rawRows, importer, projectId) {
  const headerIdx = importer.headerRow;
  if (headerIdx >= rawRows.length) return { headers: [], mapped: [], errors: [] };

  const headers = rawRows[headerIdx];
  const dataRows = rawRows.slice(headerIdx + 1);
  const mapped = [];
  const errors = [];

  dataRows.forEach((row, i) => {
    try {
      const record = importer.mapRow(row, headers, projectId);
      if (record) mapped.push(record);
    } catch (err) {
      errors.push({ row: headerIdx + 1 + i + 1, message: err.message });
    }
  });

  return { headers, mapped, errors };
}
