import { getSupabase } from './supabase';
import { uploadImage, getPublicUrl, shortId } from './storage';
import { CategoryKey } from '../theme';
import {
  Campaign,
  CampaignImage,
  SupportMessage,
  PendingCampaign,
  PaymentNotification,
  PaymentNotificationStatus,
  CampaignStatus,
  MyCampaign,
  ProgressUpdate,
} from '../types';

// ---- Forma cruda de las filas (snake_case, como vienen de la base) ----
// Nota: Postgres devuelve columnas `numeric` como string para no perder
// precisión, así que los montos se normalizan con toNum().

type CampaignRow = {
  id: string;
  slug: string;
  title: string;
  story: string;
  category: CategoryKey;
  beneficiary_name: string | null;
  goal_amount: number | string;
  current_amount: number | string;
  cover_image_url: string | null;
  qr_image_url: string | null;
  qr_bank_name: string | null;
  account_holder_name: string | null;
  location: string | null;
  uses_dedicated_account: boolean;
  dedicated_account_verified: boolean;
};

type SupportMessageRow = {
  id: string;
  message: string;
  self_reported_amount: number | string | null;
  is_anonymous: boolean;
  author: { full_name: string } | { full_name: string }[] | null;
};

type CampaignImageRow = {
  id: string;
  image_url: string;
  caption: string | null;
};

const CAMPAIGN_COLUMNS =
  'id, slug, title, story, category, beneficiary_name, goal_amount, current_amount, ' +
  'cover_image_url, qr_image_url, qr_bank_name, account_holder_name, location, ' +
  'uses_dedicated_account, dedicated_account_verified';

const toNum = (v: number | string | null): number => {
  const n = typeof v === 'string' ? Number(v) : v ?? 0;
  return Number.isNaN(n) ? 0 : n;
};

// ---- Mapeo a los tipos canónicos de la app (camelCase) ----

const mapCampaign = (row: CampaignRow): Campaign => ({
  id: row.id,
  slug: row.slug,
  title: row.title,
  story: row.story,
  category: row.category,
  beneficiaryName: row.beneficiary_name ?? '',
  goalAmount: toNum(row.goal_amount),
  currentAmount: toNum(row.current_amount),
  coverImageUrl: row.cover_image_url ?? '',
  qrImageUrl: row.qr_image_url ?? '',
  qrBankName: row.qr_bank_name ?? '',
  accountHolderName: row.account_holder_name ?? '',
  location: row.location ?? 'Santa Cruz de la Sierra',
  usesDedicatedAccount: row.uses_dedicated_account,
  dedicatedAccountVerified: row.dedicated_account_verified,
  supportMessages: [],
});

const mapSupportMessage = (row: SupportMessageRow): SupportMessage => {
  const profile = Array.isArray(row.author) ? row.author[0] : row.author;
  return {
    id: row.id,
    name: row.is_anonymous ? 'Anónimo' : profile?.full_name ?? 'Anónimo',
    message: row.message,
    amount: row.self_reported_amount != null ? toNum(row.self_reported_amount) : undefined,
  };
};

const mapImage = (row: CampaignImageRow): CampaignImage => ({
  id: row.id,
  imageUrl: row.image_url,
  caption: row.caption ?? undefined,
});

// ---- Consultas ----

// Feed: sólo campañas visibles al público (aprobada/completada). La RLS ya
// lo refuerza, pero lo filtramos explícito por claridad.
export async function fetchCampaigns(): Promise<Campaign[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('campaigns')
    .select(CAMPAIGN_COLUMNS)
    .in('status', ['aprobada', 'completada'])
    .order('created_at', { ascending: false })
    .returns<CampaignRow[]>();

  if (error) throw new Error(error.message);
  return (data ?? []).map(mapCampaign);
}

// Campañas por id (para "Siguiendo"). La RLS decide cuáles son visibles
// (públicas, propias o todas si es moderador); reusa el mapeo a camelCase.
export async function fetchCampaignsByIds(ids: string[]): Promise<Campaign[]> {
  if (ids.length === 0) return [];
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('campaigns')
    .select(CAMPAIGN_COLUMNS)
    .in('id', ids)
    .order('created_at', { ascending: false })
    .returns<CampaignRow[]>();

  if (error) throw new Error(error.message);
  return (data ?? []).map(mapCampaign);
}

// Caché de handoff lista → detalle. Las tarjetas ya tienen la campaña
// cargada; antes de navegar la dejan acá para que el detalle pinte al
// instante mientras refresca por red. En un deep link frío no hay nada
// primado y el detalle muestra su estado de carga.
const primed = new Map<string, Campaign>();

export function primeCampaign(campaign: Campaign): void {
  primed.set(campaign.slug, campaign);
}

export function getPrimedCampaign(slug: string): Campaign | null {
  return primed.get(slug) ?? null;
}

// Detalle: la campaña + sus mensajes de apoyo (más recientes primero) y su
// galería de imágenes. Acepta id o slug (el slug viene de la URL compartida).
async function fetchCampaignDetail(
  filter: { id: string } | { slug: string }
): Promise<Campaign> {
  const supabase = getSupabase();
  const base = supabase.from('campaigns').select(CAMPAIGN_COLUMNS);
  const query = 'id' in filter ? base.eq('id', filter.id) : base.eq('slug', filter.slug);
  const campaignRes = await query.single().returns<CampaignRow>();
  if (campaignRes.error) throw new Error(campaignRes.error.message);
  const id = campaignRes.data.id;

  const [messagesRes, imagesRes] = await Promise.all([
    supabase
      .from('support_messages')
      .select('id, message, self_reported_amount, is_anonymous, author:profiles(full_name)')
      .eq('campaign_id', id)
      .order('created_at', { ascending: false })
      .returns<SupportMessageRow[]>(),
    supabase
      .from('campaign_images')
      .select('id, image_url, caption')
      .eq('campaign_id', id)
      .order('sort_order', { ascending: true })
      .returns<CampaignImageRow[]>(),
  ]);

  if (messagesRes.error) throw new Error(messagesRes.error.message);
  if (imagesRes.error) throw new Error(imagesRes.error.message);

  return {
    ...mapCampaign(campaignRes.data),
    supportMessages: (messagesRes.data ?? []).map(mapSupportMessage),
    images: (imagesRes.data ?? []).map(mapImage),
  };
}

export function fetchCampaignById(id: string): Promise<Campaign> {
  return fetchCampaignDetail({ id });
}

export function fetchCampaignBySlug(slug: string): Promise<Campaign> {
  return fetchCampaignDetail({ slug });
}

// ============================================================
// Moderación (asume sesión de moderador; la RLS ya lo restringe)
// ============================================================

type OrganizerRel = { full_name: string; phone: string | null };

type PendingCampaignRow = CampaignRow & {
  organizer: OrganizerRel | OrganizerRel[] | null;
  verification_documents: {
    id: string;
    file_url: string;
    doc_type: string;
    note: string | null;
  }[];
};

function mapPendingCampaign(row: PendingCampaignRow): PendingCampaign {
  const organizer = Array.isArray(row.organizer) ? row.organizer[0] : row.organizer;
  return {
    ...mapCampaign(row),
    organizerName: organizer?.full_name ?? 'Organizador',
    organizerPhone: organizer?.phone ?? null,
    documents: (row.verification_documents ?? []).map((d) => ({
      id: d.id,
      fileUrl: d.file_url,
      docType: d.doc_type,
      note: d.note,
    })),
  };
}

// Campañas en revisión, con sus documentos y datos del organizador.
export async function fetchPendingCampaigns(): Promise<PendingCampaign[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('campaigns')
    .select(
      `${CAMPAIGN_COLUMNS}, organizer:profiles!organizer_id(full_name, phone), ` +
        'verification_documents(id, file_url, doc_type, note)'
    )
    .eq('status', 'en_revision')
    .order('created_at', { ascending: false })
    .returns<PendingCampaignRow[]>();

  if (error) throw new Error(error.message);
  return (data ?? []).map(mapPendingCampaign);
}

async function currentUserId(): Promise<string | null> {
  const { data } = await getSupabase().auth.getUser();
  return data.user?.id ?? null;
}

// Aprobar: recién acá la campaña se vuelve pública.
export async function approveCampaign(id: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('campaigns')
    .update({
      status: 'aprobada',
      reviewed_by: await currentUserId(),
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function rejectCampaign(id: string, reason: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('campaigns')
    .update({
      status: 'rechazada',
      rejection_reason: reason,
      reviewed_by: await currentUserId(),
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

// Badge "cuenta verificada": el moderador confirma que la cuenta declarada
// es exclusiva de la campaña. Sólo un moderador puede cambiarlo (trigger 012).
export async function setDedicatedAccountVerified(id: string, verified: boolean): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('campaigns')
    .update({
      dedicated_account_verified: verified,
      account_verified_by: verified ? await currentUserId() : null,
      account_verified_at: verified ? new Date().toISOString() : null,
    })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

type PaymentNotificationRow = {
  id: string;
  sender_name: string | null;
  amount: number | string | null;
  receipt_url: string | null;
  message: string | null;
  status: PaymentNotificationStatus;
  created_at: string;
};

export async function fetchPaymentNotifications(
  campaignId: string
): Promise<PaymentNotification[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('payment_notifications')
    .select('id, sender_name, amount, receipt_url, message, status, created_at')
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: false })
    .returns<PaymentNotificationRow[]>();

  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id,
    senderName: r.sender_name,
    amount: r.amount != null ? toNum(r.amount) : null,
    receiptUrl: r.receipt_url,
    message: r.message,
    status: r.status,
    createdAt: r.created_at,
  }));
}

// Confirmar/rechazar un aviso cambia SÓLO su status. REGLA: nunca toca
// current_amount (el total sale únicamente de progress_updates).
export async function setPaymentNotificationStatus(
  id: string,
  status: 'confirmado' | 'rechazado'
): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('payment_notifications')
    .update({
      status,
      reviewed_by: await currentUserId(),
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

// URL temporal para ver un archivo de un bucket privado (verification-docs,
// payment-receipts). Expira; nunca exponemos estos archivos como públicos.
export async function createSignedUrl(
  bucket: string,
  path: string,
  expiresInSeconds = 120
): Promise<string> {
  const supabase = getSupabase();
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresInSeconds);
  if (error || !data) throw new Error(error?.message ?? 'No se pudo generar el enlace.');
  return data.signedUrl;
}

// ============================================================
// Organizador: sus campañas y el avance (progress_updates)
// ============================================================

type MyCampaignRow = CampaignRow & {
  status: CampaignStatus;
  rejection_reason: string | null;
};

// Todas las campañas del usuario, en cualquier estado (la RLS deja al dueño
// ver las suyas aunque no estén aprobadas).
export async function fetchMyCampaigns(): Promise<MyCampaign[]> {
  const supabase = getSupabase();
  const userId = await currentUserId();
  if (!userId) return [];

  const { data, error } = await supabase
    .from('campaigns')
    .select(`${CAMPAIGN_COLUMNS}, status, rejection_reason`)
    .eq('organizer_id', userId)
    .order('created_at', { ascending: false })
    .returns<MyCampaignRow[]>();

  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    ...mapCampaign(row),
    status: row.status,
    rejectionReason: row.rejection_reason,
  }));
}

type ProgressUpdateRow = {
  id: string;
  new_total: number | string | null;
  update_text: string | null;
  image_url: string | null;
  created_at: string;
};

const mapProgressUpdate = (r: ProgressUpdateRow): ProgressUpdate => ({
  id: r.id,
  newTotal: r.new_total != null ? toNum(r.new_total) : null,
  updateText: r.update_text,
  imageUrl: r.image_url,
  createdAt: r.created_at,
});

export async function fetchProgressUpdates(campaignId: string): Promise<ProgressUpdate[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('progress_updates')
    .select('id, new_total, update_text, image_url, created_at')
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: false })
    .returns<ProgressUpdateRow[]>();

  if (error) throw new Error(error.message);
  return (data ?? []).map(mapProgressUpdate);
}

type AddProgressParams = {
  campaignId: string;
  newTotal: number | null;
  updateText: string | null;
  imageUri: string | null;
};

// REGLA CENTRAL: el avance se reporta insertando en progress_updates.
// new_total es el TOTAL acumulado (no un delta). El trigger sincroniza
// campaigns.current_amount; acá NUNCA escribimos current_amount.
export async function addProgressUpdate({
  campaignId,
  newTotal,
  updateText,
  imageUri,
}: AddProgressParams): Promise<ProgressUpdate> {
  const supabase = getSupabase();

  let imageUrl: string | null = null;
  if (imageUri) {
    const path = await uploadImage({
      bucket: 'campaign-images',
      path: `${campaignId}/updates/${shortId()}.jpg`,
      uri: imageUri,
    });
    imageUrl = getPublicUrl('campaign-images', path);
  }

  const { data, error } = await supabase
    .from('progress_updates')
    .insert({
      campaign_id: campaignId,
      created_by: await currentUserId(),
      new_total: newTotal,
      update_text: updateText,
      image_url: imageUrl,
    })
    .select('id, new_total, update_text, image_url, created_at')
    .single()
    .returns<ProgressUpdateRow>();

  if (error) throw new Error(error.message);
  return mapProgressUpdate(data);
}
