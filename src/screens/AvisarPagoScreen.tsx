import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Image,
  Pressable,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { RootStackParamList } from '../../App';
import { useAuth } from '../lib/auth';
import { uploadImage, shortId } from '../lib/storage';
import { getSupabase } from '../lib/supabase';
import { colors, radius, space, type, media } from '../theme';

type AvisarPagoRoute = RouteProp<RootStackParamList, 'AvisarPago'>;

export default function AvisarPagoScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation();
  const { campaignId, campaignTitle } = useRoute<AvisarPagoRoute>().params;
  const { user, profile } = useAuth();

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const pickPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
    });
    if (!result.canceled) {
      setPhotoUri(result.assets[0].uri);
    }
  };

  const onSubmit = async () => {
    if (!photoUri || submitting) return;
    if (!user) {
      setError('Tu sesión expiró. Volvé a iniciar sesión e intentá de nuevo.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      // 1) Subir el comprobante al bucket privado. Guardamos el PATH (no una URL
      //    pública): la foto puede tener datos sensibles y el bucket es privado.
      const receiptPath = await uploadImage({
        bucket: 'payment-receipts',
        path: `${campaignId}/${shortId()}.jpg`,
        uri: photoUri,
        contentType: 'image/jpeg',
      });

      const parsedAmount = amount.trim() ? Number(amount.replace(',', '.')) : null;
      const senderName = name.trim() || profile?.fullName || null;

      // 2) Insertar el aviso (mapeo camelCase -> snake_case). REGLA: esto NO
      //    toca current_amount; nace 'pendiente' hasta que el organizador
      //    concilie y confirme.
      const { error: insertError } = await getSupabase()
        .from('payment_notifications')
        .insert({
          campaign_id: campaignId,
          sender_id: user.id,
          sender_name: senderName,
          amount: parsedAmount != null && !Number.isNaN(parsedAmount) ? parsedAmount : null,
          receipt_url: receiptPath,
          message: message.trim() || null,
          status: 'pendiente',
        });

      if (insertError) throw new Error(insertError.message);

      setSent(true);
    } catch (e) {
      console.warn('No se pudo enviar el aviso de pago:', e);
      setError('No pudimos enviar tu aviso. Revisá tu conexión e intentá de nuevo.');
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <View style={[styles.screen, styles.successScreen, { paddingTop: insets.top }]}>
        <View style={styles.successIcon}>
          <Ionicons name="checkmark" size={40} color={colors.white} />
        </View>
        <Text style={styles.successTitle}>¡Gracias! Tu aviso quedó pendiente de confirmación</Text>
        <Text style={styles.successText}>
          El organizador va a revisar tu comprobante. Tu aviso no cambia el monto recaudado:
          es prueba social y ayuda a la conciliación.
        </Text>
        <Pressable
          onPress={() => nav.goBack()}
          style={({ pressed }) => [styles.successCta, pressed && { opacity: 0.9 }]}
        >
          <Text style={styles.successCtaText}>Volver a la campaña</Text>
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
        <Text style={styles.headerTitle} numberOfLines={1}>Avisar pago</Text>
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
          <Text style={styles.context} numberOfLines={2}>Aporte a “{campaignTitle}”</Text>
          <Text style={styles.intro}>
            ¿Ya aportaste por el QR? Subí la foto del comprobante para que el organizador lo
            confirme. Tu aviso no modifica la barra de progreso.
          </Text>

          <Text style={styles.label}>Foto del comprobante</Text>
          {photoUri ? (
            <View>
              <Image source={{ uri: photoUri }} style={styles.preview} resizeMode="contain" />
              <Pressable
                onPress={pickPhoto}
                style={({ pressed }) => [styles.replace, pressed && { opacity: 0.9 }]}
              >
                <Ionicons name="image-outline" size={16} color={colors.primary} />
                <Text style={styles.replaceText}>Cambiar foto</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={pickPhoto}
              style={({ pressed }) => [styles.picker, pressed && { opacity: 0.9 }]}
            >
              <Ionicons name="camera-outline" size={26} color={colors.primary} />
              <Text style={styles.pickerText}>Subir foto del comprobante</Text>
              <Text style={styles.pickerHint}>Obligatoria para enviar el aviso</Text>
            </Pressable>
          )}

          <Text style={styles.label}>Monto en Bs (opcional)</Text>
          <View style={styles.amountField}>
            <Text style={styles.amountPrefix}>Bs</Text>
            <TextInput
              value={amount}
              onChangeText={setAmount}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor={colors.textMuted}
              style={styles.amountInput}
            />
          </View>

          <Text style={styles.label}>Nombre a mostrar (opcional)</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Anónimo"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
          />

          <Text style={styles.label}>Mensaje de apoyo (opcional)</Text>
          <TextInput
            value={message}
            onChangeText={setMessage}
            placeholder="Dejá unas palabras de aliento"
            placeholderTextColor={colors.textMuted}
            multiline
            style={[styles.input, styles.inputMultiline]}
          />

          {error && <Text style={styles.error}>{error}</Text>}

          <Pressable
            onPress={onSubmit}
            disabled={!photoUri || submitting}
            style={({ pressed }) => [
              styles.cta,
              (!photoUri || submitting) && styles.ctaDisabled,
              pressed && photoUri && !submitting && { opacity: 0.9 },
            ]}
          >
            {submitting ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <>
                <Ionicons name="send-outline" size={18} color={colors.white} />
                <Text style={styles.ctaText}>Enviar aviso de pago</Text>
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
  context: { fontSize: 14, fontWeight: '600', color: colors.primary },
  intro: { marginTop: space.xs, fontSize: 14, color: colors.textMuted, lineHeight: 20 },
  label: {
    marginTop: space.xl,
    marginBottom: space.sm,
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
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
  pickerHint: { fontSize: 12, color: colors.textMuted },
  preview: {
    width: '100%',
    aspectRatio: media.photoAspect,
    borderRadius: radius.lg,
    backgroundColor: colors.track,
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
  amountInput: {
    flex: 1,
    paddingVertical: space.md,
    fontSize: 16,
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
  inputMultiline: { minHeight: 96, textAlignVertical: 'top' },
  error: {
    marginTop: space.xl,
    fontSize: 14,
    color: colors.danger,
    lineHeight: 20,
  },
  cta: {
    marginTop: space.xxl,
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
