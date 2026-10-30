import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../../App';
import { PendingCampaign } from '../types';
import { fetchPendingCampaigns } from '../lib/campaigns';
import { useAuth } from '../lib/auth';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';
import { EmptyState } from '../components/EmptyState';
import { colors, radius, space, type, categories, formatBs, media } from '../theme';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Moderation'>;

export default function ModerationScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<Nav>();
  const { profile } = useAuth();
  const isModerator = profile?.role === 'moderator' || profile?.role === 'admin';

  const [items, setItems] = useState<PendingCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setItems(await fetchPendingCampaigns());
    } catch (e) {
      console.warn('No se pudieron cargar las campañas pendientes:', e);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  // Recarga al enfocar: al volver de aprobar/rechazar, la lista se refresca y
  // la campaña resuelta desaparece.
  useFocusEffect(
    useCallback(() => {
      if (isModerator) load();
    }, [isModerator, load])
  );

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
      <Pressable onPress={() => nav.goBack()} style={styles.back}>
        <Ionicons name="arrow-back" size={22} color={colors.text} />
      </Pressable>
      <Text style={styles.headerTitle} numberOfLines={1}>Moderación</Text>
      {isModerator && (
        <Pressable
          onPress={() => nav.navigate('Reports')}
          hitSlop={8}
          style={({ pressed }) => [styles.reportsBtn, pressed && { opacity: 0.85 }]}
        >
          <Ionicons name="flag-outline" size={16} color={colors.primary} />
          <Text style={styles.reportsBtnText}>Reportes</Text>
        </Pressable>
      )}
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
        <LoadingState text="Cargando campañas…" />
      ) : error ? (
        <ErrorState onRetry={load} title="No pudimos cargar las campañas" />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(c) => c.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const cat = categories[item.category];
            return (
              <Pressable
                onPress={() => nav.navigate('ModerationDetail', { campaign: item })}
                style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}
              >
                <Image source={{ uri: item.coverImageUrl }} style={styles.cover} />
                <View style={styles.body}>
                  <View style={[styles.cat, { backgroundColor: cat.color + '1A' }]}>
                    <Text style={[styles.catText, { color: cat.color }]}>{cat.label}</Text>
                  </View>
                  <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
                  <Text style={styles.meta} numberOfLines={1}>
                    {item.organizerName} · meta Bs {formatBs(item.goalAmount)}
                  </Text>
                  <View style={styles.docsRow}>
                    <Ionicons name="document-text-outline" size={14} color={colors.textMuted} />
                    <Text style={styles.docsText}>
                      {item.documents.length} documento{item.documents.length === 1 ? '' : 's'} de verificación
                    </Text>
                  </View>
                </View>
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <EmptyState
              icon="checkmark-done-outline"
              title="Todo al día"
              message="No hay campañas pendientes de revisión. Cuando alguien envíe una, aparece acá."
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
  reportsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  reportsBtnText: { fontSize: 13, fontWeight: '600', color: colors.primary },
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
  body: { padding: space.lg, gap: space.xs },
  cat: { alignSelf: 'flex-start', paddingHorizontal: space.md, paddingVertical: 4, borderRadius: radius.pill },
  catText: { fontSize: 12, fontWeight: '600' },
  title: { fontSize: 17, fontWeight: '700', color: colors.text, lineHeight: 23, marginTop: space.xs },
  meta: { fontSize: 14, color: colors.textMuted },
  docsRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: space.xs },
  docsText: { fontSize: 13, color: colors.textMuted },
});
