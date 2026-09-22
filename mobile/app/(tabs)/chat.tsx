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
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { API_URL } from '../config.js';
import { getAuthHeaders } from '../auth.js';

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
  
  // Modal state for previewing profiles
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isProfileLoading, setIsProfileLoading] = useState(false);

  const flatListRef = useRef(null);

  useEffect(() => {
    const getUser = async () => {
      const storedId = await AsyncStorage.getItem('userId');
      setUserId(storedId);
    };
    getUser();
  }, []);

  const fetchMessages = async (isInitial = false) => {
    try {
      let url = `${API_URL}/chat?channel=${channel}`;
      if (channel === 'local') {
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
    fetchMessages(true);
    const intervalId = setInterval(() => {
      fetchMessages(false);
    }, 3000);
    return () => clearInterval(intervalId);
  }, [channel]);

  const handleSendMessage = async () => {
    if (!inputText.trim() || !userId) return;
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
          channel: channel,
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

  const renderMessageItem = ({ item }) => {
    const isMe = item.user_id?.toString() === userId?.toString();
    const reactions = item.reactions || {};
    const hasReactions = Object.values(reactions).some(count => count > 0);
    const isPickerOpen = activeMessageId === item.id;

    return (
      <View style={[styles.messageBubble, isMe ? styles.myMessage : styles.theirMessage]}>
        {!isMe && (
          <TouchableOpacity onPress={() => handleOpenProfilePreview(item.user_id)}>
            <Text style={styles.senderName}>{item.owner_name || 'Fellow Jeeper'} 🔍</Text>
          </TouchableOpacity>
        )}
        <Text style={[styles.messageText, isMe ? styles.myMessageText : styles.theirMessageText]}>
          {item.message}
        </Text>

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
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Trail Chat</Text>
        
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
        </View>
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#4caf50" />
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
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          />

          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder={channel === 'local' ? "Broadcast to local trail (10mi)..." : "Broadcast globally..."}
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
              <ActivityIndicator size="large" color="#4caf50" style={{ padding: 40 }} />
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
  header: { padding: 20, backgroundColor: '#1a1a1a', borderBottomWidth: 1, borderBottomColor: '#2c2c2e' },
  headerTitle: { fontSize: 22, fontWeight: 'bold', color: '#fff', marginBottom: 12 },
  tabContainer: { flexDirection: 'row', backgroundColor: '#2c2c2e', borderRadius: 8, padding: 4 },
  tabButton: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 6 },
  activeTab: { backgroundColor: '#4caf50' },
  tabText: { color: '#aaa', fontWeight: 'bold', fontSize: 14 },
  activeTabText: { color: '#fff' },
  keyboardContainer: { flex: 1 },
  messageList: { padding: 15, paddingBottom: 20 },
  messageBubble: { maxWidth: '85%', padding: 12, borderRadius: 12, marginBottom: 12 },
  myMessage: { alignSelf: 'flex-end', backgroundColor: '#2e7d32' },
  theirMessage: { alignSelf: 'flex-start', backgroundColor: '#1e1e1e', borderWidth: 1, borderColor: '#333' },
  senderName: { fontSize: 12, fontWeight: 'bold', color: '#4caf50', marginBottom: 4 },
  messageText: { fontSize: 16 },
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
  sendButton: { backgroundColor: '#4caf50', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  sendButtonDisabled: { backgroundColor: '#1b5e20', opacity: 0.5 },
  sendButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  // Modal Styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: '85%', backgroundColor: '#1e1e1e', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#333' },
  modalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#fff' },
  modalCloseText: { fontSize: 20, color: '#aaa', fontWeight: 'bold' },
  modalSubtitle: { fontSize: 14, color: '#4caf50', marginTop: 2, marginBottom: 15 },
  modalPhotoBox: { width: '100%', height: 160, backgroundColor: '#2c2c2e', borderRadius: 10, justifyContent: 'center', alignItems: 'center', overflow: 'hidden', marginBottom: 15 },
  modalPhoto: { width: '100%', height: '100%' },
  modalInfoRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  modalLabel: { fontSize: 16, color: '#aaa' },
  modalValue: { fontSize: 16, fontWeight: 'bold', color: '#ffeb3b' },
  modalButtonRow: { alignItems: 'center' },
  fullProfileBtn: { backgroundColor: '#2e7d32', width: '100%', paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  fullProfileBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
});