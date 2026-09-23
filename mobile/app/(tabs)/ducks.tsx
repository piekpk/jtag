import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { showAlert } from '../themedAlert.js';
import {
  getMyPond, getTrades, acceptTrade, declineTrade, cancelTrade,
  getLeaderboard, getDuckFeed, rarityColor, getMilestones, celebrateMilestones,
} from '../duckApi.js';

const SECTIONS = ['Pond', 'Trades', 'Ranks', 'Feed', 'Rewards'];

export default function DucksScreen() {
  const [section, setSection] = useState('Pond');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [myUserId, setMyUserId] = useState(null);
  const [pond, setPond] = useState(null);
  const [trades, setTrades] = useState([]);
  const [board, setBoard] = useState([]);
  const [metric, setMetric] = useState('given');
  const [nearbyOnly, setNearbyOnly] = useState(false);
  const [feed, setFeed] = useState([]);
  const [milestones, setMilestones] = useState([]);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    AsyncStorage.getItem('userId').then(setMyUserId);
  }, []);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      if (section === 'Pond') setPond(await getMyPond());
      else if (section === 'Trades') setTrades(await getTrades('all'));
      else if (section === 'Ranks') {
        let params: { metric: string; lat?: number; lng?: number } = { metric };
        if (nearbyOnly) {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status === 'granted') {
            const pos = await Location.getCurrentPositionAsync({});
            params.lat = pos.coords.latitude;
            params.lng = pos.coords.longitude;
          }
        }
        setBoard(await getLeaderboard(params));
      }
      else if (section === 'Feed') setFeed(await getDuckFeed());
      else if (section === 'Rewards') setMilestones(await getMilestones());
    } catch (e) {
      console.error('Ducks load error:', e);
      setLoadError(e.message || 'Something went wrong loading ducks.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [section, metric, nearbyOnly]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(); };

  const handleTradeAction = async (tradeId, action, label) => {
    try {
      let result = null;
      if (action === 'accept') result = await acceptTrade(tradeId);
      else if (action === 'decline') await declineTrade(tradeId);
      else await cancelTrade(tradeId);
      showAlert('Done', label);
      if (result) celebrateMilestones(result.milestones_completed);
      load();
    } catch (e) {
      showAlert('Error', e.message || 'Trade action failed.');
    }
  };

  const renderPond = () => {
    if (!pond) return null;
    return (
      <View>
        <Text style={styles.sectionHead}>
          {pond.unlocked} of {pond.total} ducks collected
        </Text>
        <View style={styles.grid}>
          {pond.slots.map((slot) => {
            const d = slot.duck;
            const c = rarityColor(d.rarity);
            return (
              <View key={d.id} style={[styles.duckCell, { borderColor: slot.unlocked ? c : '#333' }]}>
                <Text style={[styles.duckEmoji, !slot.unlocked && { opacity: 0.25 }]}>
                  {slot.unlocked ? d.emoji : '🦆'}
                </Text>
                <Text style={styles.duckName} numberOfLines={1}>
                  {slot.unlocked ? d.name : '???'}
                </Text>
                {slot.unlocked && slot.count > 0 && (
                  <Text style={styles.duckCount}>×{slot.count}</Text>
                )}
                <Text style={[styles.rarityTag, { color: c }]}>{d.rarity}</Text>
              </View>
            );
          })}
        </View>
        <Text style={styles.hint}>
          Get ducked by other Jeepers, claim duck drops on the map, or trade to fill your pond.
        </Text>
      </View>
    );
  };

  const renderTrades = () => {
    const pending = trades.filter((t) => t.status === 'pending');
    const history = trades.filter((t) => t.status !== 'pending');
    return (
      <View>
        <Text style={styles.sectionHead}>Pending ({pending.length})</Text>
        {pending.length === 0 && <Text style={styles.empty}>No pending trades.</Text>}
        {pending.map((t) => {
          const isIncoming = myUserId && t.recipient_id.toString() === myUserId.toString();
          return (
          <View key={t.id} style={styles.card}>
            <Text style={styles.tradeTitle}>
              {isIncoming ? `${t.proposer_name} offers you` : `You offered ${t.recipient_name}`}
            </Text>
            <Text style={styles.tradeDetail}>
              {t.offered.qty}× {t.offered.duck.emoji} {t.offered.duck.name} ⇄ {t.requested.qty}× {t.requested.duck.emoji} {t.requested.duck.name}
            </Text>
            <View style={styles.tradeBtns}>
              {isIncoming ? (
                <>
                  <TouchableOpacity
                    style={[styles.smallBtn, { backgroundColor: '#d4af37' }]}
                    onPress={() => handleTradeAction(t.id, 'accept', 'Trade completed!')}
                  >
                    <Text style={styles.smallBtnTextDark}>Accept</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.smallBtn, styles.ghostBtn]}
                    onPress={() => handleTradeAction(t.id, 'decline', 'Trade declined.')}
                  >
                    <Text style={styles.smallBtnText}>Decline</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity
                  style={[styles.smallBtn, styles.ghostBtn]}
                  onPress={() => handleTradeAction(t.id, 'cancel', 'Trade cancelled.')}
                >
                  <Text style={styles.smallBtnText}>Cancel offer</Text>
                </TouchableOpacity>
              )}
            </View>
            <Text style={styles.expiry}>Expires {new Date(t.expires_at).toLocaleDateString()}</Text>
          </View>
          );
        })}
        {history.length > 0 && (
          <View>
            <Text style={styles.sectionHead}>History</Text>
            {history.slice(0, 20).map((t) => (
              <View key={t.id} style={[styles.card, { opacity: 0.7 }]}>
                <Text style={styles.tradeDetail}>
                  {t.offered.qty}× {t.offered.duck.emoji} ⇄ {t.requested.qty}× {t.requested.duck.emoji} — {t.status}
                </Text>
              </View>
            ))}
          </View>
        )}
        <Text style={styles.hint}>
          Propose trades from another Jeeper's rig page.
        </Text>
      </View>
    );
  };

  const renderRanks = () => (
    <View>
      <View style={styles.toggleRow}>
        {['given', 'received'].map((m) => (
          <TouchableOpacity
            key={m}
            style={[styles.toggle, metric === m && styles.toggleActive]}
            onPress={() => { setMetric(m); }}
          >
            <Text style={[styles.toggleText, metric === m && styles.toggleTextActive]}>
              Most {m}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <TouchableOpacity style={styles.nearbyToggle} onPress={() => setNearbyOnly(!nearbyOnly)}>
        <Text style={styles.nearbyToggleText}>
          {nearbyOnly ? '📍 Nearby only (50km)' : '🌐 Everyone'}
        </Text>
      </TouchableOpacity>
      {board.length === 0 && <Text style={styles.empty}>No duck activity yet. Be the first!</Text>}
      {board.map((row, i) => (
        <View key={row.user_id} style={styles.rankRow}>
          <Text style={[styles.rankNum, i < 3 && { color: '#d4af37' }]}>#{i + 1}</Text>
          <Text style={styles.rankName}>{row.name}</Text>
          <Text style={styles.rankScore}>🦆 {row.ducks}</Text>
        </View>
      ))}
    </View>
  );

  const renderRewards = () => {
    const tracks = ['Activity', 'Collection'];
    return (
      <View>
        {tracks.map((track) => (
          <View key={track}>
            <Text style={styles.sectionHead}>{track}</Text>
            {milestones.filter((m) => m.track === track).map((m) => {
              const pct = Math.min(100, Math.round((m.progress / m.target) * 100));
              return (
                <View key={m.key} style={[styles.card, m.claimed && styles.msClaimed]}>
                  <View style={styles.msRow}>
                    <Text style={styles.msName}>{m.name}</Text>
                    {m.claimed ? (
                      <Text style={styles.msCheck}>✓ claimed</Text>
                    ) : (
                      <Text style={styles.msCount}>{Math.min(m.progress, m.target)}/{m.target}</Text>
                    )}
                  </View>
                  <Text style={styles.msDesc}>{m.description}</Text>
                  <View style={styles.msBar}>
                    <View style={[styles.msFill, { width: `${pct}%` }]} />
                  </View>
                  <Text style={styles.msReward}>🎁 {m.reward}</Text>
                </View>
              );
            })}
          </View>
        ))}
      </View>
    );
  };

  const renderFeed = () => (
    <View>
      {feed.length === 0 && <Text style={styles.empty}>No duck activity yet.</Text>}
      {feed.map((item) => (
        <View key={item.id} style={styles.card}>
          <Text style={styles.feedText}>
            <Text style={{ fontWeight: 'bold', color: '#fff' }}>{item.giver_name}</Text>
            {' ducked '}
            <Text style={{ fontWeight: 'bold', color: '#fff' }}>{item.recipient_name}</Text>
            {' with '}{item.duck.emoji} {item.duck.name}
          </Text>
          {item.note ? <Text style={styles.feedNote}>"{item.note}"</Text> : null}
        </View>
      ))}
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>🦆 Duck Pond</Text>
      </View>
      <View style={styles.segRow}>
        {SECTIONS.map((s) => (
          <TouchableOpacity
            key={s}
            style={[styles.seg, section === s && styles.segActive]}
            onPress={() => { setSection(s); setLoading(true); }}
          >
            <Text style={[styles.segText, section === s && styles.segTextActive]}>{s}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {loading ? (
        <ActivityIndicator size="large" color="#d4af37" style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          style={styles.body}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#d4af37" />}
        >
          {!!loadError && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{loadError}</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={() => { setLoading(true); load(); }}>
                <Text style={styles.retryText}>Try again</Text>
              </TouchableOpacity>
            </View>
          )}
          {section === 'Pond' && renderPond()}
          {section === 'Trades' && renderTrades()}
          {section === 'Ranks' && renderRanks()}
          {section === 'Feed' && renderFeed()}
          {section === 'Rewards' && renderRewards()}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  errorBox: { margin: 16, padding: 16, backgroundColor: '#1e1e1e', borderRadius: 12, borderWidth: 1, borderColor: '#d4af37', alignItems: 'center' },
  errorText: { color: '#e0e0e0', fontSize: 14, textAlign: 'center', marginBottom: 12 },
  retryBtn: { backgroundColor: '#d4af37', paddingVertical: 10, paddingHorizontal: 24, borderRadius: 20 },
  retryText: { color: '#121212', fontWeight: '700', fontSize: 14 },
  msRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  msName: { color: '#fff', fontWeight: '700', fontSize: 15 },
  msCheck: { color: '#d4af37', fontWeight: '700', fontSize: 12 },
  msCount: { color: '#aaa', fontWeight: '600', fontSize: 13 },
  msDesc: { color: '#ccc', fontSize: 13, marginBottom: 8 },
  msBar: { height: 8, backgroundColor: '#2c2c2e', borderRadius: 4, overflow: 'hidden', marginBottom: 8 },
  msFill: { height: '100%', backgroundColor: '#d4af37', borderRadius: 4 },
  msReward: { color: '#d4af37', fontSize: 13, fontWeight: '600' },
  msClaimed: { opacity: 0.65 },
  container: { flex: 1, backgroundColor: '#121212' },
  header: { padding: 25, paddingTop: 50, backgroundColor: '#1a1a1a' },
  title: { fontSize: 28, fontWeight: '900', color: '#ffffff', letterSpacing: 1 },
  segRow: { flexDirection: 'row', backgroundColor: '#1a1a1a', paddingHorizontal: 15, paddingBottom: 12 },
  seg: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 20, marginHorizontal: 3, backgroundColor: '#2c2c2e' },
  segActive: { backgroundColor: '#d4af37' },
  segText: { color: '#aaa', fontWeight: '600', fontSize: 13 },
  segTextActive: { color: '#121212' },
  body: { flex: 1, padding: 15 },
  sectionHead: { color: '#d4af37', fontSize: 16, fontWeight: 'bold', marginBottom: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  duckCell: {
    width: '31%', aspectRatio: 0.85, backgroundColor: '#1e1e1e', borderRadius: 12,
    borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginBottom: 12, padding: 6,
  },
  duckEmoji: { fontSize: 36 },
  duckName: { color: '#fff', fontSize: 11, fontWeight: '600', marginTop: 6, textAlign: 'center' },
  duckCount: { color: '#d4af37', fontSize: 13, fontWeight: 'bold' },
  rarityTag: { fontSize: 10, textTransform: 'capitalize', marginTop: 2 },
  hint: { color: '#757575', fontSize: 13, marginTop: 8, lineHeight: 20 },
  empty: { color: '#757575', fontSize: 14, marginVertical: 10 },
  card: { backgroundColor: '#1e1e1e', borderRadius: 12, padding: 15, marginBottom: 10 },
  tradeTitle: { color: '#fff', fontWeight: 'bold', fontSize: 15, marginBottom: 6 },
  tradeDetail: { color: '#ccc', fontSize: 14, lineHeight: 20 },
  tradeBtns: { flexDirection: 'row', marginTop: 10 },
  smallBtn: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8, marginRight: 8 },
  ghostBtn: { backgroundColor: '#2c2c2e', borderWidth: 1, borderColor: '#444' },
  smallBtnText: { color: '#fff', fontWeight: '600' },
  smallBtnTextDark: { color: '#121212', fontWeight: 'bold' },
  expiry: { color: '#757575', fontSize: 12, marginTop: 8 },
  toggleRow: { flexDirection: 'row', marginBottom: 10 },
  toggle: { flex: 1, padding: 10, alignItems: 'center', backgroundColor: '#1e1e1e', borderRadius: 8, marginRight: 8 },
  toggleActive: { backgroundColor: '#d4af37' },
  toggleText: { color: '#aaa', fontWeight: '600', textTransform: 'capitalize' },
  toggleTextActive: { color: '#121212' },
  nearbyToggle: { alignSelf: 'flex-start', marginBottom: 12, padding: 8 },
  nearbyToggleText: { color: '#d4af37', fontWeight: '600' },
  rankRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e1e1e', borderRadius: 8, padding: 12, marginBottom: 8 },
  rankNum: { color: '#888', fontWeight: 'bold', width: 40, fontSize: 16 },
  rankName: { color: '#fff', flex: 1, fontSize: 15 },
  rankScore: { color: '#d4af37', fontWeight: 'bold' },
  feedText: { color: '#ccc', fontSize: 14, lineHeight: 20 },
  feedNote: { color: '#888', fontStyle: 'italic', marginTop: 4 },
});
