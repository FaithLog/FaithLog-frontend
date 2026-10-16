import {useState} from 'react';
import {Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
import {colors, spacing} from '../theme';
import {createManualCoffeeOption, getManualCoffeeOptionError, type ManualCoffeeOption} from './manualCoffeeOption';

export type CoffeeOptionMode = 'catalog' | 'manual';

export function CoffeeOptionModeSelector({mode, onChange, disabled = false}: {
  mode: CoffeeOptionMode; onChange: (mode: CoffeeOptionMode) => void; disabled?: boolean;
}) {
  return (
    <View style={styles.modes}>
      {(['catalog', 'manual'] as const).map((value) => (
        <Pressable key={value} accessibilityRole="tab"
          accessibilityLabel={value === 'catalog' ? '커피 메뉴 선택 방식' : '커피 직접 입력 방식'}
          accessibilityState={{selected: mode === value, disabled}}
          disabled={disabled} onPress={() => onChange(value)}
          style={[styles.mode, mode === value ? styles.selectedMode : null]}>
          <Text style={[styles.modeText, mode === value ? styles.selectedText : null]}>
            {value === 'catalog' ? '메뉴 선택' : '직접 입력'}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export function ManualCoffeeOptionForm({disabled = false, existingNames, onSubmit}: {
  disabled?: boolean; existingNames: string[]; onSubmit: (option: ManualCoffeeOption) => void;
}) {
  const [content, setContent] = useState('');
  const [priceText, setPriceText] = useState('');
  const error = getManualCoffeeOptionError(content, priceText, existingNames);
  return (
    <View style={styles.form}>
      <Text style={styles.hint}>목록에 없는 메뉴를 이름과 금액으로 추가하세요.</Text>
      <Text style={styles.label}>메뉴 이름</Text>
      <TextInput accessibilityLabel="커피 메뉴명 직접 입력" placeholder="예: 바닐라 라떼"
        placeholderTextColor={colors.subtleText} value={content} editable={!disabled}
        onChangeText={setContent} maxLength={200} style={styles.input} />
      <Text style={styles.label}>금액 (원)</Text>
      <TextInput accessibilityLabel="커피 금액 직접 입력" placeholder="예: 4500" keyboardType="number-pad"
        placeholderTextColor={colors.subtleText} value={priceText} editable={!disabled}
        onChangeText={setPriceText} style={styles.input} />
      {error && (content.length > 0 || priceText.length > 0) ? (
        <Text accessibilityRole="alert" style={styles.error}>{error}</Text>
      ) : null}
      <Pressable accessibilityLabel="직접 입력 커피 항목 추가" accessibilityRole="button"
        accessibilityState={{disabled: disabled || error !== null}} disabled={disabled || error !== null}
        onPress={() => { if (!disabled && !error) onSubmit(createManualCoffeeOption(content, priceText)); }}
        style={[styles.submit, disabled || error ? styles.disabled : null]}>
        <Text style={styles.submitText}>{disabled ? '추가 중...' : '항목 추가'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  modes: {flexDirection: 'row', gap: 4, padding: 4, borderRadius: 14, backgroundColor: colors.background, marginBottom: spacing.card},
  mode: {flex: 1, minHeight: 48, justifyContent: 'center', alignItems: 'center', paddingVertical: 12, borderRadius: 10},
  selectedMode: {backgroundColor: colors.surface},
  modeText: {color: colors.subtleText, fontSize: 14, fontWeight: '600'},
  selectedText: {color: colors.textPrimary},
  form: {gap: spacing.gap},
  hint: {color: colors.subtleText, fontSize: 13, lineHeight: 20, marginBottom: 4},
  label: {color: colors.textPrimary, fontSize: 13, fontWeight: '600'},
  input: {minHeight: 50, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14, color: colors.textPrimary, backgroundColor: colors.surface, fontSize: 16},
  error: {color: colors.danger, fontSize: 13, lineHeight: 19},
  submit: {backgroundColor: colors.textPrimary, alignItems: 'center', borderRadius: 12, paddingVertical: 15, marginTop: 8},
  submitText: {color: colors.surface, fontSize: 15, fontWeight: '700'},
  disabled: {opacity: 0.4},
});
