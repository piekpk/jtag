import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Modal, Animated } from 'react-native';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { showAlert } from '../themedAlert.js';
import {
  getMyPond, getTrades, acceptTrade, declineTrade, cancelTrade,
  getLeaderboard, getDuckFeed, rarityColor, getMilestones, celebrateMilestones,
} from '../duckApi.js';
import DuckIcon from '../DuckIcon';

const SECTIONS = ['Pond', 'Trades', 'Ranks', 'Feed', 'Rewards'];

// Rotating pond header banners (bundled assets).
const POND_HEADERS = [
  require('../assets/pond-headers/pond-dusk.webp'),
  require('../assets/pond-headers/pond-mud.webp'),
  require('../assets/pond-headers/pond-gold-ripple.webp'),
];
const POND_HEADER_KEY = 'jtap_pond_header_idx';

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
  const [selectedDuck, setSelectedDuck] = useState(null);
  const [headerIdx, setHeaderIdx] = useState(0);
  const headerFade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    AsyncStorage.getItem('userId').then(setMyUserId);
  }, []);

  // Load the user's chosen pond header; tapping the header switches it.
  useEffect(() => {
    AsyncStorage.getItem(POND_HEADER_KEY).then((v) => {
      const n = parseInt(v, 10);
      if (!Number.isNaN(n) && n >= 0 && n < POND_HEADERS.length) setHeaderIdx(n);
    }).catch(() => {});
  }, []);

  const chooseHeader = (i) => {
    const next = ((i % POND_HEADERS.length) + POND_HEADERS.length) % POND_HEADERS.length;
    if (next === headerIdx) return;
    Animated.timing(headerFade, { toValue: 0, duration: 250, useNativeDriver: true }).start(() => {
      setHeaderIdx(next);
      AsyncStorage.setItem(POND_HEADER_KEY, String(next)).catch(() => {});
      Animated.timing(headerFade, { toValue: 1, duration: 250, useNativeDriver: true }).start();
    });
  };

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
        <TouchableOpacity
          activeOpacity={0.95}
          onPress={() => chooseHeader(headerIdx + 1)}
          style={styles.pondHeader}
        >
          <Animated.Image
            source={POND_HEADERS[headerIdx]}
            style={[styles.pondHeaderImg, { opacity: headerFade }]}
            resizeMode="cover"
          />
          <View style={styles.pondHeaderDim} />
          <Text style={styles.pondSwitchHint}>tap to switch</Text>
          <View style={styles.pondHeaderTextWrap}>
            <Text style={styles.pondHeaderTitle}>Duck Pond</Text>
            <Text style={styles.pondHeaderSub}>
              {pond.unlocked} of {pond.total} ducks collected
            </Text>
          </View>
          <View style={styles.pondDots}>
            {POND_HEADERS.map((_, i) => (
              <View key={i} style={[styles.pondDot, i === headerIdx && styles.pondDotActive]} />
            ))}
          </View>
        </TouchableOpacity>
        <View style={styles.grid}>
          {pond.slots.map((slot) => {
            const d = slot.duck;
            const c = rarityColor(d.rarity);
            return (
              <TouchableOpacity key={d.id} style={[styles.duckCell, { borderColor: slot.unlocked ? c : '#333' }]}
                onPress={() => slot.unlocked && setSelectedDuck({ ...d, count: slot.count })}
                activeOpacity={slot.unlocked ? 0.7 : 1}>
                <DuckIcon duck={slot.unlocked ? d : { emoji: '🦆' }} size={40}
                  style={[!slot.unlocked && { opacity: 0.25 }]} />
                <Text style={styles.duckName} numberOfLines={1}>
                  {slot.unlocked ? d.name : '???'}
                </Text>
                {slot.unlocked && slot.count > 0 && (
                  <Text style={styles.duckCount}>×{slot.count}</Text>
                )}
                <Text style={[styles.rarityTag, { color: c }]}>{d.rarity}</Text>
              </TouchableOpacity>
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
              {t.offered.qty}× <DuckIcon duck={t.offered.duck} size={16} /> {t.offered.duck.name} ⇄ {t.requested.qty}× <DuckIcon duck={t.requested.duck} size={16} /> {t.requested.duck.name}
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
                  {t.offered.qty}× <DuckIcon duck={t.offered.duck} size={14} /> ⇄ {t.requested.qty}× <DuckIcon duck={t.requested.duck} size={14} /> — {t.status}
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
            {' with '}<DuckIcon duck={item.duck} size={16} /> {item.duck.name}
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

      {/* Duck lore modal (tap an unlocked pond duck) */}
      <Modal visible={!!selectedDuck} transparent animationType="fade"
        onRequestClose={() => setSelectedDuck(null)}>
        <View style={styles.loreOverlay}>
          <View style={styles.loreBox}>
            {selectedDuck && (
              <>
                <DuckIcon duck={selectedDuck} size={72} />
                <Text style={styles.loreName}>{selectedDuck.name}</Text>
                <Text style={[styles.loreRarity, { color: rarityColor(selectedDuck.rarity) }]}>
                  {selectedDuck.rarity}{selectedDuck.count > 0 ? ` • ×${selectedDuck.count}` : ''}
                </Text>
                {selectedDuck.description ? (
                  <Text style={styles.loreDesc}>{selectedDuck.description}</Text>
                ) : null}
                {selectedDuck.lore ? (
                  <Text style={styles.loreText}>{selectedDuck.lore}</Text>
                ) : (
                  <Text style={styles.lorePending}>Legend still being written…</Text>
                )}
                <TouchableOpacity style={styles.loreClose} onPress={() => setSelectedDuck(null)}>
                  <Text style={styles.loreCloseText}>Close</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
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
  pondHeader: { height: 170, borderRadius: 14, overflow: 'hidden', marginBottom: 12, backgroundColor: '#1e1e1e' },
  pondHeaderImg: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' },
  pondHeaderDim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.35)' },
  pondHeaderTextWrap: { position: 'absolute', left: 14, bottom: 12 },
  pondHeaderTitle: { color: '#fff', fontSize: 20, fontWeight: '900', letterSpacing: 0.5, textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  pondHeaderSub: { color: '#d4af37', fontSize: 13, fontWeight: '700', marginTop: 2, textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  pondDots: { position: 'absolute', right: 12, bottom: 14, flexDirection: 'row' },
  pondDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.4)', marginLeft: 5 },
  pondDotActive: { backgroundColor: '#d4af37' },
  pondSwitchHint: { position: 'absolute', top: 10, right: 12, fontSize: 10, color: 'rgba(255,255,255,0.65)', fontStyle: 'italic' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  duckCell: {
    width: '31%', aspectRatio: 0.85, backgroundColor: '#1e1e1e', borderRadius: 12,
    borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginBottom: 12, padding: 6,
  },
  duckEmoji: { fontSize: 36 },
  duckName: { color: '#fff', fontSize: 11, fontWeight: '600', marginTop: 6, textAlign: 'center' },
  duckCount: { color: '#d4af37', fontSize: 13, fontWeight: 'bold' },
  rarityTag: { fontSize: 10, textTransform: 'capitalize', marginTop: 2 },
  loreOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  loreBox: { backgroundColor: '#1e1e1e', borderRadius: 16, padding: 24, width: '100%', maxWidth: 340, alignItems: 'center', borderWidth: 1, borderColor: '#d4af37' },
  loreEmoji: { fontSize: 56 },
  loreName: { color: '#fff', fontSize: 20, fontWeight: '800', marginTop: 8 },
  loreRarity: { fontSize: 13, fontWeight: '700', textTransform: 'capitalize', marginTop: 4 },
  loreDesc: { color: '#d4af37', fontSize: 14, fontStyle: 'italic', textAlign: 'center', marginTop: 10 },
  loreText: { color: '#e0e0e0', fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 10 },
  lorePending: { color: '#8e8e93', fontSize: 13, fontStyle: 'italic', marginTop: 10 },
  loreClose: { backgroundColor: '#d4af37', borderRadius: 20, paddingVertical: 10, paddingHorizontal: 28, marginTop: 18 },
  loreCloseText: { color: '#121212', fontWeight: '700', fontSize: 14 },
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
