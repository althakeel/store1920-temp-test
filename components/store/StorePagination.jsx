'use client';

function buildVisiblePages(page, totalPages) {
  const start = Math.max(1, Math.min(page - 2, totalPages - 4));
  return Array.from({ length: Math.min(5, totalPages) }, (_, index) => start + index).filter(
    (pageNumber) => pageNumber <= totalPages,
  );
}

export default function StorePagination({
  pagination,
  onPageChange,
  itemLabel = 'items',
  disabled = false,
  className = '',
}) {
  const page = pagination?.page || 1;
  const limit = pagination?.limit || 25;
  const total = pagination?.total || 0;
  const totalPages = Math.max(1, Number(pagination?.totalPages || pagination?.pages || 1));

  if (total <= 0) return null;

  const rangeStart = total ? (page - 1) * limit + 1 : 0;
  const rangeEnd = Math.min(page * limit, total);
  const visiblePageNumbers = buildVisiblePages(page, totalPages);
  const showPageButtons = totalPages > 1;

  return (
    <div className={`flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-4 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between ${className}`}>
      <p className="text-sm text-slate-500">
        Showing {rangeStart}–{rangeEnd} of {total.toLocaleString()} {itemLabel}
        {showPageButtons ? ` · Page ${page} of ${totalPages.toLocaleString()}` : ''}
      </p>
      {showPageButtons ? (
        <div className="flex flex-wrap items-center gap-2">
          {totalPages > 5 ? (
            <button
              type="button"
              disabled={page <= 1 || disabled}
              onClick={() => onPageChange(1)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              First
            </button>
          ) : null}
          <button
            type="button"
            disabled={page <= 1 || disabled}
            onClick={() => onPageChange(page - 1)}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Previous
          </button>
          {visiblePageNumbers.map((pageNumber) => (
            <button
              key={pageNumber}
              type="button"
              disabled={disabled}
              onClick={() => onPageChange(pageNumber)}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                page === pageNumber
                  ? 'bg-slate-900 text-white'
                  : 'border border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              {pageNumber}
            </button>
          ))}
          <button
            type="button"
            disabled={page >= totalPages || disabled}
            onClick={() => onPageChange(page + 1)}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next
          </button>
          {totalPages > 5 ? (
            <button
              type="button"
              disabled={page >= totalPages || disabled}
              onClick={() => onPageChange(totalPages)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Last
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
