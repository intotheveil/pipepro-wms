/**
 * Import definitions for each supported sheet type.
 * Each importer defines: sheet detection, header row, column mapping, transforms.
 */

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
      _rawDrawingNo: str(col('ISO DRAWING', 'ISO', 'DRAWING', 'DRAWING NO', 'ISO NO')),
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
    // Bulk lookup iso_id from drawing_no
    const drawingNos = [...new Set(mapped.map((r) => r._rawDrawingNo).filter(Boolean))];
    const isoMap = {};
    if (drawingNos.length > 0) {
      const { data } = await supabase
        .from('iso_register')
        .select('id, drawing_no')
        .eq('project_id', projectId)
        .in('drawing_no', drawingNos);
      for (const r of data || []) isoMap[r.drawing_no] = r.id;
    }
    for (const r of mapped) {
      r.iso_id = isoMap[r._rawDrawingNo] || null;
      delete r._rawDrawingNo;
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
      _rawDrawingNo: str(col('DRAWING NO', 'DRAWING No', 'ISO DRAWING', 'ISO')),
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
    // Bulk lookup iso_id from drawing_no
    const drawingNos = [...new Set(mapped.map((r) => r._rawDrawingNo).filter(Boolean))];
    const isoMap = {};
    if (drawingNos.length > 0) {
      const { data } = await supabase
        .from('iso_register')
        .select('id, drawing_no')
        .eq('project_id', projectId)
        .in('drawing_no', drawingNos);
      for (const r of data || []) isoMap[r.drawing_no] = r.id;
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

    for (const r of mapped) {
      const isoId = isoMap[r._rawDrawingNo] || null;
      r.iso_id = isoId;
      r.spool_id = spoolMap[`${r._rawSpoolNo}::${isoId || ''}`]
        || spoolMap[r._rawSpoolNo]
        || null;
      delete r._rawDrawingNo;
      delete r._rawSpoolNo;
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
