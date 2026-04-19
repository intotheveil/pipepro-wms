import { useState, useRef } from 'react';
import { read, utils } from 'xlsx';
import { useProject } from '../lib/project.jsx';
import { getSupabase } from '../lib/supabase';
import { IMPORTERS, detectImporter, parseSheet, importMaterialsBOM, importMaterialsCatalogue, importMaterialsDelivery, matchBomToCatalogue } from '../lib/importers';
import { downloadTemplate, downloadData } from '../lib/downloads';

const BATCH_SIZE = 200;

const STEPS = { UPLOAD: 0, PREVIEW: 1, IMPORTING: 2, DONE: 3 };

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

export default function Import() {
  const project = useProject();
  const fileRef = useRef(null);

  // Materials import state
  const [matStatus, setMatStatus] = useState(null);   // { type, running, result, error }
  const [deliveryModal, setDeliveryModal] = useState(false);
  const [deliveryForm, setDeliveryForm] = useState({ po_no: '', noi_no: '', delivery_date: todayStr(), supplier: '', notes: '' });
  const deliveryFileRef = useRef(null);
  const bomFileRef = useRef(null);
  const mtoFileRef = useRef(null);

  // State
  const [step, setStep] = useState(STEPS.UPLOAD);
  const [fileName, setFileName] = useState('');
  const [sheets, setSheets] = useState([]);         // [{ name, importer, rawRows }]
  const [selected, setSelected] = useState(null);    // index into sheets
  const [preview, setPreview] = useState(null);      // { headers, mapped, errors, importer }
  const [progress, setProgress] = useState({ done: 0, total: 0, errors: [] });

  // -- Step 1: File upload + sheet detection ----------------------------------

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();

    reader.onload = (ev) => {
      const wb = read(ev.target.result, { type: 'array', cellDates: true });
      const detected = [];

      for (const name of wb.SheetNames) {
        const ws = wb.Sheets[name];
        const rawRows = utils.sheet_to_json(ws, { header: 1, defval: '' });
        const importer = detectImporter(name);
        detected.push({ name, importer, rawRows });
      }

      setSheets(detected);

      // Auto-select first detected importer
      const first = detected.findIndex((s) => s.importer);
      if (first !== -1) selectSheet(first, detected);
    };

    reader.readAsArrayBuffer(file);
  }

  function selectSheet(idx, sheetsArr) {
    const arr = sheetsArr || sheets;
    const s = arr[idx];
    if (!s || !s.importer) return;

    setSelected(idx);
    const result = parseSheet(s.rawRows, s.importer, project.id);
    setPreview({ ...result, importer: s.importer });

    // Block if required columns are missing
    if (result.validation && !result.validation.valid) {
      setStep(STEPS.PREVIEW); // show the rejection message
      return;
    }
    setStep(STEPS.PREVIEW);
  }

  // -- Step 2: Run import -----------------------------------------------------

  async function runImport() {
    if (!preview) return;

    setStep(STEPS.IMPORTING);
    const { mapped, toDelete = [], importer } = preview;
    const total = mapped.length + toDelete.length;
    const errors = [];
    let done = 0;
    let deletedCount = 0;
    const deletedSamples = [];

    setProgress({ done: 0, total, errors: [] });

    const supabase = getSupabase();

    // Phase 1: Delete rows marked with Entry_Status = DELETE
    if (toDelete.length > 0 && importer.deleteKey) {
      for (let i = 0; i < toDelete.length; i += BATCH_SIZE) {
        const batch = toDelete.slice(i, i + BATCH_SIZE);
        for (const row of batch) {
          const keyVal = row[importer.deleteKey];
          if (!keyVal) continue;
          const { error } = await supabase.from(importer.table)
            .delete()
            .eq('project_id', row.project_id)
            .eq(importer.deleteKey, keyVal);
          if (error) {
            errors.push({ batch: 'del', message: `Delete ${keyVal}: ${error.message}`, rows: keyVal });
          } else {
            deletedCount++;
            if (deletedSamples.length < 10) deletedSamples.push(keyVal);
          }
        }
        done = Math.min(i + BATCH_SIZE, toDelete.length);
        setProgress({ done, total, errors: [...errors] });
      }
    }

    // Phase 2: Resolve foreign keys
    if (importer.resolveFK) {
      try {
        await importer.resolveFK(mapped, project.id, supabase);
      } catch (err) {
        errors.push({ batch: 0, message: `FK resolution: ${err.message}`, rows: 'all' });
      }
    }

    // Phase 3: Upsert/insert rows
    const upsertBase = toDelete.length;
    for (let i = 0; i < mapped.length; i += BATCH_SIZE) {
      const batch = mapped.slice(i, i + BATCH_SIZE);
      const { error } = importer.onConflict
        ? await supabase.from(importer.table).upsert(batch, { onConflict: importer.onConflict })
        : await supabase.from(importer.table).insert(batch);

      if (error) {
        errors.push({
          batch: Math.floor(i / BATCH_SIZE) + 1,
          message: error.message,
          rows: `${i + 1}\u2013${Math.min(i + BATCH_SIZE, mapped.length)}`,
        });
      }

      done = upsertBase + Math.min(i + BATCH_SIZE, mapped.length);
      setProgress({ done, total, errors: [...errors] });
    }

    // Log import
    try {
      await supabase.from('import_logs').insert({
        project_id: project.id,
        imported_at: new Date().toISOString(),
        file_name: fileName,
        import_type: importer.id,
        rows_imported: total - errors.reduce((sum, e) => {
          const parts = e.rows.split('\u2013');
          return sum + (parseInt(parts[1]) - parseInt(parts[0]) + 1);
        }, 0),
        rows_skipped: errors.length > 0 ? errors.length : 0,
        errors: errors.length > 0 ? errors : null,
        status: errors.length === 0 ? 'success' : 'partial',
      });
    } catch {
      // import log is best-effort
    }

    setStep(STEPS.DONE);
  }

  // -- Step 3: Reset ----------------------------------------------------------

  function reset() {
    setStep(STEPS.UPLOAD);
    setFileName('');
    setSheets([]);
    setSelected(null);
    setPreview(null);
    setProgress({ done: 0, total: 0, errors: [] });
    if (fileRef.current) fileRef.current.value = '';
  }

  // -- Render -----------------------------------------------------------------

  return (
    <div style={{ padding: 'var(--space-lg) var(--space-xl)', maxWidth: 960 }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 2 }}>Import Data</h1>
      <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 'var(--space-lg)' }}>
        Upload an Excel file to import data into {project.name}
      </p>

      {/* Upload area */}
      {step === STEPS.UPLOAD && (
        <div>
          <div
            style={{
              border: '2px dashed var(--color-border)',
              borderRadius: 'var(--radius-lg)',
              padding: 'var(--space-xl)',
              textAlign: 'center',
              background: 'var(--color-surface)',
              cursor: 'pointer',
            }}
            onClick={() => fileRef.current?.click()}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFile}
              style={{ display: 'none' }}
            />
            <p style={{ fontSize: 15, fontWeight: 500, marginBottom: 'var(--space-xs)' }}>
              Click to select an Excel file
            </p>
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
              .xlsx or .xls — auto-detects sheet type
            </p>
          </div>

          {/* Supported types with download buttons */}
          <div style={{ marginTop: 'var(--space-lg)' }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 'var(--space-sm)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
              Supported imports
            </p>
            {IMPORTERS.map((imp) => (
              <div
                key={imp.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-sm)',
                  padding: 'var(--space-sm) 0',
                  fontSize: 13,
                  color: 'var(--color-text-secondary)',
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-success)', flexShrink: 0 }} />
                <span style={{ flex: 1 }}>{imp.label}</span>
                <button onClick={() => downloadTemplate(imp.id)} style={dlBtn}>Template</button>
                <button onClick={() => downloadData(imp.id, project.id)} style={dlBtn}>Data</button>
              </div>
            ))}
            <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 'var(--space-sm)' }}>
              Upload behaviour: Additive. To delete rows, set Entry_Status to DELETE.
            </p>
          </div>
        </div>
      )}

      {/* Sheet selector (if multiple detected) */}
      {step >= STEPS.PREVIEW && sheets.length > 1 && (
        <div style={{ marginBottom: 'var(--space-md)' }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 'var(--space-xs)', textTransform: 'uppercase' }}>
            Sheets detected
          </p>
          <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap' }}>
            {sheets.map((s, i) => (
              <button
                key={s.name}
                onClick={() => step === STEPS.PREVIEW && selectSheet(i)}
                disabled={!s.importer || step !== STEPS.PREVIEW}
                style={{
                  padding: 'var(--space-xs) var(--space-md)',
                  fontSize: 13,
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  background: i === selected ? 'var(--color-primary-light)' : 'var(--color-surface)',
                  color: !s.importer ? 'var(--color-text-muted)' : 'var(--color-text)',
                  cursor: s.importer && step === STEPS.PREVIEW ? 'pointer' : 'default',
                  opacity: !s.importer ? 0.5 : 1,
                }}
              >
                {s.name}
                {s.importer && (
                  <span style={{ fontSize: 11, color: 'var(--color-text-muted)', marginLeft: 6 }}>
                    → {s.importer.label}
                  </span>
                )}
                {!s.importer && (
                  <span style={{ fontSize: 11, color: 'var(--color-text-muted)', marginLeft: 6 }}>
                    (skipped)
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Preview */}
      {step === STEPS.PREVIEW && preview && (
        <div>
          {/* Validation rejection */}
          {preview.validation && !preview.validation.valid && (
            <div style={{ padding: 'var(--space-lg)', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-md)' }}>
              <p style={{ fontSize: 15, fontWeight: 600, color: '#991b1b', marginBottom: 'var(--space-sm)' }}>
                Missing required columns
              </p>
              <p style={{ fontSize: 13, color: '#991b1b', marginBottom: 'var(--space-md)' }}>
                {preview.validation.missing.join(', ')}
              </p>
              <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                Download a Template or Data file to start from the correct format.
              </p>
              <button onClick={reset} style={{ ...btnSecondary, marginTop: 'var(--space-md)' }}>Back</button>
            </div>
          )}

          {/* Normal preview (validation passed) */}
          {(!preview.validation || preview.validation.valid) && (<>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 'var(--space-md)',
            flexWrap: 'wrap',
            gap: 'var(--space-sm)',
          }}>
            <div>
              <p style={{ fontSize: 15, fontWeight: 500 }}>
                {preview.importer.label}
              </p>
              <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
                {preview.mapped.length} rows to upsert
                {(preview.toDelete?.length > 0) && (
                  <span style={{ color: '#ef4444', marginLeft: 8 }}>
                    {preview.toDelete.length} to delete
                  </span>
                )}
                {preview.errors.length > 0 && (
                  <span style={{ color: 'var(--color-warning)', marginLeft: 8 }}>
                    {preview.errors.length} parse errors
                  </span>
                )}
              </p>
              {preview.validation?.unknown?.length > 0 && (
                <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>
                  Ignored {preview.validation.unknown.length} unknown column{preview.validation.unknown.length !== 1 ? 's' : ''}: {preview.validation.unknown.slice(0, 5).join(', ')}{preview.validation.unknown.length > 5 ? '...' : ''}
                </p>
              )}
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
              <button onClick={reset} style={btnSecondary}>Cancel</button>
              <button
                onClick={runImport}
                disabled={preview.mapped.length === 0}
                style={{
                  ...btnPrimary,
                  opacity: preview.mapped.length === 0 ? 0.5 : 1,
                  cursor: preview.mapped.length === 0 ? 'not-allowed' : 'pointer',
                }}
              >
                Import {preview.mapped.length + (preview.toDelete?.length || 0)} rows
              </button>
            </div>
          </div>

          {/* Preview table */}
          <div style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)',
            overflow: 'auto',
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg)' }}>
                  <th style={thStyle}>#</th>
                  {preview.importer.previewColumns.map((c) => (
                    <th key={c} style={thStyle}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.mapped.slice(0, 5).map((row, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={tdStyle}>{i + 1}</td>
                    {preview.importer.previewColumns.map((c) => (
                      <td key={c} style={tdStyle}>
                        {formatCell(row[c])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {preview.mapped.length > 5 && (
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 'var(--space-sm)' }}>
              Showing 5 of {preview.mapped.length} rows
            </p>
          )}
        </>)}
        </div>
      )}

      {/* Importing progress */}
      {step === STEPS.IMPORTING && (
        <div style={{
          padding: 'var(--space-xl)',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
          textAlign: 'center',
        }}>
          <p style={{ fontSize: 15, fontWeight: 500, marginBottom: 'var(--space-md)' }}>
            Importing...
          </p>
          <ProgressBar done={progress.done} total={progress.total} />
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 'var(--space-sm)' }}>
            {progress.done} / {progress.total} rows
          </p>
        </div>
      )}

      {/* Done */}
      {step === STEPS.DONE && (
        <div style={{
          padding: 'var(--space-xl)',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
        }}>
          <p style={{
            fontSize: 16,
            fontWeight: 500,
            marginBottom: 'var(--space-md)',
            color: progress.errors.length === 0 ? 'var(--color-success)' : 'var(--color-warning)',
          }}>
            {progress.errors.length === 0 ? 'Import complete' : 'Import completed with errors'}
          </p>

          <div style={{ display: 'flex', gap: 'var(--space-lg)', marginBottom: 'var(--space-lg)' }}>
            <Stat label="Total rows" value={progress.total} />
            <Stat
              label="Imported"
              value={progress.total - progress.errors.length}
              color="var(--color-success)"
            />
            <Stat
              label="Errors"
              value={progress.errors.length}
              color={progress.errors.length > 0 ? 'var(--color-danger)' : 'var(--color-text-muted)'}
            />
          </div>

          {progress.errors.length > 0 && (
            <div style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-md)',
              marginBottom: 'var(--space-lg)',
              maxHeight: 200,
              overflow: 'auto',
            }}>
              {progress.errors.map((err, i) => (
                <p key={i} style={{ fontSize: 12, color: 'var(--color-danger)', marginBottom: 4 }}>
                  Batch {err.batch} (rows {err.rows}): {err.message}
                </p>
              ))}
            </div>
          )}

          <button onClick={reset} style={btnPrimary}>Import another file</button>
        </div>
      )}

      {/* ================================================================= */}
      {/* MATERIALS IMPORTS                                                  */}
      {/* ================================================================= */}
      <div style={{ marginTop: 'var(--space-xl)', borderTop: '1px solid var(--color-border)', paddingTop: 'var(--space-lg)' }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 'var(--space-md)' }}>Materials</h2>
        <div style={{ display: 'flex', gap: 'var(--space-md)', flexWrap: 'wrap', marginBottom: 'var(--space-md)' }}>
          {/* BOM */}
          <div style={matCard}>
            <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Import Materials BOM</p>
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 'var(--space-sm)' }}>Per-isometric material list</p>
            <input ref={bomFileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }}
              onChange={async (e) => {
                const f = e.target.files?.[0]; if (!f) return;
                e.target.value = '';
                setMatStatus({ type: 'bom', running: true, result: null, error: null });
                try {
                  const result = await importMaterialsBOM(f, project.id);
                  setMatStatus({ type: 'bom', running: false, result, error: null });
                } catch (err) {
                  console.error('[Import/BOM]', err);
                  setMatStatus({ type: 'bom', running: false, result: null, error: err.message });
                }
              }} />
            <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center' }}>
              <button onClick={() => bomFileRef.current?.click()} style={btnPrimary}
                disabled={matStatus?.type === 'bom' && matStatus.running}>
                {matStatus?.type === 'bom' && matStatus.running ? 'Importing...' : 'Select File'}
              </button>
              <button onClick={() => downloadTemplate('materials_bom')} style={dlBtn}>Template</button>
              <button onClick={() => downloadData('materials_bom', project.id)} style={dlBtn}>Data</button>
            </div>
          </div>

          {/* MTO Catalogue */}
          <div style={matCard}>
            <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Import Project MTO</p>
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 'var(--space-sm)' }}>Master catalogue from MTO spreadsheet</p>
            <input ref={mtoFileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }}
              onChange={async (e) => {
                const f = e.target.files?.[0]; if (!f) return;
                e.target.value = '';
                setMatStatus({ type: 'mto', running: true, result: null, error: null });
                try {
                  const result = await importMaterialsCatalogue(f, project.id);
                  setMatStatus({ type: 'mto', running: false, result, error: null });
                } catch (err) {
                  console.error('[Import/MTO]', err);
                  setMatStatus({ type: 'mto', running: false, result: null, error: err.message });
                }
              }} />
            <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center' }}>
              <button onClick={() => mtoFileRef.current?.click()} style={btnPrimary}
                disabled={matStatus?.type === 'mto' && matStatus.running}>
                {matStatus?.type === 'mto' && matStatus.running ? 'Importing...' : 'Select File'}
              </button>
              <button onClick={() => downloadTemplate('materials_catalogue')} style={dlBtn}>Template</button>
              <button onClick={() => downloadData('materials_catalogue', project.id)} style={dlBtn}>Data</button>
            </div>
          </div>

          {/* Delivery / NOI */}
          <div style={matCard}>
            <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Import Material Delivery / NOI</p>
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 'var(--space-sm)' }}>Delivery note with line items</p>
            <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center' }}>
              <button onClick={() => { setDeliveryModal(true); setDeliveryForm({ po_no: '', noi_no: '', delivery_date: todayStr(), supplier: '', notes: '' }); }} style={btnPrimary}
                disabled={matStatus?.type === 'delivery' && matStatus.running}>
                {matStatus?.type === 'delivery' && matStatus.running ? 'Importing...' : 'Enter Details'}
              </button>
              <button onClick={() => downloadTemplate('materials_delivery')} style={dlBtn}>Template</button>
              <button onClick={() => downloadData('materials_delivery', project.id)} style={dlBtn}>Data</button>
            </div>
          </div>
        </div>

        {/* Re-run matcher */}
        <div style={{ marginBottom: 'var(--space-md)' }}>
          <button
            onClick={async () => {
              setMatStatus({ type: 'matcher', running: true, result: null, error: null });
              try {
                const result = await matchBomToCatalogue(project.id);
                setMatStatus({ type: 'matcher', running: false, result, error: null });
              } catch (err) {
                console.error('[Import/Matcher]', err);
                setMatStatus({ type: 'matcher', running: false, result: null, error: err.message });
              }
            }}
            disabled={matStatus?.type === 'matcher' && matStatus.running}
            style={btnSecondary}
          >
            {matStatus?.type === 'matcher' && matStatus.running ? 'Running...' : 'Re-run Catalogue Matcher'}
          </button>
          <span style={{ fontSize: 12, color: 'var(--color-text-muted)', marginLeft: 'var(--space-sm)' }}>
            Re-link BOM rows to catalogue entries after correcting data.
          </span>
        </div>

        {/* Materials import result */}
        {matStatus && !matStatus.running && (matStatus.result || matStatus.error) && (
          <div style={{
            padding: 'var(--space-md)',
            background: matStatus.error ? '#fef2f2' : '#f0fdf4',
            border: `1px solid ${matStatus.error ? '#fecaca' : '#bbf7d0'}`,
            borderRadius: 'var(--radius-md)',
            marginBottom: 'var(--space-md)',
          }}>
            {matStatus.error ? (
              <p style={{ fontSize: 13, color: '#991b1b' }}>Error: {matStatus.error}</p>
            ) : (
              <div style={{ fontSize: 13, color: '#065f46' }}>
                <p style={{ fontWeight: 600, marginBottom: 4 }}>
                  {matStatus.type === 'bom' ? 'BOM' : matStatus.type === 'mto' ? 'MTO Catalogue' : 'Delivery'} import complete
                </p>
                {Object.entries(matStatus.result).map(([k, v]) => (
                  <p key={k} style={{ marginBottom: 2 }}>
                    {k}: {Array.isArray(v) ? (v.length > 0 ? v.join(', ') : 'none') : String(v)}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Delivery modal */}
      {deliveryModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}
          onClick={() => setDeliveryModal(false)}>
          <div style={{ background: '#fff', borderRadius: 'var(--radius-lg)', padding: 24, minWidth: 400, maxWidth: 480, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}
            onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 'var(--space-md)' }}>Import Material Delivery</h3>
            {[
              ['po_no', 'PO Number', 'text', true],
              ['noi_no', 'NOI / Delivery Number', 'text', false],
              ['delivery_date', 'Delivery Date', 'date', true],
              ['supplier', 'Supplier', 'text', false],
            ].map(([key, label, type, req]) => (
              <div key={key} style={{ marginBottom: 'var(--space-sm)' }}>
                <label style={matLbl}>{label}{req ? ' *' : ''}</label>
                <input type={type} value={deliveryForm[key] || ''} onChange={(e) => setDeliveryForm(prev => ({ ...prev, [key]: e.target.value }))}
                  style={matInput} />
              </div>
            ))}
            <div style={{ marginBottom: 'var(--space-sm)' }}>
              <label style={matLbl}>Notes</label>
              <textarea value={deliveryForm.notes || ''} rows={2} onChange={(e) => setDeliveryForm(prev => ({ ...prev, notes: e.target.value }))}
                style={{ ...matInput, resize: 'vertical', fontFamily: 'inherit' }} />
            </div>
            <div style={{ marginBottom: 'var(--space-md)' }}>
              <label style={matLbl}>Excel File *</label>
              <input ref={deliveryFileRef} type="file" accept=".xlsx,.xls" style={{ fontSize: 13 }} />
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-sm)', justifyContent: 'flex-end' }}>
              <button onClick={() => setDeliveryModal(false)} style={btnSecondary}>Cancel</button>
              <button
                disabled={!deliveryForm.po_no || !deliveryForm.delivery_date}
                onClick={async () => {
                  const f = deliveryFileRef.current?.files?.[0];
                  if (!f || !deliveryForm.po_no) return;
                  setDeliveryModal(false);
                  setMatStatus({ type: 'delivery', running: true, result: null, error: null });
                  try {
                    const result = await importMaterialsDelivery(f, project.id, deliveryForm);
                    setMatStatus({ type: 'delivery', running: false, result, error: null });
                  } catch (err) {
                    console.error('[Import/Delivery]', err);
                    setMatStatus({ type: 'delivery', running: false, result: null, error: err.message });
                  }
                }}
                style={btnPrimary}
              >Import</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// -- Sub-components -----------------------------------------------------------

function ProgressBar({ done, total }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div style={{
      width: '100%',
      height: 8,
      background: 'var(--color-border)',
      borderRadius: 4,
      overflow: 'hidden',
    }}>
      <div style={{
        width: `${pct}%`,
        height: '100%',
        background: 'var(--color-primary)',
        borderRadius: 4,
        transition: 'width 300ms ease',
      }} />
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div>
      <div style={{ fontSize: 24, fontWeight: 600, color: color || 'var(--color-text)' }}>
        {value}
      </div>
      <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{label}</div>
    </div>
  );
}

function formatCell(val) {
  if (val == null || val === '') return '\u2014';
  if (Array.isArray(val)) return val.join(', ') || '\u2014';
  if (typeof val === 'boolean') return val ? 'Yes' : 'No';
  return String(val);
}

// -- Shared styles ------------------------------------------------------------

const thStyle = {
  textAlign: 'left',
  padding: '8px var(--space-md)',
  fontWeight: 600,
  fontSize: 11,
  color: 'var(--color-text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: '0.03em',
  whiteSpace: 'nowrap',
};

const tdStyle = {
  padding: '8px var(--space-md)',
  whiteSpace: 'nowrap',
  maxWidth: 200,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

const btnPrimary = {
  padding: '8px var(--space-lg)',
  background: 'var(--color-primary)',
  color: '#fff',
  border: 'none',
  borderRadius: 'var(--radius-md)',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
};

const btnSecondary = {
  padding: '8px var(--space-lg)',
  background: 'var(--color-surface)',
  color: 'var(--color-text)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-md)',
  fontSize: 13,
  cursor: 'pointer',
};

const matCard = {
  flex: '1 1 200px',
  padding: 'var(--space-md)',
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-lg)',
};

const matLbl = {
  display: 'block',
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--color-text-secondary)',
  marginBottom: 4,
  textTransform: 'uppercase',
  letterSpacing: '0.03em',
};

const matInput = {
  width: '100%',
  padding: '8px var(--space-sm)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)',
  fontSize: 13,
  outline: 'none',
};

const dlBtn = {
  padding: '4px 8px',
  background: 'transparent',
  color: 'var(--color-primary)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)',
  fontSize: 11,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};
