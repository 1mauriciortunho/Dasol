// Tipos de dominio canónicos de la app. Reflejan el esquema de la base
// (schema.sql) pero en camelCase. La base usa snake_case; el mapeo vive en
// src/lib/campaigns.ts.
import { CategoryKey } from './theme';

export type Profile = {
  id: string;
  fullName: string;
  phone: string | null;
  avatarUrl: string | null;
  role: 'user' | 'moderator' | 'admin';
  isVerified: boolean;
};

export type SupportMessage = {
  id: string;
  name: string;
  message: string;
  amount?: number; // self_reported_amount: sólo prueba social, no cuenta al total
};

export type CampaignImage = {
  id: string;
  imageUrl: string;
  caption?: string;
};

export type Campaign = {
  id: string;
  slug: string; // para links compartibles
  title: string;
  story: string;
  category: CategoryKey;
  beneficiaryName: string;
  goalAmount: number;
  currentAmount: number; // sale de progress_updates / saldo de la cuenta, no de las fotos
  coverImageUrl: string;
  qrImageUrl: string;
  qrBankName: string;
  accountHolderName: string;
  location: string;
  usesDedicatedAccount: boolean;
  dedicatedAccountVerified: boolean;
  supportMessages: SupportMessage[];
  images?: CampaignImage[];
};

// ---- Campañas del organizador / avance ----

export type CampaignStatus =
  | 'borrador'
  | 'en_revision'
  | 'aprobada'
  | 'rechazada'
  | 'pausada'
  | 'completada'
  | 'expirada';

// Campaña vista por su dueño: incluye el estado real (cualquiera) y el motivo
// de rechazo si lo hubo.
export type MyCampaign = Campaign & {
  status: CampaignStatus;
  rejectionReason: string | null;
};

// Completada = el trigger marcó status 'completada' O ya se llegó/superó la
// meta. Único lugar donde se decide "meta alcanzada"; usar en todos lados.
// (status es opcional porque la Campaign pública no lo trae; ahí alcanza con
// comparar el monto.)
export function isCompleted(c: {
  currentAmount: number;
  goalAmount: number;
  status?: CampaignStatus;
}): boolean {
  return c.status === 'completada' || (c.goalAmount > 0 && c.currentAmount >= c.goalAmount);
}

export type ProgressUpdate = {
  id: string;
  newTotal: number | null; // total acumulado reportado (no un delta); null = solo noticia
  updateText: string | null;
  imageUrl: string | null;
  createdAt: string;
};

// ---- Moderación ----

export type VerificationDocument = {
  id: string;
  fileUrl: string; // path en el bucket privado verification-docs
  docType: string;
  note: string | null;
};

// Campaña en revisión, con sus documentos y los datos de contacto del
// organizador (sólo visible para moderadores vía RLS).
export type PendingCampaign = Campaign & {
  organizerName: string;
  organizerPhone: string | null;
  documents: VerificationDocument[];
};

export type PaymentNotificationStatus = 'pendiente' | 'confirmado' | 'rechazado';

export type PaymentNotification = {
  id: string;
  senderName: string | null;
  amount: number | null;
  receiptUrl: string | null; // path en el bucket privado payment-receipts
  message: string | null;
  status: PaymentNotificationStatus;
  createdAt: string;
};

// ---- Reportes / denuncias ----

export type ReportReason =
  | 'fraude_sospechoso'
  | 'contenido_inapropiado'
  | 'duplicada'
  | 'ya_completada'
  | 'otro';

export type ReportStatus = 'abierto' | 'en_revision' | 'resuelto' | 'descartado';

export type OpenReport = {
  id: string;
  reason: ReportReason;
  details: string | null;
  status: ReportStatus;
  createdAt: string;
  campaignId: string;
  campaignTitle: string;
  reporterName: string | null;
};
