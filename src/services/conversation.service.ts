import { prisma } from "../config/database";
import { UserStatus, Prisma, Message } from "@prisma/client";
import { resolvePhotoPublicUrl } from "../providers/storage";

type ConversationListItem = Prisma.ConversationGetPayload<{
  include: {
    userOne: {
      include: {
        profile: {
          include: {
            personalDetails: true;
            photos: {
              where: { moderationStatus: "APPROVED" };
              orderBy: { sortOrder: "asc" };
              take: 1;
            };
          };
        };
      };
    };
    userTwo: {
      include: {
        profile: {
          include: {
            personalDetails: true;
            photos: {
              where: { moderationStatus: "APPROVED" };
              orderBy: { sortOrder: "asc" };
              take: 1;
            };
          };
        };
      };
    };
    messages: {
      orderBy: { createdAt: "desc" };
      take: 1;
    };
    participants: {
      where: { userId: string };
    };
  };
}>;

export class ConversationService {
  /**
   * 1. Get all conversations for the authenticated user
   */
  async getUserConversations(userId: string, page = 1, limit = 20) {
    const skip = (Math.max(1, page) - 1) * Math.max(1, limit);
    const take = Math.min(50, Math.max(1, limit));

    // Find conversations where user is userOne or userTwo
    const [conversations, total] = await Promise.all([
      prisma.conversation.findMany({
        where: {
          OR: [{ userOneId: userId }, { userTwoId: userId }],
        },
        include: {
          userOne: {
            include: {
              profile: {
                include: {
                  personalDetails: true,
                  photos: {
                    where: { moderationStatus: "APPROVED" },
                    orderBy: { sortOrder: "asc" },
                    take: 1,
                  },
                },
              },
            },
          },
          userTwo: {
            include: {
              profile: {
                include: {
                  personalDetails: true,
                  photos: {
                    where: { moderationStatus: "APPROVED" },
                    orderBy: { sortOrder: "asc" },
                    take: 1,
                  },
                },
              },
            },
          },
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
          },
          participants: {
            where: { userId },
          },
        },
        orderBy: { updatedAt: "desc" },
        skip,
        take,
      }),
      prisma.conversation.count({
        where: {
          OR: [{ userOneId: userId }, { userTwoId: userId }],
        },
      }),
    ]);

    const conversationIds = conversations.map((conv: ConversationListItem) => conv.id);

    // Batch query unread messages for all conversations in a single query to eliminate N+1 queries
    let unreadCountMap = new Map<string, number>();
    if (conversationIds.length > 0) {
      const unreadGroups = await prisma.message.groupBy({
        by: ["conversationId"],
        where: {
          conversationId: { in: conversationIds },
          senderUserId: { not: userId },
          readAt: null,
        },
        _count: {
          id: true,
        },
      });

      unreadCountMap = new Map<string, number>(
        unreadGroups.map((g) => [g.conversationId, g._count.id])
      );
    }

    // Format conversations with partner details and unread indicator
    const formatted = conversations.map((conv: ConversationListItem) => {
      const partnerUser = conv.userOneId === userId ? conv.userTwo : conv.userOne;
      const profile = partnerUser?.profile;
      const details = profile?.personalDetails;
      const primaryPhoto = profile?.photos?.[0];
      const lastMessage = conv.messages[0] || null;

      let age: number | undefined;
      if (details?.dateOfBirth) {
        const diff = Date.now() - new Date(details.dateOfBirth).getTime();
        age = Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
      }

      const unreadCount = unreadCountMap.get(conv.id) || 0;

      return {
        id: conv.id,
        updatedAt: conv.updatedAt,
        partner: {
          userId: partnerUser.id,
          profileId: profile?.id,
          name: details ? `${details.firstName}${details.lastName ? " " + details.lastName : ""}` : "Member",
          age,
          photoUrl: primaryPhoto ? resolvePhotoPublicUrl(primaryPhoto.storageKey, primaryPhoto.id, primaryPhoto.storageProvider) : null,
          isOnline: true,
        },
        lastMessage: lastMessage
          ? {
              id: lastMessage.id,
              body: lastMessage.body,
              createdAt: lastMessage.createdAt,
              senderUserId: lastMessage.senderUserId,
              isOwn: lastMessage.senderUserId === userId,
              isRead: Boolean(lastMessage.readAt),
            }
          : null,
        unreadCount,
      };
    });

    return {
      success: true,
      data: {
        conversations: formatted,
        pagination: {
          total,
          page,
          limit: take,
          totalPages: Math.ceil(total / take),
        },
      },
    };
  }

  /**
   * 2. Get single conversation detail by ID
   */
  async getConversationById(userId: string, conversationId: string) {
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        userOne: {
          include: {
            profile: {
              include: {
                personalDetails: true,
                photos: {
                  where: { moderationStatus: "APPROVED" },
                  orderBy: { sortOrder: "asc" },
                  take: 1,
                },
              },
            },
          },
        },
        userTwo: {
          include: {
            profile: {
              include: {
                personalDetails: true,
                photos: {
                  where: { moderationStatus: "APPROVED" },
                  orderBy: { sortOrder: "asc" },
                  take: 1,
                },
              },
            },
          },
        },
        participants: true,
      },
    });

    if (!conversation) {
      return {
        success: false,
        statusCode: 404,
        code: "CONVERSATION_NOT_FOUND",
        message: "Conversation not found.",
      };
    }

    // Security: Authenticated user must be a participant
    if (conversation.userOneId !== userId && conversation.userTwoId !== userId) {
      return {
        success: false,
        statusCode: 403,
        code: "FORBIDDEN",
        message: "You are not authorized to access this conversation.",
      };
    }

    const partnerUser = conversation.userOneId === userId ? conversation.userTwo : conversation.userOne;
    const profile = partnerUser.profile;
    const details = profile?.personalDetails;
    const primaryPhoto = profile?.photos?.[0];

    let age: number | undefined;
    if (details?.dateOfBirth) {
      const diff = Date.now() - new Date(details.dateOfBirth).getTime();
      age = Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
    }

    return {
      success: true,
      data: {
        conversation: {
          id: conversation.id,
          createdAt: conversation.createdAt,
          updatedAt: conversation.updatedAt,
          partner: {
            userId: partnerUser.id,
            profileId: profile?.id,
            name: details ? `${details.firstName}${details.lastName ? " " + details.lastName : ""}` : "Member",
            age,
            gender: details?.gender,
            photoUrl: primaryPhoto ? resolvePhotoPublicUrl(primaryPhoto.storageKey, primaryPhoto.id, primaryPhoto.storageProvider) : null,
            isOnline: true,
          },
        },
      },
    };
  }

  /**
   * 3. Get paginated messages in a conversation
   */
  async getMessages(
    userId: string,
    conversationId: string,
    page = 1,
    limit = 30,
    beforeCursor?: string
  ) {
    // 1. Verify conversation access
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { userOneId: true, userTwoId: true },
    });

    if (!conversation) {
      return {
        success: false,
        statusCode: 404,
        code: "CONVERSATION_NOT_FOUND",
        message: "Conversation not found.",
      };
    }

    if (conversation.userOneId !== userId && conversation.userTwoId !== userId) {
      return {
        success: false,
        statusCode: 403,
        code: "FORBIDDEN",
        message: "You are not authorized to view messages in this conversation.",
      };
    }

    const take = typeof limit === "number" && !isNaN(limit) ? Math.min(50, Math.max(1, limit)) : 30;

    let whereClause: Prisma.MessageWhereInput = { conversationId };
    if (beforeCursor) {
      const cursorMessage = await prisma.message.findUnique({
        where: { id: beforeCursor },
        select: { id: true, createdAt: true },
      });
      if (cursorMessage) {
        whereClause.OR = [
          { createdAt: { lt: cursorMessage.createdAt } },
          { createdAt: cursorMessage.createdAt, id: { lt: cursorMessage.id } },
        ];
      }
    }

    // Fetch latest messages ordered by createdAt desc for efficient database retrieval
    const [messagesDesc, total] = await Promise.all([
      prisma.message.findMany({
        where: whereClause,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take,
      }),
      prisma.message.count({ where: { conversationId } }),
    ]);

    // Reverse limited result set in application memory so API response remains chronological ASC
    const messagesAsc = [...messagesDesc].reverse();

    // Determine if older messages exist prior to the earliest message in the current window
    let hasMore = false;
    if (messagesAsc.length > 0) {
      const earliestMessage = messagesAsc[0];
      const olderCount = await prisma.message.count({
        where: {
          conversationId,
          OR: [
            { createdAt: { lt: earliestMessage.createdAt } },
            { createdAt: earliestMessage.createdAt, id: { lt: earliestMessage.id } },
          ],
        },
      });
      hasMore = olderCount > 0;
    }

    // Automatically mark unread messages from the other user as read
    await prisma.message.updateMany({
      where: {
        conversationId,
        senderUserId: { not: userId },
        readAt: null,
      },
      data: {
        readAt: new Date(),
      },
    });

    // Update participant lastReadAt
    await prisma.conversationParticipant.updateMany({
      where: { conversationId, userId },
      data: { lastReadAt: new Date() },
    });

    const formattedMessages = messagesAsc.map((m: Message) => ({
      id: m.id,
      senderUserId: m.senderUserId,
      isOwn: m.senderUserId === userId,
      body: m.body,
      createdAt: m.createdAt,
      readAt: m.readAt,
    }));

    return {
      success: true,
      data: {
        messages: formattedMessages,
        pagination: {
          total,
          limit: take,
          hasMore,
        },
      },
    };
  }

  /**
   * 4. Send a message in a conversation
   */
  async sendMessage(userId: string, conversationId: string, rawBody: string) {
    // Validate text body
    if (!rawBody || typeof rawBody !== "string") {
      return {
        success: false,
        statusCode: 400,
        code: "MESSAGE_EMPTY",
        message: "Message content cannot be empty.",
      };
    }

    const body = rawBody.trim();
    if (body.length === 0) {
      return {
        success: false,
        statusCode: 400,
        code: "MESSAGE_EMPTY",
        message: "Message content cannot be empty.",
      };
    }

    const MAX_LENGTH = 2000;
    if (body.length > MAX_LENGTH) {
      return {
        success: false,
        statusCode: 400,
        code: "MESSAGE_TOO_LONG",
        message: `Message exceeds maximum allowed length of ${MAX_LENGTH} characters.`,
      };
    }

    // Verify conversation access
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        userOne: { select: { status: true } },
        userTwo: { select: { status: true } },
      },
    });

    if (!conversation) {
      return {
        success: false,
        statusCode: 404,
        code: "CONVERSATION_NOT_FOUND",
        message: "Conversation not found.",
      };
    }

    if (conversation.userOneId !== userId && conversation.userTwoId !== userId) {
      return {
        success: false,
        statusCode: 403,
        code: "FORBIDDEN",
        message: "You are not authorized to send messages in this conversation.",
      };
    }

    // Ensure users are active
    if (
      conversation.userOne.status !== UserStatus.ACTIVE ||
      conversation.userTwo.status !== UserStatus.ACTIVE
    ) {
      return {
        success: false,
        statusCode: 403,
        code: "USER_INACTIVE",
        message: "Communication is disabled because an account is no longer active.",
      };
    }

    // Create Message + update conversation.updatedAt in atomic transaction
    const message = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const createdMessage = await tx.message.create({
        data: {
          conversationId,
          senderUserId: userId,
          body,
        },
      });

      await tx.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      });

      return createdMessage;
    });

    return {
      success: true,
      statusCode: 201,
      code: "MESSAGE_SENT",
      message: "Message sent successfully.",
      data: {
        message: {
          id: message.id,
          senderUserId: message.senderUserId,
          isOwn: true,
          body: message.body,
          createdAt: message.createdAt,
          readAt: null,
        },
      },
    };
  }

  /**
   * 5. Mark conversation messages as read
   */
  async markAsRead(userId: string, conversationId: string) {
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { userOneId: true, userTwoId: true },
    });

    if (!conversation || (conversation.userOneId !== userId && conversation.userTwoId !== userId)) {
      return {
        success: false,
        statusCode: 403,
        code: "FORBIDDEN",
        message: "Unauthorized.",
      };
    }

    await prisma.$transaction([
      prisma.message.updateMany({
        where: {
          conversationId,
          senderUserId: { not: userId },
          readAt: null,
        },
        data: { readAt: new Date() },
      }),
      prisma.conversationParticipant.updateMany({
        where: { conversationId, userId },
        data: { lastReadAt: new Date() },
      }),
    ]);

    return {
      success: true,
      message: "Conversation marked as read.",
    };
  }

  /**
   * 6. Get aggregate unread count for navbar and badges
   * Separates incoming message requests count and unread conversation messages count
   */
  async getUnreadCounts(userId: string) {
    const [unreadRequests, unreadMessages] = await Promise.all([
      // Count pending incoming requests
      prisma.messageRequest.count({
        where: {
          receiverUserId: userId,
          status: "PENDING",
        },
      }),
      // Count unread messages in conversations where user is participant
      prisma.message.count({
        where: {
          conversation: {
            OR: [{ userOneId: userId }, { userTwoId: userId }],
          },
          senderUserId: { not: userId },
          readAt: null,
        },
      }),
    ]);

    return {
      success: true,
      data: {
        unreadRequests,
        unreadMessages,
        totalUnread: unreadRequests + unreadMessages,
      },
    };
  }
}

export const conversationService = new ConversationService();
