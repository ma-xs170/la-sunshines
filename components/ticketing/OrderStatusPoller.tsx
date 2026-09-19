'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// La confirmation arrive par le webhook Stripe, parfois quelques secondes après le
// retour du client : on relit la page toutes les 3 s (jusqu'à ~60 s).
export default function OrderStatusPoller() {
  const router = useRouter();
  useEffect(() => {
    let n = 0;
    const id = window.setInterval(() => {
      n += 1;
      router.refresh();
      if (n >= 20) window.clearInterval(id);
    }, 3000);
    return () => window.clearInterval(id);
  }, [router]);
  return null;
}
