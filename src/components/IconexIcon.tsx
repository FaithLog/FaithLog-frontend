import {StyleSheet, type StyleProp, View, type ViewStyle} from 'react-native';

import {colors} from '../theme';

export type IconexIconName =
  | 'add-user'
  | 'bell'
  | 'calendar'
  | 'category'
  | 'category-2'
  | 'check'
  | 'close'
  | 'coins'
  | 'credit-card'
  | 'danger'
  | 'document'
  | 'document-2'
  | 'home'
  | 'lock'
  | 'lock-check'
  | 'lock-open'
  | 'lock-x'
  | 'message-circle'
  | 'message-square'
  | 'plus'
  | 'receipt'
  | 'send'
  | 'settings'
  | 'trash-can'
  | 'user'
  | 'users'
  | 'wallet';

type IconexIconProps = {
  color?: string;
  name: IconexIconName;
  size?: number;
  strokeWidth?: number;
  style?: StyleProp<ViewStyle>;
};

type BasePrimitive = {
  x: number;
  y: number;
};

type LinePrimitive = BasePrimitive & {
  h?: number;
  kind: 'line';
  rotate?: number;
  w: number;
};

type BoxPrimitive = BasePrimitive & {
  h: number;
  kind: 'box';
  radius?: number;
  w: number;
};

type FilledBoxPrimitive = BasePrimitive & {
  h: number;
  kind: 'filledBox';
  radius?: number;
  w: number;
};

type CirclePrimitive = BasePrimitive & {
  kind: 'circle';
  size: number;
};

type FilledCirclePrimitive = BasePrimitive & {
  kind: 'filledCircle';
  size: number;
};

type Primitive =
  | BoxPrimitive
  | CirclePrimitive
  | FilledBoxPrimitive
  | FilledCirclePrimitive
  | LinePrimitive;

const ICONEX_VIEWBOX = 24;

export function IconexIcon({
  color = colors.textPrimary,
  name,
  size = 24,
  strokeWidth = 2,
  style,
}: IconexIconProps) {
  const scale = size / ICONEX_VIEWBOX;
  const stroke = Math.max(1, strokeWidth * scale);

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={[styles.icon, {height: size, width: size}, style]}>
      {getIconPrimitives(name).map((primitive, index) => (
        <View key={`${name}-${index}`} style={getPrimitiveStyle(primitive, color, scale, stroke)} />
      ))}
    </View>
  );
}

function getPrimitiveStyle(
  primitive: Primitive,
  color: string,
  scale: number,
  stroke: number,
): ViewStyle {
  const base: ViewStyle = {
    position: 'absolute',
    left: primitive.x * scale,
    top: primitive.y * scale,
  };

  switch (primitive.kind) {
    case 'box':
      return {
        ...base,
        borderColor: color,
        borderRadius: (primitive.radius ?? 3) * scale,
        borderWidth: stroke,
        height: primitive.h * scale,
        width: primitive.w * scale,
      };
    case 'circle':
      return {
        ...base,
        borderColor: color,
        borderRadius: (primitive.size * scale) / 2,
        borderWidth: stroke,
        height: primitive.size * scale,
        width: primitive.size * scale,
      };
    case 'filledBox':
      return {
        ...base,
        backgroundColor: color,
        borderRadius: (primitive.radius ?? primitive.h / 2) * scale,
        height: primitive.h * scale,
        width: primitive.w * scale,
      };
    case 'filledCircle':
      return {
        ...base,
        backgroundColor: color,
        borderRadius: (primitive.size * scale) / 2,
        height: primitive.size * scale,
        width: primitive.size * scale,
      };
    case 'line':
      return {
        ...base,
        backgroundColor: color,
        borderRadius: stroke / 2,
        height: (primitive.h ?? 2) * scale,
        transform: primitive.rotate ? [{rotate: `${primitive.rotate}deg`}] : undefined,
        width: primitive.w * scale,
      };
    default:
      return primitive satisfies never;
  }
}

function getIconPrimitives(name: IconexIconName): Primitive[] {
  switch (name) {
    case 'check':
      return [
        {kind: 'line', x: 5, y: 12.5, w: 7, rotate: 45},
        {kind: 'line', x: 10, y: 11, w: 11, rotate: -45},
      ];
    case 'close':
      return [
        {kind: 'line', x: 6, y: 11, w: 12, rotate: 45},
        {kind: 'line', x: 6, y: 11, w: 12, rotate: -45},
      ];
    case 'plus':
      return [
        {kind: 'line', x: 6, y: 11, w: 12},
        {kind: 'line', x: 11, y: 6, w: 12, rotate: 90},
      ];
    case 'danger':
      return [
        {kind: 'circle', x: 3, y: 3, size: 18},
        {kind: 'line', x: 11, y: 7, w: 7, rotate: 90},
        {kind: 'filledCircle', x: 10.5, y: 16, size: 3},
      ];
    case 'document':
      return [
        {kind: 'box', x: 6, y: 3, w: 12, h: 18, radius: 2},
        {kind: 'line', x: 9, y: 9, w: 6},
        {kind: 'line', x: 9, y: 13, w: 6},
        {kind: 'line', x: 9, y: 17, w: 4},
      ];
    case 'document-2':
      return [
        {kind: 'box', x: 7, y: 4, w: 11, h: 16, radius: 2},
        {kind: 'line', x: 10, y: 8, w: 5},
        {kind: 'line', x: 10, y: 12, w: 5},
        {kind: 'line', x: 10, y: 16, w: 3},
        {kind: 'line', x: 5, y: 7, w: 3, rotate: 90},
      ];
    case 'category':
      return [
        {kind: 'box', x: 4, y: 4, w: 6, h: 6, radius: 2},
        {kind: 'box', x: 14, y: 4, w: 6, h: 6, radius: 2},
        {kind: 'box', x: 4, y: 14, w: 6, h: 6, radius: 2},
        {kind: 'box', x: 14, y: 14, w: 6, h: 6, radius: 2},
      ];
    case 'category-2':
      return [
        {kind: 'filledBox', x: 4, y: 5, w: 16, h: 3, radius: 2},
        {kind: 'filledBox', x: 4, y: 11, w: 16, h: 3, radius: 2},
        {kind: 'filledBox', x: 4, y: 17, w: 16, h: 3, radius: 2},
      ];
    case 'wallet':
      return [
        {kind: 'box', x: 3, y: 7, w: 18, h: 12, radius: 3},
        {kind: 'line', x: 5, y: 7, w: 11, rotate: -14},
        {kind: 'box', x: 14, y: 11, w: 5, h: 4, radius: 2},
      ];
    case 'credit-card':
      return [
        {kind: 'box', x: 3, y: 6, w: 18, h: 12, radius: 3},
        {kind: 'filledBox', x: 4, y: 10, w: 16, h: 2, radius: 0},
        {kind: 'line', x: 6, y: 15, w: 5},
      ];
    case 'receipt':
      return [
        {kind: 'box', x: 6, y: 3, w: 12, h: 18, radius: 2},
        {kind: 'line', x: 9, y: 8, w: 6},
        {kind: 'line', x: 9, y: 12, w: 6},
        {kind: 'line', x: 9, y: 16, w: 4},
      ];
    case 'coins':
      return [
        {kind: 'circle', x: 4, y: 8, size: 9},
        {kind: 'circle', x: 11, y: 5, size: 9},
        {kind: 'line', x: 6, y: 18, w: 12},
      ];
    case 'calendar':
      return [
        {kind: 'box', x: 4, y: 5, w: 16, h: 15, radius: 3},
        {kind: 'line', x: 4, y: 10, w: 16},
        {kind: 'line', x: 8, y: 3, w: 5, rotate: 90},
        {kind: 'line', x: 16, y: 3, w: 5, rotate: 90},
      ];
    case 'bell':
      return [
        {kind: 'box', x: 6, y: 6, w: 12, h: 10, radius: 5},
        {kind: 'line', x: 5, y: 16, w: 14},
        {kind: 'filledCircle', x: 10, y: 19, size: 4},
      ];
    case 'send':
      return [
        {kind: 'line', x: 4, y: 5, w: 16, rotate: 24},
        {kind: 'line', x: 4, y: 18, w: 16, rotate: -24},
        {kind: 'line', x: 9, y: 12, w: 9},
      ];
    case 'message-circle':
      return [
        {kind: 'circle', x: 4, y: 4, size: 16},
        {kind: 'line', x: 7, y: 18, w: 4, rotate: 122},
        {kind: 'line', x: 8, y: 11, w: 8},
      ];
    case 'message-square':
      return [
        {kind: 'box', x: 4, y: 5, w: 16, h: 12, radius: 3},
        {kind: 'line', x: 8, y: 17, w: 4, rotate: 122},
        {kind: 'line', x: 8, y: 11, w: 8},
      ];
    case 'user':
      return [
        {kind: 'circle', x: 8, y: 4, size: 8},
        {kind: 'box', x: 5, y: 15, w: 14, h: 6, radius: 4},
      ];
    case 'users':
      return [
        {kind: 'circle', x: 5, y: 5, size: 7},
        {kind: 'circle', x: 13, y: 6, size: 6},
        {kind: 'box', x: 3, y: 15, w: 12, h: 5, radius: 4},
        {kind: 'box', x: 13, y: 16, w: 8, h: 4, radius: 3},
      ];
    case 'add-user':
      return [
        {kind: 'circle', x: 6, y: 5, size: 7},
        {kind: 'box', x: 3, y: 15, w: 12, h: 5, radius: 4},
        {kind: 'line', x: 15, y: 10, w: 7},
        {kind: 'line', x: 17.5, y: 7.5, w: 7, rotate: 90},
      ];
    case 'settings':
      return [
        {kind: 'circle', x: 8, y: 8, size: 8},
        {kind: 'line', x: 11, y: 3, w: 5, rotate: 90},
        {kind: 'line', x: 11, y: 16, w: 5, rotate: 90},
        {kind: 'line', x: 3, y: 11, w: 5},
        {kind: 'line', x: 16, y: 11, w: 5},
        {kind: 'line', x: 5, y: 5, w: 5, rotate: 45},
        {kind: 'line', x: 15, y: 15, w: 5, rotate: 45},
      ];
    case 'trash-can':
      return [
        {kind: 'line', x: 5, y: 7, w: 14},
        {kind: 'line', x: 9, y: 4, w: 6},
        {kind: 'box', x: 7, y: 8, w: 10, h: 12, radius: 2},
        {kind: 'line', x: 10, y: 11, w: 6, rotate: 90},
        {kind: 'line', x: 14, y: 11, w: 6, rotate: 90},
      ];
    case 'lock':
    case 'lock-check':
    case 'lock-x':
      return [
        {kind: 'box', x: 5, y: 10, w: 14, h: 10, radius: 3},
        {kind: 'box', x: 8, y: 4, w: 8, h: 9, radius: 4},
        ...(name === 'lock-check'
          ? ([
              {kind: 'line', x: 9, y: 15, w: 4, rotate: 45},
              {kind: 'line', x: 12, y: 14, w: 5, rotate: -45},
            ] satisfies Primitive[])
          : name === 'lock-x'
            ? ([
                {kind: 'line', x: 10, y: 15, w: 5, rotate: 45},
                {kind: 'line', x: 10, y: 15, w: 5, rotate: -45},
              ] satisfies Primitive[])
            : []),
      ];
    case 'lock-open':
      return [
        {kind: 'box', x: 5, y: 10, w: 14, h: 10, radius: 3},
        {kind: 'box', x: 9, y: 4, w: 8, h: 8, radius: 4},
        {kind: 'filledBox', x: 14, y: 8, w: 5, h: 3, radius: 1},
      ];
    case 'home':
      return [
        {kind: 'line', x: 4, y: 11, w: 10, rotate: -42},
        {kind: 'line', x: 11.5, y: 3.5, w: 10, rotate: 42},
        {kind: 'box', x: 6, y: 11, w: 12, h: 9, radius: 2},
      ];
    default:
      return name satisfies never;
  }
}

const styles = StyleSheet.create({
  icon: {
    flexShrink: 0,
    position: 'relative',
  },
});
