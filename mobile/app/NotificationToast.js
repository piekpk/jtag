import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { listNotifications, markNotificationRead } from './notificationsApi.js';

const POLL_MS = 30000;
const SHOW_MS = 5000;

// Floating alert banner: mounted once in the root layout so it floats on top
// of every screen. Only appears when a genuinely new notification arrives —
// there is no Alerts tab or inbox anymore. New alerts are marked read when
// shown so they never re-toast.
export default function NotificationToast() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [current, setCurrent] = useState(null);
  const queueRef = useRef([]);
  const seenRef = useRef(null); // null until the first poll seeds it
  const busyRef = useRef(false);
  const timerRef = useRef(null);
  const animRef = useRef(new Animated.Value(0));
  const dismissRef = useRef(null);

  const showNext = useCallback(() => {
    const next = queueRef.current.shift() || null;
    if (!next) {
      busyRef.current = false;
      setCurrent(null);
      return;
    }
    busyRef.current = true;
    setCurrent(next);
    animRef.current.setValue(0);
    Animated.timing(animRef.current, {
      toValue: 1, duration: 250, useNativeDriver: true,
    }).start();
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (dismissRef.current) dismissRef.current();
    }, SHOW_MS);
  }, []);

  const dismiss = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    Animated.timing(animRef.current, {
      toValue: 0, duration: 180, useNativeDriver: true,
    }).start(() => showNext());
  }, [showNext]);

  useEffect(() => {
    dismissRef.current = dismiss;
  }, [dismiss]);

  const poll = useCallback(async () => {
    try {
      const data = await listNotifications();
      const items = data.notifications || [];
      if (seenRef.current === null) {
        // First poll: seed the seen set, never toast for pre-existing items.
        seenRef.current = new Set(items.map((n) => n.id));
        return;
      }
      const fresh = items.filter((n) => !n.is_read && !seenRef.current.has(n.id));
      if (fresh.length === 0) return;
      fresh.forEach((n) => {
        seenRef.current.add(n.id);
        markNotificationRead(n.id).catch(() => {});
      });
      queueRef.current.push(...fresh);
      if (!busyRef.current) showNext();
    } catch (e) {
      // offline / logged out — try again on the next poll
    }
  }, [showNext]);

  useEffect(() => {
    poll();
    const t = setInterval(poll, POLL_MS);
    return () => {
      clearInterval(t);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [poll]);

  const onTap = () => {
    const n = current;
    dismiss();
    if (n && n.type === 'ducked') router.push('/(tabs)/ducks');
  };

  if (!current) return null;

  const translateY = animRef.current.interpolate({
    inputRange: [0, 1],
    outputRange: [-160, 0],
  });

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.wrap,
        {
          top: insets.top + 8,
          transform: [{ translateY }],
          opacity: animRef.current,
        },
      ]}
    >
      <View style={styles.toastRow} pointerEvents="box-none">
        <TouchableOpacity style={styles.toast} activeOpacity={0.9} onPress={onTap}>
          <View style={styles.accent} />
          <View style={styles.textWrap}>
            <Text style={styles.title} numberOfLines={1}>{current.title}</Text>
            {!!current.body && (
              <Text style={styles.body} numberOfLines={2}>{current.body}</Text>
            )}
            <Text style={styles.hint}>Tap to view</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.closeBtn}
          onPress={dismiss}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="close" size={18} color="#8e8e93" />
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 60,
    elevation: 60,
  },
  toastRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  toast: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#1e1e1e',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#d4af37',
    paddingVertical: 12,
    paddingRight: 14,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  accent: {
    width: 4,
    backgroundColor: '#d4af37',
    borderTopLeftRadius: 14,
    borderBottomLeftRadius: 14,
    marginRight: 12,
  },
  textWrap: { flex: 1 },
  title: { color: '#fff', fontSize: 15, fontWeight: '800' },
  body: { color: '#bbb', fontSize: 13, marginTop: 3, lineHeight: 18 },
  hint: { color: '#d4af37', fontSize: 11, marginTop: 5, fontWeight: '600' },
  closeBtn: {
    marginLeft: 8,
    marginTop: 2,
    backgroundColor: '#1e1e1e',
    borderRadius: 16,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#2c2c2e',
  },
});
