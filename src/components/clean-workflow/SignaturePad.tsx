import { useRef, useEffect, useState, useCallback } from 'react';

interface Props {
  onEnd: (dataUrl: string) => void;
  existingSignature?: string;
}

export default function SignaturePad({ onEnd, existingSignature }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    ctx.scale(2, 2);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'hsl(var(--foreground))';

    // Load existing signature
    if (existingSignature) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, rect.width, rect.height);
        setHasDrawn(true);
      };
      img.src = existingSignature;
    }
  }, [existingSignature]);

  const getPosition = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e) {
      const touch = e.touches[0];
      return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
    }
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top };
  }, []);

  const startDraw = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;
    const pos = getPosition(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    setIsDrawing(true);
  }, [getPosition]);

  const draw = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    if (!isDrawing) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;
    const pos = getPosition(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  }, [isDrawing, getPosition]);

  const endDraw = useCallback(() => {
    if (!isDrawing) return;
    setIsDrawing(false);
    setHasDrawn(true);
    const canvas = canvasRef.current;
    if (canvas) {
      onEnd(canvas.toDataURL('image/png'));
    }
  }, [isDrawing, onEnd]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full border border-input rounded-xl bg-background touch-none"
      style={{ height: 180 }}
      onMouseDown={startDraw}
      onMouseMove={draw}
      onMouseUp={endDraw}
      onMouseLeave={endDraw}
      onTouchStart={startDraw}
      onTouchMove={draw}
      onTouchEnd={endDraw}
    />
  );
}
