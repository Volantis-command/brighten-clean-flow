import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';

interface Props {
  clockOn: string | null;
}

export default function ClockedOnBanner({ clockOn }: Props) {
  const [elapsed, setElapsed] = useState('');

  useEffect(() => {
    if (!clockOn) return;
    const clockOnTime = new Date(clockOn).getTime();
    const update = () => {
      const diff = Math.floor((Date.now() - clockOnTime) / 1000);
      const h = Math.floor(diff / 3600);
      const m = Math.floor((diff % 3600) / 60);
      const s = diff % 60;
      setElapsed(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [clockOn]);

  if (!clockOn) return null;

  return (
    <div
      className="sticky top-0 z-50 px-4 py-3 flex items-center justify-between"
      style={{ background: '#FEDB00', color: '#0A0F0E' }}
    >
      <div className="flex items-center gap-2">
        <Clock className="h-4 w-4" />
        <span className="font-bold text-sm">Clocked On</span>
      </div>
      <span className="font-mono font-bold text-sm">{elapsed}</span>
    </div>
  );
}
