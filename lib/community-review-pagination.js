const REVIEW_PAGE_SIZE = 25;

// Paginate only after decisions have been resolved and all filters applied.
// Notion's raw records also contain decisions, so paging those would lose status.
function paginateReviews(items, params) {
  const topic = String(params.get('topic') || '').trim();
  const risk = String(params.get('risk') || '').trim();
  const status = String(params.get('status') || '').trim();
  const conflict = params.get('conflict');
  const filtered = items.filter(item =>
    (!topic || item.topic === topic)
    && (!risk || item.risk === risk)
    && (!status || item.status === status)
    && (conflict === null || Boolean(item.conflict) === (conflict === 'true'))
  ).sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const requested = Number(params.get('page') || 1);
  const pageCount = Math.max(1, Math.ceil(filtered.length / REVIEW_PAGE_SIZE));
  const page = Math.min(pageCount, Number.isSafeInteger(requested) && requested > 0 ? requested : 1);
  const offset = (page - 1) * REVIEW_PAGE_SIZE;
  return {
    items: filtered.slice(offset, offset + REVIEW_PAGE_SIZE),
    pagination: { page, pageSize: REVIEW_PAGE_SIZE, pageCount, total: filtered.length },
    summary: {
      pending: filtered.filter(item => item.status === 'pending').length,
      sensitive: filtered.filter(item => item.risk === 'high').length,
      conflicts: filtered.filter(item => item.conflict).length,
    },
  };
}

module.exports = { paginateReviews, REVIEW_PAGE_SIZE };
