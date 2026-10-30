import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Image,
  Pressable,
  ScrollView,
  Switch,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { RootStackParamList } from '../../App';
import { MyCampaign } from '../types';
import {
  fetchMyCampaigns,
  updateMyCampaign,
  changesCriticalFields,
  changesAccount,
  CampaignEdit,
} from '../lib/campaigns';
import { colors, radius, space, type, categories, CategoryKey, media } from '../theme';

type Nav = NativeStackNavigationProp<RootStackParamList, 'EditarCampana'>;
type EditRoute = RouteProp<RootStackParamList, 'EditarCampana'>;

const CATEGORY_KEYS: CategoryKey[] = [
  'salud', 'animales', 'desastre', 'educacion', 'funeral', 'alimentacion', 'otro',
];

export default function EditarCampanaScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<Nav>();
  const { campaignId } = useRoute<EditRoute>().params;

  const [campaign, setCampaign] = useState<MyCampaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [title, setTitle] = useState('');
  const [story, setStory] = useState('');
  const [category, setCategory] = useState<CategoryKey>('otro');
  const [beneficiaryName, setBeneficiaryName] = useState('');
  const [goal, setGoal] = useState('');
  const [newCoverUri, setNewCoverUri] = useState<string | null>(null);
  const [newQrUri, setNewQrUri] = useState<string | null>(null);
  const [bankName, setBankName] = useState('');
  const [accountHolder, setAccountHolder] = useState('');
  const [dedicated, setDedicated] = useState(false);

  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const mine = await fetchMyCampaigns();
      const c = mine.find((x) => x.id === campaignId) ?? null;
      setCampaign(c);
      if (c) {
        setTitle(c.title);
        setStory(c.story);
        setCategory(c.category);
        setBeneficiaryName(c.beneficiaryName);
        setGoal(String(c.goalAmount));
        setBankName(c.qrBankName);
        setAccountHolder(c.accountHolderName);
        setDedicated(c.usesDedicatedAccount);
      }
    } catch (e) {
      console.warn('No se pudo cargar la campaña:', e);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  const goalAmount = Number(goal.replace(',', '.'));
  const goalValid = goal.trim() !== '' && !Number.isNaN(goalAmount) && goalAmount > 0;

  const missing: string[] = [];
  if (!title.trim()) missing.push('título');
  if (!story.trim()) missing.push('historia');
  if (!goalValid) missing.push('meta válida en Bs');
  const isValid = missing.length === 0;

  const edit: CampaignEdit = {
    title,
    story,
    category,
    beneficiaryName,
    goalAmount,
    qrBankName: bankName,
    accountHolderName: accountHolder,
    usesDedicatedAccount: dedicated,
    newCoverUri,
    newQrUri,
  };

  const isLive = campaign?.status === 'aprobada' || campaign?.status === 'completada';
  const resubmits = campaign?.status === 'borrador' || campaign?.status === 'rechazada';
  const goesBackToReview = !!campaign && isLive && changesCriticalFields(campaign, edit);
  const losesBadge =
    !!campaign && campaign.dedicatedAccountVerified && changesAccount(campaign, edit);

  const pickImage = async (onPick: (uri: string) => void, aspect: [number, number]) => {
    const result = await ImagePicker.launchImageLibraryAsync({
      // El recorte con proporción solo existe en Android (iOS siempre recorta
      // cuadrado); en el resto, el encuadre lo da el aspectRatio al mostrarla.
      allowsEditing: Platform.OS === 'android',
      aspect,
      mediaTypes: ['images'],
      quality: 0.7,
    });
    if (!result.canceled) {
      onPick(result.assets[0].uri);
      setConfirming(false);
    }
  };

  const save = async () => {
    if (!campaign || !isValid || saving) return;
    setSaving(true);
    setError(null);
    try {
      await updateMyCampaign(campaign, edit);
      nav.goBack();
    } catch (e) {
      console.warn('No se pudo guardar la campaña:', e);
      setError('No pudimos guardar los cambios. Revisá tu conexión e intentá de nuevo.');
      setSaving(false);
    }
  };

  // Si el cambio tiene consecuencias (vuelve a revisión o pierde el badge),
  // primero se muestra el aviso y se guarda recién al confirmar.
  const onSubmit = () => {
    if (!isValid || saving) return;
    if ((goesBackToReview || losesBadge) && !confirming) {
      setConfirming(true);
      return;
    }
    save();
  };

  // Cualquier cambio en el formulario después de ver el aviso lo vuelve a pedir.
  const onEdit = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setConfirming(false);
  };

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
      <Pressable onPress={() => nav.goBack()} style={styles.back}>
        <Ionicons name="arrow-back" size={22} color={colors.text} />
      </Pressable>
      <Text style={styles.headerTitle} numberOfLines={1}>Editar campaña</Text>
    </View>
  );

  if (loading) {
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

  if (loadError) {
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
          <Text style={styles.stateText}>Esta campaña no es tuya, así que no podés editarla.</Text>
        </View>
      </View>
    );
  }

  const ctaLabel = confirming
    ? goesBackToReview
      ? 'Sí, guardar y enviar a revisión'
      : 'Sí, guardar cambios'
    : resubmits
      ? 'Guardar y reenviar a revisión'
      : 'Guardar cambios';

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
          {campaign.status === 'rechazada' && campaign.rejectionReason && (
            <View style={styles.rejectedBox}>
              <Text style={styles.rejectedLabel}>Lo que pidió corregir el equipo</Text>
              <Text style={styles.rejectedText}>{campaign.rejectionReason}</Text>
            </View>
          )}

          {isLive && (
            <View style={styles.infoBox}>
              <Ionicons name="information-circle-outline" size={18} color={colors.primary} />
              <Text style={styles.infoText}>
                El título, la historia, la categoría y la portada se actualizan al instante. Si
                cambiás la cuenta, el QR, la meta o el beneficiario, la campaña vuelve a revisión y
                deja de verse hasta que el equipo la apruebe.
              </Text>
            </View>
          )}

          {/* Sección: la historia */}
          <Text style={styles.sectionTitle}>La historia</Text>

          <Text style={styles.label}>Título</Text>
          <TextInput
            value={title}
            onChangeText={onEdit(setTitle)}
            placeholderTextColor={colors.textMuted}
            style={styles.input}
          />

          <Text style={styles.label}>Historia</Text>
          <TextInput
            value={story}
            onChangeText={onEdit(setStory)}
            multiline
            placeholderTextColor={colors.textMuted}
            style={[styles.input, styles.inputMultiline]}
          />

          <Text style={styles.label}>Categoría</Text>
          <View style={styles.chips}>
            {CATEGORY_KEYS.map((key) => {
              const cat = categories[key];
              const active = category === key;
              return (
                <Pressable
                  key={key}
                  onPress={() => onEdit(setCategory)(key)}
                  style={[
                    styles.chip,
                    { borderColor: cat.color },
                    active && { backgroundColor: cat.color },
                  ]}
                >
                  <Text style={[styles.chipText, { color: active ? colors.white : cat.color }]}>
                    {cat.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.label}>Nombre del beneficiario (opcional)</Text>
          <TextInput
            value={beneficiaryName}
            onChangeText={onEdit(setBeneficiaryName)}
            placeholder="A quién se ayuda, si no sos vos"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
          />

          <Text style={styles.label}>Meta en Bs</Text>
          <View style={styles.amountField}>
            <Text style={styles.amountPrefix}>Bs</Text>
            <TextInput
              value={goal}
              onChangeText={onEdit(setGoal)}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor={colors.textMuted}
              style={styles.amountInput}
            />
          </View>

          <Text style={styles.label}>Foto de portada</Text>
          <Image source={{ uri: newCoverUri ?? campaign.coverImageUrl }} style={styles.coverPreview} />
          <Pressable
            onPress={() => pickImage(setNewCoverUri, media.coverPickerAspect)}
            style={({ pressed }) => [styles.replace, pressed && { opacity: 0.9 }]}
          >
            <Ionicons name="image-outline" size={16} color={colors.primary} />
            <Text style={styles.replaceText}>Cambiar portada</Text>
          </Pressable>

          {/* Sección: cómo recibís los aportes */}
          <Text style={styles.sectionTitle}>Cómo recibís los aportes</Text>
          <Text style={styles.sectionHint}>
            La gente aporta directo a tu cuenta escaneando este QR. La app no recibe ni reparte
            dinero.
          </Text>

          <Text style={styles.label}>Foto del QR Simple</Text>
          <View style={styles.qrWrap}>
            <Image source={{ uri: newQrUri ?? campaign.qrImageUrl }} style={styles.qrPreview} resizeMode="contain" />
            <Pressable
              onPress={() => pickImage(setNewQrUri, media.qrPickerAspect)}
              style={({ pressed }) => [styles.replace, pressed && { opacity: 0.9 }]}
            >
              <Ionicons name="qr-code-outline" size={16} color={colors.primary} />
              <Text style={styles.replaceText}>Cambiar QR</Text>
            </Pressable>
          </View>

          <Text style={styles.label}>Banco (opcional)</Text>
          <TextInput
            value={bankName}
            onChangeText={onEdit(setBankName)}
            placeholder="Ej: BNB, Banco Unión, BMSC"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
          />

          <Text style={styles.label}>Titular de la cuenta (opcional)</Text>
          <TextInput
            value={accountHolder}
            onChangeText={onEdit(setAccountHolder)}
            placeholder="Nombre que figura en la cuenta"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
          />

          <View style={styles.toggleRow}>
            <View style={styles.toggleTexts}>
              <Text style={styles.toggleTitle}>Es una cuenta exclusiva para esta campaña</Text>
              <Text style={styles.toggleHint}>
                Una cuenta dedicada da más confianza: su saldo refleja el total real y habilita el
                badge de cuenta verificada tras la revisión del equipo.
              </Text>
            </View>
            <Switch
              value={dedicated}
              onValueChange={onEdit(setDedicated)}
              trackColor={{ false: colors.track, true: colors.primary }}
              thumbColor={colors.white}
            />
          </View>

          {!isValid && (
            <Text style={styles.missing}>Antes de guardar, completá: {missing.join(', ')}.</Text>
          )}

          {confirming && (
            <View style={styles.warnBox}>
              <Ionicons name="alert-circle-outline" size={20} color={colors.accent} />
              <View style={{ flex: 1 }}>
                {goesBackToReview && (
                  <Text style={styles.warnText}>
                    Cambiaste datos de la cuenta, la meta o el beneficiario. Tu campaña va a volver
                    a revisión y no se va a ver en el feed hasta que el equipo la apruebe de nuevo.
                  </Text>
                )}
                {losesBadge && (
                  <Text style={[styles.warnText, goesBackToReview && { marginTop: space.sm }]}>
                    Como cambiaste la cuenta, se quita el badge de cuenta verificada hasta que el
                    equipo la revise otra vez.
                  </Text>
                )}
              </View>
            </View>
          )}

          {error && <Text style={styles.errorText}>{error}</Text>}

          <Pressable
            onPress={onSubmit}
            disabled={!isValid || saving}
            style={({ pressed }) => [
              styles.cta,
              confirming && styles.ctaWarn,
              (!isValid || saving) && styles.ctaDisabled,
              pressed && isValid && !saving && { opacity: 0.9 },
            ]}
          >
            {saving ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.ctaText}>{ctaLabel}</Text>
            )}
          </Pressable>
          {confirming && (
            <Pressable onPress={() => setConfirming(false)} disabled={saving} style={styles.cancel}>
              <Text style={styles.cancelText}>Seguir editando</Text>
            </Pressable>
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
  rejectedBox: {
    padding: space.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.danger,
    backgroundColor: colors.surface,
  },
  rejectedLabel: { fontSize: 13, fontWeight: '600', color: colors.danger },
  rejectedText: { marginTop: space.xs, fontSize: 14, color: colors.text, lineHeight: 20 },
  infoBox: {
    flexDirection: 'row',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  infoText: { flex: 1, fontSize: 13, color: colors.textMuted, lineHeight: 19 },
  sectionTitle: { ...type.h2, marginTop: space.xxl, marginBottom: space.xs },
  sectionHint: { fontSize: 13, color: colors.textMuted, lineHeight: 19, marginBottom: space.xs },
  label: {
    marginTop: space.xl,
    marginBottom: space.sm,
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
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
  inputMultiline: { minHeight: 120, textAlignVertical: 'top' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: {
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    backgroundColor: colors.surface,
  },
  chipText: { fontSize: 14, fontWeight: '600' },
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
  coverPreview: {
    width: '100%',
    aspectRatio: media.coverAspect,
    borderRadius: radius.lg,
    backgroundColor: colors.track,
  },
  qrWrap: { alignItems: 'center' },
  qrPreview: {
    width: 200,
    height: 200,
    borderRadius: radius.md,
    backgroundColor: colors.white,
  },
  replace: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    alignSelf: 'center',
    marginTop: space.md,
    paddingVertical: space.sm,
    paddingHorizontal: space.lg,
  },
  replaceText: { fontSize: 14, fontWeight: '600', color: colors.primary },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    marginTop: space.xl,
    padding: space.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  toggleTexts: { flex: 1 },
  toggleTitle: { fontSize: 14, fontWeight: '600', color: colors.text },
  toggleHint: { marginTop: space.xs, fontSize: 12, color: colors.textMuted, lineHeight: 18 },
  missing: { marginTop: space.xl, fontSize: 13, color: colors.danger, lineHeight: 19 },
  warnBox: {
    flexDirection: 'row',
    gap: space.sm,
    marginTop: space.xl,
    padding: space.lg,
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
  },
  warnText: { fontSize: 14, color: colors.text, lineHeight: 20 },
  errorText: { marginTop: space.xl, fontSize: 14, color: colors.danger, lineHeight: 20 },
  cta: {
    marginTop: space.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingVertical: space.lg,
    borderRadius: radius.md,
    minHeight: 52,
  },
  ctaWarn: { backgroundColor: colors.accent },
  ctaDisabled: { backgroundColor: colors.textMuted, opacity: 0.5 },
  ctaText: { color: colors.white, fontSize: 16, fontWeight: '600' },
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
