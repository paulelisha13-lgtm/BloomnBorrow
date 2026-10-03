import { useEffect, useState } from "react";

export const ROWS_PER_PAGE = 10;

export function usePagination(total, pageSize = ROWS_PER_PAGE) {
  const [requestedPage, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, pageCount);
  const startIndex = (page - 1) * pageSize;

  useEffect(() => {
    if (requestedPage !== page) setPage(page);
  }, [requestedPage, page]);

  return { page, pageCount, pageSize, startIndex, setPage };
}
