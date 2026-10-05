export default {
  "expo": {
    "name": "Jtap",
    "slug": "jtap",
    "version": "1.0.0",
    "orientation": "portrait",
    "userInterfaceStyle": "dark",
    "icon": "./assets/icon.png",
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
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#000000"
      },
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
      "expo-router",
      [
        "expo-notifications",
        {
          "icon": "./assets/icon.png",
          "color": "#D4AF37"
        }
      ]
    ],
    "scheme": "jtap",
    "extra": {
      "eas": {
        "projectId": "9624fd45-2657-443f-a384-bad43f4ff215"
      }
    }
  }
};