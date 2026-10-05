import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, Modal, FlatList, ActivityIndicator, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
  listNotifications, markAllNotificationsRead, markNotificationRead,
} from './notificationsApi.js';

function timeAgo(iso) {
  if (!iso) return '';
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/**
 * Used as a custom tabBarButton: renders the 🔔 tab icon with an unread
 * badge, and hosts the notification inbox sheet. Tapping never navigates.
 */
export default function NotificationBell() {
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const data = await listNotifications();
      setItems(data.notifications || []);
      setUnread(data.unread || 0);
    } catch (e) {
      // offline / logged out — leave the badge as-is
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 30000);
    return () => clearInterval(t);
  }, [refresh]);

  const open = () => {
    setLoading(true);
    setVisible(true);
    refresh().finally(() => setLoading(false));
  };
  const close = () => {
    setVisible(false);
    refresh();
  };

  const markAll = async () => {
    try {
      await markAllNotificationsRead();
    } finally {
      refresh();
    }
  };

  const tapItem = async (n) => {
    if (!n.is_read) {
      markNotificationRead(n.id).catch(() => {});
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
      setUnread((u) => Math.max(0, u - 1));
    }
    if (n.type === 'ducked') {
      close();
      router.push('/(tabs)/ducks');
    }
  };

  return (
    <>
      <TouchableOpacity onPress={open} style={styles.tabBtn} activeOpacity={0.7}>
        <View>
          <Ionicons name="notifications-outline" size={24} color="#8e8e93" />
          {unread > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text>
            </View>
          )}
        </View>
        <Text style={styles.tabLabel}>Alerts</Text>
      </TouchableOpacity>

      <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Notifications</Text>
              <TouchableOpacity onPress={markAll}>
                <Text style={styles.markAll}>Mark all read</Text>
              </TouchableOpacity>
            </View>
            {loading ? (
              <ActivityIndicator size="large" color="#d4af37" style={{ marginVertical: 30 }} />
            ) : items.length === 0 ? (
              <Text style={styles.empty}>Nothing yet — you'll see it here when someone ducks you. 🦆</Text>
            ) : (
              <FlatList
                data={items}
                keyExtractor={(n) => String(n.id)}
                renderItem={({ item: n }) => (
                  <TouchableOpacity
                    style={[styles.row, !n.is_read && styles.rowUnread]}
                    onPress={() => tapItem(n)}
                    activeOpacity={0.8}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle}>{n.title}</Text>
                      {!!n.body && <Text style={styles.rowBody}>{n.body}</Text>}
                      <Text style={styles.rowTime}>{timeAgo(n.created_at)}</Text>
                    </View>
                    {!n.is_read && <View style={styles.dot} />}
                  </TouchableOpacity>
                )}
              />
            )}
            <TouchableOpacity style={styles.closeBtn} onPress={close}>
              <Text style={styles.closeText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  tabBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 6 },
  tabLabel: { color: '#8e8e93', fontSize: 10, marginTop: 2 },
  badge: {
    position: 'absolute', top: -6, right: -10, minWidth: 18, height: 18, borderRadius: 9,
    backgroundColor: '#d4af37', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4,
  },
  badgeText: { color: '#121212', fontSize: 10, fontWeight: '800' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#1e1e1e', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingTop: 16, paddingHorizontal: 16, paddingBottom: 20, maxHeight: '80%', minHeight: 320,
  },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  sheetTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  markAll: { color: '#d4af37', fontSize: 13, fontWeight: '600' },
  empty: { color: '#888', fontSize: 14, textAlign: 'center', marginVertical: 30, lineHeight: 20 },
  row: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#2c2c2e', flexDirection: 'row', alignItems: 'center' },
  rowUnread: { backgroundColor: 'rgba(212,175,55,0.06)' },
  rowTitle: { color: '#fff', fontSize: 15, fontWeight: '700' },
  rowBody: { color: '#aaa', fontSize: 13, marginTop: 3, lineHeight: 18 },
  rowTime: { color: '#666', fontSize: 11, marginTop: 4 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#d4af37', marginLeft: 10 },
  closeBtn: { marginTop: 12, backgroundColor: '#2c2c2e', borderRadius: 10, padding: 12, alignItems: 'center' },
  closeText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
