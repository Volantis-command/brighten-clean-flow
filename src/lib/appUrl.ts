const PUBLISHED_APP_URL = 'https://brighten-clean-flow.lovable.app';

export function getAppBaseUrl() {
  if (typeof window === 'undefined') return PUBLISHED_APP_URL;

  const hostname = window.location.hostname;
  const isEditorOrPreviewHost =
    hostname.includes('lovableproject.com') ||
    hostname.includes('id-preview--') ||
    hostname.includes('lovable.app');

  return isEditorOrPreviewHost ? PUBLISHED_APP_URL : window.location.origin;
}
