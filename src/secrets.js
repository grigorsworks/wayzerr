// Keys shipped inside the app would be readable by anyone who opens it, so there are none.
// Connecting apps (Gmail, Drive…) uses each person's own free Composio key, pasted in Settings → AI & apps → Connectors.
module.exports = {
  COMPOSIO_API_KEY: process.env.COMPOSIO_API_KEY || '',
};
