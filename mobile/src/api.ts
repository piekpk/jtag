import { MOCK_PROFILES, UserProfile } from './mockProfiles';

const API_BASE_URL = 'http://192.168.86.34:8000'; // Target backend server IP & port

export const ApiService = {
  async updateLocation(userId: string, lat: number, lon: number) {
    try {
      const res = await fetch(`${API_BASE_URL}/api/users/${userId}/location`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ latitude: lat, longitude: lon }),
      });
      return await res.json();
    } catch {
      // Fallback to local state if backend isn't actively running
      return { success: true, localOnly: true };
    }
  },

  async getNearbyUsers(lat: number, lon: number, radiusMiles = 15): Promise<UserProfile[]> {
    try {
      const res = await fetch(`${API_BASE_URL}/api/proximity?lat=${lat}&lon=${lon}&radius=${radiusMiles}`);
      if (!res.ok) throw new Error();
      return await res.json();
    } catch {
      return MOCK_PROFILES;
    }
  }
};
