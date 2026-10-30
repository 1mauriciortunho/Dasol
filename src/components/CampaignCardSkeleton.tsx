import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors, radius, space, media } from '../theme';

// Tarjeta "fantasma" para el feed mientras cargan las campañas: bloques
// neutros con la forma de CampaignCard. Sin animación ni librerías.
export function CampaignCardSkeleton() {
  return (
    <View style={styles.card}>
      <View style={styles.cover} />
      <View style={styles.body}>
        <View style={styles.chip} />
        <View style={styles.lineWide} />
        <View style={styles.line} />
        <View style={styles.bar} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: space.lg,
    overflow: 'hidden',
  },
  cover: { width: '100%', aspectRatio: media.coverAspect, backgroundColor: colors.track },
  body: { padding: space.lg, gap: space.sm },
  chip: { width: 80, height: 18, borderRadius: radius.pill, backgroundColor: colors.track },
  lineWide: { width: '85%', height: 16, borderRadius: radius.sm, backgroundColor: colors.track },
  line: { width: '60%', height: 16, borderRadius: radius.sm, backgroundColor: colors.track },
  bar: { width: '100%', height: 10, borderRadius: radius.pill, backgroundColor: colors.track, marginTop: space.sm },
});
