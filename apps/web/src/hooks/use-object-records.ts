"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { FilterGroup, SortConfig } from "@openclaw-crm/shared";

interface AttributeDef {
  id: string;
  slug: string;
  title: string;
  type: string;
  isRequired: boolean;
  isMultiselect: boolean;
  options?: { id: string; title: string; color: string }[];
  statuses?: { id: string; title: string; color: string; isActive: boolean }[];
}

interface ObjectData {
  id: string;
  slug: string;
  singularName: string;
  pluralName: string;
  icon: string;
  attributes: AttributeDef[];
}

interface RecordRow {
  id: string;
  values: Record<string, unknown>;
}

const EMPTY_FILTER: FilterGroup = { operator: "and", conditions: [] };
const PAGE_SIZE = 50;

export function useObjectRecords(slug: string) {
  const [object, setObject] = useState<ObjectData | null>(null);
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const nextCursorRef = useRef<string | null>(null);

  // Filter & sort state
  const [filter, setFilter] = useState<FilterGroup>(EMPTY_FILTER);
  const [sorts, setSorts] = useState<SortConfig[]>([]);

  // Track whether filter/sort have active values
  const hasFilter = filter.conditions.length > 0;
  const hasSort = sorts.length > 0;

  // Fetch object definition once per slug change
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/v1/objects/${slug}`);
      if (res.ok && !cancelled) {
        const data = await res.json();
        setObject(data.data);
      }
    })();
    return () => { cancelled = true; };
  }, [slug]);

  // Fetch first page of records when slug, filter, or sorts change
  const fetchRecords = useCallback(async () => {
    setLoading(true);
    nextCursorRef.current = null;
    try {
      let recData: any;
      if (hasFilter || hasSort) {
        const queryRes = await fetch(`/api/v1/objects/${slug}/records/query`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            limit: PAGE_SIZE,
            cursor: "",
            ...(hasFilter ? { filter } : {}),
            ...(hasSort ? { sorts } : {}),
          }),
        });
        if (queryRes.ok) {
          recData = await queryRes.json();
        }
      } else {
        const recRes = await fetch(`/api/v1/objects/${slug}/records?cursor=&limit=${PAGE_SIZE}`);
        if (recRes.ok) {
          recData = await recRes.json();
        }
      }

      if (recData) {
        setRecords(recData.data.records);
        setTotal(recData.data.pagination.total ?? recData.data.records.length);
        nextCursorRef.current = recData.data.pagination.nextCursor ?? null;
        setHasMore(recData.data.pagination.hasMore ?? false);
      }
    } finally {
      setLoading(false);
    }
  }, [slug, filter, sorts, hasFilter, hasSort]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  // Load next page of records
  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore || !nextCursorRef.current) return;
    setLoadingMore(true);
    try {
      let recData: any;
      if (hasFilter || hasSort) {
        const queryRes = await fetch(`/api/v1/objects/${slug}/records/query`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            limit: PAGE_SIZE,
            cursor: nextCursorRef.current,
            ...(hasFilter ? { filter } : {}),
            ...(hasSort ? { sorts } : {}),
          }),
        });
        if (queryRes.ok) {
          recData = await queryRes.json();
        }
      } else {
        const recRes = await fetch(
          `/api/v1/objects/${slug}/records?cursor=${encodeURIComponent(nextCursorRef.current)}&limit=${PAGE_SIZE}`
        );
        if (recRes.ok) {
          recData = await recRes.json();
        }
      }

      if (recData) {
        setRecords((prev) => [...prev, ...recData.data.records]);
        nextCursorRef.current = recData.data.pagination.nextCursor ?? null;
        setHasMore(recData.data.pagination.hasMore ?? false);
      }
    } finally {
      setLoadingMore(false);
    }
  }, [slug, filter, sorts, hasFilter, hasSort, hasMore, loadingMore]);

  const updateRecord = useCallback(
    async (recordId: string, attrSlug: string, value: unknown) => {
      setRecords((prev) =>
        prev.map((r) =>
          r.id === recordId
            ? { ...r, values: { ...r.values, [attrSlug]: value } }
            : r
        )
      );

      await fetch(`/api/v1/objects/${slug}/records/${recordId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values: { [attrSlug]: value } }),
      });
    },
    [slug]
  );

  const createRecord = useCallback(
    async (values: Record<string, unknown>) => {
      const res = await fetch(`/api/v1/objects/${slug}/records`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values }),
      });

      if (res.ok) {
        fetchRecords();
      }
    },
    [slug, fetchRecords]
  );

  // Filter helpers
  const removeFilterCondition = useCallback(
    (index: number) => {
      setFilter((prev) => ({
        ...prev,
        conditions: prev.conditions.filter((_, i) => i !== index),
      }));
    },
    []
  );

  const clearFilters = useCallback(() => {
    setFilter(EMPTY_FILTER);
  }, []);

  const clearSorts = useCallback(() => {
    setSorts([]);
  }, []);

  return {
    object,
    records,
    total,
    loading,
    loadingMore,
    hasMore,
    loadMore,
    fetchData: fetchRecords,
    updateRecord,
    createRecord,
    setRecords,
    // Filter/sort
    filter,
    setFilter,
    sorts,
    setSorts,
    hasFilter,
    hasSort,
    removeFilterCondition,
    clearFilters,
    clearSorts,
  };
}
