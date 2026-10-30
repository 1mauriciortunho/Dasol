import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Image,
  ScrollView,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Linking,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../../App';
import { PaymentNotification, PaymentNotificationStatus } from '../types';
import {
  approveCampaign,
  rejectCampaign,
  fetchPaymentNotifications,
  setPaymentNotificationStatus,
  createSignedUrl,
  setDedicatedAccountVerified,
} from '../lib/campaigns';
import { useAuth } from '../lib/auth';
import { colors, radius, space, type, categories, formatBs, media } from '../theme';

type Nav = NativeStackNavigationProp<RootStackParamList, 'ModerationDetail'>;
type DetailRoute = RouteProp<RootStackParamList, 'ModerationDetail'>;

const STATUS_LABEL: Record<PaymentNotificationStatus, string> = {
  pendiente: 'Pendiente',
  confirmado: 'Confirmado',
  rechazado: 'Rechazado',
};
const STATUS_COLOR: Record<PaymentNotificationStatus, string> = {
  pendiente: colors.accent,
  confirmado: colors.primary,
  rechazado: colors.danger,
};

export default function ModerationDetailScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<Nav>();
  const { profile } = useAuth();
  const { campaign } = useRoute<DetailRoute>().params;
  const isModerator = profile?.role === 'moderator' || profile?.role === 'admin';

  const [working, setWorking] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [rejectMode, setRejectMode] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [accountVerified, setAccountVerified] = useState(campaign.dedicatedAccountVerified);
  const [verifyingAccount, setVerifyingAccount] = useState(false);

  const [notifs, setNotifs] = useState<PaymentNotification[]>([]);
  const [notifsLoading, setNotifsLoading] = useState(true);
  const [notifsError, setNotifsError] = useState(false);
  const [busyNotifId, setBusyNotifId] = useState<string | null>(null);

  const loadNotifs = useCallback(async () => {
    setNotifsLoading(true);
    setNotifsError(false);
    try {
      setNotifs(await fetchPaymentNotifications(campaign.id));
    } catch (e) {
      console.warn('No se pudieron cargar los avisos de pago:', e);
      setNotifsError(true);
    } finally {
      setNotifsLoading(false);
    }
  }, [campaign.id]);

  useEffect(() => {
    if (isModerator) loadNotifs();
  }, [isModerator, loadNotifs]);

  const cat = categories[campaign.category];

  const approve = async () => {
    if (working) return;
    setWorking(true);
    setActionError(null);
    try {
      await approveCampaign(campaign.id);
      nav.goBack();
    } catch (e) {
      console.warn('No se pudo aprobar la campaña:', e);
      setActionError('No pudimos aprobar la campaña. Intentá de nuevo.');
      setWorking(false);
    }
  };

  const confirmReject = async () => {
    if (working || !rejectReason.trim()) return;
    setWorking(true);
    setActionError(null);
    try {
      await rejectCampaign(campaign.id, rejectReason.trim());
      nav.goBack();
    } catch (e) {
      console.warn('No se pudo rechazar la campaña:', e);
      setActionError('No pudimos rechazar la campaña. Intentá de nuevo.');
      setWorking(false);
    }
  };

  const toggleAccountVerified = async () => {
    if (verifyingAccount) return;
    setVerifyingAccount(true);
    setActionError(null);
    try {
      await setDedicatedAccountVerified(campaign.id, !accountVerified);
      setAccountVerified(!accountVerified);
    } catch (e) {
      console.warn('No se pudo actualizar la verificación de la cuenta:', e);
      setActionError('No pudimos actualizar la verificación de la cuenta. Intentá de nuevo.');
    } finally {
      setVerifyingAccount(false);
    }
  };

  const viewFile = async (bucket: string, path: string) => {
    setActionError(null);
    try {
      const url = await createSignedUrl(bucket, path);
      await Linking.openURL(url);
    } catch (e) {
      console.warn('No se pudo abrir el archivo:', e);
      setActionError('No pudimos abrir el archivo. Intentá de nuevo.');
    }
  };

  const updateNotif = async (id: string, status: 'confirmado' | 'rechazado') => {
    setBusyNotifId(id);
    setActionError(null);
    try {
      await setPaymentNotificationStatus(id, status);
      setNotifs((prev) => prev.map((n) => (n.id === id ? { ...n, status } : n)));
    } catch (e) {
      console.warn('No se pudo actualizar el aviso:', e);
      setActionError('No pudimos actualizar el aviso. Intentá de nuevo.');
    } finally {
      setBusyNotifId(null);
    }
  };

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
      <Pressable onPress={() => nav.goBack()} style={styles.back}>
        <Ionicons name="arrow-back" size={22} color={colors.text} />
      </Pressable>
      <Text style={styles.headerTitle} numberOfLines={1}>Revisar campaña</Text>
    </View>
  );

  if (!isModerator) {
    return (
      <View style={styles.screen}>
        {header}
        <View style={styles.stateCenter}>
          <Ionicons name="lock-closed-outline" size={40} color={colors.textMuted} />
          <Text style={styles.stateTitle}>Acceso restringido</Text>
          <Text style={styles.stateText}>Esta sección es solo para el equipo de moderación.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {header}

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={insets.top + 56}
      >
        <ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + space.xxxl }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Image source={{ uri: campaign.coverImageUrl }} style={styles.cover} />

        <View style={styles.content}>
          <View style={[styles.cat, { backgroundColor: cat.color + '1A' }]}>
            <Text style={[styles.catText, { color: cat.color }]}>{cat.label}</Text>
          </View>
          <Text style={styles.title}>{campaign.title}</Text>
          {!!campaign.beneficiaryName && (
            <Text style={styles.beneficiary}>Para {campaign.beneficiaryName}</Text>
          )}
          <Text style={styles.goal}>Meta: Bs {formatBs(campaign.goalAmount)}</Text>

          {/* Contacto del organizador */}
          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>Organizador</Text>
            <Text style={styles.infoValue}>{campaign.organizerName}</Text>
            {campaign.organizerPhone ? (
              <Pressable onPress={() => Linking.openURL(`tel:${campaign.organizerPhone}`)}>
                <Text style={styles.phone}>{campaign.organizerPhone}</Text>
              </Pressable>
            ) : (
              <Text style={styles.infoMuted}>Sin teléfono registrado</Text>
            )}
          </View>

          <Text style={styles.story}>{campaign.story}</Text>

          {/* Cuenta / QR declarados */}
          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>Cuenta para los aportes</Text>
            <Text style={styles.infoValue}>
              {campaign.qrBankName || 'Banco no indicado'}
              {campaign.accountHolderName ? ` · ${campaign.accountHolderName}` : ''}
            </Text>
            <Text style={styles.infoMuted}>
              {campaign.usesDedicatedAccount
                ? 'Declara cuenta exclusiva para la campaña'
                : 'No declara cuenta exclusiva'}
            </Text>
            {campaign.usesDedicatedAccount && isModerator && (
              <Pressable
                onPress={toggleAccountVerified}
                disabled={verifyingAccount}
                style={({ pressed }) => [
                  accountVerified ? styles.verifyUndo : styles.verifyBtn,
                  verifyingAccount && styles.btnDisabled,
                  pressed && { opacity: 0.9 },
                ]}
              >
                {verifyingAccount ? (
                  <ActivityIndicator color={accountVerified ? colors.primary : colors.white} />
                ) : (
                  <>
                    <Ionicons
                      name={accountVerified ? 'shield-checkmark' : 'shield-checkmark-outline'}
                      size={16}
                      color={accountVerified ? colors.primary : colors.white}
                    />
                    <Text style={accountVerified ? styles.verifyUndoText : styles.verifyBtnText}>
                      {accountVerified ? 'Cuenta verificada · quitar' : 'Marcar cuenta como verificada'}
                    </Text>
                  </>
                )}
              </Pressable>
            )}
          </View>

          {/* Documentos de verificación (signed URL al tocar) */}
          <Text style={styles.sectionTitle}>Documentos de verificación</Text>
          {campaign.documents.length === 0 ? (
            <Text style={styles.empty}>No adjuntó documentos. Tenelo en cuenta al decidir.</Text>
          ) : (
            campaign.documents.map((doc, i) => (
              <Pressable
                key={doc.id}
                onPress={() => viewFile('verification-docs', doc.fileUrl)}
                style={({ pressed }) => [styles.docRow, pressed && { opacity: 0.9 }]}
              >
                <Ionicons name="document-text-outline" size={20} color={colors.primary} />
                <Text style={styles.docName} numberOfLines={1}>Documento {i + 1}</Text>
                <Ionicons name="open-outline" size={18} color={colors.textMuted} />
              </Pressable>
            ))
          )}

          {/* Avisos de pago */}
          <Text style={styles.sectionTitle}>Avisos de pago</Text>
          <Text style={styles.note}>
            Confirmar un aviso no cambia el monto recaudado: es solo conciliación. El total sale
            del saldo que reporta el organizador.
          </Text>

          {notifsLoading ? (
            <View style={styles.inlineState}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.stateText}>Cargando avisos…</Text>
            </View>
          ) : notifsError ? (
            <View style={styles.inlineState}>
              <Text style={styles.stateText}>No pudimos cargar los avisos.</Text>
              <Pressable onPress={loadNotifs} style={({ pressed }) => [styles.retrySm, pressed && { opacity: 0.9 }]}>
                <Text style={styles.retryText}>Reintentar</Text>
              </Pressable>
            </View>
          ) : notifs.length === 0 ? (
            <Text style={styles.empty}>Todavía no hay avisos de pago para esta campaña.</Text>
          ) : (
            notifs.map((n) => (
              <View key={n.id} style={styles.notif}>
                <View style={styles.notifHead}>
                  <Text style={styles.notifName}>{n.senderName || 'Anónimo'}</Text>
                  <View style={[styles.badge, { backgroundColor: STATUS_COLOR[n.status] + '1A' }]}>
                    <Text style={[styles.badgeText, { color: STATUS_COLOR[n.status] }]}>
                      {STATUS_LABEL[n.status]}
                    </Text>
                  </View>
                </View>
                {n.amount != null && (
                  <Text style={styles.notifAmount}>Declaró Bs {formatBs(n.amount)}</Text>
                )}
                {!!n.message && <Text style={styles.notifMessage}>{n.message}</Text>}

                {n.receiptUrl && (
                  <Pressable
                    onPress={() => viewFile('payment-receipts', n.receiptUrl as string)}
                    style={({ pressed }) => [styles.receiptBtn, pressed && { opacity: 0.9 }]}
                  >
                    <Ionicons name="image-outline" size={16} color={colors.primary} />
                    <Text style={styles.receiptText}>Ver comprobante</Text>
                  </Pressable>
                )}

                {n.status === 'pendiente' && (
                  <View style={styles.notifActions}>
                    {busyNotifId === n.id ? (
                      <ActivityIndicator color={colors.primary} />
                    ) : (
                      <>
                        <Pressable
                          onPress={() => updateNotif(n.id, 'confirmado')}
                          style={({ pressed }) => [styles.notifConfirm, pressed && { opacity: 0.9 }]}
                        >
                          <Text style={styles.notifConfirmText}>Confirmar</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => updateNotif(n.id, 'rechazado')}
                          style={({ pressed }) => [styles.notifReject, pressed && { opacity: 0.9 }]}
                        >
                          <Text style={styles.notifRejectText}>Rechazar</Text>
                        </Pressable>
                      </>
                    )}
                  </View>
                )}
              </View>
            ))
          )}

          {actionError && <Text style={styles.actionError}>{actionError}</Text>}

          {/* Acciones de la campaña */}
          {rejectMode ? (
            <View style={styles.rejectBox}>
              <Text style={styles.label}>Motivo del rechazo</Text>
              <TextInput
                value={rejectReason}
                onChangeText={setRejectReason}
                placeholder="Contale al organizador por qué no se aprobó"
                placeholderTextColor={colors.textMuted}
                multiline
                style={[styles.input, styles.inputMultiline]}
              />
              <Pressable
                onPress={confirmReject}
                disabled={working || !rejectReason.trim()}
                style={({ pressed }) => [
                  styles.danger,
                  (working || !rejectReason.trim()) && styles.btnDisabled,
                  pressed && { opacity: 0.9 },
                ]}
              >
                {working ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <Text style={styles.dangerText}>Confirmar rechazo</Text>
                )}
              </Pressable>
              <Pressable onPress={() => setRejectMode(false)} disabled={working} style={styles.cancel}>
                <Text style={styles.cancelText}>Cancelar</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.actions}>
              <Pressable
                onPress={approve}
                disabled={working}
                style={({ pressed }) => [
                  styles.approve,
                  working && styles.btnDisabled,
                  pressed && { opacity: 0.9 },
                ]}
              >
                {working ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle-outline" size={18} color={colors.white} />
                    <Text style={styles.approveText}>Aprobar campaña</Text>
                  </>
                )}
              </Pressable>
              <Pressable
                onPress={() => setRejectMode(true)}
                disabled={working}
                style={({ pressed }) => [styles.rejectOutline, pressed && { opacity: 0.9 }]}
              >
                <Text style={styles.rejectOutlineText}>Rechazar</Text>
              </Pressable>
            </View>
          )}
        </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingBottom: space.sm,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { ...type.h2, flex: 1 },
  cover: { width: '100%', aspectRatio: media.coverAspect, backgroundColor: colors.track },
  content: { padding: space.lg },
  cat: { alignSelf: 'flex-start', paddingHorizontal: space.md, paddingVertical: 4, borderRadius: radius.pill },
  catText: { fontSize: 12, fontWeight: '600' },
  title: { ...type.h1, lineHeight: 29, marginTop: space.md },
  beneficiary: { marginTop: space.xs, fontSize: 14, color: colors.textMuted },
  goal: { marginTop: space.xs, fontSize: 14, fontWeight: '600', color: colors.primary },
  infoCard: {
    marginTop: space.lg,
    padding: space.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 2,
  },
  infoLabel: { fontSize: 12, fontWeight: '600', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  infoValue: { fontSize: 15, fontWeight: '600', color: colors.text, marginTop: 2 },
  infoMuted: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  verifyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    alignSelf: 'flex-start',
    marginTop: space.md,
    backgroundColor: colors.primary,
    paddingVertical: space.sm,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
  },
  verifyBtnText: { color: colors.white, fontSize: 14, fontWeight: '600' },
  verifyUndo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    alignSelf: 'flex-start',
    marginTop: space.md,
    borderWidth: 1,
    borderColor: colors.primary,
    paddingVertical: space.sm,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
  },
  verifyUndoText: { color: colors.primary, fontSize: 14, fontWeight: '600' },
  phone: { fontSize: 15, fontWeight: '600', color: colors.primary, marginTop: 2 },
  story: { marginTop: space.lg, fontSize: 15, lineHeight: 23, color: colors.text },
  sectionTitle: { ...type.h2, marginTop: space.xxl, marginBottom: space.sm },
  note: { fontSize: 13, color: colors.textMuted, lineHeight: 19, marginBottom: space.md },
  empty: { fontSize: 14, color: colors.textMuted, lineHeight: 20 },
  docRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.lg,
    marginBottom: space.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  docName: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.text },
  inlineState: { alignItems: 'center', paddingVertical: space.lg, gap: space.sm },
  stateText: { fontSize: 14, color: colors.textMuted, textAlign: 'center' },
  retrySm: {
    marginTop: space.sm,
    backgroundColor: colors.primary,
    paddingVertical: space.sm,
    paddingHorizontal: space.xl,
    borderRadius: radius.md,
  },
  retryText: { color: colors.white, fontSize: 14, fontWeight: '600' },
  notif: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
    marginBottom: space.sm,
  },
  notifHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  notifName: { fontSize: 14, fontWeight: '600', color: colors.text },
  badge: { paddingHorizontal: space.sm, paddingVertical: 2, borderRadius: radius.pill },
  badgeText: { fontSize: 12, fontWeight: '600' },
  notifAmount: { marginTop: space.xs, fontSize: 14, color: colors.text },
  notifMessage: { marginTop: space.xs, fontSize: 14, color: colors.textMuted, lineHeight: 20 },
  receiptBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    alignSelf: 'flex-start',
    marginTop: space.sm,
    paddingVertical: space.xs,
  },
  receiptText: { fontSize: 14, fontWeight: '600', color: colors.primary },
  notifActions: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.md },
  notifConfirm: {
    backgroundColor: colors.primary,
    paddingVertical: space.sm,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
  },
  notifConfirmText: { color: colors.white, fontSize: 14, fontWeight: '600' },
  notifReject: {
    borderWidth: 1,
    borderColor: colors.danger,
    paddingVertical: space.sm,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
  },
  notifRejectText: { color: colors.danger, fontSize: 14, fontWeight: '600' },
  actionError: { marginTop: space.lg, fontSize: 14, color: colors.danger, lineHeight: 20 },
  actions: { marginTop: space.xxl, gap: space.md },
  approve: {
    flexDirection: 'row',
    gap: space.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingVertical: space.lg,
    borderRadius: radius.md,
    minHeight: 52,
  },
  approveText: { color: colors.white, fontSize: 16, fontWeight: '600' },
  rejectOutline: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: space.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  rejectOutlineText: { color: colors.danger, fontSize: 16, fontWeight: '600' },
  rejectBox: { marginTop: space.xxl },
  label: { marginBottom: space.sm, fontSize: 14, fontWeight: '600', color: colors.text },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    fontSize: 15,
    color: colors.text,
  },
  inputMultiline: { minHeight: 96, textAlignVertical: 'top' },
  danger: {
    marginTop: space.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.danger,
    paddingVertical: space.lg,
    borderRadius: radius.md,
    minHeight: 52,
  },
  dangerText: { color: colors.white, fontSize: 16, fontWeight: '600' },
  btnDisabled: { opacity: 0.5 },
  cancel: { alignItems: 'center', paddingVertical: space.md, marginTop: space.xs },
  cancelText: { color: colors.textMuted, fontSize: 15, fontWeight: '600' },
  stateCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xxl,
    gap: space.sm,
  },
  stateTitle: { ...type.h2, textAlign: 'center', marginTop: space.sm },
});
