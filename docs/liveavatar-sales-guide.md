# LiveAvatar sales guide setup

VranceFlex uses LiveAvatar Embed mode on the public landing page. The application receives only the safe iframe URL; the LiveAvatar API key must remain outside browser code and deployment variables prefixed with `NEXT_PUBLIC_`.

## 1. Create the conversational context

Run this from a trusted terminal, replacing the API key:

```bash
curl -X POST https://api.liveavatar.com/v1/contexts \
  -H "X-API-KEY: $LIVEAVATAR_API_KEY" \
  -H "Content-Type: application/json" \
  -d @- <<'JSON'
{
  "prompt": "You are the public AI product guide for VranceFlex, an agent-led B2B prospecting and outreach preparation platform. Explain how VranceFlex studies an offer, researches a market, finds and verifies potential buyers, prepares personalized email and SMS sequences, and requires human approval before outreach. Ask brief qualifying questions about the visitor's product, audience, market, and outreach goal. Be concise, helpful, and accurate. Never claim that outreach has been sent unless a real provider has confirmed it, never promise outcomes or guaranteed lead accuracy, and never request passwords, API keys, provider credentials, contact lists, or sensitive customer data. Tell interested visitors to use the Start a campaign or Create an account controls beside the conversation. If asked, clearly say that you are an AI avatar."
}
JSON
```

Copy the returned `context_id`.

## 2. Create the embed

For a free sandbox embedding, use LiveAvatar's sandbox embed avatar:

```bash
curl -X POST https://api.liveavatar.com/v2/embeddings \
  -H "X-API-KEY: $LIVEAVATAR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "avatar_id": "65f9e3c9-d48b-4118-b73a-4ae2e3cbb8f0",
    "context_id": "<context_id>",
    "is_sandbox": true
  }'
```

For production, replace the sandbox avatar with an avatar selected in the LiveAvatar dashboard and omit `is_sandbox`.

## 3. Configure VranceFlex

Copy `data.url` from the embedding response into the deployment environment:

```dotenv
NEXT_PUBLIC_LIVEAVATAR_EMBED_URL=https://embed.liveavatar.com/v1/<embedding-id>
```

Restart or redeploy VranceFlex. When the variable is absent or invalid, the landing-page guide trigger is intentionally hidden. Only HTTPS `embed.liveavatar.com/v1/` URLs are accepted.

The iframe requests microphone permission only after the visitor opens the guide and interacts with LiveAvatar. It has no access to VranceFlex sessions, workspaces, campaigns, leads, provider credentials, or Eve tools.
