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
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../config.js';

export default function ChatScreen() {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [userId, setUserId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [activeMessageId, setActiveMessageId] = useState(null); // Tracks which message has the emoji picker open
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
      const response = await fetch(`${API_URL}/chat`, {
        headers: {
          'ngrok-skip-browser-warning': 'true',
        },
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
    fetchMessages(true);
    const intervalId = setInterval(() => {
      fetchMessages(false);
    }, 3000);
    return () => clearInterval(intervalId);
  }, []);

  const handleSendMessage = async () => {
    if (!inputText.trim() || !userId) return;

    const messageContent = inputText.trim();
    setInputText('');
    setIsSending(true);

    try {
      const response = await fetch(`${API_URL}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true',
        },
        body: JSON.stringify({
          user_id: parseInt(userId),
          message: messageContent,
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
    setActiveMessageId(null); // Close picker after choosing
    try {
      const response = await fetch(`${API_URL}/chat/${messageId}/react`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true',
        },
        body: JSON.stringify({ emoji: emojiKey }),
      });

      if (response.ok) {
        fetchMessages(false);
      }
    } catch (error) {
      console.error('Error reacting to message:', error);
    }
  };

  const renderMessageItem = ({ item }) => {
    const isMe = item.user_id?.toString() === userId?.toString();
    const reactions = item.reactions || {};
    const hasReactions = Object.values(reactions).some(count => count > 0);
    const isPickerOpen = activeMessageId === item.id;

    return (
      <View style={[styles.messageBubble, isMe ? styles.myMessage : styles.theirMessage]}>
        {!isMe && <Text style={styles.senderName}>{item.owner_name || 'Fellow Jeeper'}</Text>}
        <Text style={[styles.messageText, isMe ? styles.myMessageText : styles.theirMessageText]}>
          {item.message}
        </Text>

        {/* Existing Reactions Display */}
        {hasReactions && (
          <View style={styles.reactionDisplayRow}>
            {reactions['duck'] > 0 && <Text style={styles.badgeText}>🦆 {reactions['duck']}</Text>}
            {reactions['jeep'] > 0 && <Text style={styles.badgeText}>🚙 {reactions['jeep']}</Text>}
            {reactions['wave'] > 0 && <Text style={styles.badgeText}>👋 {reactions['wave']}</Text>}
          </View>
        )}

        {/* Action Row: Single Reaction Button + Popup Picker */}
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

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#4caf50" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Trail Chat</Text>
      </View>

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
            placeholder="Broadcast to nearby trails..."
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#121212' },
  header: { padding: 20, backgroundColor: '#1a1a1a', borderBottomWidth: 1, borderBottomColor: '#2c2c2e' },
  headerTitle: { fontSize: 22, fontWeight: 'bold', color: '#fff' },
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
});