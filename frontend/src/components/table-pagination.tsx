'use client';

import { useMemo } from 'react';
import './table-pagination.css';

type TablePaginationProps = {
  currentPage: number;
  totalPages: number;
  pageStart: number;
  pageEnd: number;
  totalItems: number;
  itemLabel: string;
  onPageChange: (page: number) => void;
  summaryClassName?: string;
};

const MAX_VISIBLE_PAGES = 7;

function buildPageNumbers(currentPage: number, totalPages: number): Array<number | '...'> {
  if (totalPages <= MAX_VISIBLE_PAGES) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }
  const out: Array<number | '...'> = [1];
  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);
  if (start > 2) out.push('...');
  for (let page = start; page <= end; page += 1) out.push(page);
  if (end < totalPages - 1) out.push('...');
  out.push(totalPages);
  return out;
}

export function TablePagination({
  currentPage,
  totalPages,
  pageStart,
  pageEnd,
  totalItems,
  itemLabel,
  onPageChange,
  summaryClassName,
}: TablePaginationProps) {
  const pageNumbers = useMemo(
    () => buildPageNumbers(currentPage, totalPages),
    [currentPage, totalPages],
  );

  return (
    <footer className="table-pagination">
      <p className={summaryClassName}>
        Showing {totalItems === 0 ? 0 : pageStart + 1} to {Math.min(pageEnd, totalItems)} of {totalItems}{' '}
        {itemLabel}
      </p>
      <div>
        <button type="button" onClick={() => onPageChange(Math.max(1, currentPage - 1))} disabled={currentPage <= 1}>
          Previous
        </button>
        {pageNumbers.map((entry, index) =>
          entry === '...' ? (
            <button type="button" key={`ellipsis-${index}`} disabled aria-hidden="true">
              ...
            </button>
          ) : (
            <button
              type="button"
              key={`page-${entry}`}
              className={entry === currentPage ? 'active' : ''}
              onClick={() => onPageChange(entry)}
            >
              {entry}
            </button>
          ),
        )}
        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage >= totalPages}
        >
          Next
        </button>
      </div>
    </footer>
  );
}
