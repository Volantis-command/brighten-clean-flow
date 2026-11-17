// Persistent camera for the guided clean checklist.
//
// The old form used <input type="file" capture>, which opens the phone's camera
// app and CLOSES it after every single shot — 40 photos meant 40 open/close
// cycles. This keeps one live camera open and just swaps the prompt text, so a
// cleaner shoots the whole room without leaving the screen.
//
// Flow per photo:  prompt on screen → shutter → freeze preview →
//                  "Use photo" (next prompt appears, camera stays live) or "Retake"
//
// Falls back to the native camera input if getUserMedia is unavailable or the
// permission is denied, so the form always works.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Check, RotateCcw, Loader2, ImageOff, X } from 'lucide-react';
import { captureFromVideo, compressFile } from '@/lib/imageCompress';

interface Props {
  /** What to photograph, shown large over the viewfinder. */
  prompt: string;
  /** e.g. "Kitchen · photo 3 of 10" */
  subtitle?: string;
  /** Removable item → offer "Not in this property". */
  canRemove?: boolean;
  onCapture: (blob: Blob) => Promise<void> | void;
  onNotPresent?: () => void;
  onBack?: () => void;
  saving?: boolean;
  /**
   * Airbnb only: the admin's reference photos for this room. A small thumbnail
   * over the viewfinder the cleaner can open to see how the room should look.
   * Purely a glance: nothing to tap before shooting, nothing recorded.
   */
  reference?: {
    roomTitle: string;
    photos: { id: string; url: string; caption: string | null }[];
    onViewAll?: () => void;
  };
}

export default function GuidedCamera({
  prompt, subtitle, canRemove, onCapture, onNotPresent, onBack, saving, reference,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [denied, setDenied] = useState(false);
  const [pending, setPending] = useState<{ blob: Blob; url: string } | null>(null);
  const [working, setWorking] = useState(false);
  const [refOpen, setRefOpen] = useState(false);
  // Zoom. Cleaners asked for this: a wide shot of a benchtop is useless when
  // the thing worth proving is a mark the size of a coin.
  //
  // hardwareZoom is the MediaStreamTrack `zoom` constraint, which is real
  // lens/sensor zoom and keeps full quality. Android Chrome has it. iOS
  // Safari does NOT, and that is what most of the cleaners carry, so when the
  // track cannot do it we crop the frame on capture instead and scale the
  // preview to match, which is lossier but at least gets them close.
  const [zoom, setZoom] = useState(1);
  const [hardwareZoom, setHardwareZoom] = useState<{ max: number; step: number } | null>(null);

  const start = useCallback(async () => {
    setDenied(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        // Ask for more pixels than we display. Digital zoom spends them: a
        // 2.5x crop of a 1920 frame is only 768px wide, which is thin for a
        // report photo. `ideal` degrades on its own when a device cannot.
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 3840 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      // Does this device do real zoom? Capabilities are not in the DOM types.
      const track = stream.getVideoTracks()[0];
      const caps = (track?.getCapabilities?.() ?? {}) as { zoom?: { max?: number; min?: number; step?: number } };
      if (caps.zoom && typeof caps.zoom.max === 'number' && caps.zoom.max > 1) {
        setHardwareZoom({ max: Math.min(caps.zoom.max, 5), step: caps.zoom.step || 0.1 });
      } else {
        setHardwareZoom(null);
      }
      setZoom(1);
      setReady(true);
    } catch {
      setDenied(true);
      setReady(false);
    }
  }, []);

  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia) { setDenied(true); return; }
    start();
    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Release the frozen preview's object URL when it changes/unmounts.
  useEffect(() => () => { if (pending) URL.revokeObjectURL(pending.url); }, [pending]);

  // Push the zoom to the sensor where we can; otherwise leave it for capture.
  const applyZoom = useCallback(async (next: number) => {
    setZoom(next);
    if (!hardwareZoom) return;
    const track = streamRef.current?.getVideoTracks()[0];
    try {
      await track?.applyConstraints({ advanced: [{ zoom: next }] } as MediaTrackConstraints);
    } catch {
      // Device advertised zoom and then refused it. Fall back to cropping so
      // the button still does something rather than silently failing.
      setHardwareZoom(null);
    }
  }, [hardwareZoom]);

  const shoot = async () => {
    if (!videoRef.current || working) return;
    setWorking(true);
    try {
      // Hardware zoom is already in the frame, so only crop when it is not.
      const blob = await captureFromVideo(videoRef.current, hardwareZoom ? 1 : zoom);
      setPending({ blob, url: URL.createObjectURL(blob) });
    } catch {
      /* ignore — let them try again */
    } finally {
      setWorking(false);
    }
  };

  const accept = async () => {
    if (!pending || working) return;
    setWorking(true);
    try {
      await onCapture(pending.blob);
      URL.revokeObjectURL(pending.url);
      setPending(null); // camera is still live — next prompt appears
    } finally {
      setWorking(false);
    }
  };

  const fromFile = async (file?: File) => {
    if (!file) return;
    setWorking(true);
    try {
      const blob = await compressFile(file);
      setPending({ blob, url: URL.createObjectURL(blob) });
    } finally {
      setWorking(false);
    }
  };

  const busy = working || saving;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      {/* Prompt — the whole point: they always know what to shoot */}
      <div className="shrink-0 px-5 pt-[max(14px,env(safe-area-inset-top))] pb-3"
        style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.85), rgba(0,0,0,0.35))' }}>
        <div className="flex items-start gap-3">
          {onBack && (
            <button onClick={onBack} className="mt-0.5 shrink-0 text-white/70" aria-label="Back">
              <X className="w-5 h-5" />
            </button>
          )}
          <div className="min-w-0">
            {subtitle && (
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#45C2C8]">{subtitle}</p>
            )}
            <p className="text-white text-[19px] font-extrabold leading-snug mt-0.5">{prompt}</p>
          </div>
        </div>
      </div>

      {/* Viewfinder / frozen preview */}
      <div className="relative flex-1 min-h-0 bg-black">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className="absolute inset-0 h-full w-full object-cover"
          style={{
            display: pending || denied ? 'none' : 'block',
            // Only scale the preview when we are cropping on capture. With
            // hardware zoom the frame is already zoomed, and scaling again
            // would show more than the photo will contain.
            transform: hardwareZoom ? undefined : `scale(${zoom})`,
            transformOrigin: 'center',
          }}
        />
        {pending && (
          <img src={pending.url} alt="Photo just taken" className="absolute inset-0 h-full w-full object-cover" />
        )}

        {/* Zoom. Fixed stops rather than a pinch gesture: this is used in
            gloves, one-handed, often against a wall, and a stop you can hit
            without looking beats a gesture you have to aim. 2.5x is there
            because BJ asked for it by name. */}
        {!pending && !denied && ready && (
          <div className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 flex items-center gap-1 rounded-full bg-black/60 p-1 backdrop-blur">
            {[1, 1.5, 2, 2.5].filter(z => z === 1 || !hardwareZoom || z <= hardwareZoom.max).map((z) => (
              <button
                key={z}
                onClick={() => void applyZoom(z)}
                className={`min-w-[44px] rounded-full px-3 py-1.5 text-xs font-extrabold transition ${
                  zoom === z ? 'bg-white text-black' : 'text-white/80'
                }`}
                aria-label={`Zoom ${z} times`}
                aria-pressed={zoom === z}
              >
                {z}x
              </button>
            ))}
          </div>
        )}

        {reference && reference.photos.length > 0 && !pending && (
          refOpen ? (
            <div className="absolute inset-x-3 top-3 z-10 rounded-2xl bg-black/85 p-3 backdrop-blur">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#45C2C8]">How it should look</p>
                  <p className="mt-0.5 text-sm font-bold text-white">{reference.roomTitle}</p>
                </div>
                <button onClick={() => setRefOpen(false)} className="shrink-0 rounded-full p-1 text-white/70" aria-label="Close reference">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="mt-2 flex gap-2 overflow-x-auto">
                {reference.photos.map(p => (
                  <img key={p.id} src={p.url} alt={p.caption || reference.roomTitle}
                    className="h-24 w-32 shrink-0 rounded-lg object-cover" />
                ))}
              </div>
              {reference.photos.find(p => p.caption)?.caption && (
                <p className="mt-2 text-xs text-white/80">{reference.photos.find(p => p.caption)?.caption}</p>
              )}
              {reference.onViewAll && (
                <button onClick={reference.onViewAll}
                  className="mt-3 h-10 w-full rounded-xl border border-white/25 text-sm font-bold text-white">
                  See bigger
                </button>
              )}
            </div>
          ) : (
            <button onClick={() => setRefOpen(true)}
              className="absolute left-3 top-3 z-10 flex items-center gap-2 rounded-xl bg-black/70 p-1 pr-3"
              aria-label="Show how this room should look">
              <img src={reference.photos[0].url} alt="" className="h-11 w-11 rounded-lg object-cover" />
              <span className="text-xs font-bold text-[#45C2C8]">How it should look</span>
            </button>
          )
        )}

        {!ready && !denied && !pending && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="w-7 h-7 animate-spin text-white/70" />
          </div>
        )}

        {denied && !pending && (
          <div className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
            <ImageOff className="w-10 h-10 text-white/50 mb-4" />
            <p className="text-white font-bold text-base">Camera not available</p>
            <p className="text-white/60 text-sm mt-1.5 leading-relaxed">
              Allow camera access for the fast flow, or take this photo with your normal camera.
            </p>
            <button onClick={start}
              className="mt-5 rounded-xl bg-[#45C2C8] px-5 py-3 text-sm font-extrabold text-black">
              Enable camera
            </button>
            <label className="mt-3 text-sm font-bold text-white/80 underline">
              Use my normal camera instead
              <input type="file" accept="image/*" capture="environment" className="hidden"
                onChange={e => fromFile(e.target.files?.[0])} />
            </label>
          </div>
        )}

        {pending && (
          <div className="absolute left-0 right-0 top-3 flex justify-center">
            <span className="rounded-full bg-black/65 px-3 py-1 text-xs font-bold text-white">
              Happy with this photo?
            </span>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="shrink-0 px-5 pb-[max(18px,env(safe-area-inset-bottom))] pt-4"
        style={{ background: 'linear-gradient(0deg, rgba(0,0,0,0.9), rgba(0,0,0,0.3))' }}>
        {pending ? (
          <div className="flex items-center gap-3">
            <button onClick={() => { URL.revokeObjectURL(pending.url); setPending(null); }} disabled={busy}
              className="flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl border border-white/25 text-base font-extrabold text-white disabled:opacity-50">
              <RotateCcw className="w-5 h-5" /> Retake
            </button>
            <button onClick={accept} disabled={busy}
              className="flex h-14 flex-[1.4] items-center justify-center gap-2 rounded-2xl bg-[#45C2C8] text-base font-extrabold text-black disabled:opacity-60">
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
              Use photo
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-4">
            <div className="w-24">
              {canRemove && onNotPresent && (
                <button onClick={onNotPresent}
                  className="text-left text-xs font-bold leading-tight text-white/70 underline">
                  Not in this property
                </button>
              )}
            </div>
            <button onClick={shoot} disabled={!ready || busy} aria-label="Take photo"
              className="flex h-[74px] w-[74px] items-center justify-center rounded-full bg-white disabled:opacity-40">
              {busy
                ? <Loader2 className="w-7 h-7 animate-spin text-black" />
                : <Camera className="w-8 h-8 text-black" />}
            </button>
            <div className="w-24" />
          </div>
        )}
      </div>
    </div>
  );
}
