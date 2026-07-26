import React, { useState } from 'react';
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
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { RootStackParamList } from '../../App';
import { useAuth } from '../lib/auth';
import { uploadImage, getPublicUrl, shortId } from '../lib/storage';
import { getSupabase } from '../lib/supabase';
import { colors, radius, space, type, categories, CategoryKey } from '../theme';

type Nav = NativeStackNavigationProp<RootStackParamList, 'CrearCampana'>;

const CATEGORY_KEYS: CategoryKey[] = [
  'salud', 'animales', 'desastre', 'educacion', 'funeral', 'alimentacion', 'otro',
];

// Límite por documento de verificación. El bucket verification-docs tiene el
// mismo tope del lado de Supabase (migración 011), así que esto es solo para
// avisar temprano con un mensaje claro en vez de fallar al subir.
const MAX_DOC_MB = 5;
const MAX_DOC_BYTES = MAX_DOC_MB * 1024 * 1024;

type DocFile = {
  uri: string;
  name: string;
  mimeType: string;
  size?: number;
};

const isPdf = (doc: DocFile) =>
  doc.mimeType === 'application/pdf' || doc.name.toLowerCase().endsWith('.pdf');

// Slug a partir del título: minúsculas, sin tildes, palabras con guión, más un
// sufijo corto aleatorio para garantizar unicidad (la columna slug es unique).
function makeSlug(title: string): string {
  const base = title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quitar marcas diacríticas (tildes, ñ→n+~)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
  return `${base || 'campana'}-${shortId().slice(0, 6)}`;
}

export default function CrearCampanaScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<Nav>();
  const { user } = useAuth();

  const [title, setTitle] = useState('');
  const [story, setStory] = useState('');
  const [category, setCategory] = useState<CategoryKey | null>(null);
  const [beneficiaryName, setBeneficiaryName] = useState('');
  const [goal, setGoal] = useState('');
  const [coverUri, setCoverUri] = useState<string | null>(null);
  const [qrUri, setQrUri] = useState<string | null>(null);
  const [bankName, setBankName] = useState('');
  const [accountHolder, setAccountHolder] = useState('');
  const [dedicated, setDedicated] = useState(false);
  const [documents, setDocuments] = useState<DocFile[]>([]);
  const [docError, setDocError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const goalAmount = Number(goal.replace(',', '.'));
  const goalValid = goal.trim() !== '' && !Number.isNaN(goalAmount) && goalAmount > 0;

  // Campos obligatorios faltantes, para marcarlos con claridad antes de enviar.
  const missing: string[] = [];
  if (!title.trim()) missing.push('título');
  if (!story.trim()) missing.push('historia');
  if (!category) missing.push('categoría');
  if (!goalValid) missing.push('meta válida en Bs');
  if (!coverUri) missing.push('foto de portada');
  if (!qrUri) missing.push('foto del QR');
  const isValid = missing.length === 0;

  const pickImage = async (onPick: (uri: string) => void) => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
    });
    if (!result.canceled) {
      onPick(result.assets[0].uri);
    }
  };

  const addDocuments = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['image/*', 'application/pdf'],
      multiple: true,
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;

    const accepted: DocFile[] = [];
    const tooBig: string[] = [];
    for (const a of result.assets) {
      const doc: DocFile = {
        uri: a.uri,
        name: a.name || 'Documento',
        mimeType: a.mimeType ?? '',
        size: a.size ?? undefined,
      };
      if (doc.size != null && doc.size > MAX_DOC_BYTES) {
        tooBig.push(doc.name);
      } else {
        accepted.push(doc);
      }
    }
    setDocuments((prev) => [...prev, ...accepted]);
    setDocError(
      tooBig.length > 0
        ? `Estos archivos superan los ${MAX_DOC_MB} MB y no se adjuntaron: ${tooBig.join(', ')}.`
        : null
    );
  };

  const removeDocument = (index: number) =>
    setDocuments((prev) => prev.filter((_, i) => i !== index));

  const onSubmit = async () => {
    if (!isValid || !category || !coverUri || !qrUri || submitting) return;
    if (!user) {
      setError('Tu sesión expiró. Volvé a iniciar sesión e intentá de nuevo.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const supabase = getSupabase();

      // 1) Subir portada y QR al bucket público; guardamos sus URLs públicas.
      const slug = makeSlug(title);
      const coverPath = await uploadImage({
        bucket: 'campaign-images',
        path: `${slug}/cover-${shortId()}.jpg`,
        uri: coverUri,
      });
      const qrPath = await uploadImage({
        bucket: 'campaign-images',
        path: `${slug}/qr-${shortId()}.jpg`,
        uri: qrUri,
      });

      // 2) Crear la campaña (mapeo camelCase -> snake_case). REGLA: nace
      //    'en_revision' con current_amount 0; no es pública ni suma a nada
      //    hasta que un moderador la apruebe.
      const { data: created, error: insertError } = await supabase
        .from('campaigns')
        .insert({
          organizer_id: user.id,
          title: title.trim(),
          slug,
          story: story.trim(),
          category,
          beneficiary_name: beneficiaryName.trim() || null,
          goal_amount: goalAmount,
          currency: 'BOB',
          cover_image_url: getPublicUrl('campaign-images', coverPath),
          qr_image_url: getPublicUrl('campaign-images', qrPath),
          qr_bank_name: bankName.trim() || null,
          account_holder_name: accountHolder.trim() || null,
          uses_dedicated_account: dedicated,
          dedicated_account_verified: false,
          current_amount: 0,
          status: 'en_revision',
          location: 'Santa Cruz de la Sierra',
        })
        .select('id')
        .single();

      if (insertError) throw new Error(insertError.message);
      const campaignId = created.id as string;

      // 3) Subir cada documento de verificación al bucket privado y registrar
      //    la fila (path, no URL pública: son privados, sólo los ve el equipo).
      for (const doc of documents) {
        const pdf = isPdf(doc);
        const docPath = await uploadImage({
          bucket: 'verification-docs',
          path: `${campaignId}/${shortId()}.${pdf ? 'pdf' : 'jpg'}`,
          uri: doc.uri,
          contentType: pdf ? 'application/pdf' : doc.mimeType || 'image/jpeg',
        });
        const { error: docError } = await supabase
          .from('verification_documents')
          .insert({ campaign_id: campaignId, file_url: docPath, doc_type: 'otro' });
        if (docError) throw new Error(docError.message);
      }

      setSent(true);
    } catch (e) {
      console.warn('No se pudo crear la campaña:', e);
      setError('No pudimos enviar tu campaña. Revisá tu conexión e intentá de nuevo.');
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <View style={[styles.screen, styles.successScreen, { paddingTop: insets.top }]}>
        <View style={styles.successIcon}>
          <Ionicons name="shield-checkmark" size={40} color={colors.white} />
        </View>
        <Text style={styles.successTitle}>Tu campaña quedó enviada para revisión</Text>
        <Text style={styles.successText}>
          El equipo va a revisar la información y los documentos. Cuando la aprueben, tu campaña
          se va a mostrar en el feed. Hasta entonces no es visible para el público.
        </Text>
        <Pressable
          onPress={() => nav.navigate('Feed')}
          style={({ pressed }) => [styles.successCta, pressed && { opacity: 0.9 }]}
        >
          <Text style={styles.successCtaText}>Volver al inicio</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
        <Pressable onPress={() => nav.goBack()} style={styles.back}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>Crear campaña</Text>
      </View>

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
          <Text style={styles.intro}>
            Contanos el caso con claridad. Tu campaña pasa por una revisión del equipo antes de
            mostrarse, para cuidar la confianza de todos.
          </Text>

          {/* Sección: la historia */}
          <Text style={styles.sectionTitle}>La historia</Text>

          <Text style={styles.label}>Título</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Ej: una mano para la cirugía de Doña Marta"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
          />

          <Text style={styles.label}>Historia</Text>
          <TextInput
            value={story}
            onChangeText={setStory}
            placeholder="Contá quién necesita ayuda, para qué es y por qué urge"
            placeholderTextColor={colors.textMuted}
            multiline
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
                  onPress={() => setCategory(key)}
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
            onChangeText={setBeneficiaryName}
            placeholder="A quién se ayuda, si no sos vos"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
          />

          <Text style={styles.label}>Meta en Bs</Text>
          <View style={styles.amountField}>
            <Text style={styles.amountPrefix}>Bs</Text>
            <TextInput
              value={goal}
              onChangeText={setGoal}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor={colors.textMuted}
              style={styles.amountInput}
            />
          </View>

          <Text style={styles.label}>Foto de portada</Text>
          {coverUri ? (
            <View>
              <Image source={{ uri: coverUri }} style={styles.coverPreview} />
              <Pressable
                onPress={() => pickImage(setCoverUri)}
                style={({ pressed }) => [styles.replace, pressed && { opacity: 0.9 }]}
              >
                <Ionicons name="image-outline" size={16} color={colors.primary} />
                <Text style={styles.replaceText}>Cambiar portada</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={() => pickImage(setCoverUri)}
              style={({ pressed }) => [styles.picker, pressed && { opacity: 0.9 }]}
            >
              <Ionicons name="image-outline" size={26} color={colors.primary} />
              <Text style={styles.pickerText}>Subir foto de portada</Text>
            </Pressable>
          )}

          {/* Sección: cómo recibís los aportes */}
          <Text style={styles.sectionTitle}>Cómo recibís los aportes</Text>
          <Text style={styles.sectionHint}>
            La gente aporta directo a tu cuenta escaneando este QR. La app no recibe ni reparte
            dinero.
          </Text>

          <Text style={styles.label}>Foto del QR Simple</Text>
          {qrUri ? (
            <View style={styles.qrWrap}>
              <Image source={{ uri: qrUri }} style={styles.qrPreview} />
              <Pressable
                onPress={() => pickImage(setQrUri)}
                style={({ pressed }) => [styles.replace, pressed && { opacity: 0.9 }]}
              >
                <Ionicons name="image-outline" size={16} color={colors.primary} />
                <Text style={styles.replaceText}>Cambiar QR</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={() => pickImage(setQrUri)}
              style={({ pressed }) => [styles.picker, pressed && { opacity: 0.9 }]}
            >
              <Ionicons name="qr-code-outline" size={26} color={colors.primary} />
              <Text style={styles.pickerText}>Subir foto del QR</Text>
            </Pressable>
          )}

          <Text style={styles.label}>Banco (opcional)</Text>
          <TextInput
            value={bankName}
            onChangeText={setBankName}
            placeholder="Ej: BNB, Banco Unión, BMSC"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
          />

          <Text style={styles.label}>Titular de la cuenta (opcional)</Text>
          <TextInput
            value={accountHolder}
            onChangeText={setAccountHolder}
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
              onValueChange={setDedicated}
              trackColor={{ false: colors.track, true: colors.primary }}
              thumbColor={colors.white}
            />
          </View>

          {/* Sección: verificación */}
          <Text style={styles.sectionTitle}>Verificación</Text>
          <Text style={styles.sectionHint}>
            Adjuntá fotos o PDFs que respalden el caso (informe médico, presupuesto, carnet,
            etc.), de hasta {MAX_DOC_MB} MB cada uno. Son privados: solo los ve el equipo de
            revisión, nunca el público.
          </Text>

          {documents.map((doc, i) => (
            <View key={`${doc.uri}-${i}`} style={styles.docRow}>
              {isPdf(doc) ? (
                <View style={[styles.docThumb, styles.docThumbPdf]}>
                  <Ionicons name="document-text" size={22} color={colors.primary} />
                </View>
              ) : (
                <Image source={{ uri: doc.uri }} style={styles.docThumb} />
              )}
              <Text style={styles.docName} numberOfLines={1}>{doc.name}</Text>
              <Pressable onPress={() => removeDocument(i)} hitSlop={8} style={styles.docRemove}>
                <Ionicons name="close" size={18} color={colors.danger} />
              </Pressable>
            </View>
          ))}

          <Pressable
            onPress={addDocuments}
            style={({ pressed }) => [styles.docAdd, pressed && { opacity: 0.9 }]}
          >
            <Ionicons name="document-attach-outline" size={20} color={colors.primary} />
            <Text style={styles.docAddText}>Adjuntar documento</Text>
          </Pressable>

          {docError && <Text style={styles.docError}>{docError}</Text>}

          {!isValid && (
            <Text style={styles.missing}>
              Antes de enviar, completá: {missing.join(', ')}.
            </Text>
          )}

          {error && <Text style={styles.errorText}>{error}</Text>}

          <Pressable
            onPress={onSubmit}
            disabled={!isValid || submitting}
            style={({ pressed }) => [
              styles.cta,
              (!isValid || submitting) && styles.ctaDisabled,
              pressed && isValid && !submitting && { opacity: 0.9 },
            ]}
          >
            {submitting ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <>
                <Ionicons name="send-outline" size={18} color={colors.white} />
                <Text style={styles.ctaText}>Enviar para revisión</Text>
              </>
            )}
          </Pressable>
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
  intro: { fontSize: 14, color: colors.textMuted, lineHeight: 20 },
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
  picker: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: space.xxl,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    gap: space.xs,
  },
  pickerText: { fontSize: 15, fontWeight: '600', color: colors.primary },
  coverPreview: {
    width: '100%',
    height: 200,
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
  docRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginTop: space.sm,
    padding: space.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  docThumb: { width: 44, height: 44, borderRadius: radius.sm, backgroundColor: colors.track },
  docThumbPdf: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  docName: { flex: 1, fontSize: 14, color: colors.text },
  docError: {
    marginTop: space.sm,
    fontSize: 13,
    color: colors.danger,
    lineHeight: 19,
  },
  docRemove: { padding: space.xs },
  docAdd: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    marginTop: space.md,
    paddingVertical: space.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  docAddText: { fontSize: 15, fontWeight: '600', color: colors.primary },
  missing: {
    marginTop: space.xl,
    fontSize: 13,
    color: colors.danger,
    lineHeight: 19,
  },
  errorText: {
    marginTop: space.xl,
    fontSize: 14,
    color: colors.danger,
    lineHeight: 20,
  },
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
  ctaDisabled: { backgroundColor: colors.textMuted, opacity: 0.5 },
  ctaText: { color: colors.white, fontSize: 16, fontWeight: '600' },
  successScreen: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.xl },
  successIcon: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.xl,
  },
  successTitle: { ...type.h1, textAlign: 'center', lineHeight: 29 },
  successText: {
    marginTop: space.md,
    fontSize: 15,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
  },
  successCta: {
    marginTop: space.xxl,
    backgroundColor: colors.primary,
    paddingVertical: space.lg,
    paddingHorizontal: space.xxl,
    borderRadius: radius.md,
  },
  successCtaText: { color: colors.white, fontSize: 16, fontWeight: '600' },
});
