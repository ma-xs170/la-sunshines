'use client';

import { useEffect, useState } from 'react';
import Icon from './Icon';

export default function Countdown({ targetISO }: { targetISO: string }) {
  const [label, setLabel] = useState('— jrs');

  useEffect(() => {
    const target = new Date(targetISO);
    const tick = () => {
      const diff = Math.max(0, target.getTime() - Date.now());
      const days = Math.floor(diff / 86_400_000);
      setLabel(`${days} jrs`);
    };
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, [targetISO]);

  return (
    <div className="countdown sheen">
      <Icon name="sparkles" />
      <div>
        <div className="countdown__num">{label}</div>
        <div className="countdown__lbl">Prochaine édition</div>
      </div>
    </div>
  );
}
