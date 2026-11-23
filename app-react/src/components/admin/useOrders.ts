'use client';

import { useCallback, useEffect, useState } from 'react';
import { listOrders, type Order } from '@/lib/stores';

/** The orders of a store, read from the database; `refresh` reads them again. */
export function useOrders(storeId: string | null) {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const refresh = useCallback(async () => {
    if (!storeId) { setOrders([]); return; }
    setOrders(await listOrders(storeId));
  }, [storeId]);
  useEffect(() => { setOrders(null); void refresh(); }, [refresh]);
  return { orders, setOrders, refresh };
}
