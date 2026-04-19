/**
 * Strict fingerprint matcher: links materials_bom rows to materials_catalogue
 * via (category_code, normalizeND(nd)) exact match.
 * Ambiguous matches (>1 catalogue candidate) are left unlinked.
 */
import { getSupabase } from '../supabase';
import { fetchAll } from '../fetchAll';
import { normalizeND } from './normalize.js';

const BATCH = 200;

/**
 * Match all unlinked BOM rows for a project to catalogue entries.
 * @param {string} projectId
 * @returns {Promise<{examined, matched, ambiguous, unmatched, ambiguous_samples, unmatched_samples}>}
 */
export async function matchBomToCatalogue(projectId) {
  if (!projectId) return { examined: 0, matched: 0, ambiguous: 0, unmatched: 0, ambiguous_samples: [], unmatched_samples: [] };

  const sb = getSupabase();

  // 1. Fetch unlinked BOM rows with a category_code
  console.info('[matcher] fetching unlinked BOM rows...');
  const bomRows = await fetchAll(
    sb.from('materials_bom')
      .select('id, category_code, nd, description')
      .eq('project_id', projectId)
      .eq('is_current', true)
      .not('category_code', 'is', null)
      .is('catalogue_id', null)
  );
  console.info(`[matcher] ${bomRows.length} unlinked BOM rows with category_code`);

  if (bomRows.length === 0) {
    return { examined: 0, matched: 0, ambiguous: 0, unmatched: 0, ambiguous_samples: [], unmatched_samples: [] };
  }

  // 2. Fetch all catalogue rows
  const catRows = await fetchAll(
    sb.from('materials_catalogue')
      .select('id, category_code, nd')
      .eq('project_id', projectId)
  );
  console.info(`[matcher] ${catRows.length} catalogue rows`);

  // 3. Build lookup: key → list of catalogue IDs
  const catLookup = new Map();
  for (const c of catRows) {
    if (!c.category_code) continue;
    const ndNorm = normalizeND(c.nd) || 'NULL';
    const key = `${c.category_code}|${ndNorm}`;
    if (!catLookup.has(key)) catLookup.set(key, []);
    catLookup.get(key).push(c.id);
  }
  console.info(`[matcher] ${catLookup.size} distinct (category_code, nd) keys in catalogue`);

  // 4. Match each BOM row
  const toUpdate = [];         // { id, catalogue_id }
  let ambiguousCount = 0;
  let unmatchedCount = 0;
  const ambiguousSamples = [];
  const unmatchedSamples = [];

  for (const b of bomRows) {
    const ndNorm = normalizeND(b.nd) || 'NULL';
    const key = `${b.category_code}|${ndNorm}`;
    const candidates = catLookup.get(key);

    if (!candidates || candidates.length === 0) {
      unmatchedCount++;
      if (unmatchedSamples.length < 10) {
        unmatchedSamples.push({ bom_id: b.id, description: b.description, nd: b.nd, category_code: b.category_code });
      }
    } else if (candidates.length === 1) {
      toUpdate.push({ id: b.id, catalogue_id: candidates[0] });
    } else {
      ambiguousCount++;
      if (ambiguousSamples.length < 10) {
        ambiguousSamples.push({ bom_id: b.id, description: b.description, nd: b.nd, category_code: b.category_code, candidate_count: candidates.length });
      }
    }
  }

  console.info(`[matcher] results: ${toUpdate.length} matched, ${ambiguousCount} ambiguous, ${unmatchedCount} unmatched`);

  // 5. Batch UPDATE matched rows
  for (let i = 0; i < toUpdate.length; i += BATCH) {
    const batch = toUpdate.slice(i, i + BATCH);
    for (const { id, catalogue_id } of batch) {
      const { error } = await sb.from('materials_bom')
        .update({ catalogue_id, match_confidence: 1.0 })
        .eq('id', id);
      if (error) console.error(`[matcher] update error for bom ${id}:`, error.message);
    }
  }

  console.info(`[matcher] done: ${toUpdate.length} BOM rows linked to catalogue`);

  return {
    examined: bomRows.length,
    matched: toUpdate.length,
    ambiguous: ambiguousCount,
    unmatched: unmatchedCount,
    ambiguous_samples: ambiguousSamples,
    unmatched_samples: unmatchedSamples,
  };
}
