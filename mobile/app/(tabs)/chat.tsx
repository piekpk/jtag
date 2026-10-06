import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  FlatList,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Modal,
  Image,
  Animated,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { API_URL } from '../config.js';
import { getAuthHeaders } from '../auth.js';

// Rotating chat header banners (bundled assets).
const CHAT_HEADERS = [
  require('../assets/chat-headers/chat-signal.webp'),
  require('../assets/chat-headers/chat-overlook.webp'),
  require('../assets/chat-headers/chat-windshield.webp'),
];
const CHAT_HEADER_KEY = 'jtap_chat_header_idx';

// Helper function to safely format image URLs
const getImageUrl = (imagePath: string) => {
  if (!imagePath) return null;
  if (imagePath.includes('http://192.168.')) {
    return imagePath.replace(/http:\/\/192\.168\.\d+\.\d+:\d+/, API_URL);
  }
  if (imagePath.startsWith('http')) return imagePath;
  return `${API_URL}/${imagePath.startsWith('/') ? imagePath.slice(1) : imagePath}`;
};

export default function ChatScreen() {
  const router = useRouter();
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [userId, setUserId] = useState(null);
  const [channel, setChannel] = useState('global');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [activeMessageId, setActiveMessageId] = useState(null);
  const [headerIdx, setHeaderIdx] = useState(0);
  const headerFade = useRef(new Animated.Value(1)).current;

  // Load the user's chosen chat header; tapping the header switches it.
  useEffect(() => {
    AsyncStorage.getItem(CHAT_HEADER_KEY).then((v) => {
      const n = parseInt(v, 10);
      if (!Number.isNaN(n) && n >= 0 && n < CHAT_HEADERS.length) setHeaderIdx(n);
    }).catch(() => {});
  }, []);

  const chooseHeader = (i) => {
    const next = ((i % CHAT_HEADERS.length) + CHAT_HEADERS.length) % CHAT_HEADERS.length;
    if (next === headerIdx) return;
    Animated.timing(headerFade, { toValue: 0, duration: 250, useNativeDriver: true }).start(() => {
      setHeaderIdx(next);
      AsyncStorage.setItem(CHAT_HEADER_KEY, String(next)).catch(() => {});
      Animated.timing(headerFade, { toValue: 1, duration: 250, useNativeDriver: true }).start();
    });
  };

  // 'global' | 'local' | 'bot'. The bot DM's real channel is `bot:<userId>`.
  const apiChannel = channel === 'bot' ? (userId ? `bot:${userId}` : null) : channel;
  const isBotDm = channel === 'bot';
  
  // Modal state for previewing profiles
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isProfileLoading, setIsProfileLoading] = useState(false);

  const flatListRef = useRef(null);
  const messageCountRef = useRef(0); // tracks last-seen count so auto-scroll only fires on new messages
  const isNearBottomRef = useRef(true); // false once the user scrolls up to read history

  // Track whether the user is currently near the bottom of the chat.
  const handleChatScroll = (e) => {
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
    const distanceFromBottom = contentSize.height - (layoutMeasurement.height + contentOffset.y);
    isNearBottomRef.current = distanceFromBottom < 80;
  };

  useEffect(() => {
    const getUser = async () => {
      const storedId = await AsyncStorage.getItem('userId');
      setUserId(storedId);
    };
    getUser();
  }, []);

  const fetchMessages = async (isInitial = false) => {
    if (!apiChannel) {
      if (isInitial) setIsLoading(false);
      return;
    }
    try {
      let url = `${API_URL}/chat?channel=${encodeURIComponent(apiChannel)}`;
      if (apiChannel === 'local') {
        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          let location = await Location.getCurrentPositionAsync({});
          url += `&lat=${location.coords.latitude}&lng=${location.coords.longitude}`;
        }
      }

      const response = await fetch(url, {
        headers: await getAuthHeaders(),
      });
      if (response.ok) {
        const data = await response.json();
        setMessages(data);
      }
    } catch (error) {
      console.error('Failed to fetch messages:', error);
    } finally {
      if (isInitial) setIsLoading(false);
    }
  };

  useEffect(() => {
    setIsLoading(true);
    messageCountRef.current = 0; // fresh channel load should land at the bottom
    isNearBottomRef.current = true;
    fetchMessages(true);
    const intervalId = setInterval(() => {
      fetchMessages(false);
    }, 3000);
    return () => clearInterval(intervalId);
  }, [apiChannel]);

  const handleSendMessage = async () => {
    if (!inputText.trim() || !userId || !apiChannel) return;
    const messageContent = inputText.trim();
    setInputText('');
    setIsSending(true);

    try {
      const response = await fetch(`${API_URL}/chat`, {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({
          user_id: parseInt(userId),
          message: messageContent,
          channel: apiChannel,
        }),
      });

      if (response.ok) {
        fetchMessages(false);
      }
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setIsSending(false);
    }
  };

  const handleReaction = async (messageId, emojiKey) => {
    setActiveMessageId(null);
    try {
      await fetch(`${API_URL}/chat/${messageId}/react`, {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({ emoji: emojiKey }),
      });
      fetchMessages(false);
    } catch (error) {
      console.error('Error reacting to message:', error);
    }
  };

  // Fetch target user profile and show modal preview
  const handleOpenProfilePreview = async (targetUserId) => {
    setIsProfileLoading(true);
    setIsModalVisible(true);
    try {
      const response = await fetch(`${API_URL}/users/${targetUserId}/profile`, {
        headers: await getAuthHeaders(),
      });
      if (response.ok) {
        const data = await response.json();
        setSelectedProfile(data);
      }
    } catch (error) {
      console.error('Failed to load profile preview:', error);
    } finally {
      setIsProfileLoading(false);
    }
  };

  const openPlaceSearchOnMap = async (searchId) => {
    try {
      const response = await fetch(`${API_URL}/places/searches/${searchId}`, {
        headers: await getAuthHeaders(),
      });
      if (!response.ok) return;
      const search = await response.json();
      router.push({
        pathname: '/(tabs)/map',
        params: { placePins: JSON.stringify({ category: search.category, results: search.results }) },
      });
    } catch (e) {
      console.log('openPlaceSearchOnMap failed', e);
    }
  };

  const renderMessageItem = ({ item }) => {
    const isMe = item.user_id?.toString() === userId?.toString();
    const reactions = item.reactions || {};
    const hasReactions = Object.values(reactions).some(count => count > 0);
    const isPickerOpen = activeMessageId === item.id;

    const mapMatch = !isMe && typeof item.message === 'string' && item.message.match(/\[map:(\d+)\]/);
    const cleanMessage = typeof item.message === 'string' ? item.message.replace(/\[map:\d+\]/g, '').trim() : item.message;
    return (
      <View style={[styles.messageBubble, isMe ? styles.myMessage : styles.theirMessage]}>
        {!isMe && (
          <TouchableOpacity onPress={() => handleOpenProfilePreview(item.user_id)}>
            <Text style={styles.senderName}>{item.owner_name || 'Fellow Jeeper'} 🔍</Text>
          </TouchableOpacity>
        )}
        <Text style={[styles.messageText, isMe ? styles.myMessageText : styles.theirMessageText]}>
          {cleanMessage}
        </Text>
        {mapMatch && (
          <TouchableOpacity style={styles.mapLinkButton} onPress={() => openPlaceSearchOnMap(mapMatch[1])}>
            <Text style={styles.mapLinkText}>🗺️ View on map</Text>
          </TouchableOpacity>
        )}

        {hasReactions && (
          <View style={styles.reactionDisplayRow}>
            {reactions['duck'] > 0 && <Text style={styles.badgeText}>🦆 {reactions['duck']}</Text>}
            {reactions['jeep'] > 0 && <Text style={styles.badgeText}>🚙 {reactions['jeep']}</Text>}
            {reactions['wave'] > 0 && <Text style={styles.badgeText}>👋 {reactions['wave']}</Text>}
          </View>
        )}

        <View style={styles.actionRow}>
          <TouchableOpacity 
            onPress={() => setActiveMessageId(isPickerOpen ? null : item.id)} 
            style={styles.reactToggleButton}
          >
            <Text style={styles.reactToggleText}>{isPickerOpen ? '✕' : '👍 React'}</Text>
          </TouchableOpacity>

          {isPickerOpen && (
            <View style={styles.emojiPickerPopup}>
              <TouchableOpacity onPress={() => handleReaction(item.id, 'duck')} style={styles.emojiOption}>
                <Text style={styles.emojiOptionText}>🦆</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleReaction(item.id, 'jeep')} style={styles.emojiOption}>
                <Text style={styles.emojiOptionText}>🚙</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleReaction(item.id, 'wave')} style={styles.emojiOption}>
                <Text style={styles.emojiOptionText}>👋</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <Text style={[styles.timestamp, isMe ? styles.myTimestamp : styles.theirTimestamp]}>
          {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <TouchableOpacity
        activeOpacity={0.95}
        onPress={() => chooseHeader(headerIdx + 1)}
        style={styles.chatHeader}
      >
        <Animated.Image
          source={CHAT_HEADERS[headerIdx]}
          style={[styles.chatHeaderImg, { opacity: headerFade }]}
          resizeMode="cover"
        />
        <View style={styles.chatHeaderDim} />
        <Text style={styles.chatSwitchHint}>tap to switch</Text>
        <View style={styles.chatHeaderTextWrap}>
          <Text style={styles.chatHeaderTitle}>Trail Chat</Text>
        </View>
        <View style={styles.chatDots}>
          {CHAT_HEADERS.map((_, i) => (
            <View key={i} style={[styles.chatDot, i === headerIdx && styles.chatDotActive]} />
          ))}
        </View>
      </TouchableOpacity>
      <View style={styles.tabBar}>
        <View style={styles.tabContainer}>
          <TouchableOpacity 
            style={[styles.tabButton, channel === 'global' && styles.activeTab]}
            onPress={() => setChannel('global')}
          >
            <Text style={[styles.tabText, channel === 'global' && styles.activeTabText]}>Global</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.tabButton, channel === 'local' && styles.activeTab]}
            onPress={() => setChannel('local')}
          >
            <Text style={[styles.tabText, channel === 'local' && styles.activeTabText]}>Local (10 mi)</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.tabButton, channel === 'bot' && styles.activeTab]}
            onPress={() => setChannel('bot')}
          >
            <Text style={[styles.tabText, channel === 'bot' && styles.activeTabText]}>🤖 JtapBot</Text>
          </TouchableOpacity>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#d4af37" />
        </View>
      ) : (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardContainer}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        >
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item, index) => item.id?.toString() || index.toString()}
            renderItem={renderMessageItem}
            contentContainerStyle={styles.messageList}
            // Local channel and bot DM always follow new messages; global only
            // follows when the user is already near the bottom.
            onContentSizeChange={() => {
              const grew = messages.length > messageCountRef.current;
              messageCountRef.current = messages.length;
              if (grew && (channel !== 'global' || isNearBottomRef.current)) {
                flatListRef.current?.scrollToEnd({ animated: true });
              }
            }}
            onScroll={handleChatScroll}
            scrollEventThrottle={16}
          />

          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder={isBotDm ? "Ask JtapBot anything..." : channel === 'local' ? "Broadcast to local trail (10mi)..." : "Broadcast globally..."}
              placeholderTextColor="#888"
              value={inputText}
              onChangeText={setInputText}
            />
            <TouchableOpacity
              style={[styles.sendButton, (!inputText.trim() || isSending) && styles.sendButtonDisabled]}
              onPress={handleSendMessage}
              disabled={!inputText.trim() || isSending}
            >
              {isSending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.sendButtonText}>Send</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      )}

      {/* Profile Preview Modal Popup */}
      <Modal
        visible={isModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {isProfileLoading || !selectedProfile ? (
              <ActivityIndicator size="large" color="#d4af37" style={{ padding: 40 }} />
            ) : (
              <>
                <View style={styles.modalHeaderRow}>
                  <Text style={styles.modalTitle}>{selectedProfile.settings?.ownerName || 'Fellow Jeeper'}</Text>
                  <TouchableOpacity onPress={() => setIsModalVisible(false)}>
                    <Text style={styles.modalCloseText}>✕</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.modalSubtitle}>{selectedProfile.settings?.vehicleTitle || 'Jeep Wrangler'}</Text>

                {/* Profile Photo Preview */}
                <View style={styles.modalPhotoBox}>
                  {selectedProfile.profile_picture_url || selectedProfile.settings?.photos?.[0] ? (
                    <Image 
                      source={{ 
                        uri: getImageUrl(selectedProfile.profile_picture_url || selectedProfile.settings.photos[0]),
                        headers: { 'ngrok-skip-browser-warning': 'true' }
                      }} 
                      style={styles.modalPhoto} 
                    />
                  ) : (
                    <Text style={{ color: '#888' }}>🚙 No Photo</Text>
                  )}
                </View>

                <View style={styles.modalInfoRow}>
                  <Text style={styles.modalLabel}>Ducks Received:</Text>
                  <Text style={styles.modalValue}>🦆 {selectedProfile.settings?.duckCount || 0}</Text>
                </View>

                <View style={styles.modalButtonRow}>
                  <TouchableOpacity 
                    style={styles.fullProfileBtn} 
                    onPress={() => {
                      setIsModalVisible(false);
                      router.push(`/rig/${selectedProfile.id}`);
                    }}
                  >
                    <Text style={styles.fullProfileBtnText}>View Full Rig Profile</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#121212' },
  chatHeader: { height: 150, overflow: 'hidden', backgroundColor: '#1e1e1e' },
  chatHeaderImg: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' },
  chatHeaderDim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.35)' },
  chatHeaderTextWrap: { position: 'absolute', left: 20, bottom: 14 },
  chatHeaderTitle: { fontSize: 22, fontWeight: '900', color: '#fff', letterSpacing: 0.5, textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  chatSwitchHint: { position: 'absolute', top: 10, right: 12, fontSize: 10, color: 'rgba(255,255,255,0.65)', fontStyle: 'italic' },
  chatDots: { position: 'absolute', right: 12, bottom: 16, flexDirection: 'row' },
  chatDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.4)', marginLeft: 5 },
  chatDotActive: { backgroundColor: '#d4af37' },
  tabBar: { paddingHorizontal: 20, paddingVertical: 12, backgroundColor: '#1a1a1a', borderBottomWidth: 1, borderBottomColor: '#2c2c2e' },
  tabContainer: { flexDirection: 'row', backgroundColor: '#2c2c2e', borderRadius: 8, padding: 4 },
  tabButton: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 6 },
  activeTab: { backgroundColor: '#d4af37' },
  tabText: { color: '#aaa', fontWeight: 'bold', fontSize: 14 },
  activeTabText: { color: '#121212' },
  keyboardContainer: { flex: 1 },
  messageList: { padding: 15, paddingBottom: 20 },
  messageBubble: { maxWidth: '85%', padding: 12, borderRadius: 12, marginBottom: 12 },
  myMessage: { alignSelf: 'flex-end', backgroundColor: '#8a6d1f' },
  theirMessage: { alignSelf: 'flex-start', backgroundColor: '#1e1e1e', borderWidth: 1, borderColor: '#333' },
  senderName: { fontSize: 12, fontWeight: 'bold', color: '#d4af37', marginBottom: 4 },
  messageText: { fontSize: 16 },
  mapLinkButton: {
    marginTop: 8, alignSelf: 'flex-start', backgroundColor: '#2a2417',
    borderWidth: 1, borderColor: '#d4af37', borderRadius: 16, paddingVertical: 6, paddingHorizontal: 12,
  },
  mapLinkText: { color: '#d4af37', fontSize: 14, fontWeight: '600' },
  myMessageText: { color: '#ffffff' },
  theirMessageText: { color: '#e0e0e0' },
  reactionDisplayRow: { flexDirection: 'row', marginTop: 6, flexWrap: 'wrap' },
  badgeText: { fontSize: 12, color: '#ffeb3b', backgroundColor: 'rgba(0,0,0,0.3)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, marginRight: 6, marginTop: 4 },
  actionRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  reactToggleButton: { paddingHorizontal: 8, paddingVertical: 4, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 6 },
  reactToggleText: { fontSize: 12, color: '#aaa', fontWeight: '600' },
  emojiPickerPopup: { flexDirection: 'row', backgroundColor: '#2c2c2e', borderRadius: 8, padding: 4, marginLeft: 8, borderWidth: 1, borderColor: '#444' },
  emojiOption: { paddingHorizontal: 8, paddingVertical: 2 },
  emojiOptionText: { fontSize: 16 },
  timestamp: { fontSize: 10, marginTop: 6, alignSelf: 'flex-end' },
  myTimestamp: { color: 'rgba(255, 255, 255, 0.7)' },
  theirTimestamp: { color: '#888' },
  inputContainer: { flexDirection: 'row', padding: 12, backgroundColor: '#1a1a1a', borderTopWidth: 1, borderTopColor: '#2c2c2e', alignItems: 'center' },
  input: { flex: 1, backgroundColor: '#2c2c2e', color: '#fff', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, fontSize: 16, marginRight: 10 },
  sendButton: { backgroundColor: '#d4af37', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  sendButtonDisabled: { backgroundColor: '#5c4a12', opacity: 0.5 },
  sendButtonText: { color: '#121212', fontWeight: 'bold', fontSize: 14 },
  // Modal Styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: '85%', backgroundColor: '#1e1e1e', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#333' },
  modalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#fff' },
  modalCloseText: { fontSize: 20, color: '#aaa', fontWeight: 'bold' },
  modalSubtitle: { fontSize: 14, color: '#d4af37', marginTop: 2, marginBottom: 15 },
  modalPhotoBox: { width: '100%', height: 160, backgroundColor: '#2c2c2e', borderRadius: 10, justifyContent: 'center', alignItems: 'center', overflow: 'hidden', marginBottom: 15 },
  modalPhoto: { width: '100%', height: '100%' },
  modalInfoRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  modalLabel: { fontSize: 16, color: '#aaa' },
  modalValue: { fontSize: 16, fontWeight: 'bold', color: '#ffeb3b' },
  modalButtonRow: { alignItems: 'center' },
  fullProfileBtn: { backgroundColor: '#d4af37', width: '100%', paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  fullProfileBtnText: { color: '#121212', fontWeight: 'bold', fontSize: 16 },
});