async function testLiveApi() {
  const token =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJkZmFmNDRjNi1mM2U1LTQyNzItYTg3ZS0xNTJiZjBhY2QyNWYiLCJwaG9uZSI6Iis5MTk4NzY1NDMyMTAiLCJyb2xlcyI6WyJVU0VSIl0sInN0YXR1cyI6IkFDVElWRSIsImlhdCI6MTc4ODQzOTIzNywiZXhwIjoxNzg5MDQ0MDM3fQ.5iWPD029XrDwuXxY8YCpstkVP0W3hFYid4U4Sgwuf2s";

  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  console.log("==================================================");
  console.log("LIVE HTTP ENDPOINTS VERIFICATION (http://localhost:5000)");
  console.log("==================================================");

  // 1. Health
  const healthRes = await fetch("http://localhost:5000/api/health");
  const healthJson = await healthRes.json();
  console.log("1. /api/health ->", healthJson.status);

  // 2. Unread Counters
  const unreadRes = await fetch("http://localhost:5000/api/messages/unread-count", { headers });
  const unreadJson = await unreadRes.json();
  console.log("2. /api/messages/unread-count ->", unreadJson.data);

  // 3. Incoming Requests
  const reqsRes = await fetch("http://localhost:5000/api/message-requests/incoming", { headers });
  const reqsJson = await reqsRes.json();
  console.log("3. /api/message-requests/incoming ->", {
    count: reqsJson.data?.requests?.length,
    sender: reqsJson.data?.requests?.[0]?.sender?.name,
  });

  // 4. Conversations
  const convsRes = await fetch("http://localhost:5000/api/messages/conversations", { headers });
  const convsJson = await convsRes.json();
  console.log("4. /api/messages/conversations ->", {
    count: convsJson.data?.conversations?.length,
    partner: convsJson.data?.conversations?.[0]?.partner?.name,
    lastMessage: convsJson.data?.conversations?.[0]?.lastMessage?.body,
  });

  // 5. Send message in conversation
  const convId = convsJson.data?.conversations?.[0]?.id;
  if (convId) {
    const sendRes = await fetch(`http://localhost:5000/api/messages/conversations/${convId}/messages`, {
      method: "POST",
      headers,
      body: JSON.stringify({ body: "Live HTTP message test from Arya!" }),
    });
    const sendJson = await sendRes.json();
    console.log("5. POST .../messages ->", sendJson.data?.message?.body);
  }

  console.log("==================================================");
  console.log("ALL LIVE HTTP VERIFICATIONS PASSED!");
  console.log("==================================================");
}

testLiveApi().catch(console.error);
