import React from 'react';
import { View, StyleSheet } from 'react-native';
import DuckIcon from './DuckIcon';

/**
 * Transparent floating row of a user's showcased duck sprites.
 * No background, no text — the cover photo (or dark profile background)
 * shows straight through. Renders nothing when there are no ducks.
 */
export default function DuckShowcase({ ducks, size = 46 }) {
  if (!ducks || ducks.length === 0) return null;
  return (
    <View style={styles.row} pointerEvents="none">
      {ducks.map((d) => (
        <View key={d.id} style={styles.duck}>
          <DuckIcon duck={d} size={size} style={styles.sprite} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingVertical: 4,
  },
  duck: {
    marginHorizontal: 7,
    // iOS: soft drop shadow following the sprite's alpha. Android: no-op.
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.6,
    shadowRadius: 4,
  },
  sprite: {
    // Emoji fallback gets a matching shadow on both platforms.
    textShadowColor: 'rgba(0,0,0,0.75)',
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 5,
  },
});
