import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../../App';
import { OpenReport } from '../types';
import { fetchOpenReports, setReportStatus, reasonLabel } from '../lib/reports';
import { fetchCampaignById, primeCampaign } from '../lib/campaigns';
import { useAuth } from '../lib/auth';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';
import { EmptyState } from '../components/EmptyState';
import { colors, radius, space, type, formatDate } from '../theme';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Reports'>;

export default function ReportsScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<Nav>();
  const { profile } = useAuth();
  const isModerator = profile?.role === 'moderator' || profile?.role === 'admin';

  const [items, setItems] = useState<OpenReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setItems(await fetchOpenReports());
    } catch (e) {
      console.warn('No se pudieron cargar los reportes:', e);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (isModerator) load();
    }, [isModerator, load])
  );

  const resolve = async (id: string, status: 'resuelto' | 'descartado') => {
    setBusyId(id);
    setActionError(null);
    try {
      await setReportStatus(id, status);
      setItems((prev) => prev.filter((r) => r.id !== id));
    } catch (e) {
      console.warn('No se pudo actualizar el reporte:', e);
      setActionError('No pudimos actualizar el reporte. Intentá de nuevo.');
    } finally {
      setBusyId(null);
    }
  };

  const openCampaign = async (campaignId: string) => {
    setOpeningId(campaignId);
    setActionError(null);
    try {
      const campaign = await fetchCampaignById(campaignId);
      primeCampaign(campaign);
      nav.navigate('CampaignDetail', { slug: campaign.slug });
    } catch (e) {
      console.warn('No se pudo abrir la campaña:', e);
      setActionError('No pudimos abrir la campaña. Intentá de nuevo.');
    } finally {
      setOpeningId(null);
    }
  };

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
      <Pressable onPress={() => nav.goBack()} style={styles.back}>
        <Ionicons name="arrow-back" size={22} color={colors.text} />
      </Pressable>
      <Text style={styles.headerTitle} numberOfLines={1}>Reportes</Text>
    </View>
  );

  if (!isModerator) {
    return (
      <View style={styles.screen}>
        {header}
        <EmptyState
          icon="lock-closed-outline"
          title="Acceso restringido"
          message="Esta sección es solo para el equipo de moderación."
        />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {header}

      {loading ? (
        <LoadingState text="Cargando reportes…" />
      ) : error ? (
        <ErrorState onRetry={load} title="No pudimos cargar los reportes" />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(r) => r.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={actionError ? <Text style={styles.actionError}>{actionError}</Text> : null}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.reasonRow}>
                <Ionicons name="flag-outline" size={16} color={colors.danger} />
                <Text style={styles.reason}>{reasonLabel(item.reason)}</Text>
              </View>
              <Text style={styles.campaign} numberOfLines={2}>{item.campaignTitle}</Text>
              {!!item.details && <Text style={styles.details}>{item.details}</Text>}
              <Text style={styles.meta}>
                Reportó {item.reporterName || 'Anónimo'} · {formatDate(item.createdAt)}
              </Text>

              <Pressable
                onPress={() => openCampaign(item.campaignId)}
                disabled={openingId === item.campaignId}
                style={({ pressed }) => [styles.openLink, pressed && { opacity: 0.7 }]}
              >
                {openingId === item.campaignId ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <>
                    <Ionicons name="open-outline" size={16} color={colors.primary} />
                    <Text style={styles.openLinkText}>Abrir campaña</Text>
                  </>
                )}
              </Pressable>

              <View style={styles.actions}>
                {busyId === item.id ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <>
                    <Pressable
                      onPress={() => resolve(item.id, 'resuelto')}
                      style={({ pressed }) => [styles.resolve, pressed && { opacity: 0.9 }]}
                    >
                      <Text style={styles.resolveText}>Marcar resuelto</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => resolve(item.id, 'descartado')}
                      style={({ pressed }) => [styles.discard, pressed && { opacity: 0.9 }]}
                    >
                      <Text style={styles.discardText}>Descartar</Text>
                    </Pressable>
                  </>
                )}
              </View>
            </View>
          )}
          ListEmptyComponent={
            <EmptyState
              icon="checkmark-done-outline"
              title="Todo al día"
              message="No hay reportes pendientes. Cuando alguien denuncie una campaña, aparece acá."
            />
          }
        />
      )}
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
  list: { paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.xxxl, flexGrow: 1 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
    marginBottom: space.lg,
  },
  reasonRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  reason: { fontSize: 14, fontWeight: '700', color: colors.danger },
  campaign: { marginTop: space.sm, fontSize: 16, fontWeight: '600', color: colors.text, lineHeight: 22 },
  details: { marginTop: space.xs, fontSize: 14, color: colors.text, lineHeight: 20 },
  meta: { marginTop: space.sm, fontSize: 13, color: colors.textMuted },
  openLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    alignSelf: 'flex-start',
    marginTop: space.md,
    paddingVertical: space.xs,
  },
  openLinkText: { fontSize: 14, fontWeight: '600', color: colors.primary },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.md },
  resolve: {
    backgroundColor: colors.primary,
    paddingVertical: space.sm,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
  },
  resolveText: { color: colors.white, fontSize: 14, fontWeight: '600' },
  discard: {
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: space.sm,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
  },
  discardText: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },
  actionError: { fontSize: 14, color: colors.danger, lineHeight: 20, marginBottom: space.md },
});
