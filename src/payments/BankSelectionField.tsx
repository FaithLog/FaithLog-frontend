import {useState} from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';

import {AppModal} from '../components/AppModal';
import {IconexIcon} from '../components/IconexIcon';
import {TextField} from '../components/ui';
import {colors, radius, spacing} from '../theme';
import {BANK_OPTIONS, isPresetBankName, normalizeBankName} from './paymentAccountInput';

export function BankSelectionField({
  bankName,
  disabled = false,
  domainLabel,
  onChange,
}: {
  bankName: string;
  disabled?: boolean;
  domainLabel: string;
  onChange: (bankName: string) => void;
}) {
  const [pickerVisible, setPickerVisible] = useState(false);
  const [directInput, setDirectInput] = useState(
    () => normalizeBankName(bankName).length > 0 && !isPresetBankName(bankName),
  );
  const selectedBankName = isPresetBankName(bankName) ? bankName : '';

  const selectBank = (nextBankName: string) => {
    setDirectInput(false);
    onChange(nextBankName);
    setPickerVisible(false);
  };

  const selectDirectInput = () => {
    setDirectInput(true);
    if (selectedBankName) onChange('');
    setPickerVisible(false);
  };

  return (
    <View style={styles.field}>
      <Text style={styles.label}>은행</Text>
      <Pressable
        accessibilityLabel={`${domainLabel} 계좌 은행 선택`}
        accessibilityRole="button"
        accessibilityState={{disabled, expanded: pickerVisible}}
        disabled={disabled}
        onPress={() => setPickerVisible(true)}
        style={({pressed}) => [
          styles.selectButton,
          disabled ? styles.disabled : null,
          pressed ? styles.pressed : null,
        ]}>
        <Text
          ellipsizeMode="tail"
          numberOfLines={1}
          style={[styles.selectText, selectedBankName ? null : styles.placeholder]}>
          {selectedBankName || (directInput ? '직접 입력' : '은행을 선택해 주세요')}
        </Text>
        <Text accessibilityElementsHidden style={styles.chevron}>⌄</Text>
      </Pressable>

      <AppModal
        animationType="fade"
        onRequestClose={() => setPickerVisible(false)}
        transparent
        visible={pickerVisible}>
        <View style={styles.modalRoot}>
          <Pressable
            accessibilityLabel="은행 선택 닫기"
            accessibilityRole="button"
            onPress={() => setPickerVisible(false)}
            style={styles.backdrop}
          />
          <View accessibilityViewIsModal style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <View style={styles.sheetTitleBlock}>
                <Text accessibilityRole="header" style={styles.sheetTitle}>은행 선택</Text>
                <Text style={styles.sheetDescription}>등록할 계좌의 은행을 선택해 주세요.</Text>
              </View>
              <Pressable
                accessibilityLabel="은행 선택 닫기"
                accessibilityRole="button"
                onPress={() => setPickerVisible(false)}
                style={({pressed}) => [styles.closeButton, pressed ? styles.pressed : null]}>
                <IconexIcon color={colors.textSecondary} name="close" size={20} strokeWidth={2} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.optionList}>
              {BANK_OPTIONS.map((option) => (
                <BankOption
                  key={option}
                  label={option}
                  onPress={() => selectBank(option)}
                  selected={selectedBankName === option}
                />
              ))}
              <View style={styles.optionDivider} />
              <BankOption
                label="직접 입력"
                onPress={selectDirectInput}
                selected={directInput}
              />
            </ScrollView>
          </View>
        </View>
      </AppModal>

      {directInput ? (
        <TextField
          accessibilityLabel={`${domainLabel} 계좌 은행명 직접 입력`}
          editable={!disabled}
          label="은행명 직접 입력"
          onChangeText={onChange}
          placeholder="은행명을 입력해 주세요"
          value={bankName}
        />
      ) : null}
    </View>
  );
}

function BankOption({
  label,
  onPress,
  selected,
}: {
  label: string;
  onPress: () => void;
  selected: boolean;
}) {
  return (
    <Pressable
      accessibilityLabel={`${label} 선택`}
      accessibilityRole="radio"
      accessibilityState={{checked: selected}}
      onPress={onPress}
      style={({pressed}) => [
        styles.option,
        selected ? styles.optionSelected : null,
        pressed ? styles.pressed : null,
      ]}>
      <Text style={[styles.optionText, selected ? styles.optionTextSelected : null]}>
        {label}
      </Text>
      {selected ? <IconexIcon color={colors.primary} name="check" size={18} strokeWidth={2.2} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {bottom: 0, left: 0, position: 'absolute', right: 0, top: 0},
  chevron: {color: colors.textMuted, fontSize: 18, fontWeight: '700', lineHeight: 20},
  closeButton: {
    alignItems: 'center',
    borderRadius: radius.pill,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  disabled: {opacity: 0.55},
  field: {gap: 8},
  label: {color: colors.textSecondary, fontSize: 13, fontWeight: '700', lineHeight: 18},
  modalRoot: {
    backgroundColor: 'rgba(15, 23, 42, 0.35)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  option: {
    alignItems: 'center',
    borderRadius: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingHorizontal: 16,
  },
  optionList: {gap: 2, paddingBottom: spacing.bottomSafe},
  optionDivider: {backgroundColor: colors.borderSoft, height: 1, marginVertical: 6},
  optionSelected: {backgroundColor: colors.primarySoft},
  optionText: {color: colors.textPrimary, fontSize: 15, fontWeight: '600', lineHeight: 21},
  optionTextSelected: {color: colors.primary, fontWeight: '700'},
  placeholder: {color: colors.textMuted},
  pressed: {opacity: 0.72},
  selectButton: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderColor: colors.borderSoft,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 48,
    paddingHorizontal: 16,
  },
  selectText: {color: colors.textPrimary, flex: 1, fontSize: 15, lineHeight: 21},
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '82%',
    paddingHorizontal: 20,
    paddingTop: 18,
  },
  sheetDescription: {color: colors.textMuted, fontSize: 13, lineHeight: 18},
  sheetHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sheetTitle: {color: colors.textPrimary, fontSize: 20, fontWeight: '700', lineHeight: 28},
  sheetTitleBlock: {flex: 1, gap: 2},
});
