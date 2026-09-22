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
  const flatListRef = useRef(null);

  // 1. Get logged-in user ID on mount
  useEffect(() => {
    const getUser = async () => {
      const storedId = await AsyncStorage.getItem('userId');
      setUserId(storedId);
    };
    getUser();
  }, []);

  // 2. Fetch messages function
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

  // 3. Set up HTTP Polling loop (fetches new messages every 3 seconds)
  useEffect(() => {
    fetchMessages(true); // Initial load with loader

    const intervalId = setInterval(() => {
      fetchMessages(false); // Background poll without loader
    }, 3000);

    return () => clearInterval(intervalId); // Cleanup interval on unmount
  }, []);

  // 4. Send message handler
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
        // Immediately fetch to update chat window with the new message
        fetchMessages(false);
      } else {
        console.error('Failed to send message');
      }
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setIsSending(false);
    }
  };

  const renderMessageItem = ({ item }) => {
    const isMe = item.user_id?.toString() === userId?.toString();

    return (
      <View style={[styles.messageBubble, isMe ? styles.myMessage : styles.theirMessage]}>
        {!isMe && <Text style={styles.senderName}>{item.owner_name || 'Fellow Jeeper'}</Text>}
        <Text style={[styles.messageText, isMe ? styles.myMessageText : styles.theirMessageText]}>
          {item.message}
        </Text>
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
  messageBubble: { maxWidth: '80%', padding: 12, borderRadius: 12, marginBottom: 10 },
  myMessage: { alignSelf: 'flex-end', backgroundColor: '#2e7d32' },
  theirMessage: { alignSelf: 'flex-start', backgroundColor: '#1e1e1e', borderWidth: 1, borderColor: '#333' },
  senderName: { fontSize: 12, fontWeight: 'bold', color: '#4caf50', marginBottom: 4 },
  messageText: { fontSize: 16 },
  myMessageText: { color: '#ffffff' },
  theirMessageText: { color: '#e0e0e0' },
  timestamp: { fontSize: 10, marginTop: 4, alignSelf: 'flex-end' },
  myTimestamp: { color: 'rgba(255, 255, 255, 0.7)' },
  theirTimestamp: { color: '#888' },
  inputContainer: { flexDirection: 'row', padding: 12, backgroundColor: '#1a1a1a', borderTopWidth: 1, borderTopColor: '#2c2c2e', alignItems: 'center' },
  input: { flex: 1, backgroundColor: '#2c2c2e', color: '#fff', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, fontSize: 16, marginRight: 10 },
  sendButton: { backgroundColor: '#4caf50', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  sendButtonDisabled: { backgroundColor: '#1b5e20', opacity: 0.5 },
  sendButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
});