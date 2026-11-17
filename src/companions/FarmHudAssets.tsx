import React from 'react';
import {Image, Pressable, StyleSheet, Text, View, type ImageSourcePropType} from 'react-native';
import {colors, radius, typography} from '../theme';

/** FaithLog-blue / faith-teal retina icons. PNG is bundled offline by Metro. */
export const FARM_HUD_ICONS = {
  'action-feed': require('../../assets/companions/farm-hud/action-feed.png') as ImageSourcePropType,
  'action-pet': require('../../assets/companions/farm-hud/action-pet.png') as ImageSourcePropType,
  'action-play': require('../../assets/companions/farm-hud/action-play.png') as ImageSourcePropType,
  'action-clean': require('../../assets/companions/farm-hud/action-clean.png') as ImageSourcePropType,
  'action-sleep': require('../../assets/companions/farm-hud/action-sleep.png') as ImageSourcePropType,
  'action-evolve': require('../../assets/companions/farm-hud/action-evolve.png') as ImageSourcePropType,
  'status-hunger': require('../../assets/companions/farm-hud/status-hunger.png') as ImageSourcePropType,
  'status-affection': require('../../assets/companions/farm-hud/status-affection.png') as ImageSourcePropType,
  'status-cleanliness': require('../../assets/companions/farm-hud/status-cleanliness.png') as ImageSourcePropType,
  'status-health': require('../../assets/companions/farm-hud/status-health.png') as ImageSourcePropType,
  'status-joy': require('../../assets/companions/farm-hud/status-joy.png') as ImageSourcePropType,
  'state-hungry': require('../../assets/companions/farm-hud/state-hungry.png') as ImageSourcePropType,
  'state-dirty': require('../../assets/companions/farm-hud/state-dirty.png') as ImageSourcePropType,
  'state-sick': require('../../assets/companions/farm-hud/state-sick.png') as ImageSourcePropType,
  'state-sleepy': require('../../assets/companions/farm-hud/state-sleepy.png') as ImageSourcePropType,
  'state-happy': require('../../assets/companions/farm-hud/state-happy.png') as ImageSourcePropType,
  'state-selected': require('../../assets/companions/farm-hud/state-selected.png') as ImageSourcePropType,
  'fx-heart': require('../../assets/companions/farm-hud/fx-heart.png') as ImageSourcePropType,
  'fx-sparkles': require('../../assets/companions/farm-hud/fx-sparkles.png') as ImageSourcePropType,
  'fx-clean': require('../../assets/companions/farm-hud/fx-clean.png') as ImageSourcePropType,
  'fx-evolve': require('../../assets/companions/farm-hud/fx-evolve.png') as ImageSourcePropType,
  'badge-lv1': require('../../assets/companions/farm-hud/badge-lv1.png') as ImageSourcePropType,
  'badge-lv2': require('../../assets/companions/farm-hud/badge-lv2.png') as ImageSourcePropType,
  'badge-lv3': require('../../assets/companions/farm-hud/badge-lv3.png') as ImageSourcePropType,
} as const;

export type FarmHudIconName = keyof typeof FARM_HUD_ICONS;
export type FarmCareActionName = 'feed' | 'pet' | 'play' | 'clean' | 'sleep' | 'evolve';
export type FarmHudMeterKind = 'hunger' | 'affection' | 'cleanliness' | 'health' | 'joy';

export const FARM_HUD_ACTIONS: Readonly<Record<FarmCareActionName, {label: string; icon: FarmHudIconName}>> = {
  feed: {label: '먹이주기', icon: 'action-feed'},
  pet: {label: '쓰다듬기', icon: 'action-pet'},
  play: {label: '놀아주기', icon: 'action-play'},
  clean: {label: '청소하기', icon: 'action-clean'},
  sleep: {label: '잠자기', icon: 'action-sleep'},
  evolve: {label: '진화', icon: 'action-evolve'},
};

const METER_COLORS: Record<FarmHudMeterKind, string> = {
  hunger: colors.faith,
  affection: colors.primary,
  cleanliness: '#46A9AF',
  health: colors.success,
  joy: '#E2AD50',
};
const METER_ICONS: Record<FarmHudMeterKind, FarmHudIconName> = {
  hunger: 'status-hunger', affection: 'status-affection',
  cleanliness: 'status-cleanliness', health: 'status-health', joy: 'status-joy',
};

/** No pre-rendered text, badges or progress values: all remain accessible RN UI. */
export function FarmHudIcon({name, size = 32}: {name: FarmHudIconName; size?: number}) {
  const safeSize = Number.isFinite(size) && size > 0 ? size : 32;
  return <Image source={FARM_HUD_ICONS[name]} accessible={false}
    resizeMode="contain" fadeDuration={0} style={{width: safeSize, height: safeSize}} />;
}

export function FarmHudGauge({kind, label, value, max = 100}: {
  kind: FarmHudMeterKind; label: string; value: number; max?: number;
}) {
  const safeMax = Number.isFinite(max) && max > 0 ? max : 100;
  const safeValue = Number.isFinite(value) ? Math.max(0, Math.min(value, safeMax)) : 0;
  const percentage = safeValue / safeMax * 100;
  const width = `${percentage}%` as `${number}%`;
  return <View style={styles.gaugeCard}>
    <View style={styles.gaugeHeader}>
      <FarmHudIcon name={METER_ICONS[kind]} size={24}/>
      <Text style={styles.gaugeLabel}>{label}</Text>
      <Text style={styles.gaugeValue}>{Math.round(percentage)}%</Text>
    </View>
    <View style={styles.track} accessibilityRole="progressbar" accessibilityLabel={label}
      accessibilityValue={{min: 0, max: safeMax, now: safeValue}}>
      <View style={[styles.fill, {width, backgroundColor: METER_COLORS[kind]}]}/>
    </View>
  </View>;
}

/** Visual-only control; it calls the provided callback, never invents server data. */
export function FarmCareButton({action, onPress, selected = false, disabled = false}: {
  action: FarmCareActionName; onPress: () => void; selected?: boolean; disabled?: boolean;
}) {
  const item = FARM_HUD_ACTIONS[action];
  return <Pressable onPress={onPress} disabled={disabled} accessible accessibilityRole="button"
    accessibilityLabel={item.label} accessibilityState={{selected, disabled}}
    style={[styles.button, selected && styles.buttonSelected, disabled && styles.buttonDisabled]}>
    <FarmHudIcon name={item.icon} size={34}/>
    <Text style={[styles.buttonText, selected && styles.buttonTextSelected]}>{item.label}</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  gaugeCard: {backgroundColor: colors.surface, borderColor: colors.borderSoft, borderWidth: 1,
    borderRadius: radius.control, paddingHorizontal: 12, paddingVertical: 10, gap: 7},
  gaugeHeader: {flexDirection: 'row', alignItems: 'center', gap: 7},
  gaugeLabel: {...typography.caption, flex: 1, color: colors.textPrimary, fontWeight: '600'},
  gaugeValue: {...typography.caption, color: colors.textSecondary, fontWeight: '600'},
  track: {height: 8, backgroundColor: colors.borderSoft, borderRadius: radius.pill, overflow: 'hidden'},
  fill: {height: '100%', borderRadius: radius.pill},
  button: {minHeight: 64, minWidth: 64, justifyContent: 'center', alignItems: 'center',
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderSoft,
    borderRadius: radius.control, paddingVertical: 6, paddingHorizontal: 4, gap: 2},
  buttonSelected: {borderColor: colors.primary, backgroundColor: colors.primarySoft},
  buttonDisabled: {opacity: 0.45},
  buttonText: {...typography.caption, fontSize: 11, color: colors.textSecondary,
    fontWeight: '600', textAlign: 'center'},
  buttonTextSelected: {color: colors.primary},
});
