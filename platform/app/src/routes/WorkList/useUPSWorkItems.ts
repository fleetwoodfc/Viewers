import { useState, useEffect } from 'react';
import { useDebounce } from '../../hooks';
import { mapWorkitemToRow } from './upsUtils';

export interface UPSFilterValues {
  patientName?: string;
  patientId?: string;
  procedureStepLabel?: string;
  procedureStepState?: string;
  pageNumber?: number;
  resultsPerPage?: number;
}

export interface UPSWorkItemsResult {
  workitems: ReturnType<typeof mapWorkitemToRow>[];
  isLoading: boolean;
  error: Error | null;
  total: number;
}

/**
 * Custom hook that fetches UPS workitems from the data source.
 *
 * Falls back gracefully if the data source does not expose
 * `dataSource.query.workitems`.
 *
 * @param dataSource - The active OHIF data source instance
 * @param filterValues - Current filter values; changes are debounced 200 ms
 * @returns workitems, isLoading, error, total
 */
function useUPSWorkItems(dataSource: any, filterValues: UPSFilterValues): UPSWorkItemsResult {
  const [workitems, setWorkitems] = useState<ReturnType<typeof mapWorkitemToRow>[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);
  const [total, setTotal] = useState<number>(0);

  const debouncedFilterValues = useDebounce(filterValues, 200);

  useEffect(() => {
    if (!dataSource) {
      return;
    }

    // Graceful degradation: data source may not support UPS workitems
    if (!dataSource.query?.workitems?.search) {
      setError(new Error('This data source does not support UPS workitems'));
      setWorkitems([]);
      setTotal(0);
      return;
    }

    let cancelled = false;

    const fetchWorkitems = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const rawResults = await dataSource.query.workitems.search(debouncedFilterValues);
        if (!cancelled) {
          const rows = (rawResults || []).map(mapWorkitemToRow);
          setWorkitems(rows);
          setTotal(rows.length);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('UPS workitems fetch error:', err);
          setError(err instanceof Error ? err : new Error(String(err)));
          setWorkitems([]);
          setTotal(0);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    fetchWorkitems();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    dataSource,
    debouncedFilterValues?.patientName,
    debouncedFilterValues?.patientId,
    debouncedFilterValues?.procedureStepLabel,
    debouncedFilterValues?.procedureStepState,
    debouncedFilterValues?.pageNumber,
    debouncedFilterValues?.resultsPerPage,
  ]);

  return { workitems, isLoading, error, total };
}

export default useUPSWorkItems;
