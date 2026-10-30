// Sistema de diseño — App Solidaria (Santa Cruz de la Sierra)
// Verde profundo = confianza y crecimiento (el oriente verde).
// Ámbar cálido = energía y progreso. Fondo blanco tibio, nada frío.

export const colors = {
  primary: '#1B5E4A',
  primaryDark: '#123F33',
  accent: '#E8963C',
  accentSoft: '#F7E6CF',
  bg: '#FBFAF7',
  surface: '#FFFFFF',
  border: '#ECE8E0',
  text: '#1C2520',
  textMuted: '#6B716C',
  track: '#EEEAE1',
  danger: '#C0492F',
  white: '#FFFFFF',
  // Éxito = el mismo verde primario (meta alcanzada / completada). Único lugar
  // donde se define el color de éxito; usar colors.success en badge/banner/barra.
  success: '#1B5E4A',
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28, xxxl: 40 };

export const radius = { sm: 8, md: 12, lg: 20, pill: 999 };

// Proporciones de imagen. Las portadas usan siempre 16:9 (en tarjetas, detalle,
// moderación y formularios) para que se vean con el mismo encuadre en
// cualquier ancho de pantalla; las fotos de avances y comprobantes, 4:3.
// pickerAspect = recorte que se ofrece al elegir la foto en el celular.
export const media = {
  coverAspect: 16 / 9,
  photoAspect: 4 / 3,
  coverPickerAspect: [16, 9] as [number, number],
  qrPickerAspect: [1, 1] as [number, number],
};

// En web (pantallas anchas) el contenido se centra con este ancho máximo.
export const layout = { maxContentWidth: 640 };

export const type = {
  display: { fontSize: 28, fontWeight: '700' as const, color: colors.text },
  h1: { fontSize: 22, fontWeight: '700' as const, color: colors.text },
  h2: { fontSize: 18, fontWeight: '600' as const, color: colors.text },
  body: { fontSize: 15, fontWeight: '400' as const, color: colors.text, lineHeight: 22 },
  small: { fontSize: 13, fontWeight: '400' as const, color: colors.textMuted },
  caption: { fontSize: 12, fontWeight: '500' as const, color: colors.textMuted },
};

// Cada categoría tiene su propio color para que el feed se lea de un vistazo.
export const categories = {
  salud:        { label: 'Salud',        color: '#C0492F' },
  animales:     { label: 'Animales',     color: '#1B7F79' },
  desastre:     { label: 'Desastre',     color: '#B5562A' },
  educacion:    { label: 'Educación',    color: '#3A6EA5' },
  funeral:      { label: 'Funeral',      color: '#6B6F73' },
  alimentacion: { label: 'Alimentación', color: '#7A8B2E' },
  otro:         { label: 'Otro',         color: '#6B716C' },
} as const;

export type CategoryKey = keyof typeof categories;

// Formatea bolivianos con punto de miles (1.250) sin depender de Intl,
// que en algunos motores de React Native viene incompleto.
export const formatBs = (n: number) =>
  Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');

// Fecha corta en español (ej. "16 jun 2026") sin Intl/toLocaleDateString.
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export const formatDate = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`;
};
