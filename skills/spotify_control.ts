import { FunctionDeclaration, Type } from '@google/genai';
import { BaseSkill, SkillExecutionContext, SkillExecutionResult } from './base_skill.ts';

interface SpotifyPlaybackState {
  isPlaying: boolean;
  trackName: string;
  artistName: string;
  albumName: string;
  trackType: string;
  volumePercent: number;
  spotifyUri: string;
  queueIndex: number;
}

const CURATED_TRACK_LIBRARY = [
  {
    trackName: 'Byron Bay Sunset',
    artistName: 'Xavier Rudd & Coastal Acoustic',
    albumName: 'Southern Cross Sessions',
    spotifyUri: 'spotify:track:4uLU6hMCjMI75M1A2tKUQC',
  },
  {
    trackName: 'The Less I Know The Better',
    artistName: 'Tame Impala',
    albumName: 'Currents',
    spotifyUri: 'spotify:track:6K4t31amVTZDgR3sKmwUJJ',
  },
  {
    trackName: 'Innerbloom',
    artistName: 'RÜFÜS DU SOL',
    albumName: 'Bloom',
    spotifyUri: 'spotify:track:5CG9Ps5lN8K2O4T8uJ5B9m',
  },
  {
    trackName: 'Down Under (Acoustic Sunrise Mix)',
    artistName: 'Colin Hay',
    albumName: 'Man @ Work',
    spotifyUri: 'spotify:track:3UmaczJpikHgJFyBTAJVoz',
  },
  {
    trackName: 'Big Jet Plane',
    artistName: 'Angus & Julia Stone',
    albumName: 'Down the Way',
    spotifyUri: 'spotify:track:5N8nNu2aP0fF5dRhb1E8zG',
  },
];

/**
 * Plugin 2: Spotify Music Control Skill (`spotify_control`)
 * Supports OAuth user token (`context.oauthTokens.spotify`) for real Spotify Connect playback
 * (`play_music`, `pause_playback`, `next_track`, `set_volume`), client-credentials catalog search,
 * or interactive dry-run mode synced with Matilda's WebAudio synthesizer.
 */
export class SpotifyControlSkill extends BaseSkill {
  readonly name = 'spotify_control';
  readonly oauthProvider = 'spotify' as const;

  readonly description =
    'Controls Spotify music playback via OAuth or companion audio engine: play tracks/artists/playlists, pause, skip next track, and set volume.';

  readonly decision_criteria =
    'User asks to play music, play a song/artist/playlist on Spotify, pause or stop the music, skip to the next track/song, or change/set the music volume.';

  readonly filler_phrase = 'Pulling that up on Spotify for you now...';

  private state: SpotifyPlaybackState = {
    isPlaying: false,
    trackName: CURATED_TRACK_LIBRARY[0].trackName,
    artistName: CURATED_TRACK_LIBRARY[0].artistName,
    albumName: CURATED_TRACK_LIBRARY[0].albumName,
    trackType: 'track',
    volumePercent: 75,
    spotifyUri: CURATED_TRACK_LIBRARY[0].spotifyUri,
    queueIndex: 0,
  };

  readonly tool_declarations: FunctionDeclaration[] = [
    {
      name: 'play_music',
      description: 'Search for and start playing a song, artist, album, or playlist on Spotify.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          query: {
            type: Type.STRING,
            description:
              'Song title, artist, vibe, or playlist name to play (e.g. "Tame Impala", "relaxing coastal acoustic").',
          },
          type: {
            type: Type.STRING,
            description: 'Type of media to play: "track", "artist", "album", or "playlist". Defaults to "track".',
          },
        },
        required: ['query'],
      },
    },
    {
      name: 'pause_playback',
      description: 'Pause the currently playing Spotify music track.',
      parameters: {
        type: Type.OBJECT,
        properties: {},
      },
    },
    {
      name: 'next_track',
      description: 'Skip to the next song in the Spotify playback queue.',
      parameters: {
        type: Type.OBJECT,
        properties: {},
      },
    },
    {
      name: 'set_volume',
      description: 'Set the Spotify playback volume percentage between 0 and 100.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          percent: {
            type: Type.NUMBER,
            description: 'Target volume level from 0 (mute) to 100 (maximum).',
          },
        },
        required: ['percent'],
      },
    },
  ];

  private hasClientCredentials(): boolean {
    const id = process.env.SPOTIFY_CLIENT_ID || '';
    const secret = process.env.SPOTIFY_CLIENT_SECRET || '';
    return Boolean(id && secret) && !id.startsWith('YOUR_') && !secret.startsWith('YOUR_');
  }

  private async fetchClientCredentialsToken(): Promise<string | null> {
    if (!this.hasClientCredentials()) return null;
    try {
      const basicAuth = Buffer.from(
        `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
      ).toString('base64');
      const res = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basicAuth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
      });
      if (!res.ok) return null;
      const data: any = await res.json();
      return data.access_token || null;
    } catch {
      return null;
    }
  }

  async execute(
    toolName: string,
    args: Record<string, any>,
    context?: SkillExecutionContext
  ): Promise<SkillExecutionResult> {
    const startTime = Date.now();
    const userOAuthToken = context?.oauthTokens?.spotify || null;
    const clientToken = userOAuthToken ? null : await this.fetchClientCredentialsToken();
    const token = userOAuthToken || clientToken;
    const mode = userOAuthToken ? 'oauth_api' : token ? 'live_api' : 'dry_run_mock';

    let resolvedTool = toolName;
    if (!['play_music', 'pause_playback', 'next_track', 'set_volume'].includes(resolvedTool)) {
      const lower = (context?.userInput || '').toLowerCase();
      if (/\b(pause|stop|mute)\b/i.test(lower)) resolvedTool = 'pause_playback';
      else if (/\b(next|skip)\b/i.test(lower)) resolvedTool = 'next_track';
      else if (/\b(volume|louder|quieter)\b/i.test(lower)) resolvedTool = 'set_volume';
      else resolvedTool = 'play_music';
    }

    if (resolvedTool === 'play_music') {
      const query = String(args?.query || context?.userInput || 'Byron Bay Sunset').trim();
      const mediaType = String(args?.type || 'track');

      if (token) {
        try {
          const searchUrl = `https://api.spotify.com/v1/search?q=${encodeURIComponent(
            query
          )}&type=${encodeURIComponent(mediaType)}&limit=1`;
          const searchRes = await fetch(searchUrl, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (searchRes.ok) {
            const searchData: any = await searchRes.json();
            const firstItem =
              searchData?.tracks?.items?.[0] ||
              searchData?.playlists?.items?.[0] ||
              searchData?.albums?.items?.[0];
            if (firstItem) {
              this.state = {
                ...this.state,
                isPlaying: true,
                trackName: firstItem.name,
                artistName:
                  firstItem.artists?.map((a: any) => a.name).join(', ') ||
                  firstItem.owner?.display_name ||
                  'Spotify',
                albumName: firstItem.album?.name || mediaType,
                trackType: mediaType,
                spotifyUri: firstItem.uri || 'spotify:track:live',
              };
              if (userOAuthToken) {
                await fetch('https://api.spotify.com/v1/me/player/play', {
                  method: 'PUT',
                  headers: {
                    Authorization: `Bearer ${userOAuthToken}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify(
                    mediaType === 'track'
                      ? { uris: [this.state.spotifyUri] }
                      : { context_uri: this.state.spotifyUri }
                  ),
                }).catch(() => {});
              }
            }
          }
        } catch {}
      }

      if (!token || !this.state.isPlaying) {
        const lowerQ = query.toLowerCase();
        const matched =
          CURATED_TRACK_LIBRARY.find(
            (t) =>
              lowerQ.includes(t.trackName.toLowerCase()) ||
              lowerQ.includes(t.artistName.toLowerCase())
          ) ||
          (lowerQ.includes('tame')
            ? CURATED_TRACK_LIBRARY[1]
            : lowerQ.includes('rufus') || lowerQ.includes('innerbloom')
            ? CURATED_TRACK_LIBRARY[2]
            : lowerQ.includes('stone')
            ? CURATED_TRACK_LIBRARY[4]
            : {
                trackName:
                  query
                    .replace(/^(hey\s+tilly|hey\s+sofia|play|put\s+on|start|spotify)\s+/i, '')
                    .trim() || 'Byron Bay Sunset',
                artistName: 'Spotify Session Mix',
                albumName: 'Companion Stream',
                spotifyUri: `spotify:track:session_${Date.now().toString(36)}`,
              });

        this.state = {
          ...this.state,
          isPlaying: true,
          trackName: matched.trackName,
          artistName: matched.artistName,
          albumName: matched.albumName,
          trackType: mediaType,
          spotifyUri: matched.spotifyUri,
        };
      }

      return {
        skillName: this.name,
        toolName: 'play_music',
        args: { query, type: mediaType },
        success: true,
        voiceSummary: `Playing ${this.state.trackName} by ${this.state.artistName} on Spotify now.`,
        data: {
          ...this.state,
          oauthConnected: Boolean(userOAuthToken),
        },
        uiAction: {
          type: 'play_music',
          param: `${this.state.trackName} — ${this.state.artistName}`,
        },
        executionTimeMs: Date.now() - startTime,
        mode,
      };
    }

    if (resolvedTool === 'pause_playback') {
      if (userOAuthToken) {
        await fetch('https://api.spotify.com/v1/me/player/pause', {
          method: 'PUT',
          headers: { Authorization: `Bearer ${userOAuthToken}` },
        }).catch(() => {});
      }
      this.state.isPlaying = false;
      return {
        skillName: this.name,
        toolName: 'pause_playback',
        args: {},
        success: true,
        voiceSummary: `Paused Spotify playback on ${this.state.trackName}.`,
        data: { ...this.state, oauthConnected: Boolean(userOAuthToken) },
        uiAction: { type: 'pause_music' },
        executionTimeMs: Date.now() - startTime,
        mode,
      };
    }

    if (resolvedTool === 'next_track') {
      if (userOAuthToken) {
        await fetch('https://api.spotify.com/v1/me/player/next', {
          method: 'POST',
          headers: { Authorization: `Bearer ${userOAuthToken}` },
        }).catch(() => {});
      }
      this.state.queueIndex = (this.state.queueIndex + 1) % CURATED_TRACK_LIBRARY.length;
      const nextItem = CURATED_TRACK_LIBRARY[this.state.queueIndex];
      this.state = {
        ...this.state,
        isPlaying: true,
        trackName: nextItem.trackName,
        artistName: nextItem.artistName,
        albumName: nextItem.albumName,
        spotifyUri: nextItem.spotifyUri,
      };
      return {
        skillName: this.name,
        toolName: 'next_track',
        args: {},
        success: true,
        voiceSummary: `Skipped to the next track: ${this.state.trackName} by ${this.state.artistName}.`,
        data: { ...this.state, oauthConnected: Boolean(userOAuthToken) },
        uiAction: {
          type: 'play_music',
          param: `${this.state.trackName} — ${this.state.artistName}`,
        },
        executionTimeMs: Date.now() - startTime,
        mode,
      };
    }

    const rawPercent = typeof args?.percent === 'number' ? args.percent : 65;
    const clampedPercent = Math.max(0, Math.min(100, Math.round(rawPercent)));
    if (userOAuthToken) {
      await fetch(
        `https://api.spotify.com/v1/me/player/volume?volume_percent=${clampedPercent}`,
        {
          method: 'PUT',
          headers: { Authorization: `Bearer ${userOAuthToken}` },
        }
      ).catch(() => {});
    }
    this.state.volumePercent = clampedPercent;
    return {
      skillName: this.name,
      toolName: 'set_volume',
      args: { percent: clampedPercent },
      success: true,
      voiceSummary: `Set Spotify volume to ${clampedPercent} percent.`,
      data: { ...this.state, oauthConnected: Boolean(userOAuthToken) },
      executionTimeMs: Date.now() - startTime,
      mode,
    };
  }
}

export default new SpotifyControlSkill();
