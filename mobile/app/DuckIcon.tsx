import React from 'react';
import { Text, Image } from 'react-native';
import { API_URL } from './config.js';

/**
 * Renders a duck's custom sprite image when it has one,
 * falling back to its emoji otherwise.
 */
export default function DuckIcon({ duck, size = 40, style = null }) {
  if (duck && duck.image_url) {
    return (
      <Image
        source={{ uri: `${API_URL}${duck.image_url}` }}
        style={[{ width: size, height: size, borderRadius: size / 6 }, style]}
        resizeMode="contain"
      />
    );
  }
  return <Text style={[{ fontSize: size }, style]}>{(duck && duck.emoji) || '🦆'}</Text>;
}
