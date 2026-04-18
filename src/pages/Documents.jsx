import { useEffect, useState, useMemo, useRef } from 'react';
import { useProject } from '../lib/project.jsx';
import { getSupabase } from '../lib/supabase';
import { fetchAll } from '../lib/fetchAll';
import { BUCKETS, resolveBucket, storagePath } from '../lib/storage';
import { utils, writeFile } from 'xlsx';

// ── Revision-status badge ────────────────────────────────────────────────────

const REV = {
  A: { bg: '#d1fae5', fg: '#065f46', t: 'A \u2013 Approved' },
  B: { bg: '#fef3c7', fg: '#92400e', t: 'B \u2013 Approved w/ Comment' },
  C: { bg: '#fee2e2', fg: '#991b1b', t: 'C \u2013 Rejected' },
};

function revKey(v) {
  if (!v) return null;
  const c = v.trim().charAt(0).toUpperCase();
  return REV[c] ? c : null;
}

function RevBadge({ value }) {
  const k = revKey(value);
  const s = k
    ? { background: REV[k].bg, color: REV[k].fg }
    : { background: '#e5e7eb', color: '#6b7280' };
  return (
    <span style={{ ...badge, ...s }}>
      {k ? REV[k].t : 'Pending'}
    </span>
  );
}

const badge = {
  display: 'inline-block', padding: '2px 10px', borderRadius: 12,
  fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap',
};

// ── Table columns ────────────────────────────────────────────────────────────

const COLS = [
  { k: 'serial_number',       l: '#',                   w: 50 },
  { k: 'doc_no',              l: 'Doc ID',              w: 220 },
  { k: 'notes',               l: 'Project Doc ID',      w: 200 },
  { k: 'title',               l: 'Title',               w: 280, wrap: true },
  { k: 'file_type',           l: 'Category',            w: 120 },
  { k: 'document_purpose',    l: 'Purpose',             w: 150 },
  { k: 'revision',            l: 'Rev',                 w: 60 },
  { k: 'revision_status',     l: 'Rev Status',          w: 160, render: (v) => <RevBadge value={v} /> },
  { k: 'discipline',          l: 'Discipline',          w: 130 },
  { k: 'owner_name',          l: 'Owner',               w: 120 },
  { k: 'approved_by',         l: 'Approved By',         w: 130 },
  { k: 'uploaded_at',         l: 'Issue Date',          w: 110, render: fmtDate },
  { k: 'revision_date',       l: 'Rev Date',            w: 110, render: fmtDate },
  { k: 'transmittal_in',      l: 'Transmittal In',      w: 140 },
  { k: 'transmittal_in_date', l: 'Transmittal In Date', w: 130, render: fmtDate },
  { k: 'transmittal_out',     l: 'Transmittal Out',     w: 140 },
  { k: 'transmittal_out_date',l: 'Transmittal Out Date',w: 130, render: fmtDate },
  { k: '_bucket',             l: 'Bucket',              w: 120 },
  { k: '_file',               l: 'File',                w: 100 },
];

// ── Panel form fields ────────────────────────────────────────────────────────

const FIELDS = [
  { k: 'serial_number',       l: 'Serial Number',         t: 'number' },
  { k: 'doc_no',              l: 'Document ID',           t: 'text' },
  { k: 'notes',               l: 'Project Doc ID',        t: 'text' },
  { k: 'title',               l: 'Document Title',        t: 'text' },
  { k: 'file_type',           l: 'Document Category',     t: 'text' },
  { k: 'document_purpose',    l: 'Document Purpose',      t: 'text' },
  { k: 'revision',            l: 'Revision',              t: 'text' },
  { k: 'internal_project_id', l: 'Internal / Project ID', t: 'text' },
  { k: 'revision_status',     l: 'Revision Status',       t: 'select',
    opts: ['', 'A', 'B', 'C'] },
  { k: 'discipline',          l: 'Discipline',            t: 'text' },
  { k: 'discipline_code',     l: 'D. Code',               t: 'text' },
  { k: 'owner_name',          l: 'Owner',                 t: 'text' },
  { k: 'approved_by',         l: 'Approved By',           t: 'text' },
  { k: 'uploaded_at',         l: 'Issue Date',            t: 'date' },
  { k: 'revision_date',       l: 'Revision Date',         t: 'date' },
  { k: 'transmittal_in',      l: 'Transmittal In',        t: 'text' },
  { k: 'transmittal_in_date', l: 'Trans. In Date',        t: 'date' },
  { k: 'transmittal_out',     l: 'Transmittal Out',       t: 'text' },
  { k: 'transmittal_out_date',l: 'Trans. Out Date',       t: 'date' },
  { k: 'file_url',            l: 'File Location / URL',   t: 'text' },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(v) {
  if (!v) return '\u2014';
  return String(v).split('T')[0];
}

function blank(pid) {
  const o = { project_id: pid, category_id: null, status: 'active' };
  for (const f of FIELDS) o[f.k] = f.t === 'number' ? null : '';
  return o;
}

// ── inject spinner keyframes once ────────────────────────────────────────────
if (typeof document !== 'undefined' && !document.getElementById('_spinkf')) {
  const s = document.createElement('style');
  s.id = '_spinkf';
  s.textContent = '@keyframes _spin{to{transform:rotate(360deg)}}';
  document.head.appendChild(s);
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════

export default function Documents() {
  const project = useProject();

  // data
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);

  // filters
  const [search, setSearch]   = useState('');
  const [fCat, setFCat]       = useState('');
  const [fDisc, setFDisc]     = useState('');
  const [fRev, setFRev]       = useState('');
  const [fBucket, setFBucket] = useState('');
  const [latestRev, setLatestRev] = useState(false);

  // panel
  const [panel, setPanel]     = useState(null); // { mode:'add'|'edit', data }
  const [saving, setSaving]   = useState(false);

  // upload
  const [uploadId, setUploadId] = useState(null);

  // ── fetch ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    let c = false;
    (async () => {
      setLoading(true);
      try {
        const data = await fetchAll(
          getSupabase().from('documents').select('*')
            .eq('project_id', project.id)
            .order('serial_number', { ascending: true, nullsFirst: false })
        );
        if (!c) setRows(data);
      } catch { /* */ }
      if (!c) setLoading(false);
    })();
    return () => { c = true; };
  }, [project.id]);

  // ── derived filter lists ───────────────────────────────────────────────────

  const cats  = useMemo(() => unique(rows, 'file_type'), [rows]);
  const discs = useMemo(() => unique(rows, 'discipline'), [rows]);

  const term = search.toLowerCase();
  const filtered = rows.filter((r) => {
    if (term && !(
      has(r.doc_no, term) || has(r.title, term) ||
      has(r.notes, term) || has(r.discipline, term)
    )) return false;
    if (fCat  && r.file_type !== fCat)  return false;
    if (fDisc && r.discipline !== fDisc) return false;
    if (fRev  && revKey(r.revision_status) !== fRev) return false;
    if (fBucket && resolveBucket(r.file_type) !== fBucket) return false;
    return true;
  });

  // ── latest-rev filter ──────────────────────────────────────────────────────

  const displayed = useMemo(() => {
    if (!latestRev) return filtered;
    const groups = new Map();
    for (const r of filtered) {
      const key = (r.title || '').trim().toLowerCase();
      if (!key) { /* keep untitled rows as-is */ continue; }
      const existing = groups.get(key);
      if (!existing || revRank(r.revision) > revRank(existing.revision)) {
        groups.set(key, r);
      }
    }
    // Include untitled rows + best-per-title
    const best = new Set([...groups.values()].map((r) => r.id));
    return filtered.filter((r) => {
      const key = (r.title || '').trim().toLowerCase();
      return !key || best.has(r.id);
    });
  }, [filtered, latestRev]);

  // ── panel open / save ──────────────────────────────────────────────────────

  function openAdd()  { setPanel({ mode: 'add',  data: blank(project.id) }); }
  function openEdit(r){ setPanel({ mode: 'edit', data: { ...r } }); }
  function closePanel(){ setPanel(null); }

  async function savePanel() {
    if (!panel) return;
    setSaving(true);
    const supabase = getSupabase();

    if (panel.mode === 'add') {
      const { data, error } = await supabase
        .from('documents').insert(panel.data).select();
      if (!error && data?.length) {
        setRows((p) => [...p, data[0]]);
        closePanel();
      }
    } else {
      const { id, created_at, ...upd } = panel.data;
      const { error } = await supabase
        .from('documents').update(upd).eq('id', id);
      if (!error) {
        setRows((p) => p.map((r) => r.id === id ? { ...r, ...upd } : r));
        closePanel();
      }
    }
    setSaving(false);
  }

  // ── file upload ────────────────────────────────────────────────────────────

  async function handleUpload(doc, file) {
    setUploadId(doc.id);
    const supabase = getSupabase();
    const bucket = resolveBucket(doc.file_type);
    const path = storagePath(project.id, doc, file.name);

    const { error: upErr } = await supabase.storage
      .from(bucket).upload(path, file, { upsert: true });

    if (!upErr) {
      // Store as bucket:path so we know which bucket to fetch from later
      const fileUrl = `${bucket}:${path}`;
      const { error: dbErr } = await supabase
        .from('documents').update({ file_url: fileUrl }).eq('id', doc.id);
      if (!dbErr) {
        setRows((p) => p.map((r) => r.id === doc.id ? { ...r, file_url: fileUrl } : r));
      }
    }
    setUploadId(null);
  }

  // ── export ─────────────────────────────────────────────────────────────────

  function exportXlsx() {
    const out = displayed.map((r) => ({
      '#': r.serial_number,
      'Doc ID': r.doc_no,
      'Project Doc ID': r.notes,
      'Title': r.title,
      'Category': r.file_type,
      'Purpose': r.document_purpose,
      'Revision': r.revision,
      'Internal/Project ID': r.internal_project_id,
      'Status': r.revision_status,
      'Discipline': r.discipline,
      'D. Code': r.discipline_code,
      'Owner': r.owner_name,
      'Approved By': r.approved_by,
      'Issue Date': fmtDate(r.uploaded_at),
      'Revision Date': fmtDate(r.revision_date),
      'Transmittal In': r.transmittal_in,
      'Trans. In Date': fmtDate(r.transmittal_in_date),
      'Transmittal Out': r.transmittal_out,
      'Trans. Out Date': fmtDate(r.transmittal_out_date),
      'File': r.file_url,
    }));
    const ws = utils.json_to_sheet(out);
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, 'Document Register');
    writeFile(wb, `${project.code}_Document_Register.xlsx`);
  }

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ position: 'relative', height: '100%', overflow: 'hidden' }}>

      {/* ── scrollable content area ── */}
      <div style={{
        padding: 'var(--space-lg) var(--space-xl)',
        height: '100%', overflow: 'auto',
        transition: 'margin-right var(--transition-normal)',
        marginRight: panel ? 400 : 0,
      }}>

        {/* header */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start',
                       marginBottom:'var(--space-lg)', flexWrap:'wrap', gap:'var(--space-md)' }}>
          <div>
            <h1 style={{ fontSize:22, fontWeight:600, marginBottom:2 }}>Document Control Register</h1>
            <p style={{ fontSize:13, color:'var(--color-text-muted)' }}>{project.name}</p>
          </div>
          <div style={{ display:'flex', gap:'var(--space-sm)' }}>
            <button onClick={exportXlsx} style={bSec}>Export</button>
            <button onClick={openAdd} style={bPri}>Add Document</button>
          </div>
        </div>

        {/* filters */}
        <div style={{ display:'flex', gap:'var(--space-sm)', marginBottom:'var(--space-md)', flexWrap:'wrap' }}>
          <input type="text" placeholder="Search title, doc ID, discipline\u2026"
            value={search} onChange={(e)=>setSearch(e.target.value)}
            style={{ ...iSt, width:260 }} />
          <button
            onClick={()=>setLatestRev(v=>!v)}
            style={{
              padding:'var(--space-sm) var(--space-md)',
              border: latestRev ? '1px solid var(--sidebar-bg)' : '1px solid var(--color-border)',
              borderRadius:'var(--radius-md)',
              fontSize:13, cursor:'pointer', fontWeight:500,
              background: latestRev ? 'var(--sidebar-bg)' : 'var(--color-surface)',
              color: latestRev ? '#fff' : 'var(--color-text-secondary)',
              transition:'all var(--transition-fast)',
              whiteSpace:'nowrap',
            }}
          >
            {latestRev ? '\u2713 ' : ''}Latest Rev
          </button>
          <select value={fCat} onChange={(e)=>setFCat(e.target.value)} style={sSt}>
            <option value="">All Categories</option>
            {cats.map(c=><option key={c} value={c}>{c}</option>)}
          </select>
          <select value={fDisc} onChange={(e)=>setFDisc(e.target.value)} style={sSt}>
            <option value="">All Disciplines</option>
            {discs.map(d=><option key={d} value={d}>{d}</option>)}
          </select>
          <select value={fRev} onChange={(e)=>setFRev(e.target.value)} style={sSt}>
            <option value="">All Statuses</option>
            <option value="A">A \u2013 Approved</option>
            <option value="B">B \u2013 Approved w/ Comment</option>
            <option value="C">C \u2013 Rejected</option>
          </select>
          <select value={fBucket} onChange={(e)=>setFBucket(e.target.value)} style={sSt}>
            <option value="">All Buckets</option>
            {BUCKETS.map(b=><option key={b.id} value={b.id}>{b.label}</option>)}
          </select>
        </div>

        {/* body */}
        {loading ? (
          <p style={{ color:'var(--color-text-muted)' }}>Loading\u2026</p>
        ) : rows.length === 0 ? (
          <Empty />
        ) : (
          <>
            <p style={{ fontSize:12, color:'var(--color-text-muted)', marginBottom:'var(--space-sm)' }}>
              {displayed.length} of {rows.length} documents{latestRev ? ' (latest rev only)' : ''}
            </p>

            <div style={{ background:'var(--color-surface)', border:'1px solid var(--color-border)',
                           borderRadius:'var(--radius-lg)', overflowX:'auto', width:'100%', maxHeight:'calc(100vh - 240px)' }}>
              <table style={{ minWidth:2400, width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                <thead>
                  <tr style={{ borderBottom:'1px solid var(--color-border)', background:'var(--color-bg)' }}>
                    {COLS.map(c=><th key={c.k} style={{ ...th, minWidth:c.w, position:'sticky', top:0, background:'#ffffff', zIndex:10 }}>{c.l}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {displayed.length === 0 ? (
                    <tr><td colSpan={COLS.length} style={{ padding:'var(--space-lg)', textAlign:'center', color:'var(--color-text-muted)' }}>
                      No results match your filters
                    </td></tr>
                  ) : displayed.map(row=>(
                    <tr key={row.id}
                      onClick={()=>openEdit(row)}
                      style={{ borderBottom:'1px solid var(--color-border)', cursor:'pointer',
                               transition:'background var(--transition-fast)' }}
                      onMouseEnter={e=>(e.currentTarget.style.background='var(--color-bg)')}
                      onMouseLeave={e=>(e.currentTarget.style.background='transparent')}
                    >
                      {COLS.map(c=>{
                        if (c.k === '_file') return (
                          <td key={c.k} style={td} onClick={e=>e.stopPropagation()}>
                            <FileCell row={row} busy={uploadId===row.id} onUpload={handleUpload} />
                          </td>
                        );
                        if (c.k === '_bucket') return (
                          <td key={c.k} style={td}>
                            <span style={{ fontSize:11, color:'var(--color-text-secondary)' }}>
                              {resolveBucket(row.file_type)}
                            </span>
                          </td>
                        );
                        const cellSt = c.wrap ? tdWrap : td;
                        return (
                          <td key={c.k} style={cellSt}>
                            {c.render ? c.render(row[c.k]) : (row[c.k] != null && row[c.k] !== '' ? row[c.k] : '\u2014')}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* ── slide-in panel ── */}
      {panel && (
        <Panel mode={panel.mode} data={panel.data}
          setData={(fn)=>setPanel(p=>({ ...p, data: typeof fn==='function' ? fn(p.data) : fn }))}
          onSave={savePanel} onClose={closePanel} saving={saving} />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// FILE CELL
// ═══════════════════════════════════════════════════════════════════════════════

function FileCell({ row, busy, onUpload }) {
  const ref = useRef(null);

  if (busy) return <Spin />;

  if (row.file_url) {
    const isHttp = row.file_url.startsWith('http');
    if (isHttp) {
      return (
        <a href={row.file_url} target="_blank" rel="noopener noreferrer"
          title="Open external link"
          style={{ color:'var(--color-primary)', fontSize:15, textDecoration:'none' }}>
          &#128279;
        </a>
      );
    }
    // Storage path — format  bucket:path
    return <StorageLink fileUrl={row.file_url} />;
  }

  return (
    <>
      <input ref={ref} type="file" style={{ display:'none' }}
        onChange={e=>{ const f=e.target.files?.[0]; if(f) onUpload(row,f); }} />
      <button onClick={()=>ref.current?.click()} style={uploadBtn}>Upload&nbsp;&#8593;</button>
    </>
  );
}

function StorageLink({ fileUrl }) {
  const [url, setUrl] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleClick(e) {
    e.preventDefault();
    if (url) { window.open(url, '_blank'); return; }

    setLoading(true);
    const parts = fileUrl.split(':');
    const bucket = parts[0];
    const path = parts.slice(1).join(':');
    const supabase = getSupabase();
    const { data } = await supabase.storage.from(bucket)
      .createSignedUrl(path, 3600);
    if (data?.signedUrl) {
      setUrl(data.signedUrl);
      window.open(data.signedUrl, '_blank');
    }
    setLoading(false);
  }

  if (loading) return <Spin />;

  return (
    <a href="#" onClick={handleClick} title="Download from storage"
      style={{ color:'var(--color-primary)', fontSize:15, textDecoration:'none' }}>
      &#128196;
    </a>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SLIDE PANEL
// ═══════════════════════════════════════════════════════════════════════════════

function Panel({ mode, data, setData, onSave, onClose, saving }) {
  function chg(key, val) {
    setData(prev => ({ ...prev, [key]: val === '' ? null : val }));
  }

  return (
    <div style={{
      position:'absolute', top:0, right:0, width:400, height:'100%',
      background:'var(--color-surface)', borderLeft:'1px solid var(--color-border)',
      boxShadow:'-4px 0 16px rgba(0,0,0,0.06)',
      display:'flex', flexDirection:'column', zIndex:10,
    }}>
      {/* header */}
      <div style={{
        display:'flex', alignItems:'center', justifyContent:'space-between',
        padding:'var(--space-md) var(--space-lg)',
        borderBottom:'1px solid var(--color-border)', flexShrink:0,
      }}>
        <p style={{ fontSize:16, fontWeight:600 }}>
          {mode === 'add' ? 'New Document' : 'Edit Document'}
        </p>
        <button onClick={onClose} style={{
          background:'none', border:'none', fontSize:20, cursor:'pointer',
          color:'var(--color-text-muted)', lineHeight:1,
        }}>{'\u00d7'}</button>
      </div>

      {/* body */}
      <div style={{ flex:1, overflow:'auto', padding:'var(--space-lg)' }}>
        <div style={{ display:'flex', flexDirection:'column', gap:'var(--space-md)' }}>
          {FIELDS.map(f=>(
            <label key={f.k} style={{ display:'block' }}>
              <span style={lbl}>{f.l}</span>
              {f.t === 'select' ? (
                <select value={data[f.k]||''} onChange={e=>chg(f.k,e.target.value)} style={fi}>
                  {f.opts.map(o=>(
                    <option key={o} value={o}>
                      {o==='' ? '\u2014 Select \u2014'
                        : o==='A' ? 'A \u2013 Approved'
                        : o==='B' ? 'B \u2013 Approved w/ Comment'
                        : 'C \u2013 Rejected'}
                    </option>
                  ))}
                </select>
              ) : (
                <input type={f.t} value={data[f.k]??''}
                  onChange={e=>chg(f.k,
                    f.t==='number' ? (e.target.value ? Number(e.target.value) : null) : e.target.value
                  )}
                  style={fi} />
              )}
            </label>
          ))}
        </div>
      </div>

      {/* footer */}
      <div style={{
        display:'flex', gap:'var(--space-sm)',
        padding:'var(--space-md) var(--space-lg)',
        borderTop:'1px solid var(--color-border)', flexShrink:0,
      }}>
        <button onClick={onClose} disabled={saving} style={{ ...bSec, flex:1 }}>Cancel</button>
        <button onClick={onSave} disabled={saving} style={{ ...bPri, flex:1 }}>
          {saving ? 'Saving\u2026' : mode==='add' ? 'Create' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TINY COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

function Empty() {
  return (
    <div style={{ padding:'var(--space-xl)', background:'var(--color-surface)',
                  border:'1px solid var(--color-border)', borderRadius:'var(--radius-lg)',
                  textAlign:'center' }}>
      <p style={{ fontSize:15, color:'var(--color-text-secondary)', marginBottom:'var(--space-xs)' }}>
        No documents found.
      </p>
      <p style={{ fontSize:13, color:'var(--color-text-muted)' }}>
        Import data or add documents manually.
      </p>
    </div>
  );
}

function Spin() {
  return (
    <span style={{
      display:'inline-block', width:16, height:16,
      border:'2px solid var(--color-border)',
      borderTopColor:'var(--color-primary)',
      borderRadius:'50%', animation:'_spin .6s linear infinite',
    }} />
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// UTIL
// ═══════════════════════════════════════════════════════════════════════════════

function unique(arr, key) {
  return [...new Set(arr.map(r=>r[key]).filter(Boolean))].sort();
}

function has(val, term) {
  return (val||'').toLowerCase().includes(term);
}

/**
 * Rank a revision string for comparison.
 * Pure numbers compare as integers, letters alphabetically, empty/null = -1.
 */
function revRank(rev) {
  if (rev == null || rev === '') return -1;
  const s = String(rev).trim();
  const n = Number(s);
  if (!isNaN(n) && s !== '') return n * 1000;          // numeric: scale up
  return s.toUpperCase().charCodeAt(0);                 // alpha: code point
}

// ═══════════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════════

const th = {
  textAlign:'left', padding:'10px var(--space-md)', fontWeight:600,
  fontSize:11, color:'var(--color-text-secondary)',
  textTransform:'uppercase', letterSpacing:'0.03em', whiteSpace:'nowrap',
};
const td = {
  padding:'10px var(--space-md)', whiteSpace:'nowrap',
};
const tdWrap = {
  padding:'10px var(--space-md)', whiteSpace:'normal',
  wordBreak:'break-word',
};
const iSt = {
  padding:'var(--space-sm) var(--space-md)',
  border:'1px solid var(--color-border)', borderRadius:'var(--radius-md)',
  fontSize:13, outline:'none', background:'var(--color-surface)',
};
const sSt = {
  padding:'var(--space-sm) var(--space-md)',
  border:'1px solid var(--color-border)', borderRadius:'var(--radius-md)',
  fontSize:13, outline:'none', background:'var(--color-surface)', cursor:'pointer',
};
const lbl = {
  display:'block', fontSize:11, fontWeight:600, color:'var(--color-text-secondary)',
  marginBottom:4, textTransform:'uppercase', letterSpacing:'0.03em',
};
const fi = {
  width:'100%', padding:'8px var(--space-sm)',
  border:'1px solid var(--color-border)', borderRadius:'var(--radius-sm)',
  fontSize:13, outline:'none',
};
const bPri = {
  padding:'8px var(--space-lg)', background:'var(--color-primary)', color:'#fff',
  border:'none', borderRadius:'var(--radius-md)', fontSize:13, fontWeight:500, cursor:'pointer',
};
const bSec = {
  padding:'8px var(--space-lg)', background:'var(--color-surface)', color:'var(--color-text)',
  border:'1px solid var(--color-border)', borderRadius:'var(--radius-md)',
  fontSize:13, cursor:'pointer',
};
const uploadBtn = {
  padding:'2px 8px', fontSize:11,
  background:'var(--color-primary-light)', color:'var(--color-primary)',
  border:'1px solid var(--color-primary)', borderRadius:'var(--radius-sm)',
  cursor:'pointer', fontWeight:500,
};
