import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  ScrollView,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../../App';
import { Campaign } from '../types';
import { fetchCampaigns, primeCampaign } from '../lib/campaigns';
import { subscribeToAllCampaigns } from '../lib/realtime';
import { useAuth } from '../lib/auth';
import { CampaignCard } from '../components/CampaignCard';
import { CampaignCardSkeleton } from '../components/CampaignCardSkeleton';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { colors, space, type, categories, CategoryKey } from '../theme';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Feed'>;

const FILTERS: ('todas' | CategoryKey)[] = [
  'todas', 'salud', 'animales', 'desastre', 'educacion', 'alimentacion',
];

export default function FeedScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<Nav>();
  const { session, profile, loading: authLoading } = useAuth();
  const [filter, setFilter] = useState<'todas' | CategoryKey>('todas');
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setCampaigns(await fetchCampaigns());
    } catch (e) {
      console.warn('No se pudo cargar el feed:', e);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  // Pull-to-refresh: no togglea `loading` para no desmontar la lista.
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      setCampaigns(await fetchCampaigns());
      setError(false);
    } catch (e) {
      console.warn('No se pudo refrescar el feed:', e);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Realtime: una sola suscripción a los UPDATE de campañas. Actualizamos el
  // monto en vivo y sacamos las que dejen de ser públicas.
  useEffect(() => {
    const unsubscribe = subscribeToAllCampaigns((change) => {
      setCampaigns((prev) => {
        if (!prev.some((c) => c.id === change.id)) return prev;
        const isPublic = change.status === 'aprobada' || change.status === 'completada';
        if (!isPublic) return prev.filter((c) => c.id !== change.id);
        return prev.map((c) =>
          c.id === change.id ? { ...c, currentAmount: change.currentAmount } : c
        );
      });
    });
    return unsubscribe;
  }, []);

  const data = filter === 'todas'
    ? campaigns
    : campaigns.filter((c) => c.category === filter);

  // El alta de campaña exige sesión: si no hay, mandamos a Auth y al loguearse
  // se redirige a CrearCampana.
  const onCreate = () => {
    if (session) nav.navigate('CrearCampana');
    else nav.navigate('Auth', { redirect: { screen: 'CrearCampana' } });
  };

  // Un solo acceso en el header: Perfil si hay sesión (concentra Mis campañas,
  // Siguiendo, Moderación y cerrar sesión), o iniciar sesión si no la hay.
  const onHeaderAccess = () => {
    if (session) nav.navigate('Perfil');
    else nav.navigate('Auth', {});
  };

  const initial = (profile?.fullName || '?').trim().charAt(0).toUpperCase();

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.kicker}>SANTA CRUZ DE LA SIERRA</Text>
        <Text style={type.display}>Cerca tuyo</Text>
        <Text style={[type.small, { marginTop: space.xs }]}>
          Casos reales que necesitan una mano hoy
        </Text>
      </View>

      {!authLoading && (session ? (
        <Pressable
          onPress={onHeaderAccess}
          hitSlop={8}
          style={({ pressed }) => [
            styles.access,
            { top: insets.top + space.md },
            pressed && { opacity: 0.7 },
          ]}
        >
          {profile ? (
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initial}</Text>
            </View>
          ) : (
            <Ionicons name="person-circle-outline" size={30} color={colors.primary} />
          )}
        </Pressable>
      ) : (
        <Pressable
          onPress={onHeaderAccess}
          hitSlop={8}
          style={({ pressed }) => [
            styles.loginBtn,
            { top: insets.top + space.md },
            pressed && { opacity: 0.7 },
          ]}
        >
          <Ionicons name="log-in-outline" size={16} color={colors.primary} />
          <Text style={styles.loginText}>Iniciar sesión</Text>
        </Pressable>
      ))}

      <View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filters}
        >
          {FILTERS.map((f) => {
            const active = f === filter;
            const label = f === 'todas' ? 'Todas' : categories[f].label;
            return (
              <Pressable
                key={f}
                onPress={() => setFilter(f)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {loading ? (
        <View style={styles.skeletonWrap}>
          <CampaignCardSkeleton />
          <CampaignCardSkeleton />
          <CampaignCardSkeleton />
        </View>
      ) : error ? (
        <ErrorState
          onRetry={load}
          title="No pudimos cargar las campañas"
          message="Revisá tu conexión e intentá de nuevo."
        />
      ) : (
        <FlatList
          data={data}
          keyExtractor={(c) => c.id}
          renderItem={({ item }) => (
            <CampaignCard
              campaign={item}
              onPress={() => {
                primeCampaign(item);
                nav.navigate('CampaignDetail', { slug: item.slug });
              }}
            />
          )}
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
          ListEmptyComponent={
            <EmptyState
              icon="heart-outline"
              title="Todavía no hay campañas activas"
              message="Volvé a mirar pronto: siempre aparece alguien que necesita una mano. ¿Conocés un caso? Levantá la primera."
              actionLabel={session ? 'Crear campaña' : undefined}
              onAction={session ? onCreate : undefined}
            />
          }
        />
      )}

      <Pressable
        onPress={onCreate}
        style={({ pressed }) => [
          styles.fab,
          { bottom: insets.bottom + space.lg },
          pressed && { opacity: 0.9 },
        ]}
      >
        <Ionicons name="add" size={30} color={colors.white} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.sm },
  kicker: {
    fontSize: 12, fontWeight: '700', color: colors.primary,
    letterSpacing: 1.2, marginBottom: 2,
  },
  filters: { paddingHorizontal: space.lg, paddingVertical: space.md, gap: space.sm },
  chip: {
    paddingHorizontal: space.lg, paddingVertical: space.sm,
    borderRadius: 999, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 14, fontWeight: '500', color: colors.textMuted },
  chipTextActive: { color: colors.white },
  access: {
    position: 'absolute',
    right: space.lg,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loginBtn: {
    position: 'absolute',
    right: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  loginText: { fontSize: 14, fontWeight: '600', color: colors.primary },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.white, fontSize: 15, fontWeight: '700' },
  list: { paddingHorizontal: space.lg, paddingBottom: space.xxxl + 72, flexGrow: 1 },
  skeletonWrap: { paddingHorizontal: space.lg, paddingTop: space.md },
  fab: {
    position: 'absolute',
    right: space.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.text,
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
});
