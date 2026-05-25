/**
 * FullscreenImageViewer · issue
 *
 * 微信/飞书风格的全屏图片查看器：
 *  - 单指 pan：拖动图片
 *  - 双指 pinch：放大缩小（native gesture，worklet on UI thread）
 *  - 双击：toggle 1× / 2.5×（聚焦 tap 位置）
 *  - 单击：关闭
 *  - 弹簧回弹：松手后超出 minScale 自动回 1×
 *
 * Her 美学：黑 backdrop（rgba(0,0,0,0.95)） + serif caption + 慢淡入淡出。
 * 不做 swipe-to-close（避免和 pan 冲突，单击关足够）。
 */
import React, { useEffect } from 'react';
import {
  Dimensions,
  Image,
  Modal,
  Platform,
  StyleSheet,
  Text,
} from 'react-native';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { COLORS, FONT_SERIF_BOLD } from '../../theme';

type Source = { uri: string; headers?: Record<string, string> };

type Props = {
  visible: boolean;
  source: Source | null;
  caption?: string;
  onClose: () => void;
};

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const DOUBLE_TAP_SCALE = 2.5;

const SCREEN = Dimensions.get('window');

export function FullscreenImageViewer({
  visible,
  source,
  caption,
  onClose,
}: Props) {
  // backdrop 淡入淡出 + 控件淡入（caption / hint）
  const backdrop = useSharedValue(0);
  const chrome = useSharedValue(0);

  // 变换 state · pinch + pan
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);

  // pinch focal point（双指中心，相对屏幕中心）
  const focalX = useSharedValue(0);
  const focalY = useSharedValue(0);

  // visible 切换时驱动淡入淡出 + reset 变换
  useEffect(() => {
    if (visible) {
      backdrop.value = withTiming(1, {
        duration: 220,
        easing: Easing.out(Easing.quad),
      });
      chrome.value = withTiming(1, { duration: 380 });
      scale.value = 1;
      savedScale.value = 1;
      tx.value = 0;
      ty.value = 0;
      savedTx.value = 0;
      savedTy.value = 0;
    } else {
      backdrop.value = withTiming(0, { duration: 180 });
      chrome.value = withTiming(0, { duration: 180 });
    }
    // shared values 不进 deps（避免无限触发）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // pinch 手势 · two-finger zoom，focal 用屏幕中心相对偏移驱动 translate
  const pinch = Gesture.Pinch()
    .onStart((e) => {
      focalX.value = e.focalX - SCREEN.width / 2;
      focalY.value = e.focalY - SCREEN.height / 2;
    })
    .onUpdate((e) => {
      const next = Math.min(
        MAX_SCALE,
        Math.max(MIN_SCALE * 0.5, savedScale.value * e.scale),
      );
      scale.value = next;
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      // 缩到比 1× 还小 → 弹回 1× + 复位 translate
      if (scale.value < MIN_SCALE) {
        scale.value = withSpring(MIN_SCALE, {
          damping: 18,
          stiffness: 200,
        });
        tx.value = withSpring(0, { damping: 18, stiffness: 200 });
        ty.value = withSpring(0, { damping: 18, stiffness: 200 });
        savedScale.value = MIN_SCALE;
        savedTx.value = 0;
        savedTy.value = 0;
      }
    });

  // pan 手势 · 单指拖动（只在放大态生效；1× 时不拦截，留给 single-tap 关闭）
  const pan = Gesture.Pan()
    .minPointers(1)
    .maxPointers(1)
    .onUpdate((e) => {
      if (scale.value <= MIN_SCALE * 1.01) return;
      tx.value = savedTx.value + e.translationX;
      ty.value = savedTy.value + e.translationY;
    })
    .onEnd(() => {
      savedTx.value = tx.value;
      savedTy.value = ty.value;
    });

  // double tap · toggle 1× / 2.5×（在 tap 位置聚焦放大）
  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDelay(280)
    .onEnd((e) => {
      if (scale.value > MIN_SCALE * 1.01) {
        // 已放大 → 复位
        scale.value = withSpring(MIN_SCALE, {
          damping: 18,
          stiffness: 200,
        });
        tx.value = withSpring(0, { damping: 18, stiffness: 200 });
        ty.value = withSpring(0, { damping: 18, stiffness: 200 });
        savedScale.value = MIN_SCALE;
        savedTx.value = 0;
        savedTy.value = 0;
      } else {
        // 1× → 2.5×（focal 在 tap 点，translate 朝相反方向移动让该点视觉上"留住"）
        const fx = e.x - SCREEN.width / 2;
        const fy = e.y - SCREEN.height / 2;
        scale.value = withSpring(DOUBLE_TAP_SCALE, {
          damping: 18,
          stiffness: 200,
        });
        tx.value = withSpring(-fx * (DOUBLE_TAP_SCALE - 1), {
          damping: 18,
          stiffness: 200,
        });
        ty.value = withSpring(-fy * (DOUBLE_TAP_SCALE - 1), {
          damping: 18,
          stiffness: 200,
        });
        savedScale.value = DOUBLE_TAP_SCALE;
        savedTx.value = -fx * (DOUBLE_TAP_SCALE - 1);
        savedTy.value = -fy * (DOUBLE_TAP_SCALE - 1);
      }
    });

  // single tap · 1× 时关闭 viewer，放大态时不响应（避免误关）
  // .runOnJS(true) 让 onEnd 直接跑在 JS 线程，省去 runOnJS 包裹（reanimated 4 已废弃）
  const singleTap = Gesture.Tap()
    .numberOfTaps(1)
    .maxDelay(220)
    .runOnJS(true)
    .onEnd(() => {
      if (scale.value <= MIN_SCALE * 1.01) {
        onClose();
      }
    });

  // double-tap 优先 (requireExternalGestureToFail) 否则 single-tap 会先吞掉
  const tapComposed = Gesture.Exclusive(doubleTap, singleTap);
  // 手势组合：pinch + pan + tap 同时识别
  const composed = Gesture.Simultaneous(
    Gesture.Race(pinch, pan),
    tapComposed,
  );

  const imageStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { scale: scale.value },
    ],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdrop.value,
  }));

  const chromeStyle = useAnimatedStyle(() => ({ opacity: chrome.value }));

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <GestureHandlerRootView style={styles.root}>
        <Animated.View style={[styles.backdrop, backdropStyle]} />
        <GestureDetector gesture={composed}>
          <Animated.View style={styles.stage}>
            {source ? (
              <Animated.View style={imageStyle}>
                <Image
                  source={source}
                  style={styles.image}
                  resizeMode="contain"
                />
              </Animated.View>
            ) : null}
          </Animated.View>
        </GestureDetector>

        {/* caption + 操作 hint · 仅 1× 时显示，放大态隐起来不打扰 */}
        <Animated.View style={[styles.chrome, chromeStyle]} pointerEvents="none">
          {caption ? (
            <Text style={styles.caption} numberOfLines={2}>
              {caption}
            </Text>
          ) : null}
          <Text style={styles.hint}>
            双指缩放 · 双击放大 · 单击关闭
          </Text>
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.96)',
  },
  stage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: SCREEN.width,
    height: SCREEN.height,
  },
  chrome: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: Platform.OS === 'android' ? 36 : 48,
    paddingHorizontal: 26,
    alignItems: 'center',
  },
  caption: {
    fontFamily: FONT_SERIF_BOLD,
    fontStyle: 'italic',
    fontSize: 12.5,
    lineHeight: 18,
    color: COLORS.bgSub,
    opacity: 0.85,
    textAlign: 'center',
    marginBottom: 8,
  },
  hint: {
    fontFamily: FONT_SERIF_BOLD,
    fontStyle: 'italic',
    fontSize: 11,
    color: COLORS.bgSub,
    opacity: 0.55,
    letterSpacing: 0.6,
  },
});

