// Shrink photos on the device before upload.
//
// A modern phone camera shot is 3–5 MB. A 3-bed turnover is ~40 photos, so raw
// that's 150 MB+ over a cleaner's mobile data — slow, expensive, and the main
// reason uploads fail on site. Resized to 1600px at 72% JPEG each shot is
// ~200–300 KB: visually identical in the report, roughly 15× faster to upload.

const MAX_EDGE = 1600;
const QUALITY = 0.72;

function canvasToBlob(canvas: HTMLCanvasElement, quality = QUALITY): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not encode photo'))),
      'image/jpeg',
      quality,
    );
  });
}

/** Scale so the longest edge is at most MAX_EDGE (never upscales). */
function fitted(w: number, h: number, maxEdge = MAX_EDGE) {
  const scale = Math.min(1, maxEdge / Math.max(w, h));
  return { width: Math.round(w * scale), height: Math.round(h * scale) };
}

/** Grab the current video frame, downscaled and compressed. */
/**
 * A still from the live camera preview, optionally zoomed.
 *
 * `zoom` is a digital crop: 2 takes the middle quarter of the frame and
 * scales it back up. The preview is CSS-scaled by the same factor, so what
 * the cleaner frames is what they get.
 *
 * Digital rather than hardware because the MediaStreamTrack `zoom`
 * constraint does not exist on iOS Safari, which is what the cleaners are
 * holding. GuidedCamera applies hardware zoom first where the device offers
 * it and only passes a zoom factor here when it does not, so Android gets
 * real lens zoom and iPhone still gets something usable.
 */
export async function captureFromVideo(video: HTMLVideoElement, zoom = 1): Promise<Blob> {
  const vw = video.videoWidth || 1280;
  const vh = video.videoHeight || 720;

  // Never crop beyond the frame, and never divide by zero on a bad value.
  const z = Number.isFinite(zoom) && zoom > 1 ? Math.min(zoom, 5) : 1;
  const srcW = vw / z;
  const srcH = vh / z;
  const srcX = (vw - srcW) / 2;
  const srcY = (vh - srcH) / 2;

  const { width, height } = fitted(srcW, srcH);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Camera not available on this device');
  ctx.drawImage(video, srcX, srcY, srcW, srcH, 0, 0, width, height);
  return canvasToBlob(canvas);
}

/** Compress a file picked from the native camera / gallery (fallback path). */
export async function compressFile(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file; // unsupported format — send as-is rather than fail
  const { width, height } = fitted(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  return canvasToBlob(canvas);
}
