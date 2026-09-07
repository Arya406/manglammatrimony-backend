import { prisma } from "../src/config/database";

async function checkDuplicates() {
  try {
    const duplicates: any[] = await prisma.$queryRawUnsafe(`
      SELECT 
        LEAST(sender_user_id, receiver_user_id) AS user_a,
        GREATEST(sender_user_id, receiver_user_id) AS user_b,
        COUNT(*)::int AS count,
        json_agg(json_build_object(
          'id', id,
          'senderUserId', sender_user_id,
          'receiverUserId', receiver_user_id,
          'status', status,
          'createdAt', created_at
        )) AS records
      FROM message_requests
      WHERE status = 'PENDING'
      GROUP BY LEAST(sender_user_id, receiver_user_id), GREATEST(sender_user_id, receiver_user_id)
      HAVING COUNT(*) > 1;
    `);

    console.log("==================================================");
    console.log("PENDING MESSAGE REQUESTS DUPLICATE CHECK");
    console.log("==================================================");
    if (duplicates.length === 0) {
      console.log("✓ ZERO duplicate pending message requests found. Database is clean.");
    } else {
      console.error(`✗ FOUND ${duplicates.length} DUPLICATE PENDING GROUPS:`);
      console.error(JSON.stringify(duplicates, null, 2));
    }
    console.log("==================================================");
  } catch (err) {
    console.error("Error checking duplicate pending requests:", err);
  } finally {
    await prisma.$disconnect();
  }
}

checkDuplicates();
