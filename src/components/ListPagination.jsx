import React from "react";

export function ListPagination({ page, pageCount, pageSize, startIndex, total, label = "records", onPageChange }) {
  if (!total) return null;

  return <nav className="list-pagination" aria-label={`${label} pagination`}>
    <span className="list-pagination-summary">Showing {startIndex + 1}&ndash;{Math.min(startIndex + pageSize, total)} of {total} {label}</span>
    <div className="list-pagination-controls">
      <button type="button" disabled={page === 1} onClick={() => onPageChange(page - 1)} aria-label={`Previous ${label} page`}>&larr; Previous</button>
      <span>Page {page} of {pageCount}</span>
      <button type="button" disabled={page === pageCount} onClick={() => onPageChange(page + 1)} aria-label={`Next ${label} page`}>Next &rarr;</button>
    </div>
  </nav>;
}
