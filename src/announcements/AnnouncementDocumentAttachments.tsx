import {Pressable, StyleSheet, Text, View} from 'react-native';

import {colors, radius, spacing, typography} from '../theme';
import {formatAttachmentByteSize} from '../media/pdfAttachmentPolicy';

export type AnnouncementDocumentItem = {
  assetId?: number;
  byteSize: number;
  fileName: string;
  localId: string;
  message?: string;
  status: 'completing' | 'failed' | 'hashing' | 'ready' | 'reserving' | 'uploading';
};

export function AnnouncementDocumentEditor({
  disabled,
  items,
  onAdd,
  onMove,
  onRemove,
  onRetry,
}: {
  disabled: boolean;
  items: AnnouncementDocumentItem[];
  onAdd: () => void;
  onMove: (from: number, to: number) => void;
  onRemove: (localId: string) => void;
  onRetry: (localId: string) => void;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.headingRow}>
        <View style={styles.headingCopy}>
          <Text style={styles.heading}>첨부 문서</Text>
          <Text style={styles.caption}>PDF · 파일당 최대 10MB</Text>
        </View>
        <SmallAction accessibilityLabel="공지 PDF 추가" disabled={disabled} label="PDF 추가" onPress={onAdd} primary />
      </View>
      {items.map((item, index) => (
        <View accessibilityLabel={`${item.fileName} PDF 첨부`} key={item.localId} style={styles.row}>
          <View accessibilityElementsHidden style={styles.pdfIcon}><Text style={styles.pdfIconText}>PDF</Text></View>
          <View style={styles.fileCopy}>
            <Text numberOfLines={2} style={styles.fileName}>{item.fileName}</Text>
            <Text style={item.status === 'failed' ? styles.error : styles.caption}>
              {item.status === 'ready'
                ? formatAttachmentByteSize(item.byteSize)
                : item.status === 'failed'
                  ? (item.message ?? '업로드하지 못했습니다.')
                  : statusLabel[item.status]}
            </Text>
          </View>
          <View style={styles.actions}>
            {item.status === 'failed' ? <SmallAction accessibilityLabel={`${item.fileName} 다시 시도`} label="재시도" onPress={() => onRetry(item.localId)} /> : null}
            <SmallAction accessibilityLabel={`${item.fileName} 왼쪽으로 이동`} disabled={disabled || index === 0} label="←" onPress={() => onMove(index, index - 1)} />
            <SmallAction accessibilityLabel={`${item.fileName} 오른쪽으로 이동`} disabled={disabled || index === items.length - 1} label="→" onPress={() => onMove(index, index + 1)} />
            <SmallAction accessibilityLabel={`${item.fileName} 삭제`} disabled={disabled} label="삭제" onPress={() => onRemove(item.localId)} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function AnnouncementDocumentList({items, onOpen}: {items: AnnouncementDocumentItem[]; onOpen: (item: AnnouncementDocumentItem) => void}) {
  if (items.length === 0) return null;
  return (
    <View style={styles.section}>
      <Text style={styles.heading}>첨부 파일</Text>
      {items.map((item) => (
        <Pressable accessibilityLabel={`${item.fileName} PDF 열기`} accessibilityRole="button" key={item.localId} onPress={() => onOpen(item)} style={styles.openRow}>
          <View accessibilityElementsHidden style={styles.pdfIcon}><Text style={styles.pdfIconText}>PDF</Text></View>
          <View style={styles.fileCopy}>
            <Text numberOfLines={2} style={styles.fileName}>{item.fileName}</Text>
            <Text style={styles.caption}>{formatAttachmentByteSize(item.byteSize)}</Text>
          </View>
          <Text style={styles.openLabel}>열기</Text>
        </Pressable>
      ))}
    </View>
  );
}

const statusLabel = {completing: '첨부 확인 중', hashing: '파일 확인 중', reserving: '업로드 준비 중', uploading: '업로드 중'} as const;

function SmallAction({accessibilityLabel, disabled = false, label, onPress, primary = false}: {accessibilityLabel: string; disabled?: boolean; label: string; onPress: () => void; primary?: boolean}) {
  return <Pressable accessibilityLabel={accessibilityLabel} accessibilityRole="button" accessibilityState={{disabled}} disabled={disabled} onPress={onPress} style={[styles.button, primary && styles.buttonPrimary, disabled && styles.buttonDisabled]}><Text style={[styles.buttonText, primary && styles.buttonTextPrimary]}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  actions: {alignItems: 'center', flexDirection: 'row', gap: 4},
  button: {alignItems: 'center', borderColor: colors.border, borderRadius: radius.control, borderWidth: 1, justifyContent: 'center', minHeight: 44, minWidth: 44, paddingHorizontal: spacing.gap},
  buttonDisabled: {opacity: 0.4},
  buttonPrimary: {backgroundColor: colors.primary, borderColor: colors.primary},
  buttonText: {...typography.caption, color: colors.textPrimary, fontWeight: '700'},
  buttonTextPrimary: {color: colors.surface},
  caption: {...typography.caption, color: colors.textMuted},
  error: {...typography.caption, color: colors.danger},
  fileCopy: {flex: 1, gap: 2, minWidth: 0},
  fileName: {...typography.body, color: colors.textPrimary, fontWeight: '700'},
  heading: {...typography.cardTitle, color: colors.textPrimary},
  headingCopy: {flex: 1, gap: 2},
  headingRow: {alignItems: 'center', flexDirection: 'row', gap: spacing.gap, justifyContent: 'space-between'},
  openLabel: {...typography.body, color: colors.primary, fontWeight: '700'},
  openRow: {alignItems: 'center', backgroundColor: colors.neutralSoft, borderRadius: radius.item, flexDirection: 'row', gap: spacing.gap, minHeight: 64, padding: spacing.gap},
  pdfIcon: {alignItems: 'center', backgroundColor: '#FEECEC', borderRadius: radius.control, height: 44, justifyContent: 'center', width: 44},
  pdfIconText: {...typography.caption, color: '#D83939', fontWeight: '800'},
  row: {alignItems: 'center', borderColor: colors.border, borderRadius: radius.item, borderWidth: 1, flexDirection: 'row', gap: spacing.gap, padding: spacing.gap},
  section: {backgroundColor: colors.surface, borderRadius: radius.card, gap: spacing.gap, padding: spacing.card},
});
