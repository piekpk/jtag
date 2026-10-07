import AsyncStorage from '@react-native-async-storage/async-storage';

// Central auth helper: stores the JWT from login/signup and attaches it
// to every backend request as an Authorization: Bearer header.
export async function getAuthHeaders(asJson = true) {
  const token = await AsyncStorage.getItem('userToken');
  const headers = {
    'ngrok-skip-browser-warning': 'true',
  };
  if (asJson) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

export async function saveSession(userId, token) {
  await AsyncStorage.setItem('userId', userId.toString());
  if (token) {
    await AsyncStorage.setItem('userToken', token);
  }
}

export async function clearSession() {
  await AsyncStorage.removeItem('userId');
  await AsyncStorage.removeItem('userToken');
}
