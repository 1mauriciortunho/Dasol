// Configuración de la app.

// URL pública del sitio (deploy web en Vercel). Es también el prefijo de los
// deep links: el linking de App.tsx mapea `/c/:slug` al detalle de campaña.
export const SITE_URL = 'https://dasol-khaki.vercel.app';

// URL base para compartir campañas: `${CAMPAIGN_BASE_URL}/${slug}` abre el
// detalle de esa campaña en el navegador.
export const CAMPAIGN_BASE_URL = `${SITE_URL}/c`;
