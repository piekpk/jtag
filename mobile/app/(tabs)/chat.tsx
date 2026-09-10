import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, Modal, KeyboardAvoidingView, Platform, SafeAreaView } from 'react-native';
import { useRouter } from 'expo-router';

const NEARBY_RIGS = [
  { id: '1', name: '2023 Wrangler Rubicon', distance: '3.2 mi' },
  { id: '2', name: '2021 Gladiator Mojave', distance: '7.8 mi' },
  { id: '3', name: '2015 Wrangler Sahara', distance: '12.1 mi' },
];

const INITIAL_MESSAGES = [
  { id: '1', sender: 'TrailBoss99', text: 'Anyone hitting the trails this weekend?', reactions: {} },
  { id: '2', sender: 'MudCrawler', text: 'Thinking about heading up north.', reactions: { '🦆': 1 } },
];

export default function TrailChatScreen() {
  const router = useRouter();
  const [messages, setMessages] = useState(INITIAL_MESSAGES);
  const [inputText, setInputText] = useState('');
  const [showRigsModal, setShowRigsModal] = useState(false);
  const [activeReactionId, setActiveReactionId] = useState<string | null>(null);

  const sendMessage = () => {
    if (!inputText.trim()) return;
    const newMessage = { id: Date.now().toString(), sender: 'My 4xe Sahara', text: inputText, reactions: {} };
    setMessages([...messages, newMessage]);
    setInputText('');
  };

  const addReaction = (messageId: string, emoji: string) => {
    setMessages(messages.map(msg => {
      if (msg.id === messageId) {
        const currentCount = msg.reactions[emoji as keyof typeof msg.reactions] || 0;
        return { ...msg, reactions: { ...msg.reactions, [emoji]: currentCount + 1 } };
      }
      return msg;
    }));
    setActiveReactionId(null);
  };

  const renderMessage = ({ item }: { item: typeof INITIAL_MESSAGES[0] }) => (
    <View style={styles.messageCard}>
      <Text style={styles.sender}>{item.sender}</Text>
      <Text style={styles.messageText}>{item.text}</Text>
      <View style={styles.reactionsContainer}>
        {Object.entries(item.reactions).map(([emoji, count]) => (
          <View key={emoji} style={styles.reactionBadge}><Text style={styles.reactionText}>{emoji} {count as number}</Text></View>
        ))}
      </View>
      <View style={styles.reactionActions}>
        <TouchableOpacity onPress={() => setActiveReactionId(activeReactionId === item.id ? null : item.id)}>
          <Text style={styles.reactButton}>+ React</Text>
        </TouchableOpacity>
        {activeReactionId === item.id && (
          <View style={styles.emojiMenu}>
            <TouchableOpacity onPress={() => addReaction(item.id, '🦆')}><Text style={styles.emoji}>🦆</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => addReaction(item.id, '🚙')}><Text style={styles.emoji}>🚙</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => addReaction(item.id, '👋')}><Text style={styles.emoji}>👋</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => alert('Full emoji picker library will be integrated here!')}><Text style={styles.emoji}>...</Text></TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Trail Chat</Text>
        <TouchableOpacity style={styles.nearbyButton} onPress={() => setShowRigsModal(true)}>
          <Text style={styles.nearbyButtonText}>📍 Nearby (15mi)</Text>
        </TouchableOpacity>
      </View>

      <FlatList data={messages} keyExtractor={item => item.id} renderItem={renderMessage} contentContainerStyle={styles.chatList} />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.inputContainer}>
          <TextInput style={styles.input} placeholder="Message the trail..." value={inputText} onChangeText={setInputText} />
          <TouchableOpacity style={styles.sendButton} onPress={sendMessage}><Text style={styles.sendButtonText}>Send</Text></TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      <Modal visible={showRigsModal} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Rigs within 15 Miles</Text>
            {NEARBY_RIGS.map(rig => (
              <TouchableOpacity 
                key={rig.id} 
                style={styles.rigRow} 
                onPress={() => {
                  setShowRigsModal(false);
                  router.push(`/rig/${rig.id}`);
                }}
              >
                <Text style={styles.rigName}>{rig.name}</Text>
                <Text style={styles.rigDistance}>{rig.distance}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.closeModalBtn} onPress={() => setShowRigsModal(false)}>
              <Text style={styles.closeModalText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 15, backgroundColor: '#1a1a1a' },
  headerTitle: { fontSize: 22, fontWeight: 'bold', color: '#fff' },
  nearbyButton: { backgroundColor: '#4caf50', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20 },
  nearbyButtonText: { color: '#fff', fontWeight: 'bold' },
  chatList: { padding: 15 },
  messageCard: { backgroundColor: '#fff', padding: 15, borderRadius: 10, marginBottom: 12, elevation: 2 },
  sender: { fontWeight: 'bold', color: '#4caf50', marginBottom: 5 },
  messageText: { fontSize: 16, color: '#333' },
  reactionsContainer: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 },
  reactionBadge: { backgroundColor: '#e0e0e0', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4, marginRight: 6, marginBottom: 6 },
  reactionText: { fontSize: 12 },
  reactionActions: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  reactButton: { color: '#757575', fontSize: 14, fontWeight: '600', marginRight: 10 },
  emojiMenu: { flexDirection: 'row', backgroundColor: '#eeeeee', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  emoji: { fontSize: 20, marginHorizontal: 8 },
  inputContainer: { flexDirection: 'row', padding: 10, backgroundColor: '#fff', borderTopWidth: 1, borderColor: '#ddd' },
  input: { flex: 1, backgroundColor: '#f0f0f0', borderRadius: 20, paddingHorizontal: 15, fontSize: 16, marginRight: 10 },
  sendButton: { backgroundColor: '#1a1a1a', borderRadius: 20, paddingHorizontal: 20, justifyContent: 'center' },
  sendButtonText: { color: '#fff', fontWeight: 'bold' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 25, minHeight: 350 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
  rigRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#eee' },
  rigName: { fontSize: 16, fontWeight: '600', color: '#333' },
  rigDistance: { fontSize: 16, color: '#4caf50', fontWeight: 'bold' },
  closeModalBtn: { marginTop: 30, backgroundColor: '#1a1a1a', padding: 15, borderRadius: 10, alignItems: 'center' },
  closeModalText: { color: '#fff', fontSize: 16, fontWeight: 'bold' }
});