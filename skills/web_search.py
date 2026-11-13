"""
Plugin 1: Web Search Skill (skills/web_search.py)
Python reference implementation matching the BaseSkill contract for Gemini Live.
"""
import os
from google import genai
from google.genai import types


class WebSearchSkill:
    name = "web_search"
    description = "Fetches real-time facts, news, or weather and returns a concise voice-friendly summary."
    decision_criteria = (
        "User asks for current weather, breaking news, real-time facts, sports scores, "
        "or explicitly asks to search the web or look something up."
    )
    filler_phrase = "Searching for that right now..."

    tool_declarations = [
        types.FunctionDeclaration(
            name="web_search",
            description="Fetch real-time facts, news, or weather and return a 2-3 sentence voice summary.",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "query": types.Schema(type=types.Type.STRING, description="Search query to look up."),
                    "category": types.Schema(type=types.Type.STRING, description="weather, news, or facts."),
                },
                required=["query"],
            ),
        )
    ]

    async def execute(self, **kwargs) -> dict:
        query = kwargs.get("query", "")
        client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"), http_options={"api_version": "v1beta"})
        response = client.models.generate_content(
            model="gemini-4-hydrogen",
            contents=(
                f"Search the web for: {query}. Return a concise, voice-friendly summary "
                "in 2 to 3 short sentences max with no markdown and no URLs."
            ),
            config=types.GenerateContentConfig(tools=[types.Tool(google_search=types.GoogleSearch())]),
        )
        return {"query": query, "summary": (response.text or "").strip()}
