import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../../App';
import { MyCampaign, CampaignStatus } from '../types';
import { fetchMyCampaigns } from '../lib/campaigns';
import { ProgressBar } from '../components/ProgressBar';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';
import { EmptyState } from '../components/EmptyState';
import { colors, radius, space, type, media } from '../theme';

type Nav = NativeStackNavigationProp<RootStackParamList, 'MisCampanas'>;

const STATUS: Record<CampaignStatus, { label: string; color: string }> = {
  borrador: { label: 'Borrador', color: colors.textMuted },
  en_revision: { label: 'En revisión', color: colors.accent },
  aprobada: { label: 'Aprobada', color: colors.primary },
  rechazada: { label: 'Rechazada', color: colors.danger },
  pausada: { label: 'Pausada', color: colors.textMuted },
  completada: { label: 'Completada', color: colors.success },
  expirada: { label: 'Expirada', color: colors.textMuted },
};

export default function MisCampanasScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<Nav>();

  const [items, setItems] = useState<MyCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setItems(await fetchMyCampaigns());
    } catch (e) {
      console.warn('No se pudieron cargar tus campañas:', e);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      setItems(await fetchMyCampaigns());
      setError(false);
    } catch (e) {
      console.warn('No se pudieron refrescar tus campañas:', e);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
        <Pressable onPress={() => nav.goBack()} style={styles.back}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>Mis campañas</Text>
      </View>

      {loading ? (
        <LoadingState text="Cargando tus campañas…" />
      ) : error ? (
        <ErrorState onRetry={load} title="No pudimos cargar tus campañas" />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(c) => c.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          renderItem={({ item }) => {
            const st = STATUS[item.status];
            return (
              <Pressable
                onPress={() => nav.navigate('CampanaManage', { campaignId: item.id })}
                style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}
              >
                <Image source={{ uri: item.coverImageUrl }} style={styles.cover} />
                <View style={styles.body}>
                  <View style={[styles.badge, { backgroundColor: st.color + '1A' }]}>
                    <Text style={[styles.badgeText, { color: st.color }]}>{st.label}</Text>
                  </View>
                  <Text style={styles.title} numberOfLines={2}>{item.title}</Text>

                  {item.status === 'rechazada' && item.rejectionReason && (
                    <Text style={styles.reject}>Motivo: {item.rejectionReason}</Text>
                  )}

                  <View style={styles.progress}>
                    <ProgressBar current={item.currentAmount} goal={item.goalAmount} />
                  </View>
                </View>
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <EmptyState
              icon="add-circle-outline"
              title="Todavía no creaste ninguna campaña"
              message="Cuando levantes un caso, lo vas a poder gestionar desde acá."
              actionLabel="Crear campaña"
              onAction={() => nav.navigate('CrearCampana')}
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
    marginBottom: space.lg,
    overflow: 'hidden',
  },
  cover: { width: '100%', aspectRatio: media.coverAspect, backgroundColor: colors.track },
  body: { padding: space.lg },
  badge: { alignSelf: 'flex-start', paddingHorizontal: space.md, paddingVertical: 4, borderRadius: radius.pill },
  badgeText: { fontSize: 12, fontWeight: '600' },
  title: { fontSize: 17, fontWeight: '700', color: colors.text, lineHeight: 23, marginTop: space.sm },
  reject: { marginTop: space.xs, fontSize: 13, color: colors.danger, lineHeight: 19 },
  progress: { marginTop: space.md },
});
