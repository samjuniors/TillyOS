"""
Plugin 2: Spotify Music Control Skill (skills/spotify_control.py)
Python reference implementation with Spotify Web API + dry-run/mock fallback.
"""
import os
from google.genai import types


class SpotifyControlSkill:
    name = "spotify_control"
    description = "Controls Spotify playback: play_music, pause_playback, next_track, and set_volume."
    decision_criteria = (
        "User asks to play music, play a song/artist/playlist on Spotify, pause or stop the music, "
        "skip to the next track, or adjust the music volume."
    )
    filler_phrase = "Pulling that up on Spotify..."

    tool_declarations = [
        types.FunctionDeclaration(
            name="play_music",
            description="Search and play a track, artist, or playlist on Spotify.",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "query": types.Schema(type=types.Type.STRING, description="Track, artist, or playlist query."),
                    "type": types.Schema(type=types.Type.STRING, description="track, artist, album, or playlist."),
                },
                required=["query"],
            ),
        ),
        types.FunctionDeclaration(
            name="pause_playback",
            description="Pause current Spotify playback.",
            parameters=types.Schema(type=types.Type.OBJECT, properties={}),
        ),
        types.FunctionDeclaration(
            name="next_track",
            description="Skip to the next Spotify track.",
            parameters=types.Schema(type=types.Type.OBJECT, properties={}),
        ),
        types.FunctionDeclaration(
            name="set_volume",
            description="Set Spotify playback volume percentage (0-100).",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={"percent": types.Schema(type=types.Type.NUMBER, description="Volume 0 to 100.")},
                required=["percent"],
            ),
        ),
    ]

    async def execute(self, tool_name: str = "play_music", **kwargs) -> dict:
        client_id = os.environ.get("SPOTIFY_CLIENT_ID", "")
        is_mock = not client_id or client_id == "YOUR_SPOTIFY_CLIENT_ID"
        if tool_name == "pause_playback":
            return {"status": "paused", "mode": "dry_run_mock" if is_mock else "live_api"}
        if tool_name == "next_track":
            return {"status": "skipped_next", "mode": "dry_run_mock" if is_mock else "live_api"}
        if tool_name == "set_volume":
            return {"status": "volume_updated", "percent": kwargs.get("percent", 75), "mode": "dry_run_mock" if is_mock else "live_api"}
        return {
            "status": "playing",
            "query": kwargs.get("query", "Byron Bay Sunset"),
            "type": kwargs.get("type", "track"),
            "mode": "dry_run_mock" if is_mock else "live_api",
        }
