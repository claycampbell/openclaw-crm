export const baseUrl = (
  process.env.NEXT_PUBLIC_APP_URL || "https://aria.seawolfai.net"
).trim().replace(/\/+$/, "");
