import React, { useCallback, useState } from 'react';
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
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { RootStackParamList } from '../../App';
import { MyCampaign, ProgressUpdate, CampaignStatus } from '../types';
import { fetchMyCampaigns, fetchProgressUpdates, addProgressUpdate } from '../lib/campaigns';
import { ProgressBar } from '../components/ProgressBar';
import { colors, radius, space, type, formatBs, formatDate, media } from '../theme';

type Nav = NativeStackNavigationProp<RootStackParamList, 'CampanaManage'>;
type ManageRoute = RouteProp<RootStackParamList, 'CampanaManage'>;

const STATUS: Record<CampaignStatus, { label: string; color: string }> = {
  borrador: { label: 'Borrador', color: colors.textMuted },
  en_revision: { label: 'En revisión', color: colors.accent },
  aprobada: { label: 'Aprobada', color: colors.primary },
  rechazada: { label: 'Rechazada', color: colors.danger },
  pausada: { label: 'Pausada', color: colors.textMuted },
  completada: { label: 'Completada', color: colors.success },
  expirada: { label: 'Expirada', color: colors.textMuted },
};

export default function CampanaManageScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<Nav>();
  const { campaignId } = useRoute<ManageRoute>().params;

  const [campaign, setCampaign] = useState<MyCampaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [updates, setUpdates] = useState<ProgressUpdate[]>([]);
  const [updatesLoading, setUpdatesLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [newTotalText, setNewTotalText] = useState('');
  const [message, setMessage] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const mine = await fetchMyCampaigns();
      setCampaign(mine.find((c) => c.id === campaignId) ?? null);
    } catch (e) {
      console.warn('No se pudo cargar la campaña:', e);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  const loadUpdates = useCallback(async () => {
    setUpdatesLoading(true);
    try {
      setUpdates(await fetchProgressUpdates(campaignId));
    } catch (e) {
      console.warn('No se pudieron cargar las actualizaciones:', e);
    } finally {
      setUpdatesLoading(false);
    }
  }, [campaignId]);

  // Al volver de editar la campaña (título, estado, etc.) se recarga.
  useFocusEffect(
    useCallback(() => {
      load();
      loadUpdates();
    }, [load, loadUpdates])
  );

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (!result.canceled) setImageUri(result.assets[0].uri);
  };

  const openForm = () => {
    setConfirm(null);
    setFormError(null);
    setShowForm(true);
  };

  const onSave = async () => {
    const hasTotal = newTotalText.trim() !== '';
    const hasMessage = message.trim() !== '';
    if (!hasTotal && !hasMessage) {
      setFormError('Agregá un total nuevo o un mensaje (al menos uno).');
      return;
    }

    let total: number | null = null;
    if (hasTotal) {
      const n = Number(newTotalText.replace(',', '.'));
      if (Number.isNaN(n) || n < 0) {
        setFormError('El total tiene que ser un número válido (0 o más).');
        return;
      }
      total = n;
    }

    setSaving(true);
    setFormError(null);
    try {
      await addProgressUpdate({
        campaignId,
        newTotal: total,
        updateText: message.trim() || null,
        imageUri,
      });
      setShowForm(false);
      setNewTotalText('');
      setMessage('');
      setImageUri(null);
      setConfirm('¡Listo! Tu actualización se publicó.');
      // Refrescar: el monto y la barra reflejan el nuevo total (vía trigger).
      await Promise.all([load(), loadUpdates()]);
    } catch (e) {
      console.warn('No se pudo guardar la actualización:', e);
      setFormError('No pudimos guardar la actualización. Intentá de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
      <Pressable onPress={() => nav.goBack()} style={styles.back}>
        <Ionicons name="arrow-back" size={22} color={colors.text} />
      </Pressable>
      <Text style={styles.headerTitle} numberOfLines={1}>Gestionar campaña</Text>
    </View>
  );

  if (loading && !campaign) {
    return (
      <View style={styles.screen}>
        {header}
        <View style={styles.stateCenter}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.stateText}>Cargando…</Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.screen}>
        {header}
        <View style={styles.stateCenter}>
          <Ionicons name="cloud-offline-outline" size={40} color={colors.textMuted} />
          <Text style={styles.stateTitle}>No pudimos cargar la campaña</Text>
          <Pressable onPress={load} style={({ pressed }) => [styles.retry, pressed && { opacity: 0.9 }]}>
            <Text style={styles.retryText}>Reintentar</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (!campaign) {
    return (
      <View style={styles.screen}>
        {header}
        <View style={styles.stateCenter}>
          <Ionicons name="lock-closed-outline" size={40} color={colors.textMuted} />
          <Text style={styles.stateTitle}>Acceso restringido</Text>
          <Text style={styles.stateText}>Esta campaña no es tuya, así que no podés gestionarla.</Text>
        </View>
      </View>
    );
  }

  const st = STATUS[campaign.status];

  return (
    <View style={styles.screen}>
      {header}

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={insets.top + 56}
      >
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xxxl }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Image source={{ uri: campaign.coverImageUrl }} style={styles.cover} />
          <View style={[styles.badge, { backgroundColor: st.color + '1A' }]}>
            <Text style={[styles.badgeText, { color: st.color }]}>{st.label}</Text>
          </View>
          <Text style={styles.title}>{campaign.title}</Text>
          {campaign.status === 'rechazada' && campaign.rejectionReason && (
            <Text style={styles.rejection}>Motivo: {campaign.rejectionReason}</Text>
          )}
          <Pressable
            onPress={() => nav.navigate('EditarCampana', { campaignId })}
            style={({ pressed }) => [styles.editBtn, pressed && { opacity: 0.9 }]}
          >
            <Ionicons name="create-outline" size={16} color={colors.primary} />
            <Text style={styles.editBtnText}>
              {campaign.status === 'rechazada' ? 'Corregir y reenviar' : 'Editar campaña'}
            </Text>
          </Pressable>

          <View style={styles.progressBlock}>
            <ProgressBar current={campaign.currentAmount} goal={campaign.goalAmount} large />
          </View>

          {confirm && (
            <View style={styles.confirmBox}>
              <Ionicons name="checkmark-circle" size={18} color={colors.primary} />
              <Text style={styles.confirmText}>{confirm}</Text>
            </View>
          )}

          {!showForm ? (
            <Pressable
              onPress={openForm}
              style={({ pressed }) => [styles.cta, pressed && { opacity: 0.9 }]}
            >
              <Ionicons name="trending-up-outline" size={18} color={colors.white} />
              <Text style={styles.ctaText}>Actualizar avance</Text>
            </Pressable>
          ) : (
            <View style={styles.form}>
              <Text style={styles.label}>Total recaudado hasta ahora (Bs)</Text>
              <View style={styles.amountField}>
                <Text style={styles.amountPrefix}>Bs</Text>
                <TextInput
                  value={newTotalText}
                  onChangeText={setNewTotalText}
                  keyboardType="numeric"
                  placeholder={String(Math.round(campaign.currentAmount))}
                  placeholderTextColor={colors.textMuted}
                  style={styles.amountInput}
                />
              </View>
              <Text style={styles.help}>
                Ingresá el saldo total de tu cuenta para esta campaña, no lo que entró hoy. Hoy
                figura Bs {formatBs(campaign.currentAmount)}.
              </Text>

              <Text style={styles.label}>Mensaje para quienes ayudan (opcional)</Text>
              <TextInput
                value={message}
                onChangeText={setMessage}
                placeholder="Ej: ya pagamos la primera cuota, ¡gracias!"
                placeholderTextColor={colors.textMuted}
                multiline
                style={[styles.input, styles.inputMultiline]}
              />

              <Text style={styles.label}>Foto (opcional)</Text>
              {imageUri ? (
                <View>
                  <Image source={{ uri: imageUri }} style={styles.preview} resizeMode="contain" />
                  <Pressable
                    onPress={pickImage}
                    style={({ pressed }) => [styles.replace, pressed && { opacity: 0.9 }]}
                  >
                    <Ionicons name="image-outline" size={16} color={colors.primary} />
                    <Text style={styles.replaceText}>Cambiar foto</Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  onPress={pickImage}
                  style={({ pressed }) => [styles.picker, pressed && { opacity: 0.9 }]}
                >
                  <Ionicons name="image-outline" size={22} color={colors.primary} />
                  <Text style={styles.pickerText}>Agregar una foto</Text>
                </Pressable>
              )}

              {formError && <Text style={styles.error}>{formError}</Text>}

              <Pressable
                onPress={onSave}
                disabled={saving}
                style={({ pressed }) => [
                  styles.cta,
                  saving && styles.ctaDisabled,
                  pressed && !saving && { opacity: 0.9 },
                ]}
              >
                {saving ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <Text style={styles.ctaText}>Publicar actualización</Text>
                )}
              </Pressable>
              <Pressable onPress={() => setShowForm(false)} disabled={saving} style={styles.cancel}>
                <Text style={styles.cancelText}>Cancelar</Text>
              </Pressable>
            </View>
          )}

          {/* Historial de actualizaciones */}
          <Text style={styles.sectionTitle}>Novedades publicadas</Text>
          {updatesLoading ? (
            <View style={styles.inlineState}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : updates.length === 0 ? (
            <Text style={styles.empty}>Todavía no publicaste novedades.</Text>
          ) : (
            updates.map((u) => (
              <View key={u.id} style={styles.update}>
                <View style={styles.updateHead}>
                  <Text style={styles.updateDate}>{formatDate(u.createdAt)}</Text>
                  {u.newTotal != null && (
                    <Text style={styles.updateTotal}>Total: Bs {formatBs(u.newTotal)}</Text>
                  )}
                </View>
                {!!u.updateText && <Text style={styles.updateText}>{u.updateText}</Text>}
                {!!u.imageUrl && <Image source={{ uri: u.imageUrl }} style={styles.updateImage} resizeMode="contain" />}
              </View>
            ))
          )}
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
  content: { paddingHorizontal: space.lg, paddingTop: space.md },
  cover: { width: '100%', aspectRatio: media.coverAspect, borderRadius: radius.lg, backgroundColor: colors.track },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: space.md,
    paddingVertical: 4,
    borderRadius: radius.pill,
    marginTop: space.md,
  },
  badgeText: { fontSize: 12, fontWeight: '600' },
  title: { ...type.h1, lineHeight: 29, marginTop: space.sm },
  rejection: { marginTop: space.xs, fontSize: 14, color: colors.danger, lineHeight: 20 },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    alignSelf: 'flex-start',
    marginTop: space.md,
    paddingVertical: space.sm,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  editBtnText: { fontSize: 14, fontWeight: '600', color: colors.primary },
  progressBlock: {
    marginTop: space.lg,
    padding: space.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  confirmBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginTop: space.lg,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
  },
  confirmText: { flex: 1, fontSize: 14, color: colors.text },
  cta: {
    marginTop: space.lg,
    flexDirection: 'row',
    gap: space.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingVertical: space.lg,
    borderRadius: radius.md,
    minHeight: 52,
  },
  ctaDisabled: { opacity: 0.6 },
  ctaText: { color: colors.white, fontSize: 16, fontWeight: '600' },
  form: { marginTop: space.lg },
  label: { marginTop: space.lg, marginBottom: space.sm, fontSize: 14, fontWeight: '600', color: colors.text },
  amountField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: space.lg,
  },
  amountPrefix: { fontSize: 16, fontWeight: '700', color: colors.primary },
  amountInput: { flex: 1, paddingVertical: space.md, fontSize: 16, color: colors.text },
  help: { marginTop: space.xs, fontSize: 12, color: colors.textMuted, lineHeight: 18 },
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
  picker: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    paddingVertical: space.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  pickerText: { fontSize: 15, fontWeight: '600', color: colors.primary },
  preview: { width: '100%', aspectRatio: media.photoAspect, borderRadius: radius.md, backgroundColor: colors.track },
  replace: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    alignSelf: 'center',
    marginTop: space.sm,
    paddingVertical: space.sm,
  },
  replaceText: { fontSize: 14, fontWeight: '600', color: colors.primary },
  error: { marginTop: space.lg, fontSize: 14, color: colors.danger, lineHeight: 20 },
  cancel: { alignItems: 'center', paddingVertical: space.md, marginTop: space.xs },
  cancelText: { color: colors.textMuted, fontSize: 15, fontWeight: '600' },
  sectionTitle: { ...type.h2, marginTop: space.xxl, marginBottom: space.md },
  inlineState: { alignItems: 'center', paddingVertical: space.lg },
  empty: { fontSize: 14, color: colors.textMuted, lineHeight: 20 },
  update: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
    marginBottom: space.sm,
  },
  updateHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  updateDate: { fontSize: 13, color: colors.textMuted },
  updateTotal: { fontSize: 13, fontWeight: '600', color: colors.primary },
  updateText: { marginTop: space.xs, fontSize: 14, color: colors.text, lineHeight: 20 },
  updateImage: {
    width: '100%',
    aspectRatio: media.photoAspect,
    borderRadius: radius.md,
    backgroundColor: colors.track,
    marginTop: space.md,
  },
  stateCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xxl,
    gap: space.sm,
  },
  stateTitle: { ...type.h2, textAlign: 'center', marginTop: space.sm },
  stateText: { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
  retry: {
    marginTop: space.lg,
    backgroundColor: colors.primary,
    paddingVertical: space.md,
    paddingHorizontal: space.xxl,
    borderRadius: radius.md,
  },
  retryText: { color: colors.white, fontSize: 15, fontWeight: '600' },
});
