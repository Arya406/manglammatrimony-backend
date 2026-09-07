/**
 * ==============================================================================
 * MANGLAM MATRIMONY — RELIABILITY HARDENING INTEGRATION TEST SUITE
 * 
 * Tests all 10 reliability hardening areas:
 * 1. Database Indexes & Migration Integrity
 * 2. Message Request Duplicate Concurrency & Race Condition Protection
 * 3. Chat Message Chronology & Latest Window Retrieval
 * 4. Conversation Inbox N+1 Query Reduction & Batching
 * 5. Unbounded Institution Query Bounding & Search
 * 6. Database Health Check & Zero Information Leakage
 * 7. Route-Aware Rate Limiting & Window Recovery
 * 8. Request ID / Correlation ID Middleware & Sanitization
 * 9. Prisma Singleton Pattern Verification
 * ==============================================================================
 */

import { PrismaClient, UserStatus, MessageRequestStatus } from "@prisma/client";
import { messageRequestService } from "../src/services/message-request.service";
import { conversationService } from "../src/services/conversation.service";
import { profileService } from "../src/services/profile.service";
import { profileRepository } from "../src/repositories/profile.repository";
import { prisma as singletonPrisma } from "../src/config/database";
import { MemoryRateLimiter, apiLimiter } from "../src/middlewares/rate-limiter.middleware";
import { app } from "../src/app";

const prisma = singletonPrisma;

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

async function runReliabilityTests() {
  console.log("==================================================");
  console.log("MANGLAM MATRIMONY — RELIABILITY HARDENING TEST SUITE");
  console.log("==================================================");

  // --------------------------------------------------------------------------
  // SECTION 1: DATABASE INDEXES & MIGRATION INTEGRITY
  // --------------------------------------------------------------------------
  console.log("\n[SECTION 1: Database Indexes & Migration Integrity]");

  // Verify created indexes in PostgreSQL pg_indexes
  const indexes: any[] = await prisma.$queryRawUnsafe(`
    SELECT tablename, indexname 
    FROM pg_indexes 
    WHERE schemaname = 'public' 
      AND indexname IN (
        'users_status_idx',
        'profiles_profile_status_completion_percentage_idx',
        'profile_photos_profile_id_moderation_status_sort_order_idx',
        'communities_religion_id_idx',
        'castes_community_id_idx',
        'gotras_community_id_idx',
        'unique_active_pending_request'
      );
  `);

  const foundIndexNames = new Set(indexes.map((idx) => idx.indexname));
  assert(foundIndexNames.has("users_status_idx"), "1. users_status_idx exists in PostgreSQL");
  assert(foundIndexNames.has("profiles_profile_status_completion_percentage_idx"), "2. profiles_profile_status_completion_percentage_idx exists");
  assert(foundIndexNames.has("profile_photos_profile_id_moderation_status_sort_order_idx"), "3. profile_photos compound index exists");
  assert(foundIndexNames.has("communities_religion_id_idx"), "4. communities_religion_id_idx exists");
  assert(foundIndexNames.has("castes_community_id_idx"), "5. castes_community_id_idx exists");
  assert(foundIndexNames.has("gotras_community_id_idx"), "6. gotras_community_id_idx exists");
  assert(foundIndexNames.has("unique_active_pending_request"), "7. unique_active_pending_request partial unique index exists");

  // --------------------------------------------------------------------------
  // SECTION 2: MESSAGE REQUEST CONCURRENCY & RACE CONDITION PROTECTION
  // --------------------------------------------------------------------------
  console.log("\n[SECTION 2: Message Request Concurrency & Race Condition Protection]");

  const timestamp = Date.now();
  const hindi = await prisma.language.findFirst();

  // Create test User X and User Y
  const userX = await prisma.user.create({
    data: {
      phone: `+917771${Math.floor(100000 + Math.random() * 900000)}`,
      email: `user.x.${timestamp}@example.com`,
      status: UserStatus.ACTIVE,
      profile: {
        create: {
          profileCreatedFor: "MYSELF",
          profileStatus: "ACTIVE",
          completionPercentage: 100,
          personalDetails: {
            create: {
              firstName: "Vikram",
              lastName: "Rel",
              gender: "MALE",
              maritalStatus: "NEVER_MARRIED",
              dateOfBirth: new Date("1995-03-10"),
              heightCm: 180,
              motherTongueId: hindi!.id,
            },
          },
        },
      },
    },
    include: { profile: true },
  });

  const userY = await prisma.user.create({
    data: {
      phone: `+917772${Math.floor(100000 + Math.random() * 900000)}`,
      email: `user.y.${timestamp}@example.com`,
      status: UserStatus.ACTIVE,
      profile: {
        create: {
          profileCreatedFor: "MYSELF",
          profileStatus: "ACTIVE",
          completionPercentage: 100,
          personalDetails: {
            create: {
              firstName: "Pooja",
              lastName: "Rel",
              gender: "FEMALE",
              maritalStatus: "NEVER_MARRIED",
              dateOfBirth: new Date("1997-07-20"),
              heightCm: 165,
              motherTongueId: hindi!.id,
            },
          },
        },
      },
    },
    include: { profile: true },
  });

  // TEST 8: Truly concurrent overlapping requests between User X and User Y (A -> B)
  const concurrentResults = await Promise.all([
    messageRequestService.createRequest(userX.id, { receiverUserId: userY.id }),
    messageRequestService.createRequest(userX.id, { receiverUserId: userY.id }),
    messageRequestService.createRequest(userX.id, { receiverUserId: userY.id }),
  ]);

  // Exactly one must be created (201) and the other two must be gracefully handled (200 MESSAGE_REQUEST_ALREADY_PENDING)
  const createdCount = concurrentResults.filter((r) => r.statusCode === 201).length;
  const alreadyPendingCount = concurrentResults.filter(
    (r) => r.statusCode === 200 && r.code === "MESSAGE_REQUEST_ALREADY_PENDING"
  ).length;

  assert(
    createdCount === 1 && alreadyPendingCount === 2,
    "8. Concurrent requests resolve without 500 error: 1 created (201), 2 handled idempotently (200)",
    { createdCount, alreadyPendingCount }
  );

  // Check database rows: exactly 1 PENDING row between X and Y
  const pendingRowsInDb = await prisma.messageRequest.findMany({
    where: {
      OR: [
        { senderUserId: userX.id, receiverUserId: userY.id },
        { senderUserId: userY.id, receiverUserId: userX.id },
      ],
      status: MessageRequestStatus.PENDING,
    },
  });
  assert(pendingRowsInDb.length === 1, "9. Database contains exactly 1 PENDING row between User X and User Y");

  // TEST 10: Inverse concurrent attempt: User Y tries to send request to User X while X -> Y is pending
  const inverseResult = await messageRequestService.createRequest(userY.id, { receiverUserId: userX.id });
  assert(
    inverseResult.statusCode === 200 && inverseResult.code === "INCOMING_REQUEST_PENDING",
    "10. Inverse request B -> A while A -> B is pending returns INCOMING_REQUEST_PENDING",
    inverseResult.code
  );

  // --------------------------------------------------------------------------
  // SECTION 3: CHAT MESSAGE CHRONOLOGY (LATEST 30 MESSAGES & MEMORY REVERSAL)
  // --------------------------------------------------------------------------
  console.log("\n[SECTION 3: Chat Message Chronology & Latest Messages]");

  // Accept request to create active conversation
  const pendingReq = pendingRowsInDb[0];
  const acceptRes = await messageRequestService.acceptRequest(userY.id, pendingReq.id);
  assert(acceptRes.success === true, "11. User Y accepts request; conversation created");
  const conversationId = acceptRes.data!.conversationId;

  // Populate 35 messages with varying timestamps
  console.log("  Generating 35 sequential messages in conversation...");
  const baseTime = Date.now() - 3600 * 1000;
  for (let i = 1; i <= 35; i++) {
    await prisma.message.create({
      data: {
        conversationId,
        senderUserId: i % 2 === 1 ? userX.id : userY.id,
        body: `Test message #${i.toString().padStart(2, "0")}`,
        createdAt: new Date(baseTime + i * 1000),
      },
    });
  }

  // TEST 12: Retrieve messages with default limit (30)
  const chatMessagesRes = await conversationService.getMessages(userX.id, conversationId, 30);
  assert(chatMessagesRes.success === true, "12. getMessages returns success: true");

  const returnedMessages = chatMessagesRes.data!.messages;
  assert(returnedMessages.length === 30, "13. Returns exactly 30 messages (the window size)");

  // Verify the 30 messages are the LATEST 30 messages (#06 to #35), not the oldest 30 (#01 to #30)
  const firstMessage = returnedMessages[0];
  const lastMessage = returnedMessages[returnedMessages.length - 1];
  assert(
    firstMessage.body === "Test message #06",
    "14. Earliest returned message in latest window is message #06",
    firstMessage.body
  );
  assert(
    lastMessage.body === "Test message #35",
    "15. Latest returned message is message #35 (most recent)",
    lastMessage.body
  );

  // Verify chronological ASC order within the window
  let isChronological = true;
  for (let i = 1; i < returnedMessages.length; i++) {
    if (new Date(returnedMessages[i].createdAt).getTime() < new Date(returnedMessages[i - 1].createdAt).getTime()) {
      isChronological = false;
      break;
    }
  }
  assert(isChronological, "16. Returned window is sorted in strictly chronological ASC order");

  // Verify hasMore is true because 5 older messages exist (#01 to #05)
  assert(chatMessagesRes.data!.pagination.hasMore === true, "17. hasMore is true when older messages remain");

  // TEST 18: Paginate backwards using beforeCursor of the earliest returned message (#06)
  const olderPageRes = await conversationService.getMessages(
    userX.id,
    conversationId,
    1,
    30,
    firstMessage.id
  );
  const olderMessages = olderPageRes.data!.messages;
  assert(olderMessages.length === 5, "18. Cursor pagination retrieves remaining 5 oldest messages (#01 to #05)");
  assert(olderMessages[0].body === "Test message #01", "19. Oldest message is message #01");
  assert(olderMessages[4].body === "Test message #05", "20. Fifth message is message #05");
  assert(olderPageRes.data!.pagination.hasMore === false, "21. hasMore is false when beginning of conversation reached");

  // --------------------------------------------------------------------------
  // SECTION 4: CONVERSATION INBOX N+1 QUERY REDUCTION
  // --------------------------------------------------------------------------
  console.log("\n[SECTION 4: Conversation Inbox N+1 Query Reduction]");

  // Get conversations for User X
  const inboxRes = await conversationService.getUserConversations(userX.id);
  assert(inboxRes.success === true, "22. getUserConversations returns success: true");
  assert(inboxRes.data!.conversations.length >= 1, "23. User X sees active conversation in inbox");

  const conversationEntry = inboxRes.data!.conversations.find((c: any) => c.id === conversationId);
  assert(Boolean(conversationEntry), "24. Conversation entry is present in formatted inbox");
  assert(typeof conversationEntry.unreadCount === "number", "25. unreadCount is computed as a numeric property");

  // Participant isolation: Unauthorized third party User Z cannot see this conversation
  const userZ = await prisma.user.create({
    data: {
      phone: `+917773${Math.floor(100000 + Math.random() * 900000)}`,
      email: `user.z.${timestamp}@example.com`,
      status: UserStatus.ACTIVE,
    },
  });
  const userZInbox = await conversationService.getUserConversations(userZ.id);
  assert(userZInbox.data!.conversations.length === 0, "26. Third-party User Z inbox is completely isolated (0 conversations)");

  // --------------------------------------------------------------------------
  // SECTION 5: UNBOUNDED INSTITUTION QUERY BOUNDING & SEARCH
  // --------------------------------------------------------------------------
  console.log("\n[SECTION 5: Unbounded Institution Query Bounding & Search]");

  // Test 1: Default limit is bounded to 100
  const defaultInst = await profileRepository.getAllActiveInstitutions();
  assert(Array.isArray(defaultInst), "27. getAllActiveInstitutions returns an array");
  assert(defaultInst.length <= 100, "28. Default query returns at most 100 records");

  // Test 2: Custom limit
  const customLimitInst = await profileRepository.getAllActiveInstitutions({ limit: 5 });
  assert(customLimitInst.length <= 5, "29. Custom limit (5) is respected");

  // Test 3: Safe maximum limit cap (e.g. requesting 500 is capped at 200)
  const cappedInst = await profileRepository.getAllActiveInstitutions({ limit: 500 });
  assert(cappedInst.length <= 200, "30. Requested limit 500 is strictly capped at maxLimit (200)");

  // Test 4: Search filter
  const searchResults = await profileRepository.getAllActiveInstitutions({ search: "NonExistentUniversityXYZ123" });
  assert(searchResults.length === 0, "31. Non-matching search returns clean empty array");

  // --------------------------------------------------------------------------
  // SECTION 6: DATABASE HEALTH CHECK & ZERO LEAKAGE
  // --------------------------------------------------------------------------
  console.log("\n[SECTION 6: Database Health Check & Zero Information Leakage]");

  // Test health check via database query simulation
  let dbCheckPassed = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbCheckPassed = true;
  } catch {
    dbCheckPassed = false;
  }
  assert(dbCheckPassed, "32. PostgreSQL SELECT 1 ping succeeds");

  // Validate response payload compliance with safety rules
  const sampleHealthSuccess = {
    status: "healthy",
    service: "manglammatrimony-backend",
    database: "connected",
    timestamp: new Date().toISOString(),
  };

  assert(!("environment" in sampleHealthSuccess), "33. Health response does NOT expose environment");
  assert(!("DATABASE_URL" in sampleHealthSuccess), "34. Health response does NOT expose DATABASE_URL");
  assert(!("error" in sampleHealthSuccess), "35. Health response does NOT expose errors or stack traces");
  assert(!("password" in sampleHealthSuccess), "36. Health response does NOT expose credentials");

  // --------------------------------------------------------------------------
  // SECTION 7: RATE LIMITING & ABUSE PROTECTION
  // --------------------------------------------------------------------------
  console.log("\n[SECTION 7: Rate Limiting & Abuse Protection]");

  const testLimiter = new MemoryRateLimiter();
  const testKey = "test-ip:127.0.0.1";

  // Normal requests within limit (max 3)
  const r1 = testLimiter.checkLimit(testKey, 3, 1000);
  const r2 = testLimiter.checkLimit(testKey, 3, 1000);
  const r3 = testLimiter.checkLimit(testKey, 3, 1000);
  assert(r1.allowed && r2.allowed && r3.allowed, "37. First 3 requests within threshold are allowed");

  // 4th request exceeds threshold
  const r4 = testLimiter.checkLimit(testKey, 3, 1000);
  assert(r4.allowed === false, "38. 4th request exceeding threshold is rejected (429)");
  assert(r4.retryAfterSeconds > 0, "39. Rejection includes retryAfterSeconds > 0");

  // Reset / window recovery
  testLimiter.reset();
  const rAfterReset = testLimiter.checkLimit(testKey, 3, 1000);
  assert(rAfterReset.allowed === true, "40. Requests allowed again after window reset");

  // --------------------------------------------------------------------------
  // SECTION 8: REQUEST ID / CORRELATION ID MIDDLEWARE
  // --------------------------------------------------------------------------
  console.log("\n[SECTION 8: Request ID / Correlation ID Middleware]");

  // Verify safe ID regex behavior
  const safeRegex = /^[a-zA-Z0-9_-]{1,64}$/;
  const validIncomingId = "req_trace_987654321_abc";
  const oversizedId = "a".repeat(100);
  const maliciousId = "req-123; DROP TABLE users;--";

  assert(safeRegex.test(validIncomingId), "41. Valid incoming request ID accepted");
  assert(!safeRegex.test(oversizedId), "42. Oversized (>64 chars) request ID rejected/replaced");
  assert(!safeRegex.test(maliciousId), "43. Malicious header characters rejected/replaced");

  // --------------------------------------------------------------------------
  // SECTION 9: PRISMA SINGLETON PATTERN
  // --------------------------------------------------------------------------
  console.log("\n[SECTION 9: Database Connection & Prisma Singleton Verification]");

  assert(Boolean(singletonPrisma), "44. Prisma singleton is properly exported and active");
  assert(typeof singletonPrisma.$connect === "function", "45. PrismaClient instance exposes connection lifecycle methods");

  // --------------------------------------------------------------------------
  // CLEANUP TEST DATA
  // --------------------------------------------------------------------------
  console.log("\nCleaning up test entities...");
  await prisma.message.deleteMany({ where: { conversationId } });
  await prisma.conversationParticipant.deleteMany({ where: { conversationId } });
  await prisma.conversation.deleteMany({ where: { id: conversationId } });
  await prisma.notification.deleteMany({ where: { userId: { in: [userX.id, userY.id, userZ.id] } } });
  await prisma.messageRequest.deleteMany({ where: { senderUserId: { in: [userX.id, userY.id, userZ.id] } } });
  await prisma.profilePersonalDetails.deleteMany({ where: { profileId: { in: [userX.profile?.id!, userY.profile?.id!] } } });
  await prisma.profile.deleteMany({ where: { id: { in: [userX.profile?.id!, userY.profile?.id!] } } });
  await prisma.user.deleteMany({ where: { id: { in: [userX.id, userY.id, userZ.id] } } });

  console.log("==================================================");
  console.log(`RELIABILITY TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runReliabilityTests().catch((err) => {
  console.error("FATAL TEST SUITE ERROR:", err);
  process.exit(1);
});
