import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Share,
  Modal,
  TextInput,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../../App';
import { Campaign, ProgressUpdate, ReportReason, isCompleted } from '../types';
import { fetchCampaignBySlug, fetchProgressUpdates, getPrimedCampaign } from '../lib/campaigns';
import { subscribeToCampaign } from '../lib/realtime';
import { createReport, REPORT_REASONS } from '../lib/reports';
import { isFollowing, followCampaign, unfollowCampaign } from '../lib/follows';
import { useAuth } from '../lib/auth';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';
import { CAMPAIGN_BASE_URL } from '../lib/config';
import { colors, radius, space, type, categories, formatBs, formatDate, media } from '../theme';
import { ProgressBar } from '../components/ProgressBar';

type DetailRoute = RouteProp<RootStackParamList, 'CampaignDetail'>;
type Nav = NativeStackNavigationProp<RootStackParamList, 'CampaignDetail'>;

const snippet = (s: string) => (s.length > 120 ? `${s.slice(0, 120).trim()}…` : s);

export default function CampaignDetailScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<Nav>();
  const { session } = useAuth();
  const { slug } = useRoute<DetailRoute>().params;

  // Si venimos de una lista, la campaña ya está primada y se pinta al
  // instante; en un deep link frío (URL compartida) arranca en null y se
  // muestra el estado de carga hasta que llega de la red.
  const [campaign, setCampaign] = useState<Campaign | null>(() => getPrimedCampaign(slug));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [updates, setUpdates] = useState<ProgressUpdate[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const campaignId = campaign?.id ?? null;

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setCampaign(await fetchCampaignBySlug(slug));
    } catch (e) {
      console.warn('No se pudo cargar el detalle:', e);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  // Novedades para los donantes (solo las que tienen texto). Espera a conocer
  // el id (en deep link frío llega recién con la campaña).
  const loadUpdates = useCallback(async () => {
    if (!campaignId) return;
    try {
      const data = await fetchProgressUpdates(campaignId);
      setUpdates(data.filter((u) => !!u.updateText));
    } catch (e) {
      console.warn('No se pudieron cargar las novedades:', e);
    }
  }, [campaignId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadUpdates();
  }, [loadUpdates]);

  // Realtime: la barra se mueve sola cuando el trigger actualiza el monto.
  useEffect(() => {
    if (!campaignId) return;
    const unsubscribe = subscribeToCampaign(campaignId, (change) => {
      setCampaign((prev) => (prev ? { ...prev, currentAmount: change.currentAmount } : prev));
    });
    return unsubscribe;
  }, [campaignId]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([load(), loadUpdates()]);
    } finally {
      setRefreshing(false);
    }
  }, [load, loadUpdates]);

  // Estado de seguimiento (solo con sesión).
  useEffect(() => {
    if (!session || !campaignId) {
      setFollowing(false);
      return;
    }
    let active = true;
    isFollowing(campaignId)
      .then((f) => {
        if (active) setFollowing(f);
      })
      .catch((e) => console.warn('No se pudo resolver el seguimiento:', e));
    return () => {
      active = false;
    };
  }, [session, campaignId]);

  // Seguir exige sesión. Alternancia optimista: revierte si falla.
  const onToggleFollow = async () => {
    if (!campaign) return;
    if (!session) {
      nav.navigate('Auth', { redirect: { screen: 'CampaignDetail', params: { slug } } });
      return;
    }
    if (followBusy) return;

    const next = !following;
    setFollowing(next);
    setFollowBusy(true);
    try {
      if (next) await followCampaign(campaign.id);
      else await unfollowCampaign(campaign.id);
    } catch (e) {
      console.warn('No se pudo actualizar el seguimiento:', e);
      setFollowing(!next); // revertir
    } finally {
      setFollowBusy(false);
    }
  };

  const [following, setFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);

  const [reportVisible, setReportVisible] = useState(false);
  const [reportReason, setReportReason] = useState<ReportReason | null>(null);
  const [reportDetails, setReportDetails] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportDone, setReportDone] = useState(false);

  // Deep link frío: todavía no hay campaña que mostrar. (Va después de todos
  // los hooks para no romper su orden entre renders.)
  if (!campaign) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        {error && !loading ? (
          <ErrorState
            onRetry={load}
            title="No encontramos esta campaña"
            message="El enlace puede estar mal copiado, o la campaña ya no está disponible."
          />
        ) : (
          <LoadingState text="Cargando campaña…" />
        )}
      </View>
    );
  }

  const cat = categories[campaign.category];
  const completed = isCompleted(campaign);

  // Avisar un pago exige sesión: sin ella, vamos a Auth y al loguearse se
  // redirige a AvisarPago conservando los params de la campaña.
  const onAvisarPago = () => {
    const params = { campaignId: campaign.id, campaignTitle: campaign.title };
    if (session) nav.navigate('AvisarPago', params);
    else nav.navigate('Auth', { redirect: { screen: 'AvisarPago', params } });
  };

  // Compartir con el Share nativo. La cancelación resuelve sin error, así que
  // no mostramos nada molesto.
  const onShare = async () => {
    try {
      await Share.share({
        message:
          `${campaign.title}\n\n` +
          `${snippet(campaign.story)}\n\n` +
          `Meta: Bs ${formatBs(campaign.goalAmount)}\n\n` +
          `Sumate: ${CAMPAIGN_BASE_URL}/${campaign.slug}`,
      });
    } catch (e) {
      console.warn('No se pudo compartir:', e);
    }
  };

  // Reportar exige sesión. Sin ella, vamos a Auth y al volver caemos en este
  // mismo detalle.
  const onReport = () => {
    if (!session) {
      nav.navigate('Auth', { redirect: { screen: 'CampaignDetail', params: { slug } } });
      return;
    }
    setReportReason(null);
    setReportDetails('');
    setReportError(null);
    setReportDone(false);
    setReportVisible(true);
  };

  const submitReport = async () => {
    if (!reportReason) {
      setReportError('Elegí un motivo.');
      return;
    }
    setReportSubmitting(true);
    setReportError(null);
    try {
      await createReport({
        campaignId: campaign.id,
        reason: reportReason,
        details: reportDetails.trim() || null,
      });
      setReportDone(true);
    } catch (e) {
      console.warn('No se pudo enviar el reporte:', e);
      setReportError('No pudimos enviar el reporte. Intentá de nuevo.');
    } finally {
      setReportSubmitting(false);
    }
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + space.xxxl }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        <View>
          <Image source={{ uri: campaign.coverImageUrl }} style={styles.cover} />
          <Pressable
            onPress={() => (nav.canGoBack() ? nav.goBack() : nav.replace('Feed'))}
            style={[styles.back, { top: insets.top + space.sm }]}
          >
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </Pressable>

          <View style={[styles.topActions, { top: insets.top + space.sm }]}>
            <Pressable onPress={onToggleFollow} style={styles.roundBtn} hitSlop={6}>
              <Ionicons
                name={following ? 'heart' : 'heart-outline'}
                size={20}
                color={following ? colors.accent : colors.text}
              />
            </Pressable>
            <Pressable onPress={onShare} style={styles.roundBtn} hitSlop={6}>
              <Ionicons name="share-social-outline" size={20} color={colors.text} />
            </Pressable>
            <Pressable onPress={onReport} style={styles.roundBtn} hitSlop={6}>
              <Ionicons name="flag-outline" size={20} color={colors.text} />
            </Pressable>
          </View>
        </View>

        <View style={styles.content}>
          <View style={styles.chipRow}>
            <View style={[styles.cat, { backgroundColor: cat.color + '1A' }]}>
              <Text style={[styles.catText, { color: cat.color }]}>{cat.label}</Text>
            </View>
            {campaign.dedicatedAccountVerified && (
              <View style={styles.verified}>
                <Ionicons name="shield-checkmark" size={14} color={colors.primary} />
                <Text style={styles.verifiedText}>Cuenta verificada</Text>
              </View>
            )}
          </View>

          <Text style={styles.title}>{campaign.title}</Text>
          <Text style={styles.beneficiary}>Para {campaign.beneficiaryName}</Text>

          {completed && (
            <View style={styles.doneBanner}>
              <Ionicons name="checkmark-circle" size={20} color={colors.success} />
              <Text style={styles.doneBannerText}>
                ¡Meta alcanzada! Gracias a quienes ayudaron.
              </Text>
            </View>
          )}

          <View style={styles.progressBlock}>
            <ProgressBar current={campaign.currentAmount} goal={campaign.goalAmount} large />
          </View>

          <Text style={styles.story}>{campaign.story}</Text>

          <View style={styles.qrCard}>
            <Text style={styles.qrTitle}>
              {completed ? 'La meta se cumplió. Si querés, podés seguir aportando.' : 'Aportá escaneando el QR'}
            </Text>
            <Text style={styles.qrSub}>Pagás directo a la cuenta de la campaña</Text>
            <Image source={{ uri: campaign.qrImageUrl }} style={styles.qr} resizeMode="contain" />
            <View style={styles.bankRow}>
              <Ionicons name="business-outline" size={15} color={colors.textMuted} />
              <Text style={styles.bankText}>{campaign.qrBankName} · {campaign.accountHolderName}</Text>
            </View>
            {campaign.usesDedicatedAccount && (
              <View style={styles.dedicated}>
                <Ionicons name="lock-closed-outline" size={13} color={colors.primary} />
                <Text style={styles.dedicatedText}>Cuenta exclusiva de esta campaña</Text>
              </View>
            )}
          </View>

          <Pressable
            onPress={onAvisarPago}
            style={({ pressed }) => [styles.cta, pressed && { opacity: 0.9 }]}
          >
            <Ionicons name="camera-outline" size={18} color={colors.white} />
            <Text style={styles.ctaText}>Ya aporté, avisar con comprobante</Text>
          </Pressable>

          {updates.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Novedades</Text>
              {updates.map((u) => (
                <View key={u.id} style={styles.update}>
                  <Text style={styles.updateDate}>{formatDate(u.createdAt)}</Text>
                  <Text style={styles.updateText}>{u.updateText}</Text>
                  {!!u.imageUrl && (
                    <Image source={{ uri: u.imageUrl }} style={styles.updateImage} resizeMode="contain" />
                  )}
                </View>
              ))}
            </>
          )}

          <Text style={styles.sectionTitle}>
            {loading || error
              ? 'Mensajes de apoyo'
              : `Mensajes de apoyo (${campaign.supportMessages.length})`}
          </Text>

          {loading ? (
            <LoadingState text="Cargando mensajes…" />
          ) : error ? (
            <ErrorState onRetry={load} title="No pudimos cargar los mensajes" />
          ) : campaign.supportMessages.length === 0 ? (
            <Text style={styles.messagesEmpty}>
              Todavía no hay mensajes. Si ya aportaste, podés ser el primero en dejar uno.
            </Text>
          ) : (
            campaign.supportMessages.map((m) => (
              <View key={m.id} style={styles.message}>
                <View style={styles.messageHead}>
                  <Text style={styles.messageName}>{m.name}</Text>
                  {m.amount != null && (
                    <Text style={styles.messageAmount}>Bs {m.amount}</Text>
                  )}
                </View>
                <Text style={styles.messageText}>{m.message}</Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      <Modal
        visible={reportVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setReportVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={[styles.modalCard, { paddingBottom: insets.bottom + space.lg }]}>
            <View style={styles.modalHandle} />
            {reportDone ? (
              <>
                <Ionicons
                  name="checkmark-circle"
                  size={40}
                  color={colors.primary}
                  style={{ alignSelf: 'center' }}
                />
                <Text style={styles.modalTitle}>Gracias, lo vamos a revisar</Text>
                <Text style={styles.modalText}>Tu reporte llegó al equipo de moderación.</Text>
                <Pressable
                  onPress={() => setReportVisible(false)}
                  style={({ pressed }) => [styles.modalCta, pressed && { opacity: 0.9 }]}
                >
                  <Text style={styles.modalCtaText}>Cerrar</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.modalTitle}>Reportar campaña</Text>
                <Text style={styles.modalText}>
                  Contanos qué pasa. Reportar no cambia nada de la campaña; solo avisa al equipo.
                </Text>

                <Text style={styles.modalLabel}>Motivo</Text>
                <View style={styles.reasons}>
                  {REPORT_REASONS.map((r) => {
                    const active = reportReason === r.key;
                    return (
                      <Pressable
                        key={r.key}
                        onPress={() => setReportReason(r.key)}
                        style={[styles.reasonChip, active && styles.reasonChipActive]}
                      >
                        <Text style={[styles.reasonChipText, active && styles.reasonChipTextActive]}>
                          {r.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Text style={styles.modalLabel}>Detalles (opcional)</Text>
                <TextInput
                  value={reportDetails}
                  onChangeText={setReportDetails}
                  placeholder="Contanos más si querés"
                  placeholderTextColor={colors.textMuted}
                  multiline
                  style={[styles.modalInput, styles.modalInputMultiline]}
                />

                {reportError && <Text style={styles.modalError}>{reportError}</Text>}

                <Pressable
                  onPress={submitReport}
                  disabled={reportSubmitting}
                  style={({ pressed }) => [
                    styles.modalCta,
                    reportSubmitting && { opacity: 0.6 },
                    pressed && !reportSubmitting && { opacity: 0.9 },
                  ]}
                >
                  {reportSubmitting ? (
                    <ActivityIndicator color={colors.white} />
                  ) : (
                    <Text style={styles.modalCtaText}>Enviar reporte</Text>
                  )}
                </Pressable>
                <Pressable
                  onPress={() => setReportVisible(false)}
                  disabled={reportSubmitting}
                  style={styles.modalCancel}
                >
                  <Text style={styles.modalCancelText}>Cancelar</Text>
                </Pressable>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  cover: { width: '100%', aspectRatio: media.coverAspect, backgroundColor: colors.track },
  topActions: { position: 'absolute', right: space.lg, flexDirection: 'row', gap: space.sm },
  roundBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(28,37,32,0.45)' },
  modalCard: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
  },
  modalHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: space.lg,
  },
  modalTitle: { ...type.h2, marginTop: space.sm },
  modalText: { marginTop: space.xs, fontSize: 14, color: colors.textMuted, lineHeight: 20 },
  modalLabel: { marginTop: space.lg, marginBottom: space.sm, fontSize: 14, fontWeight: '600', color: colors.text },
  reasons: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  reasonChip: {
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  reasonChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  reasonChipText: { fontSize: 14, fontWeight: '500', color: colors.textMuted },
  reasonChipTextActive: { color: colors.white },
  modalInput: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    fontSize: 15,
    color: colors.text,
  },
  modalInputMultiline: { minHeight: 80, textAlignVertical: 'top' },
  modalError: { marginTop: space.md, fontSize: 14, color: colors.danger, lineHeight: 20 },
  modalCta: {
    marginTop: space.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingVertical: space.lg,
    borderRadius: radius.md,
    minHeight: 52,
  },
  modalCtaText: { color: colors.white, fontSize: 16, fontWeight: '600' },
  modalCancel: { alignItems: 'center', paddingVertical: space.md, marginTop: space.xs },
  modalCancelText: { color: colors.textMuted, fontSize: 15, fontWeight: '600' },
  back: {
    position: 'absolute', left: space.lg,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center',
  },
  content: { padding: space.lg },
  chipRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.md },
  cat: { paddingHorizontal: space.md, paddingVertical: 4, borderRadius: radius.pill },
  catText: { fontSize: 12, fontWeight: '600' },
  verified: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  verifiedText: { fontSize: 12, fontWeight: '500', color: colors.primary },
  title: { ...type.h1, lineHeight: 29 },
  beneficiary: { marginTop: space.xs, fontSize: 14, color: colors.textMuted },
  progressBlock: {
    marginTop: space.xl, padding: space.lg,
    backgroundColor: colors.surface, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border,
  },
  doneBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginTop: space.xl,
    padding: space.lg,
    borderRadius: radius.md,
    backgroundColor: colors.success + '1A',
  },
  doneBannerText: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.success, lineHeight: 21 },
  story: { marginTop: space.xl, fontSize: 15, lineHeight: 23, color: colors.text },
  qrCard: {
    marginTop: space.xl, padding: space.xl, alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border,
  },
  qrTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  qrSub: { marginTop: 2, fontSize: 13, color: colors.textMuted },
  qr: {
    width: 220, height: 220, marginVertical: space.lg,
    borderRadius: radius.md, backgroundColor: colors.white,
  },
  bankRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bankText: { fontSize: 14, color: colors.text, fontWeight: '500' },
  dedicated: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: space.sm },
  dedicatedText: { fontSize: 12, color: colors.primary, fontWeight: '500' },
  cta: {
    marginTop: space.xl, flexDirection: 'row', gap: space.sm,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.primary, paddingVertical: space.lg, borderRadius: radius.md,
  },
  ctaText: { color: colors.white, fontSize: 16, fontWeight: '600' },
  sectionTitle: { ...type.h2, marginTop: space.xxl, marginBottom: space.md },
  message: {
    backgroundColor: colors.surface, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    padding: space.lg, marginBottom: space.sm,
  },
  messageHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  messageName: { fontSize: 14, fontWeight: '600', color: colors.text },
  messageAmount: {
    fontSize: 12, fontWeight: '600', color: colors.primary,
    backgroundColor: colors.accentSoft, paddingHorizontal: space.sm, paddingVertical: 2,
    borderRadius: radius.pill,
  },
  messageText: { marginTop: 4, fontSize: 14, color: colors.textMuted, lineHeight: 20 },
  messagesEmpty: { fontSize: 14, color: colors.textMuted, lineHeight: 20 },
  update: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
    marginBottom: space.sm,
  },
  updateDate: { fontSize: 13, color: colors.textMuted },
  updateText: { marginTop: space.xs, fontSize: 14, color: colors.text, lineHeight: 20 },
  updateImage: {
    width: '100%',
    aspectRatio: media.photoAspect,
    borderRadius: radius.md,
    backgroundColor: colors.track,
    marginTop: space.md,
  },
});
