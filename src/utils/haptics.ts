/**
 * Safe Haptic Feedback Utility for Web and Mobile
 * Uses the Web Vibration API (navigator.vibrate) when supported.
 */

export type HapticType = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error' | 'selection';

export function triggerHaptic(type: HapticType = 'light'): void {
  try {
    if (typeof window === 'undefined' || !('navigator' in window)) return;
    if (typeof window.navigator.vibrate !== 'function') return;

    switch (type) {
      case 'selection':
      case 'light':
        // Quick 10ms micro-tap for tabs, sorts, selects
        window.navigator.vibrate(10);
        break;

      case 'medium':
        // Solid 25ms tap for primary button clicks & modal triggers
        window.navigator.vibrate(25);
        break;

      case 'heavy':
        // Strong 45ms tap for major actions like reset/clear
        window.navigator.vibrate(45);
        break;

      case 'success':
        // Double pleasant pulse: [15ms vibration, 45ms pause, 30ms vibration]
        window.navigator.vibrate([15, 45, 30]);
        break;

      case 'warning':
        // Double warning pulse: [30ms vibration, 50ms pause, 30ms vibration]
        window.navigator.vibrate([30, 50, 30]);
        break;

      case 'error':
        // Triple error pulse: [40ms vibration, 40ms pause, 40ms vibration, 40ms pause, 40ms vibration]
        window.navigator.vibrate([40, 40, 40, 40, 40]);
        break;

      default:
        window.navigator.vibrate(15);
        break;
    }
  } catch {
    // Gracefully ignore devices/browsers that disallow or restrict vibration
  }
}

export const haptic = {
  light: () => triggerHaptic('light'),
  selection: () => triggerHaptic('selection'),
  medium: () => triggerHaptic('medium'),
  heavy: () => triggerHaptic('heavy'),
  success: () => triggerHaptic('success'),
  warning: () => triggerHaptic('warning'),
  error: () => triggerHaptic('error'),
};
