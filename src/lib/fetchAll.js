/**
 * Paginated fetch that bypasses Supabase's 1000-row server default.
 * Pass a fully-built query chain — fetchAll handles .range() pagination.
 *
 * Usage:
 *   const data = await fetchAll(supabase.from('table').select('*').eq('project_id', id))
 *
 * @param {object} query - A Supabase query builder (before .range())
 * @returns {Promise<Array>}
 */
export async function fetchAll(query) {
  const PAGE = 1000;
  let allData = [];
  let from = 0;

  while (true) {
    const { data, error } = await query.range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data?.length) break;
    allData = [...allData, ...data];
    if (data.length < PAGE) break;
    from += PAGE;
  }

  return allData;
}
