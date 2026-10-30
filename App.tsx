import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, Platform, StyleSheet } from 'react-native';
import {
  NavigationContainer,
  createNavigationContainerRef,
  getStateFromPath as defaultGetStateFromPath,
  LinkingOptions,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { AuthProvider } from './src/lib/auth';
import { hasSeenOnboarding } from './src/lib/onboarding';
import { fetchCampaignById, primeCampaign } from './src/lib/campaigns';
import { SITE_URL } from './src/lib/config';
import FeedScreen from './src/screens/FeedScreen';
import CampaignDetailScreen from './src/screens/CampaignDetailScreen';
import AvisarPagoScreen from './src/screens/AvisarPagoScreen';
import CrearCampanaScreen from './src/screens/CrearCampanaScreen';
import AuthScreen from './src/screens/AuthScreen';
import ModerationScreen from './src/screens/ModerationScreen';
import ModerationDetailScreen from './src/screens/ModerationDetailScreen';
import MisCampanasScreen from './src/screens/MisCampanasScreen';
import CampanaManageScreen from './src/screens/CampanaManageScreen';
import EditarCampanaScreen from './src/screens/EditarCampanaScreen';
import ReportsScreen from './src/screens/ReportsScreen';
import SiguiendoScreen from './src/screens/SiguiendoScreen';
import PerfilScreen from './src/screens/PerfilScreen';
import OnboardingScreen from './src/screens/OnboardingScreen';
import { PendingCampaign } from './src/types';
import { colors, layout } from './src/theme';

export type RootStackParamList = {
  Feed: undefined;
  CampaignDetail: { slug: string };
  AvisarPago: { campaignId: string; campaignTitle: string };
  CrearCampana: undefined;
  Auth: { redirect?: { screen: keyof RootStackParamList; params?: object } } | undefined;
  Moderation: undefined;
  ModerationDetail: { campaign: PendingCampaign };
  MisCampanas: undefined;
  CampanaManage: { campaignId: string };
  EditarCampana: { campaignId: string };
  Reports: undefined;
  Siguiendo: undefined;
  Perfil: undefined;
  Onboarding: { fromProfile?: boolean } | undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

// Ref para navegar desde fuera de un screen (ej. al tocar una notificación).
export const navigationRef = createNavigationContainerRef<RootStackParamList>();

// Toque en una notificación con data.campaignId → abrir el detalle de esa
// campaña. Trae la campaña por id (el detalle igual refresca) y, si no hay nada
// que abrir o falla, no rompe.
async function openFromNotification(response: Notifications.NotificationResponse | null) {
  const campaignId = response?.notification.request.content.data?.campaignId;
  if (!campaignId || typeof campaignId !== 'string') return;
  try {
    const campaign = await fetchCampaignById(campaignId);
    primeCampaign(campaign);
    if (navigationRef.isReady()) navigationRef.navigate('CampaignDetail', { slug: campaign.slug });
  } catch (e) {
    console.warn('No se pudo abrir la campaña de la notificación:', e);
  }
}

export default function App() {
  // Resolvemos la ruta inicial ANTES de montar el navegador, así el Feed no
  // parpadea antes del onboarding la primera vez.
  const [initialRoute, setInitialRoute] = useState<'Feed' | 'Onboarding' | null>(null);

  useEffect(() => {
    hasSeenOnboarding().then((seen) => setInitialRoute(seen ? 'Feed' : 'Onboarding'));
  }, []);

  // Toques en notificaciones: en vivo (app abierta/en segundo plano) y el caso
  // de arranque en frío (la app se abrió tocando una notificación). No aplica en
  // web (estas APIs no existen ahí y tiran error).
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = Notifications.addNotificationResponseReceivedListener(openFromNotification);
    Notifications.getLastNotificationResponseAsync().then(openFromNotification).catch(() => {});
    return () => sub.remove();
  }, []);

  if (!initialRoute) {
    return (
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaProvider>
    );
  }

  // Deep links: `/c/:slug` abre el detalle de una campaña — es la URL que
  // genera el botón compartir y la que circula por WhatsApp. En web, además,
  // mantiene la URL del navegador sincronizada con la pantalla.
  const linking: LinkingOptions<RootStackParamList> = {
    prefixes: [SITE_URL, 'dasol://'],
    config: {
      screens: {
        Feed: '',
        CampaignDetail: 'c/:slug',
        CrearCampana: 'crear',
        Auth: 'entrar',
        Perfil: 'perfil',
        Siguiendo: 'siguiendo',
        MisCampanas: 'mis-campanas',
        CampanaManage: 'mis-campanas/gestion',
        AvisarPago: 'avisar-pago',
        Moderation: 'moderacion',
        ModerationDetail: 'moderacion/detalle',
        Reports: 'moderacion/denuncias',
        Onboarding: 'bienvenida',
      },
    },
    // La raíz respeta la decisión ya resuelta de onboarding (primera visita →
    // carrusel); cualquier otro path se resuelve con el parser por defecto.
    getStateFromPath: (path, options) => {
      const clean = path.replace(/\?.*$/, '').replace(/^\/+|\/+$/g, '');
      if (clean === '') return { routes: [{ name: initialRoute }] };
      // El detalle de moderación recibe un objeto por params que no sobrevive
      // a la URL: al recargar la página ahí, volvemos a la lista.
      if (clean === 'moderacion/detalle') return { routes: [{ name: 'Moderation' }] };
      return defaultGetStateFromPath(path, options);
    },
  };

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <AuthProvider>
        <View style={styles.webFrame}>
          <View style={styles.webContent}>
            <NavigationContainer ref={navigationRef} linking={linking}>
              <Stack.Navigator initialRouteName={initialRoute} screenOptions={{ headerShown: false }}>
                <Stack.Screen name="Onboarding" component={OnboardingScreen} />
                <Stack.Screen name="Feed" component={FeedScreen} />
                <Stack.Screen name="CampaignDetail" component={CampaignDetailScreen} />
                <Stack.Screen name="AvisarPago" component={AvisarPagoScreen} />
                <Stack.Screen name="CrearCampana" component={CrearCampanaScreen} />
                <Stack.Screen name="Auth" component={AuthScreen} />
                <Stack.Screen name="Moderation" component={ModerationScreen} />
                <Stack.Screen name="ModerationDetail" component={ModerationDetailScreen} />
                <Stack.Screen name="MisCampanas" component={MisCampanasScreen} />
                <Stack.Screen name="CampanaManage" component={CampanaManageScreen} />
                <Stack.Screen name="EditarCampana" component={EditarCampanaScreen} />
                <Stack.Screen name="Reports" component={ReportsScreen} />
                <Stack.Screen name="Siguiendo" component={SiguiendoScreen} />
                <Stack.Screen name="Perfil" component={PerfilScreen} />
              </Stack.Navigator>
            </NavigationContainer>
          </View>
        </View>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

// En web, en pantallas anchas, la app se muestra centrada con un ancho máximo
// (como en el celular) en vez de estirarse a todo el ancho del navegador.
const styles = StyleSheet.create({
  webFrame: { flex: 1, backgroundColor: colors.bg, alignItems: 'center' },
  webContent: {
    flex: 1,
    width: '100%',
    maxWidth: Platform.OS === 'web' ? layout.maxContentWidth : undefined,
  },
});
