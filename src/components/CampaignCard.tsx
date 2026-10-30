import React from 'react';
import { View, Text, Image, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Campaign, isCompleted } from '../types';
import { colors, radius, space, categories, media } from '../theme';
import { ProgressBar } from './ProgressBar';

type Props = {
  campaign: Campaign;
  onPress: () => void;
};

export function CampaignCard({ campaign, onPress }: Props) {
  const cat = categories[campaign.category];
  const completed = isCompleted(campaign);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <Image source={{ uri: campaign.coverImageUrl }} style={styles.cover} />

      <View style={styles.body}>
        <View style={styles.chipRow}>
          <View style={[styles.cat, { backgroundColor: cat.color + '1A' }]}>
            <Text style={[styles.catText, { color: cat.color }]}>{cat.label}</Text>
          </View>
          {completed && (
            <View style={styles.done}>
              <Ionicons name="checkmark-circle" size={13} color={colors.success} />
              <Text style={styles.doneText}>Meta alcanzada</Text>
            </View>
          )}
          {campaign.dedicatedAccountVerified && (
            <View style={styles.verified}>
              <Ionicons name="shield-checkmark" size={13} color={colors.primary} />
              <Text style={styles.verifiedText}>Cuenta verificada</Text>
            </View>
          )}
        </View>

        <Text style={styles.title} numberOfLines={2}>{campaign.title}</Text>
        <Text style={styles.snippet} numberOfLines={2}>{campaign.story}</Text>

        <View style={styles.progress}>
          <ProgressBar current={campaign.currentAmount} goal={campaign.goalAmount} />
        </View>

        <View style={styles.footer}>
          <Ionicons name="location-outline" size={14} color={colors.textMuted} />
          <Text style={styles.loc}>{campaign.location}</Text>
        </View>
      </View>
    </Pressable>
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
  pressed: { opacity: 0.85 },
  cover: { width: '100%', aspectRatio: media.coverAspect, backgroundColor: colors.track },
  body: { padding: space.lg },
  chipRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.md },
  cat: { paddingHorizontal: space.md, paddingVertical: 4, borderRadius: radius.pill },
  catText: { fontSize: 12, fontWeight: '600' },
  verified: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  verifiedText: { fontSize: 12, fontWeight: '500', color: colors.primary },
  done: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: space.md,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.success + '1A',
  },
  doneText: { fontSize: 12, fontWeight: '600', color: colors.success },
  title: { fontSize: 17, fontWeight: '700', color: colors.text, lineHeight: 23 },
  snippet: { marginTop: space.xs, fontSize: 14, color: colors.textMuted, lineHeight: 20 },
  progress: { marginTop: space.md },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: space.md },
  loc: { fontSize: 13, color: colors.textMuted },
});
