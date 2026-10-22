// Vite replaces BASE_URL in production; direct module tests use the full edition root.
export function assetUrl(path) {
  const base = typeof import.meta.env === 'object' ? import.meta.env.BASE_URL : '/';
  return `${base}${path.replace(/^\/+/, '')}`;
}
