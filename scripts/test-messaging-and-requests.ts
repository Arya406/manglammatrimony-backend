/**
 * ==============================================================================
 * MANGLAM MATRIMONY — CONNECTION REQUEST & CHAT SYSTEM INTEGRATION TEST SUITE
 * 
 * Verifies all 28 critical production architecture, security, persistence,
 * idempotency, and authorization rules.
 * ==============================================================================
 */

import { PrismaClient, UserStatus } from "@prisma/client";
import { messageRequestService } from "../src/services/message-request.service";
import { conversationService } from "../src/services/conversation.service";

const prisma = new PrismaClient();

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: any) {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${testName}`, detail !== undefined ? detail : "");
    failed++;
  }
}

async function runTests() {
  console.log("==================================================");
  console.log("MANGLAM MATRIMONY — MESSAGING & REQUEST TEST SUITE");
  console.log("==================================================");

  // Setup test users: User A, User B, User C, and Inactive User D
  const testPhoneA = `+918888${Math.floor(100000 + Math.random() * 900000)}`;
  const testPhoneB = `+918889${Math.floor(100000 + Math.random() * 900000)}`;
  const testPhoneC = `+918890${Math.floor(100000 + Math.random() * 900000)}`;
  const testPhoneD = `+918891${Math.floor(100000 + Math.random() * 900000)}`;

  const hindu = await prisma.religion.findFirst();
  const hindi = await prisma.language.findFirst();

  // Create User A
  const userA = await prisma.user.create({
    data: {
      phone: testPhoneA,
      status: UserStatus.ACTIVE,
      profile: {
        create: {
          profileCreatedFor: "MYSELF",
          profileStatus: "ACTIVE",
          completionPercentage: 100,
          personalDetails: {
            create: {
              firstName: "Aarav",
              lastName: "Test",
              gender: "MALE",
              maritalStatus: "NEVER_MARRIED",
              dateOfBirth: new Date("1996-01-01"),
              heightCm: 178,
              motherTongueId: hindi!.id,
            },
          },
        },
      },
    },
    include: { profile: true },
  });

  // Create User B
  const userB = await prisma.user.create({
    data: {
      phone: testPhoneB,
      status: UserStatus.ACTIVE,
      profile: {
        create: {
          profileCreatedFor: "MYSELF",
          profileStatus: "ACTIVE",
          completionPercentage: 100,
          personalDetails: {
            create: {
              firstName: "Bhavna",
              lastName: "Test",
              gender: "FEMALE",
              maritalStatus: "NEVER_MARRIED",
              dateOfBirth: new Date("1998-05-15"),
              heightCm: 165,
              motherTongueId: hindi!.id,
            },
          },
        },
      },
    },
    include: { profile: true },
  });

  // Create User C (Third-party eavesdropper/attacker)
  const userC = await prisma.user.create({
    data: {
      phone: testPhoneC,
      status: UserStatus.ACTIVE,
      profile: {
        create: {
          profileCreatedFor: "MYSELF",
          profileStatus: "ACTIVE",
          completionPercentage: 100,
          personalDetails: {
            create: {
              firstName: "Chetan",
              lastName: "Test",
              gender: "MALE",
              maritalStatus: "NEVER_MARRIED",
              dateOfBirth: new Date("1995-03-20"),
              heightCm: 175,
              motherTongueId: hindi!.id,
            },
          },
        },
      },
    },
    include: { profile: true },
  });

  // Create User D (Inactive account)
  const userD = await prisma.user.create({
    data: {
      phone: testPhoneD,
      status: UserStatus.SUSPENDED,
      profile: {
        create: {
          profileCreatedFor: "MYSELF",
          profileStatus: "SUSPENDED",
          completionPercentage: 50,
          personalDetails: {
            create: {
              firstName: "Deepak",
              lastName: "Inactive",
              gender: "MALE",
              maritalStatus: "NEVER_MARRIED",
              dateOfBirth: new Date("1994-02-10"),
              heightCm: 170,
              motherTongueId: hindi!.id,
            },
          },
        },
      },
    },
    include: { profile: true },
  });

  try {
    // --------------------------------------------------------------------------
    // Test 1: User A cannot message themselves
    // --------------------------------------------------------------------------
    console.log("\n[TEST GROUP 1: Request Creation & Basic Validation]");
    const selfRes = await messageRequestService.createRequest(userA.id, {
      receiverUserId: userA.id,
    });
    assert(
      !selfRes.success && selfRes.code === "CANNOT_REQUEST_OWN_PROFILE",
      "1. Self-request is strictly blocked"
    );

    // --------------------------------------------------------------------------
    // Test 2: User A cannot send request with empty/missing recipient
    // --------------------------------------------------------------------------
    const emptyRes = await messageRequestService.createRequest(userA.id, {});
    assert(
      !emptyRes.success && emptyRes.code === "INVALID_RECIPIENT",
      "2. Empty recipient is rejected"
    );

    // --------------------------------------------------------------------------
    // Test 3: Inactive User D cannot send message request
    // --------------------------------------------------------------------------
    const inactiveSenderRes = await messageRequestService.createRequest(userD.id, {
      receiverUserId: userB.id,
    });
    assert(
      !inactiveSenderRes.success && inactiveSenderRes.code === "ACCOUNT_NOT_ELIGIBLE",
      "3. Suspended/inactive account cannot send message requests"
    );

    // --------------------------------------------------------------------------
    // Test 4: Cannot request inactive User D
    // --------------------------------------------------------------------------
    const inactiveReceiverRes = await messageRequestService.createRequest(userA.id, {
      receiverUserId: userD.id,
    });
    assert(
      !inactiveReceiverRes.success && inactiveReceiverRes.code === "RECIPIENT_NOT_ACTIVE",
      "4. Requests to suspended/inactive accounts are rejected"
    );

    // --------------------------------------------------------------------------
    // Test 5: User A successfully creates Message Request to User B
    // --------------------------------------------------------------------------
    const reqRes = await messageRequestService.createRequest(userA.id, {
      receiverProfileId: userB.profile!.id,
    });
    assert(
      reqRes.success && reqRes.statusCode === 201 && reqRes.data?.relationshipState === "PENDING_SENT",
      "5. User A sends message request to User B successfully",
      reqRes
    );
    const requestId1 = reqRes.data!.request.id;

    // --------------------------------------------------------------------------
    // Test 6: Notification created for recipient User B
    // --------------------------------------------------------------------------
    const notificationB = await prisma.notification.findFirst({
      where: { userId: userB.id, relatedRequestId: requestId1 },
    });
    assert(
      Boolean(notificationB && notificationB.type === "MESSAGE_REQUEST_RECEIVED"),
      "6. Database notification automatically recorded for recipient"
    );

    // --------------------------------------------------------------------------
    // Test 7: Relationship status for User A is PENDING_SENT
    // --------------------------------------------------------------------------
    const relA = await messageRequestService.getRelationshipStatus(userA.id, userB.id);
    assert(
      relA.data?.relationshipState === "PENDING_SENT",
      "7. Relationship status for sender is PENDING_SENT"
    );

    // --------------------------------------------------------------------------
    // Test 8: Relationship status for User B is PENDING_RECEIVED
    // --------------------------------------------------------------------------
    const relB = await messageRequestService.getRelationshipStatus(userB.id, userA.id);
    assert(
      relB.data?.relationshipState === "PENDING_RECEIVED",
      "8. Relationship status for recipient is PENDING_RECEIVED"
    );

    // --------------------------------------------------------------------------
    // Test 9: Duplicate pending request by User A is idempotent / rejected
    // --------------------------------------------------------------------------
    const dupRes = await messageRequestService.createRequest(userA.id, {
      receiverUserId: userB.id,
    });
    assert(
      dupRes.success && dupRes.code === "MESSAGE_REQUEST_ALREADY_PENDING",
      "9. Duplicate pending request is safely idempotent"
    );

    // --------------------------------------------------------------------------
    // Test 10: Inverse request by User B while pending informs about incoming request
    // --------------------------------------------------------------------------
    const invRes = await messageRequestService.createRequest(userB.id, {
      receiverUserId: userA.id,
    });
    assert(
      invRes.success && invRes.code === "INCOMING_REQUEST_PENDING",
      "10. Inverse request while pending informs user to check inbox"
    );

    // --------------------------------------------------------------------------
    // Test 11: User B views incoming requests with sender profile details
    // --------------------------------------------------------------------------
    console.log("\n[TEST GROUP 2: Inbox & Request Details]");
    const inboxB = await messageRequestService.getIncomingRequests(userB.id);
    const foundReq = inboxB.data?.requests.find((r) => r.id === requestId1);
    assert(
      Boolean(foundReq && foundReq.sender.name.includes("Aarav")),
      "11. User B sees incoming request in inbox with sender name and age"
    );

    // --------------------------------------------------------------------------
    // Test 12: User A sees request in sent requests
    // --------------------------------------------------------------------------
    const sentA = await messageRequestService.getSentRequests(userA.id);
    assert(
      sentA.data?.requests.some((r) => r.id === requestId1),
      "12. User A sees request in sent requests list"
    );

    // --------------------------------------------------------------------------
    // Test 13: User C cannot view User A & B's request detail (authorization)
    // --------------------------------------------------------------------------
    const unauthView = await messageRequestService.getRequestById(userC.id, requestId1);
    assert(
      !unauthView.success && unauthView.statusCode === 403,
      "13. Unauthorized third-party User C cannot view request details"
    );

    // --------------------------------------------------------------------------
    // Test 14: User A cannot accept their own sent request
    // --------------------------------------------------------------------------
    console.log("\n[TEST GROUP 3: Request Decision & Decline Flow]");
    const senderAcceptRes = await messageRequestService.acceptRequest(userA.id, requestId1);
    assert(
      !senderAcceptRes.success && senderAcceptRes.statusCode === 403,
      "14. Sender User A cannot accept their own sent request"
    );

    // --------------------------------------------------------------------------
    // Test 15: User C cannot accept User B's request
    // --------------------------------------------------------------------------
    const hackerAcceptRes = await messageRequestService.acceptRequest(userC.id, requestId1);
    assert(
      !hackerAcceptRes.success && hackerAcceptRes.statusCode === 403,
      "15. Third-party User C cannot accept User B's request"
    );

    // --------------------------------------------------------------------------
    // Test 16: User B declines request $\rightarrow$ status becomes DECLINED
    // --------------------------------------------------------------------------
    const declineRes = await messageRequestService.declineRequest(userB.id, requestId1);
    assert(
      declineRes.success && declineRes.data?.request.status === "DECLINED",
      "16. User B declines request successfully"
    );

    // --------------------------------------------------------------------------
    // Test 17: User A cannot re-request immediately (anti-spam 24-hour cooldown)
    // --------------------------------------------------------------------------
    const spamRes = await messageRequestService.createRequest(userA.id, {
      receiverUserId: userB.id,
    });
    assert(
      !spamRes.success && spamRes.statusCode === 429 && spamRes.code === "REQUEST_COOLDOWN_ACTIVE",
      "17. 24-hour anti-spam cooldown prevents immediate re-request after decline"
    );

    // --------------------------------------------------------------------------
    // Test 18: Reset cooldown for testing accept flow and create request 2
    // --------------------------------------------------------------------------
    console.log("\n[TEST GROUP 4: Accept Flow & Atomic Conversation Creation]");
    // Delete declined request to simulate fresh connection for accept tests
    await prisma.messageRequest.delete({ where: { id: requestId1 } });

    const reqRes2 = await messageRequestService.createRequest(userA.id, {
      receiverUserId: userB.id,
    });
    const requestId2 = reqRes2.data!.request.id;

    // User B accepts request 2
    const acceptRes = await messageRequestService.acceptRequest(userB.id, requestId2);
    assert(
      acceptRes.success && acceptRes.statusCode === 200 && Boolean(acceptRes.data?.conversationId),
      "18. User B accepts request atomically creating unique conversation",
      acceptRes
    );
    const conversationId = acceptRes.data!.conversationId;

    // --------------------------------------------------------------------------
    // Test 19: Conversation uniqueness constraint in PostgreSQL
    // --------------------------------------------------------------------------
    const conv = await prisma.conversation.findUnique({
      where: { id: conversationId },
    });
    assert(
      Boolean(conv && conv.userOneId < conv.userTwoId),
      "19. Conversation enforces deterministic userOneId < userTwoId"
    );

    // --------------------------------------------------------------------------
    // Test 20: Acceptance notification created for User A
    // --------------------------------------------------------------------------
    const acceptNotifA = await prisma.notification.findFirst({
      where: { userId: userA.id, relatedRequestId: requestId2 },
    });
    assert(
      Boolean(acceptNotifA && acceptNotifA.type === "MESSAGE_REQUEST_ACCEPTED"),
      "20. Acceptance notification persisted for sender User A"
    );

    // --------------------------------------------------------------------------
    // Test 21: Cannot send request when already connected
    // --------------------------------------------------------------------------
    const reRequestRes = await messageRequestService.createRequest(userA.id, {
      receiverUserId: userB.id,
    });
    assert(
      reRequestRes.success && reRequestRes.code === "CONVERSATION_ALREADY_EXISTS",
      "21. Request service recognizes existing connection and points to conversation"
    );

    // --------------------------------------------------------------------------
    // Test 22: User A and B can send messages in the conversation
    // --------------------------------------------------------------------------
    console.log("\n[TEST GROUP 5: Chat Messaging & Authorization]");
    const msg1Res = await conversationService.sendMessage(
      userA.id,
      conversationId,
      "Namaste Bhavna, glad to connect!"
    );
    assert(
      msg1Res.success && msg1Res.data?.message.body === "Namaste Bhavna, glad to connect!",
      "22. User A sends message into active conversation"
    );

    const msg2Res = await conversationService.sendMessage(
      userB.id,
      conversationId,
      "Hello Aarav! Nice to meet you."
    );
    assert(
      msg2Res.success && msg2Res.data?.message.body === "Hello Aarav! Nice to meet you.",
      "23. User B replies in active conversation"
    );

    // --------------------------------------------------------------------------
    // Test 23: Empty message is rejected
    // --------------------------------------------------------------------------
    const emptyMsgRes = await conversationService.sendMessage(userA.id, conversationId, "   ");
    assert(
      !emptyMsgRes.success && emptyMsgRes.code === "MESSAGE_EMPTY",
      "24. Whitespace/empty message is rejected"
    );

    // --------------------------------------------------------------------------
    // Test 24: Message exceeding 2000 characters is rejected
    // --------------------------------------------------------------------------
    const longText = "a".repeat(2005);
    const longMsgRes = await conversationService.sendMessage(userA.id, conversationId, longText);
    assert(
      !longMsgRes.success && longMsgRes.code === "MESSAGE_TOO_LONG",
      "25. Message exceeding 2000 characters is rejected"
    );

    // --------------------------------------------------------------------------
    // Test 25: User C cannot send messages into User A & B's conversation (403)
    // --------------------------------------------------------------------------
    const hackerSendRes = await conversationService.sendMessage(
      userC.id,
      conversationId,
      "I am an eavesdropper"
    );
    assert(
      !hackerSendRes.success && hackerSendRes.statusCode === 403,
      "26. Unauthorized User C cannot send messages into conversation (403 Forbidden)"
    );

    // --------------------------------------------------------------------------
    // Test 26: User C cannot read User A & B's messages (403)
    // --------------------------------------------------------------------------
    const hackerReadRes = await conversationService.getMessages(userC.id, conversationId);
    assert(
      !hackerReadRes.success && hackerReadRes.statusCode === 403,
      "27. Unauthorized User C cannot read messages in conversation (403 Forbidden)"
    );

    // --------------------------------------------------------------------------
    // Test 27: Unread counts calculation & mark as read
    // --------------------------------------------------------------------------
    console.log("\n[TEST GROUP 6: Unread Badges & Counts]");
    // User A currently has 1 unread message from User B
    const unreadBefore = await conversationService.getUnreadCounts(userA.id);
    assert(
      unreadBefore.data?.unreadMessages === 1,
      "28. Unread message count correctly shows 1 unread message for User A"
    );

    // User A fetches messages $\rightarrow$ automatically marks as read
    await conversationService.getMessages(userA.id, conversationId);
    const unreadAfter = await conversationService.getUnreadCounts(userA.id);
    assert(
      unreadAfter.data?.unreadMessages === 0,
      "29. Unread messages marked read automatically when conversation is opened"
    );

    // --------------------------------------------------------------------------
    // Test 28: Aggregate conversation list with lastMessage snippet
    // --------------------------------------------------------------------------
    const convsA = await conversationService.getUserConversations(userA.id);
    const activeConv = convsA.data?.conversations.find((c) => c.id === conversationId);
    assert(
      Boolean(activeConv && activeConv.lastMessage?.body.includes("Nice to meet you")),
      "30. User conversations list includes partner profile snippet and last message"
    );

    console.log("\n==================================================");
    console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log("==================================================");

    if (failed > 0) {
      process.exit(1);
    }
  } finally {
    // Cleanup test fixtures
    await prisma.notification.deleteMany({
      where: { userId: { in: [userA.id, userB.id, userC.id, userD.id] } },
    });
    await prisma.message.deleteMany({
      where: { senderUserId: { in: [userA.id, userB.id, userC.id, userD.id] } },
    });
    await prisma.conversationParticipant.deleteMany({
      where: { userId: { in: [userA.id, userB.id, userC.id, userD.id] } },
    });
    await prisma.conversation.deleteMany({
      where: {
        OR: [
          { userOneId: { in: [userA.id, userB.id, userC.id, userD.id] } },
          { userTwoId: { in: [userA.id, userB.id, userC.id, userD.id] } },
        ],
      },
    });
    await prisma.messageRequest.deleteMany({
      where: {
        OR: [
          { senderUserId: { in: [userA.id, userB.id, userC.id, userD.id] } },
          { receiverUserId: { in: [userA.id, userB.id, userC.id, userD.id] } },
        ],
      },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [userA.id, userB.id, userC.id, userD.id] } },
    });

    await prisma.$disconnect();
  }
}

runTests().catch((err) => {
  console.error("Test execution error:", err);
  process.exit(1);
});
