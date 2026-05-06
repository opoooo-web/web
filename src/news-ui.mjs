export function filterItems(items, { query = '', category = '' } = {}) {
  const normalizedQuery = query.trim().toLowerCase();

  return items.filter((item) => {
    const text = [item.title, item.summary, item.sourceName, item.category]
      .join(' ')
      .toLowerCase();
    const matchesQuery = !normalizedQuery || text.includes(normalizedQuery);
    const matchesCategory = !category || item.category === category;
    return matchesQuery && matchesCategory;
  });
}

export function getCategories(items) {
  return [...new Set(items.map((item) => item.category).filter(Boolean))].sort();
}

export function getLeadItem(items) {
  return [...items].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))[0];
}

export function summarizeStatus(status) {
  const errors = status.errors?.length ?? 0;
  const base = `${status.itemCount} items from ${status.sourceCount} sources`;
  return errors > 0 ? `${base} · ${errors} source${errors === 1 ? '' : 's'} needs attention` : base;
}

export function formatDate(value) {
  if (!value) {
    return '';
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

export function canLoadNextPage({ currentPage, totalPages, isLoading }) {
  return !isLoading && currentPage < totalPages;
}

export function shouldEnableCursorEffects({ hover, finePointer, reducedMotion }) {
  return Boolean(hover && finePointer && !reducedMotion);
}
