'use client';

import { useEffect } from 'react';

// Retour « paiement annulé » : on libère tout de suite la réservation du client (idempotent).
export default function CancelPendingOrder({ orderNumber }: { orderNumber: string }) {
  useEffect(() => {
    fetch('/api/checkout/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_number: orderNumber }),
    }).catch(() => undefined);
  }, [orderNumber]);
  return null;
}
