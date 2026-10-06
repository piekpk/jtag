import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  RefreshControl, Modal, TextInput, Image, Animated,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { showAlert } from '../themedAlert.js';
import {
  listMarketplace, createListing, deleteListing, markListingSold, getListing,
  photoUrl, MARKET_CATEGORIES,
} from '../marketApi.js';

// Rotating marketplace header banners (bundled assets).
const MARKET_HEADERS = [
  require('../../assets/market-headers/market-parts.webp'),
  require('../../assets/market-headers/market-garage.webp'),
  require('../../assets/market-headers/market-tailgate.webp'),
];
const MARKET_HEADER_KEY = 'jtap_market_header_idx';

function timeAgo(iso) {
  if (!iso) return '';
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function formatPrice(p) {
  const n = Number(p);
  if (!n) return 'Free';
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export default function MarketScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [category, setCategory] = useState('All');
  const [myUserId, setMyUserId] = useState(null);
  const [selected, setSelected] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [zoomPhoto, setZoomPhoto] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [headerIdx, setHeaderIdx] = useState(0);
  const headerFade = useRef(new Animated.Value(1)).current;

  // Load the user's chosen marketplace header; tapping the header switches it.
  useEffect(() => {
    AsyncStorage.getItem(MARKET_HEADER_KEY).then((v) => {
      const n = parseInt(v, 10);
      if (!Number.isNaN(n) && n >= 0 && n < MARKET_HEADERS.length) setHeaderIdx(n);
    }).catch(() => {});
  }, []);

  const chooseHeader = (i) => {
    const next = ((i % MARKET_HEADERS.length) + MARKET_HEADERS.length) % MARKET_HEADERS.length;
    if (next === headerIdx) return;
    Animated.timing(headerFade, { toValue: 0, duration: 250, useNativeDriver: true }).start(() => {
      setHeaderIdx(next);
      AsyncStorage.setItem(MARKET_HEADER_KEY, String(next)).catch(() => {});
      Animated.timing(headerFade, { toValue: 1, duration: 250, useNativeDriver: true }).start();
    });
  };

  // create-form state
  const [cPhoto, setCPhoto] = useState(null);
  const [cTitle, setCTitle] = useState('');
  const [cPrice, setCPrice] = useState('');
  const [cCategory, setCCategory] = useState('Other');
  const [cDesc, setCDesc] = useState('');
  const [cContact, setCContact] = useState('');
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem('userId').then(setMyUserId);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(query.trim()), 400);
    return () => clearTimeout(t);
  }, [query]);

  // Open a specific listing when navigated here with ?listingId= (e.g. from a seller's profile).
  useEffect(() => {
    const openId = params.listingId;
    if (!openId) return;
    router.setParams({ listingId: undefined }); // consume once so refocus doesn't reopen
    (async () => {
      try {
        const listing = await getListing(openId);
        setSelected(listing);
      } catch (e) {
        // listing may be gone; fall through to the normal list
      }
    })();
  }, [params.listingId]);

  const load = useCallback(async () => {
    try {
      setLoadError(null);
      const data = await listMarketplace({ q: debouncedQ, category });
      setListings(data.listings || []);
    } catch (e) {
      setLoadError(e.message || 'Could not load marketplace.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [debouncedQ, category]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(); };

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      showAlert('Permission needed', 'Allow camera access to snap a photo of your item. Listings use live camera photos only, so buyers know every listing is real.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.8,
    });
    if (!result.canceled) setCPhoto(result.assets[0].uri);
  };

  const resetCreate = () => {
    setCPhoto(null); setCTitle(''); setCPrice('');
    setCCategory('Other'); setCDesc(''); setCContact('');
  };

  const handlePost = async () => {
    if (!cPhoto) { showAlert('Photo required', 'Add one photo of the item.'); return; }
    if (!cTitle.trim()) { showAlert('Title required', 'Give your listing a title.'); return; }
    if (!cDesc.trim()) { showAlert('Description required', 'Describe the item.'); return; }
    if (!cContact.trim()) { showAlert('Contact info required', 'Tell buyers how to reach you.'); return; }
    const price = parseFloat(cPrice);
    if (cPrice.trim() && (isNaN(price) || price < 0)) {
      showAlert('Invalid price', 'Enter a valid price (numbers only).'); return;
    }
    setPosting(true);
    try {
      await createListing({
        photoUri: cPhoto, title: cTitle.trim(), price: isNaN(price) ? 0 : price,
        description: cDesc.trim(), contactInfo: cContact.trim(), category: cCategory,
      });
      setShowCreate(false);
      resetCreate();
      load();
      showAlert('Posted', 'Your listing is live on the marketplace.');
    } catch (e) {
      showAlert('Post failed', e.message || 'Could not post your listing.');
    } finally {
      setPosting(false);
    }
  };

  const handleDelete = (listing) => {
    showAlert('Delete listing?', `"${listing.title}" will be removed permanently.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await deleteListing(listing.id);
            setSelected(null);
            load();
          } catch (e) {
            showAlert('Delete failed', e.message || 'Could not delete the listing.');
          }
        },
      },
    ]);
  };

  const handleToggleSold = async (listing) => {
    try {
      const updated = await markListingSold(listing.id, !listing.is_sold);
      setSelected(updated);
      load();
    } catch (e) {
      showAlert('Update failed', e.message || 'Could not update the listing.');
    }
  };

  const renderCard = (l) => {
    const isMine = myUserId && String(l.user_id) === String(myUserId);
    return (
      <TouchableOpacity key={l.id} style={styles.card} onPress={() => setSelected(l)} activeOpacity={0.85}>
        {photoUrl(l.photo_url) ? (
          <Image source={{ uri: photoUrl(l.photo_url) }} style={styles.photo} resizeMode="cover" />
        ) : (
          <View style={[styles.photo, styles.photoFallback]}><Text style={styles.photoEmoji}>🏷️</Text></View>
        )}
        {l.is_sold && (
          <View style={styles.soldBanner}><Text style={styles.soldText}>SOLD</Text></View>
        )}
        <View style={styles.cbody}>
          <View style={styles.row1}>
            <Text style={styles.title} numberOfLines={1}>{l.title}</Text>
            <Text style={styles.price}>{formatPrice(l.price)}</Text>
          </View>
          <Text style={styles.meta}>{l.seller_name} · {timeAgo(l.created_at)}</Text>
          <Text style={styles.desc} numberOfLines={2}>{l.description}</Text>
          <View style={styles.sellerRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{(l.seller_name || '?')[0].toUpperCase()}</Text>
            </View>
            <Text style={styles.sname} numberOfLines={1}>{l.seller_name}</Text>
            {isMine ? (
              <Text style={styles.mineTag}>Your listing</Text>
            ) : (
              <View style={styles.contactBtn}><Text style={styles.contactText}>Contact</Text></View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const isMineSelected = selected && myUserId && String(selected.user_id) === String(myUserId);

  return (
    <View style={styles.container}>
      <TouchableOpacity
        activeOpacity={0.95}
        onPress={() => chooseHeader(headerIdx + 1)}
        style={styles.marketHeader}
      >
        <Animated.Image
          source={MARKET_HEADERS[headerIdx]}
          style={[styles.marketHeaderImg, { opacity: headerFade }]}
          resizeMode="cover"
        />
        <View style={styles.marketHeaderDim} />
        <Text style={styles.marketSwitchHint}>tap to switch</Text>
        <View style={styles.marketHeaderTextWrap}>
          <Text style={styles.marketHeaderTitle}>Marketplace</Text>
        </View>
        <View style={styles.marketDots}>
          {MARKET_HEADERS.map((_, i) => (
            <View key={i} style={[styles.marketDot, i === headerIdx && styles.marketDotActive]} />
          ))}
        </View>
      </TouchableOpacity>
      <View style={styles.searchWrap}>
        <TextInput
          style={styles.search}
          placeholder="Search parts, gear, ducks…"
          placeholderTextColor="#8e8e93"
          value={query}
          onChangeText={setQuery}
          returnKeyType="search"
        />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}
        contentContainerStyle={styles.chips}>
        {MARKET_CATEGORIES.map((c) => (
          <TouchableOpacity key={c} style={[styles.chip, category === c && styles.chipOn]}
            onPress={() => setCategory(c)}>
            <Text style={[styles.chipText, category === c && styles.chipTextOn]}>{c}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color="#d4af37" /></View>
      ) : loadError ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{loadError}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => { setLoading(true); load(); }}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView style={styles.feed} contentContainerStyle={{ paddingBottom: 110 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh}
            tintColor="#d4af37" colors={['#d4af37']} />}>
          {listings.length === 0 ? (
            <Text style={styles.empty}>
              {debouncedQ || category !== 'All'
                ? 'No listings match your search.'
                : 'No listings yet. Tap + to post the first one.'}
            </Text>
          ) : listings.map(renderCard)}
        </ScrollView>
      )}

      <TouchableOpacity style={styles.fab} onPress={() => setShowCreate(true)} activeOpacity={0.8}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      {/* Detail modal */}
      <Modal visible={!!selected} animationType="slide" transparent
        onRequestClose={() => setSelected(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.detailBox}>
            <ScrollView>
              {selected && photoUrl(selected.photo_url) && (
                <TouchableOpacity onPress={() => setZoomPhoto(true)} activeOpacity={0.9}>
                  <Image source={{ uri: photoUrl(selected.photo_url) }} style={styles.detailPhoto} resizeMode="cover" />
                </TouchableOpacity>
              )}
              {selected && (
                <View style={styles.detailBody}>
                  <View style={styles.row1}>
                    <Text style={styles.detailTitle}>{selected.title}</Text>
                    <Text style={styles.price}>{formatPrice(selected.price)}</Text>
                  </View>
                  <Text style={styles.meta}>
                    {selected.seller_name} · {timeAgo(selected.created_at)} · {selected.category}
                    {selected.is_sold ? ' · SOLD' : ''}
                  </Text>
                  <Text style={styles.detailDesc}>{selected.description}</Text>
                  <Text style={styles.contactLabel}>CONTACT</Text>
                  <Text style={styles.contactInfo}>{selected.contact_info}</Text>
                  {isMineSelected && (
                    <View style={styles.ownerBtns}>
                      <TouchableOpacity style={styles.soldBtn} onPress={() => handleToggleSold(selected)}>
                        <Text style={styles.soldBtnText}>
                          {selected.is_sold ? 'Mark available' : 'Mark sold'}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(selected)}>
                        <Text style={styles.deleteBtnText}>Delete</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                  <TouchableOpacity style={styles.closeBtn} onPress={() => setSelected(null)}>
                    <Text style={styles.closeBtnText}>Close</Text>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Fullscreen photo zoom */}
      <Modal visible={zoomPhoto && !!selected} transparent animationType="fade"
        onRequestClose={() => setZoomPhoto(false)}>
        <TouchableOpacity style={styles.zoomBackdrop} activeOpacity={1} onPress={() => setZoomPhoto(false)}>
          <TouchableOpacity style={styles.zoomClose} onPress={() => setZoomPhoto(false)}>
            <Text style={styles.zoomCloseText}>✕</Text>
          </TouchableOpacity>
          {selected && photoUrl(selected.photo_url) && (
            <Image source={{ uri: photoUrl(selected.photo_url) }} style={styles.zoomImage} resizeMode="contain" />
          )}
        </TouchableOpacity>
      </Modal>

      {/* Create modal */}
      <Modal visible={showCreate} animationType="slide" transparent
        onRequestClose={() => setShowCreate(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.detailBox}>
            <ScrollView contentContainerStyle={{ paddingBottom: 8 }}>
              <Text style={styles.createTitle}>New Listing</Text>
              <TouchableOpacity style={styles.photoBox} onPress={takePhoto} activeOpacity={0.8}>
                {cPhoto ? (
                  <Image source={{ uri: cPhoto }} style={styles.photoPreview} resizeMode="cover" />
                ) : (
                  <>
                    <Text style={styles.photoBoxCam}>📷</Text>
                    <Text style={styles.photoBoxT1}>Tap to take a photo</Text>
                    <Text style={styles.photoBoxT2}>1 photo per listing</Text>
                  </>
                )}
              </TouchableOpacity>
              <Text style={styles.camNote}>📷 Camera only — no gallery uploads, so buyers know every listing is real.</Text>
              <Text style={styles.flabel}>Title</Text>
              <TextInput style={styles.field} placeholder="What are you selling?"
                placeholderTextColor="#8e8e93" value={cTitle} onChangeText={setCTitle} maxLength={120} />
              <Text style={styles.flabel}>Price</Text>
              <TextInput style={styles.field} placeholder="$ 0" placeholderTextColor="#8e8e93"
                value={cPrice} onChangeText={setCPrice} keyboardType="decimal-pad" />
              <Text style={styles.flabel}>Category</Text>
              <View style={styles.catWrap}>
                {MARKET_CATEGORIES.filter((c) => c !== 'All').map((c) => (
                  <TouchableOpacity key={c} style={[styles.chip, cCategory === c && styles.chipOn]}
                    onPress={() => setCCategory(c)}>
                    <Text style={[styles.chipText, cCategory === c && styles.chipTextOn]}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.flabel}>Description</Text>
              <TextInput style={[styles.field, styles.fieldBig]} multiline
                placeholder="Condition, fitment, mileage, reason for selling…"
                placeholderTextColor="#8e8e93" value={cDesc} onChangeText={setCDesc} textAlignVertical="top" />
              <Text style={styles.flabel}>Contact info</Text>
              <TextInput style={styles.field} placeholder="Phone, Messenger, or however buyers reach you"
                placeholderTextColor="#8e8e93" value={cContact} onChangeText={setCContact} />
              <TouchableOpacity style={[styles.postBtn, posting && { opacity: 0.6 }]}
                onPress={handlePost} disabled={posting} activeOpacity={0.85}>
                <Text style={styles.postBtnText}>{posting ? 'Posting…' : 'Post Listing'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => { setShowCreate(false); resetCreate(); }}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  marketHeader: { height: 150, overflow: 'hidden', backgroundColor: '#1e1e1e' },
  marketHeaderImg: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' },
  marketHeaderDim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.35)' },
  marketHeaderTextWrap: { position: 'absolute', left: 25, bottom: 14 },
  marketHeaderTitle: { fontSize: 26, fontWeight: '900', color: '#fff', letterSpacing: 0.5, textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  marketSwitchHint: { position: 'absolute', top: 10, right: 12, fontSize: 10, color: 'rgba(255,255,255,0.65)', fontStyle: 'italic' },
  marketDots: { position: 'absolute', right: 12, bottom: 16, flexDirection: 'row' },
  marketDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.4)', marginLeft: 5 },
  marketDotActive: { backgroundColor: '#d4af37' },
  searchWrap: { paddingHorizontal: 18, paddingTop: 12, backgroundColor: '#1a1a1a', paddingBottom: 4 },
  search: { backgroundColor: '#2c2c2e', borderRadius: 12, padding: 12, paddingLeft: 16, color: '#fff', fontSize: 15 },
  chipScroll: { backgroundColor: '#1a1a1a', maxHeight: 52 },
  chips: { flexDirection: 'row', gap: 8, paddingHorizontal: 18, paddingVertical: 10, alignItems: 'center' },
  chip: { backgroundColor: '#2c2c2e', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 18 },
  chipOn: { backgroundColor: '#d4af37' },
  chipText: { color: '#ccc', fontSize: 12.5, fontWeight: '600' },
  chipTextOn: { color: '#121212' },
  feed: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText: { color: '#e0e0e0', fontSize: 14, textAlign: 'center', marginBottom: 12 },
  retryBtn: { backgroundColor: '#d4af37', paddingVertical: 10, paddingHorizontal: 24, borderRadius: 20 },
  retryText: { color: '#121212', fontWeight: '700', fontSize: 14 },
  empty: { color: '#8e8e93', fontSize: 14, textAlign: 'center', marginTop: 40, paddingHorizontal: 32, lineHeight: 22 },
  card: { backgroundColor: '#1e1e1e', borderRadius: 14, marginHorizontal: 18, marginTop: 14, overflow: 'hidden', borderWidth: 1, borderColor: '#2a2a2c' },
  photo: { width: '100%', height: 190, backgroundColor: '#2c2c2e' },
  photoFallback: { alignItems: 'center', justifyContent: 'center' },
  photoEmoji: { fontSize: 52 },
  soldBanner: { position: 'absolute', top: 12, right: 0, backgroundColor: '#d4af37', paddingVertical: 4, paddingHorizontal: 14, borderTopLeftRadius: 8, borderBottomLeftRadius: 8 },
  soldText: { color: '#121212', fontWeight: '800', fontSize: 12 },
  cbody: { padding: 12, paddingBottom: 14 },
  row1: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  title: { fontSize: 15.5, fontWeight: '700', color: '#fff', flex: 1 },
  price: { fontSize: 16, fontWeight: '800', color: '#d4af37' },
  meta: { color: '#8e8e93', fontSize: 12, marginTop: 3 },
  desc: { color: '#c9c9ce', fontSize: 13, marginTop: 7, lineHeight: 19 },
  sellerRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 9 },
  avatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#d4af37', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#121212', fontWeight: '800', fontSize: 13 },
  sname: { fontSize: 13, color: '#e6e6e6', fontWeight: '600', flex: 1 },
  mineTag: { color: '#8e8e93', fontSize: 12, fontStyle: 'italic' },
  contactBtn: { borderWidth: 1, borderColor: '#d4af37', paddingVertical: 7, paddingHorizontal: 14, borderRadius: 16 },
  contactText: { color: '#d4af37', fontSize: 12.5, fontWeight: '700' },
  fab: { position: 'absolute', right: 20, bottom: 28, width: 58, height: 58, borderRadius: 29, backgroundColor: '#d4af37', alignItems: 'center', justifyContent: 'center', elevation: 6, shadowColor: '#d4af37', shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  fabText: { color: '#121212', fontSize: 30, fontWeight: '300', marginTop: -3 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  detailBox: { backgroundColor: '#1e1e1e', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '92%', paddingTop: 8 },
  detailPhoto: { width: '100%', height: 260, borderTopLeftRadius: 20, borderTopRightRadius: 20, backgroundColor: '#2c2c2e' },
  zoomBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', alignItems: 'center' },
  zoomImage: { width: '94%', height: '80%' },
  zoomClose: { position: 'absolute', top: 50, right: 20, zIndex: 2, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(212,175,55,0.9)', justifyContent: 'center', alignItems: 'center' },
  zoomCloseText: { color: '#121212', fontSize: 18, fontWeight: 'bold' },
  detailBody: { padding: 18, paddingBottom: 34 },
  detailTitle: { fontSize: 19, fontWeight: '800', color: '#fff', flex: 1 },
  detailDesc: { color: '#e0e0e0', fontSize: 14.5, lineHeight: 22, marginTop: 12 },
  contactLabel: { color: '#d4af37', fontSize: 12, fontWeight: '800', letterSpacing: 1, marginTop: 18 },
  contactInfo: { color: '#fff', fontSize: 15, fontWeight: '600', marginTop: 6, backgroundColor: '#2c2c2e', borderRadius: 10, padding: 12 },
  ownerBtns: { flexDirection: 'row', gap: 10, marginTop: 18 },
  soldBtn: { flex: 1, backgroundColor: '#2c2c2e', borderRadius: 10, padding: 13, alignItems: 'center' },
  soldBtnText: { color: '#d4af37', fontWeight: '700', fontSize: 14 },
  deleteBtn: { flex: 1, backgroundColor: 'transparent', borderWidth: 1, borderColor: '#5a2a2a', borderRadius: 10, padding: 13, alignItems: 'center' },
  deleteBtnText: { color: '#ff8a8a', fontWeight: '700', fontSize: 14 },
  closeBtn: { backgroundColor: '#d4af37', borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 14 },
  closeBtnText: { color: '#121212', fontWeight: '800', fontSize: 15 },
  createTitle: { color: '#fff', fontSize: 20, fontWeight: '800', padding: 18, paddingBottom: 6 },
  photoBox: { marginHorizontal: 18, borderWidth: 2, borderStyle: 'dashed', borderColor: '#d4af37', borderRadius: 14, height: 170, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1a1a1a', overflow: 'hidden' },
  photoBoxCam: { fontSize: 34 },
  photoBoxT1: { color: '#d4af37', fontWeight: '700', fontSize: 14, marginTop: 6 },
  photoBoxT2: { color: '#8e8e93', fontSize: 12, marginTop: 2 },
  camNote: { color: '#d4af37', fontSize: 12, marginTop: 6, marginBottom: 4 },
  photoPreview: { width: '100%', height: '100%' },
  flabel: { color: '#d4af37', fontSize: 12.5, fontWeight: '700', marginHorizontal: 18, marginTop: 14, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.6 },
  field: { marginHorizontal: 18, backgroundColor: '#2c2c2e', borderRadius: 10, padding: 13, color: '#fff', fontSize: 14.5 },
  fieldBig: { height: 96, textAlignVertical: 'top' },
  catWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginHorizontal: 18 },
  postBtn: { marginHorizontal: 18, marginTop: 20, backgroundColor: '#d4af37', borderRadius: 12, padding: 16, alignItems: 'center' },
  postBtnText: { color: '#121212', fontWeight: '800', fontSize: 16 },
  cancelBtn: { marginHorizontal: 18, marginTop: 10, marginBottom: 26, padding: 12, alignItems: 'center' },
  cancelBtnText: { color: '#8e8e93', fontWeight: '600', fontSize: 14 },
});
