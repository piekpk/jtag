export default {
  "expo": {
    "name": "Jtap",
    "slug": "jtap",
    "version": "1.0.0",
    "orientation": "portrait",
    "userInterfaceStyle": "dark",
    "ios": {
      "bundleIdentifier": "com.jtap.app",
      "supportsTablet": false,
      "infoPlist": {
        "NSLocationWhenInUseUsageDescription": "Jtap needs your location to find rigs nearby."
      },
      "config": {
        "googleMapsApiKey": process.env.GOOGLE_MAPS_API_KEY
      }
    },
    "android": {
      "package": "com.jtap.app",
      "permissions": [
        "ACCESS_FINE_LOCATION",
        "ACCESS_COARSE_LOCATION"
      ],
      "config": {
        "googleMaps": {
          "apiKey": process.env.GOOGLE_MAPS_API_KEY
        }
      }
    },
    "androidStatusBar": {
      "backgroundColor": "#121212",
      "barStyle": "light-content"
    },
    "plugins": [
      "expo-router"
    ],
    "scheme": "jtap",
    "extra": {
      "eas": {
        "projectId": "4ea1c11e-16e9-4174-9c9d-26f0b34bbfe8"
      }
    }
  }
};