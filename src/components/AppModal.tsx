import {
  Children,
  cloneElement,
  createContext,
  isValidElement,
  type PropsWithChildren,
  type ReactElement,
  type ReactNode,
  useContext,
} from 'react';
import {
  Modal as NativeModal,
  type ModalProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

const AppModalInsetContext = createContext(0);

export function AppModalInsetProvider({
  bottomInset,
  children,
}: PropsWithChildren<{bottomInset: number}>) {
  return (
    <AppModalInsetContext.Provider value={Math.max(0, bottomInset)}>
      {children}
    </AppModalInsetContext.Provider>
  );
}

export function AppModal({children, ...props}: ModalProps) {
  const bottomInset = useContext(AppModalInsetContext);
  const child = Children.only(children);
  const insetContent = applyModalBottomInset(child, bottomInset);

  return (
    <NativeModal {...props}>
      {insetContent}
    </NativeModal>
  );
}

function applyModalBottomInset(child: ReactNode, bottomInset: number) {
  if (bottomInset <= 0 || !isValidElement(child)) return child;

  const element = child as ReactElement<{style?: StyleProp<ViewStyle>}>;
  return cloneElement(element, {
    style: [element.props.style, {paddingBottom: bottomInset}],
  });
}
