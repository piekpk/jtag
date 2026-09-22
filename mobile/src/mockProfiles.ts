export interface UserProfile {
  id: string;
  displayName: string;
  vehicle: string;
  bio: string;
  images: (string | null)[];
  approxDistance: string;
  coords: {
    latitude: number;
    longitude: number;
  };
}

export const MOCK_PROFILES: UserProfile[] = [
  {
    id: 'user_1',
    displayName: 'TrailRunner4x4',
    vehicle: 'Jeep Wrangler Rubicon (JL)',
    bio: 'Always down for rocky trails and recovery runs.',
    images: [
      'https://picsum.photos/seed/jeep1/400/400',
      'https://picsum.photos/seed/jeep2/400/400',
      'https://picsum.photos/seed/jeep3/400/400',
      'https://picsum.photos/seed/jeep4/400/400',
    ],
    approxDistance: '0.8 mi',
    coords: { latitude: 40.7128, longitude: -73.3700 },
  },
  {
    id: 'user_2',
    displayName: 'MudSlinger99',
    vehicle: 'Jeep Cherokee (XJ)',
    bio: 'Stock wheels, 3-inch lift, and plenty of tow straps.',
    images: [
      'https://picsum.photos/seed/mud1/400/400',
      'https://picsum.photos/seed/mud2/400/400',
      'https://picsum.photos/seed/mud3/400/400',
      'https://picsum.photos/seed/mud4/400/400',
    ],
    approxDistance: '1.4 mi',
    coords: { latitude: 40.7180, longitude: -73.3620 },
  },
  {
    id: 'user_3',
    displayName: 'OverlandRig',
    vehicle: 'Jeep Gladiator Mojave',
    bio: 'Weekend camper and overlanding explorer.',
    images: [
      'https://picsum.photos/seed/over1/400/400',
      'https://picsum.photos/seed/over2/400/400',
      'https://picsum.photos/seed/over3/400/400',
      'https://picsum.photos/seed/over4/400/400',
    ],
    approxDistance: '2.1 mi',
    coords: { latitude: 40.7050, longitude: -73.3850 },
  },
  {
    id: 'user_4',
    displayName: 'SandCrawler',
    vehicle: 'Jeep Wrangler Sahara 4xe',
    bio: 'Beach permits, air compressors, and quiet trails.',
    images: [
      'https://picsum.photos/seed/sand1/400/400',
      'https://picsum.photos/seed/sand2/400/400',
      'https://picsum.photos/seed/sand3/400/400',
      'https://picsum.photos/seed/sand4/400/400',
    ],
    approxDistance: '3.5 mi',
    coords: { latitude: 40.7250, longitude: -73.3500 },
  },
  {
    id: 'user_5',
    displayName: 'SummitSeeker',
    vehicle: 'Jeep Wrangler TJ',
    bio: 'Simple setup built for mountain passes.',
    images: [
      'https://picsum.photos/seed/summit1/400/400',
      'https://picsum.photos/seed/summit2/400/400',
      'https://picsum.photos/seed/summit3/400/400',
      'https://picsum.photos/seed/summit4/400/400',
    ],
    approxDistance: '4.9 mi',
    coords: { latitude: 40.6980, longitude: -73.3900 },
  },
];
