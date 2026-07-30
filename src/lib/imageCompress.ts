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
export async function captureFromVideo(video: HTMLVideoElement): Promise<Blob> {
  const vw = video.videoWidth || 1280;
  const vh = video.videoHeight || 720;
  const { width, height } = fitted(vw, vh);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Camera not available on this device');
  ctx.drawImage(video, 0, 0, width, height);
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
