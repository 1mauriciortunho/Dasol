import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../../App';
import { useAuth } from '../lib/auth';
import { colors, radius, space, type } from '../theme';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Auth'>;
type AuthRoute = RouteProp<RootStackParamList, 'Auth'>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Traduce los errores comunes de Supabase a mensajes humanos en español.
function humanError(e: unknown): string {
  const msg = (e as { message?: string })?.message?.toLowerCase() ?? '';
  if (msg.includes('invalid login credentials')) return 'Email o contraseña incorrectos.';
  if (msg.includes('already registered') || msg.includes('already been registered'))
    return 'Ese email ya tiene una cuenta. Probá iniciar sesión.';
  if (msg.includes('password should be at least'))
    return 'La contraseña es muy corta: usá al menos 6 caracteres.';
  if (msg.includes('unable to validate email') || msg.includes('invalid email'))
    return 'Revisá el email, no parece válido.';
  if (msg.includes('email not confirmed'))
    return 'Todavía no confirmaste tu email. Revisá tu correo y volvé a entrar.';
  if (msg.includes('network') || msg.includes('fetch'))
    return 'Sin conexión. Revisá tu internet e intentá de nuevo.';
  return 'No se pudo completar. Intentá de nuevo en un momento.';
}

export default function AuthScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<Nav>();
  // El redirect es un objeto y no sobrevive a una recarga de página en
  // /entrar (la URL lo degrada a string); en ese caso se ignora.
  const rawRedirect = useRoute<AuthRoute>().params?.redirect;
  const redirect = rawRedirect && typeof rawRedirect === 'object' ? rawRedirect : undefined;
  const { signIn, signUp } = useAuth();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const isRegister = mode === 'register';
  const emailValid = EMAIL_RE.test(email.trim());

  const canSubmit = isRegister
    ? !!fullName.trim() && !!phone.trim() && emailValid && password.length >= 6
    : emailValid && password.length > 0;

  const onSuccess = () => {
    if (redirect) {
      // El destino es dinámico (viene por params), así que escapamos el tipado
      // estricto del navigator con un cast acotado.
      (nav.replace as (screen: string, params?: object) => void)(
        redirect.screen,
        redirect.params
      );
    } else if (nav.canGoBack()) {
      nav.goBack();
    } else {
      nav.replace('Feed');
    }
  };

  const onSubmit = async () => {
    setError(null);
    setInfo(null);
    if (!canSubmit) {
      setError(
        isRegister
          ? 'Completá tu nombre, teléfono, un email válido y una contraseña de 6+ caracteres.'
          : 'Ingresá un email válido y tu contraseña.'
      );
      return;
    }
    setSubmitting(true);
    try {
      if (isRegister) {
        const { needsConfirmation } = await signUp({ email, password, fullName, phone });
        if (needsConfirmation) {
          setInfo('Te enviamos un correo para confirmar tu cuenta. Confirmalo y después iniciá sesión.');
          setMode('login');
          setPassword('');
          return;
        }
      } else {
        await signIn(email, password);
      }
      onSuccess();
    } catch (e) {
      setError(humanError(e));
    } finally {
      setSubmitting(false);
    }
  };

  const switchMode = () => {
    setMode(isRegister ? 'login' : 'register');
    setError(null);
    setInfo(null);
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
        <Pressable onPress={() => nav.goBack()} style={styles.back}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {isRegister ? 'Crear cuenta' : 'Iniciar sesión'}
        </Text>
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
            {isRegister
              ? 'Creá tu cuenta para crear campañas o avisar pagos. Ver el feed no necesita cuenta.'
              : 'Entrá para crear una campaña o avisar un pago. Mirar las campañas es libre.'}
          </Text>

          {isRegister && (
            <>
              <Text style={styles.label}>Nombre completo</Text>
              <TextInput
                value={fullName}
                onChangeText={setFullName}
                placeholder="Tu nombre y apellido"
                placeholderTextColor={colors.textMuted}
                style={styles.input}
              />

              <Text style={styles.label}>Teléfono</Text>
              <TextInput
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                placeholder="Ej: +591 70000000"
                placeholderTextColor={colors.textMuted}
                style={styles.input}
              />
            </>
          )}

          <Text style={styles.label}>Email</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="vos@email.com"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
          />

          <Text style={styles.label}>Contraseña</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder={isRegister ? 'Al menos 6 caracteres' : 'Tu contraseña'}
            placeholderTextColor={colors.textMuted}
            style={styles.input}
          />

          {info && <Text style={styles.info}>{info}</Text>}
          {error && <Text style={styles.error}>{error}</Text>}

          <Pressable
            onPress={onSubmit}
            disabled={submitting}
            style={({ pressed }) => [
              styles.cta,
              submitting && styles.ctaDisabled,
              pressed && !submitting && { opacity: 0.9 },
            ]}
          >
            {submitting ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.ctaText}>{isRegister ? 'Crear cuenta' : 'Iniciar sesión'}</Text>
            )}
          </Pressable>

          <Pressable onPress={switchMode} style={styles.switch} hitSlop={8}>
            <Text style={styles.switchText}>
              {isRegister ? '¿Ya tenés cuenta? ' : '¿No tenés cuenta? '}
              <Text style={styles.switchLink}>
                {isRegister ? 'Iniciá sesión' : 'Registrate'}
              </Text>
            </Text>
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
  info: {
    marginTop: space.xl,
    fontSize: 14,
    color: colors.primary,
    lineHeight: 20,
  },
  error: {
    marginTop: space.xl,
    fontSize: 14,
    color: colors.danger,
    lineHeight: 20,
  },
  cta: {
    marginTop: space.xxl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingVertical: space.lg,
    borderRadius: radius.md,
    minHeight: 52,
  },
  ctaDisabled: { opacity: 0.6 },
  ctaText: { color: colors.white, fontSize: 16, fontWeight: '600' },
  switch: { marginTop: space.xl, alignItems: 'center', paddingVertical: space.sm },
  switchText: { fontSize: 14, color: colors.textMuted },
  switchLink: { color: colors.primary, fontWeight: '600' },
});
