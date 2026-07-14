import {Pressable, StyleSheet, Text, View} from 'react-native';

import {colors, spacing} from '../theme';

export type DutyPageNavItem<Page extends string> = Readonly<{
  id: Page;
  label: string;
}>;

export function DutyPageNav<Page extends string>({
  domainLabel,
  items,
  onSelectPage,
  page,
}: {
  domainLabel: string;
  items: ReadonlyArray<DutyPageNavItem<Page>>;
  onSelectPage: (page: Page) => void;
  page: Page;
}) {
  return (
    <View style={styles.pageNav}>
      {items.map((item) => {
        const active = item.id === page;

        return (
          <Pressable
            accessibilityLabel={`${domainLabel} ${item.label} 페이지 열기`}
            accessibilityRole="button"
            accessibilityState={{selected: active}}
            key={item.id}
            onPress={() => onSelectPage(item.id)}
            style={({pressed}) => [
              styles.pageNavButton,
              active ? styles.pageNavButtonActive : null,
              pressed ? styles.pressed : null,
            ]}>
            <Text style={[styles.pageNavText, active ? styles.pageNavTextActive : null]}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  pageNav: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.gap,
  },
  pageNavButton: {
    alignItems: 'center',
    backgroundColor: colors.borderSoft,
    borderRadius: 8,
    flexGrow: 1,
    justifyContent: 'center',
    minHeight: 48,
    minWidth: '46%',
    paddingHorizontal: spacing.card,
    paddingVertical: spacing.gap,
  },
  pageNavButtonActive: {
    backgroundColor: colors.primary,
  },
  pageNavText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '800',
  },
  pageNavTextActive: {
    color: colors.surface,
  },
  pressed: {
    opacity: 0.75,
  },
});
