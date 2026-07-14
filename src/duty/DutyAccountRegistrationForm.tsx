import type {ReactNode} from 'react';
import {StyleSheet, View} from 'react-native';

import {TextField} from '../components/ui';
import {colors, spacing} from '../theme';
import {DutyActionButton, DutySectionHeader} from './DutyPresentation';

type DutyAccountRegistrationFormProps = {
  accountHolder: string;
  accountNumber: string;
  bankName: string;
  busy: boolean;
  description: string;
  domainLabel: string;
  feedback?: ReactNode;
  nickname: string;
  onAccountHolderChange: (value: string) => void;
  onAccountNumberChange: (value: string) => void;
  onBankNameChange: (value: string) => void;
  onNicknameChange: (value: string) => void;
  onSubmit: () => void;
  submitAccessibilityLabel: string;
  submitLabel: string;
};

export function DutyAccountRegistrationForm({
  accountHolder,
  accountNumber,
  bankName,
  busy,
  description,
  domainLabel,
  feedback,
  nickname,
  onAccountHolderChange,
  onAccountNumberChange,
  onBankNameChange,
  onNicknameChange,
  onSubmit,
  submitAccessibilityLabel,
  submitLabel,
}: DutyAccountRegistrationFormProps) {
  return (
    <View style={styles.section}>
      <DutySectionHeader
        description={description}
        eyebrow="계좌 등록"
        title="정산 계좌 추가"
      />
      <View style={styles.formCard}>
        <View style={styles.formGrid}>
          <View style={styles.formField}>
            <TextField
              accessibilityLabel={`${domainLabel} 계좌 별칭`}
              editable={!busy}
              label="별칭"
              onChangeText={onNicknameChange}
              placeholder={`${domainLabel} 계좌`}
              value={nickname}
            />
          </View>
          <View style={styles.formField}>
            <TextField
              accessibilityLabel={`${domainLabel} 계좌 은행명`}
              editable={!busy}
              label="은행"
              onChangeText={onBankNameChange}
              placeholder="카카오뱅크"
              value={bankName}
            />
          </View>
        </View>
        <TextField
          accessibilityLabel={`${domainLabel} 계좌번호`}
          editable={!busy}
          keyboardType="number-pad"
          label="계좌번호"
          onChangeText={onAccountNumberChange}
          placeholder="3333-00-7777777"
          value={accountNumber}
        />
        <View style={styles.formGrid}>
          <View style={styles.formField}>
            <TextField
              accessibilityLabel={`${domainLabel} 계좌 예금주`}
              editable={!busy}
              label="예금주"
              onChangeText={onAccountHolderChange}
              placeholder={`${domainLabel} 담당자`}
              value={accountHolder}
            />
          </View>
        </View>
        {feedback}
        <DutyActionButton
          accessibilityLabel={submitAccessibilityLabel}
          busy={busy}
          label={submitLabel}
          onPress={onSubmit}
          variant="primary"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  formCard: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    gap: spacing.gap,
    paddingHorizontal: 24,
    paddingVertical: 22,
    shadowColor: colors.textPrimary,
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.03,
    shadowRadius: 14,
  },
  formField: {
    flex: 1,
    minWidth: 140,
  },
  formGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.gap,
  },
  section: {gap: spacing.gap},
});
