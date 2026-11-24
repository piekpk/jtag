import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Image,
  ActivityIndicator, SafeAreaView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { API_URL } from '../config.js';
import { getAuthHeaders } from '../auth.js';

// Same image-URL helper as Browse: rewrite stale local IPs, prefix
// relative upload paths with the API base.
const getImageUrl = (imagePath: string) => {
  if (!imagePath) return null;

  if (imagePath.includes('http://192.168.')) {
    return imagePath.replace(/http:\/\/192\.168\.\d+\.\d+:\d+/, API_URL);
  }

  if (imagePath.startsWith('http')) return imagePath;
  return `${API_URL}/${imagePath.startsWith('/') ? imagePath.slice(1) : imagePath}`;
};

// Squad profile screen (S4.2, #49). Display only: header + member
// grid from GET /squads/{id} (S4.1, #48). Join/Leave actions live in
// S2.2 (#45). A private squad the caller doesn't belong to answers
// 403 with no member data, so the screen shows its locked state.
export default function SquadProfileScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [squad, setSquad] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | ok | locked | notfound | error
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadSquad = useCallback(async () => {
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`${API_URL}/squads/${id}`, { headers });
      if (response.status === 403) {
        setStatus('locked');
        return;
      }
      if (response.status === 404) {
        setStatus('notfound');
        return;
      }
      if (!response.ok) {
        setStatus('error');
        return;
      }
      const data = await response.json();
      setSquad(data);
      setStatus('ok');
    } catch (e) {
      setStatus('error');
    }
  }, [id]);

  useEffect(() => {
    loadSquad();
  }, [loadSquad]);

  const onRefresh = async () => {
    setIsRefreshing(true);
    await loadSquad();
    setIsRefreshing(false);
  };

  if (status === 'loading') {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#d4af37" />
      </View>
    );
  }

  if (status === 'locked') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.lockIcon}>🔒</Text>
          <Text style={styles.lockTitle}>This squad is private</Text>
          <Text style={styles.lockText}>
            Only members can see its details.
          </Text>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (status !== 'ok' || !squad) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.lockTitle}>
            {status === 'notfound' ? 'Squad not found' : 'Could not load this squad'}
          </Text>
          <Text style={styles.lockText}>
            {status === 'notfound'
              ? 'It may have been deleted.'
              : 'Check your connection and try again.'}
          </Text>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const renderMember = ({ item }) => (
    <View style={styles.memberCard}>
      <View style={styles.memberAvatarContainer}>
        {item.profile_picture_url ? (
          <Image
            source={{
              uri: getImageUrl(item.profile_picture_url),
              headers: {
                'ngrok-skip-browser-warning': 'true',
                'User-Agent': 'JtapApp/1.0',
              },
            }}
            style={styles.memberAvatar}
          />
        ) : (
          <Text style={styles.memberAvatarPlaceholder}>🚙</Text>
        )}
      </View>
      <Text style={styles.memberName} numberOfLines={1}>
        {item.display_name || 'Fellow Jeeper'}
      </Text>
      <View style={[styles.roleBadge, item.role === 'leader' && styles.roleBadgeLeader]}>
        <Text style={[styles.roleText, item.role === 'leader' && styles.roleTextLeader]}>
          {item.role === 'leader' ? 'Leader' : 'Member'}
        </Text>
      </View>
      {item.joined_at ? (
        <Text style={styles.joinedText}>
          Joined {new Date(item.joined_at).toLocaleDateString()}
        </Text>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={squad.members}
        keyExtractor={(item) => String(item.user_id)}
        renderItem={renderMember}
        numColumns={2}
        columnWrapperStyle={styles.memberRow}
        contentContainerStyle={styles.content}
        refreshing={isRefreshing}
        onRefresh={onRefresh}
        ListHeaderComponent={
          <View>
            <View style={styles.header}>
              <View style={styles.avatarContainer}>
                {squad.avatar_url ? (
                  <Image
                    source={{
                      uri: getImageUrl(squad.avatar_url),
                      headers: {
                        'ngrok-skip-browser-warning': 'true',
                        'User-Agent': 'JtapApp/1.0',
                      },
                    }}
                    style={styles.avatar}
                  />
                ) : (
                  <Text style={styles.avatarPlaceholder}>🛡️</Text>
                )}
              </View>
              <Text style={styles.squadName}>
                {squad.name}{squad.is_private ? ' 🔒' : ''}
              </Text>
              {squad.description ? (
                <Text style={styles.description}>{squad.description}</Text>
              ) : null}
              <Text style={styles.memberCount}>
                {squad.member_count} {squad.member_count === 1 ? 'member' : 'members'}
                {squad.my_role ? ` · You are ${squad.my_role === 'leader' ? 'the leader' : 'a member'}` : ''}
              </Text>
            </View>
            <Text style={styles.sectionHeader}>Members</Text>
          </View>
        }
        ListEmptyComponent={
          <Text style={styles.emptyText}>No members to show.</Text>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  content: { padding: 20 },
  header: { alignItems: 'center', marginBottom: 20 },
  avatarContainer: {
    width: 88, height: 88, borderRadius: 44, backgroundColor: '#2c2c2e',
    justifyContent: 'center', alignItems: 'center', overflow: 'hidden', marginBottom: 14,
  },
  avatar: { width: '100%', height: '100%' },
  avatarPlaceholder: { fontSize: 40 },
  squadName: { fontSize: 26, fontWeight: '700', color: '#fff', textAlign: 'center' },
  description: { fontSize: 15, color: '#aaa', textAlign: 'center', marginTop: 8 },
  memberCount: { fontSize: 14, color: '#8e8e93', marginTop: 10 },
  sectionHeader: { fontSize: 18, fontWeight: 'bold', color: '#fff', marginBottom: 12 },
  memberRow: { justifyContent: 'space-between', marginBottom: 12 },
  memberCard: {
    width: '48%', backgroundColor: '#1e1e1e', borderRadius: 12,
    padding: 14, alignItems: 'center',
  },
  memberAvatarContainer: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: '#2c2c2e',
    justifyContent: 'center', alignItems: 'center', overflow: 'hidden', marginBottom: 10,
  },
  memberAvatar: { width: '100%', height: '100%' },
  memberAvatarPlaceholder: { fontSize: 26 },
  roleBadge: {
    backgroundColor: '#2c2c2e', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  roleBadgeLeader: { backgroundColor: '#D4AF37' },
  roleText: { fontSize: 13, fontWeight: '600', color: '#fff' },
  roleTextLeader: { color: '#121212' },
  memberName: { fontSize: 14, fontWeight: '600', color: '#fff', marginTop: 8, marginBottom: 8, textAlign: 'center' },
  joinedText: { fontSize: 12, color: '#8e8e93', marginTop: 8 },
  emptyText: { color: '#8e8e93', fontSize: 15, textAlign: 'center', marginTop: 12 },
  lockIcon: { fontSize: 44, marginBottom: 16 },
  lockTitle: { fontSize: 22, fontWeight: '700', color: '#fff', textAlign: 'center' },
  lockText: {
    fontSize: 15, color: '#aaa', textAlign: 'center', marginTop: 10, lineHeight: 21,
  },
  backBtn: {
    backgroundColor: '#D4AF37', borderRadius: 10,
    paddingVertical: 12, paddingHorizontal: 28, marginTop: 24,
  },
  backBtnText: { color: '#121212', fontSize: 16, fontWeight: '600' },
});
