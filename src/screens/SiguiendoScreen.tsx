import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../../App';
import { Campaign } from '../types';
import { fetchFollowedCampaigns } from '../lib/follows';
import { primeCampaign } from '../lib/campaigns';
import { CampaignCard } from '../components/CampaignCard';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';
import { EmptyState } from '../components/EmptyState';
import { colors, space, type } from '../theme';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Siguiendo'>;

export default function SiguiendoScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<Nav>();

  const [items, setItems] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setItems(await fetchFollowedCampaigns());
    } catch (e) {
      console.warn('No se pudieron cargar las campañas seguidas:', e);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      setItems(await fetchFollowedCampaigns());
      setError(false);
    } catch (e) {
      console.warn('No se pudieron refrescar las campañas seguidas:', e);
    } finally {
      setRefreshing(false);
    }
  }, []);

  // Se recarga al enfocar: si dejaste de seguir desde el detalle, vuelve
  // reflejado.
  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
        <Pressable onPress={() => nav.goBack()} style={styles.back}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>Siguiendo</Text>
      </View>

      {loading ? (
        <LoadingState text="Cargando…" />
      ) : error ? (
        <ErrorState onRetry={load} title="No pudimos cargar tus seguidas" />
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
          renderItem={({ item }) => (
            <CampaignCard
              campaign={item}
              onPress={() => {
                primeCampaign(item);
                nav.navigate('CampaignDetail', { slug: item.slug });
              }}
            />
          )}
          ListEmptyComponent={
            <EmptyState
              icon="heart-outline"
              title="Todavía no seguís ninguna campaña"
              message="Tocá el corazón en una campaña para guardarla acá."
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
});
