import {type PropsWithChildren, useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  AppState,
  BackHandler,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {colors, radius, spacing, typography} from '../theme';
import {createForegroundUpdateCoordinator, createStoreUrlOpener} from './updateGateCoordinator';
import type {UpdateRequirement} from './updateConfig';
import {loadNativeUpdateRequirement} from './nativeRemoteUpdateConfig';

type GateState =
  | {status: 'checking'}
  | {status: 'allowed'}
  | ({status: 'required'} & Omit<Extract<UpdateRequirement, {required: true}>, 'required'>);

export function AppUpdateGate({
  children,
  checkForUpdate = loadNativeUpdateRequirement,
}: PropsWithChildren<{checkForUpdate?: () => Promise<UpdateRequirement>}>) {
  const [state, setState] = useState<GateState>({status: 'checking'});
  const [openingStore, setOpeningStore] = useState(false);
  const [storeError, setStoreError] = useState<string | null>(null);
  const coordinatorRef = useRef<ReturnType<typeof createForegroundUpdateCoordinator<UpdateRequirement>> | null>(null);
  const openerRef = useRef<ReturnType<typeof createStoreUrlOpener> | null>(null);

  coordinatorRef.current ??= createForegroundUpdateCoordinator(checkForUpdate);
  openerRef.current ??= createStoreUrlOpener(Linking);

  useEffect(() => {
    let mounted = true;
    let previousAppState = AppState.currentState;
    const coordinator = coordinatorRef.current!;

    const applyCurrentCheck = () => {
      const operation = coordinator.checkCurrentCycle();
      void operation.then((requirement) => {
        if (!mounted || !coordinator.isCurrent(operation)) return;
        if (requirement.required) {
          setState({
            status: 'required',
            title: requirement.title,
            message: requirement.message,
            storeUrl: requirement.storeUrl,
          });
          return;
        }
        setState({status: 'allowed'});
      }, () => {
        if (mounted && coordinator.isCurrent(operation)) setState({status: 'allowed'});
      });
    };

    applyCurrentCheck();
    const subscription = AppState.addEventListener('change', (nextState) => {
      const returnedToForeground = nextState === 'active' && previousAppState !== 'active';
      previousAppState = nextState;
      if (!returnedToForeground) return;

      coordinator.beginForegroundCycle();
      applyCurrentCheck();
    });

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (state.status !== 'required') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => subscription.remove();
  }, [state.status]);

  if (state.status === 'checking') return <UpdateGateLoading />;
  if (state.status === 'allowed') return children;

  const openStore = async () => {
    if (openingStore) return;
    setOpeningStore(true);
    setStoreError(null);
    const result = await openerRef.current!.open(
      Platform.OS === 'ios' ? 'ios' : 'android',
      state.storeUrl,
    );
    if (!result.ok) {
      setStoreError('스토어를 열 수 없습니다. 잠시 후 다시 시도해 주세요.');
    }
    setOpeningStore(false);
  };

  return (
    <View accessibilityLabel="FaithLog 업데이트" style={styles.screen}>
      <ScrollView
        alwaysBounceVertical={false}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <View style={styles.icon}>
            <Text accessibilityElementsHidden style={styles.iconText}>↑</Text>
          </View>
          <Text accessibilityRole="header" style={styles.title}>{state.title}</Text>
          <Text style={styles.message}>{state.message}</Text>
          {storeError ? (
            <Text accessibilityLiveRegion="polite" style={styles.error}>{storeError}</Text>
          ) : null}
          <Pressable
            accessibilityLabel="업데이트"
            accessibilityRole="button"
            accessibilityState={{busy: openingStore, disabled: openingStore}}
            disabled={openingStore}
            onPress={() => void openStore()}
            style={({pressed}) => [
              styles.button,
              pressed && !openingStore ? styles.buttonPressed : null,
              openingStore ? styles.buttonDisabled : null,
            ]}>
            {openingStore ? <ActivityIndicator color={colors.surface} /> : null}
            <Text style={styles.buttonText}>{openingStore ? '스토어 여는 중...' : '업데이트'}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

function UpdateGateLoading() {
  return (
    <View accessibilityLabel="앱 버전 확인 중" style={styles.loadingScreen}>
      <ActivityIndicator color={colors.primary} size="large" />
      <Text style={styles.loadingText}>앱을 확인하고 있어요.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.screenX,
    paddingVertical: 48,
  },
  card: {
    alignItems: 'stretch',
    gap: 16,
    padding: spacing.card,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
  },
  icon: {
    alignItems: 'center',
    alignSelf: 'center',
    justifyContent: 'center',
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primarySoft,
  },
  iconText: {
    color: colors.primary,
    fontSize: 28,
    fontWeight: '700',
    lineHeight: 32,
  },
  title: {
    ...typography.screenTitle,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  message: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  error: {
    ...typography.caption,
    color: colors.danger,
    textAlign: 'center',
  },
  button: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: radius.control,
    backgroundColor: colors.primary,
  },
  buttonPressed: {
    opacity: 0.82,
  },
  buttonDisabled: {
    opacity: 0.62,
  },
  buttonText: {
    ...typography.label,
    color: colors.surface,
  },
  loadingScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    padding: spacing.screenX,
    backgroundColor: colors.background,
  },
  loadingText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
