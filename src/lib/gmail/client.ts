// Gmail API: read INBOX label metadata to get the unread count. The
// gmail.metadata scope is sufficient — no message bodies are fetched.

export async function getInboxUnreadCount(accessToken: string): Promise<number> {
  const res = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/labels/INBOX",
    { headers: { authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) {
    const text = await res.text();
    const err = new Error(`Gmail labels.get failed: ${res.status} ${text}`);
    // Tag 401 so callers can decide to refresh + retry
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }
  const json = (await res.json()) as { messagesUnread?: number };
  return json.messagesUnread ?? 0;
}
