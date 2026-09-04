import { prisma } from "../config/database";
import { MessageRequestStatus, NotificationType, UserStatus } from "@prisma/client";

export class MessageRequestService {
  /**
   * Resolves target userId and profileId from the given identifier
   */
  private async resolveTargetUser(target: { receiverProfileId?: string; receiverUserId?: string }) {
    if (target.receiverUserId) {
      const user = await prisma.user.findUnique({
        where: { id: target.receiverUserId },
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
      });
      return user;
    }

    if (target.receiverProfileId) {
      const profile = await prisma.profile.findUnique({
        where: { id: target.receiverProfileId },
        include: {
          user: true,
          personalDetails: true,
          photos: {
            where: { moderationStatus: "APPROVED" },
            orderBy: { sortOrder: "asc" },
            take: 1,
          },
        },
      });

      if (profile && profile.user) {
        return {
          ...profile.user,
          profile,
        };
      }
    }

    return null;
  }

  /**
   * 1. Create a new Message Request
   */
  async createRequest(
    senderUserId: string,
    target: { receiverProfileId?: string; receiverUserId?: string }
  ) {
    if (!target.receiverProfileId && !target.receiverUserId) {
      return {
        success: false,
        statusCode: 400,
        code: "INVALID_RECIPIENT",
        message: "Receiver profile or user ID must be provided.",
      };
    }

    // Resolve target recipient
    const recipientUser = await this.resolveTargetUser(target);
    if (!recipientUser) {
      return {
        success: false,
        statusCode: 404,
        code: "RECIPIENT_NOT_FOUND",
        message: "The requested profile or user does not exist.",
      };
    }

    const receiverUserId = recipientUser.id;

    // Rule: Cannot send request to own profile
    if (senderUserId === receiverUserId) {
      return {
        success: false,
        statusCode: 400,
        code: "CANNOT_REQUEST_OWN_PROFILE",
        message: "You cannot send a message request to your own profile.",
      };
    }

    // Validate sender status
    const sender = await prisma.user.findUnique({
      where: { id: senderUserId },
      include: { profile: { include: { personalDetails: true } } },
    });

    if (!sender || sender.status !== UserStatus.ACTIVE) {
      return {
        success: false,
        statusCode: 403,
        code: "ACCOUNT_NOT_ELIGIBLE",
        message: "Your account is not active or eligible to send message requests.",
      };
    }

    if (recipientUser.status !== UserStatus.ACTIVE) {
      return {
        success: false,
        statusCode: 400,
        code: "RECIPIENT_NOT_ACTIVE",
        message: "The recipient profile is currently not available.",
      };
    }

    // Check existing relationship between sender and receiver (in either direction)
    const existingRequests = await prisma.messageRequest.findMany({
      where: {
        OR: [
          { senderUserId, receiverUserId },
          { senderUserId: receiverUserId, receiverUserId: senderUserId },
        ],
      },
      orderBy: { createdAt: "desc" },
    });

    const activePending = existingRequests.find((r) => r.status === MessageRequestStatus.PENDING);
    if (activePending) {
      if (activePending.senderUserId === senderUserId) {
        return {
          success: true,
          statusCode: 200,
          code: "MESSAGE_REQUEST_ALREADY_PENDING",
          message: "A message request is already pending with this profile.",
          data: {
            request: activePending,
            relationshipState: "PENDING_SENT",
          },
        };
      } else {
        return {
          success: true,
          statusCode: 200,
          code: "INCOMING_REQUEST_PENDING",
          message: "This profile has already sent you a message request. Please check your inbox.",
          data: {
            request: activePending,
            relationshipState: "PENDING_RECEIVED",
          },
        };
      }
    }

    // Check if already accepted
    const acceptedRequest = existingRequests.find((r) => r.status === MessageRequestStatus.ACCEPTED);
    if (acceptedRequest) {
      const userOneId = senderUserId < receiverUserId ? senderUserId : receiverUserId;
      const userTwoId = senderUserId < receiverUserId ? receiverUserId : senderUserId;

      const conversation = await prisma.conversation.findUnique({
        where: { userOneId_userTwoId: { userOneId, userTwoId } },
      });

      return {
        success: true,
        statusCode: 200,
        code: "CONVERSATION_ALREADY_EXISTS",
        message: "You are already connected with this profile.",
        data: {
          request: acceptedRequest,
          conversationId: conversation?.id,
          relationshipState: "ACCEPTED",
        },
      };
    }

    // Check if declined recently (anti-spam 24-hour cooldown rule)
    const recentDeclined = existingRequests.find((r) => r.status === MessageRequestStatus.DECLINED);
    if (recentDeclined && recentDeclined.respondedAt) {
      const hoursSinceDecline =
        (Date.now() - new Date(recentDeclined.respondedAt).getTime()) / (1000 * 60 * 60);
      const COOLDOWN_HOURS = 24;

      if (hoursSinceDecline < COOLDOWN_HOURS) {
        const remainingHours = Math.ceil(COOLDOWN_HOURS - hoursSinceDecline);
        return {
          success: false,
          statusCode: 429,
          code: "REQUEST_COOLDOWN_ACTIVE",
          message: `This profile previously declined a request. You can try again in ${remainingHours} hour${
            remainingHours > 1 ? "s" : ""
          }.`,
          data: {
            cooldownHoursRemaining: remainingHours,
            relationshipState: "DECLINED",
          },
        };
      }
    }

    // Atomic Transaction: Create Request + Create Notification for recipient
    const senderName =
      sender.profile?.personalDetails?.firstName || "A Manglam Matrimony member";

    const result = await prisma.$transaction(async (tx) => {
      const newRequest = await tx.messageRequest.create({
        data: {
          senderUserId,
          receiverUserId,
          status: MessageRequestStatus.PENDING,
        },
      });

      await tx.notification.create({
        data: {
          userId: receiverUserId,
          type: NotificationType.MESSAGE_REQUEST_RECEIVED,
          title: "New Message Request",
          body: `${senderName} wants to connect with you.`,
          relatedRequestId: newRequest.id,
        },
      });

      return newRequest;
    });

    return {
      success: true,
      statusCode: 201,
      code: "MESSAGE_REQUEST_CREATED",
      message: "Message request sent successfully.",
      data: {
        request: result,
        relationshipState: "PENDING_SENT",
      },
    };
  }

  /**
   * 2. Get incoming pending requests for the authenticated user
   */
  async getIncomingRequests(userId: string, page = 1, limit = 20) {
    const skip = (Math.max(1, page) - 1) * Math.max(1, limit);
    const take = Math.min(50, Math.max(1, limit));

    const [requests, total] = await Promise.all([
      prisma.messageRequest.findMany({
        where: {
          receiverUserId: userId,
          status: MessageRequestStatus.PENDING,
        },
        include: {
          sender: {
            include: {
              profile: {
                include: {
                  personalDetails: true,
                  religion: { include: { religion: true, community: true } },
                  education: { include: { education: true } },
                  career: { include: { occupation: true } },
                  photos: {
                    where: { moderationStatus: "APPROVED" },
                    orderBy: { sortOrder: "asc" },
                    take: 3,
                  },
                },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      prisma.messageRequest.count({
        where: {
          receiverUserId: userId,
          status: MessageRequestStatus.PENDING,
        },
      }),
    ]);

    const formattedRequests = requests.map((req) => {
      const profile = req.sender.profile;
      const details = profile?.personalDetails;
      const primaryPhoto = profile?.photos?.[0];

      let age: number | undefined;
      if (details?.dateOfBirth) {
        const diff = Date.now() - new Date(details.dateOfBirth).getTime();
        age = Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
      }

      return {
        id: req.id,
        createdAt: req.createdAt,
        status: req.status,
        sender: {
          userId: req.senderUserId,
          profileId: profile?.id,
          name: details ? `${details.firstName}${details.lastName ? " " + details.lastName : ""}` : "Member",
          age,
          gender: details?.gender,
          religion: profile?.religion?.religion?.name,
          community: profile?.religion?.community?.name,
          education: profile?.education?.education?.name || profile?.education?.institutionName,
          occupation: profile?.career?.occupation?.name || profile?.career?.companyName,
          photoUrl: primaryPhoto ? `/api/profile/photos/${primaryPhoto.id}/file` : null,
        },
      };
    });

    return {
      success: true,
      data: {
        requests: formattedRequests,
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
   * 3. Get sent requests by the authenticated user
   */
  async getSentRequests(userId: string, page = 1, limit = 20) {
    const skip = (Math.max(1, page) - 1) * Math.max(1, limit);
    const take = Math.min(50, Math.max(1, limit));

    const [requests, total] = await Promise.all([
      prisma.messageRequest.findMany({
        where: { senderUserId: userId },
        include: {
          receiver: {
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
        },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      prisma.messageRequest.count({
        where: { senderUserId: userId },
      }),
    ]);

    const formatted = requests.map((req) => {
      const profile = req.receiver.profile;
      const details = profile?.personalDetails;
      const primaryPhoto = profile?.photos?.[0];

      return {
        id: req.id,
        createdAt: req.createdAt,
        status: req.status,
        respondedAt: req.respondedAt,
        receiver: {
          userId: req.receiverUserId,
          profileId: profile?.id,
          name: details ? `${details.firstName}${details.lastName ? " " + details.lastName : ""}` : "Member",
          photoUrl: primaryPhoto ? `/api/profile/photos/${primaryPhoto.id}/file` : null,
        },
      };
    });

    return {
      success: true,
      data: {
        requests: formatted,
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
   * 4. Get a specific request by ID
   */
  async getRequestById(userId: string, requestId: string) {
    const request = await prisma.messageRequest.findUnique({
      where: { id: requestId },
      include: {
        sender: {
          include: {
            profile: {
              include: {
                personalDetails: true,
                religion: { include: { religion: true, community: true } },
                education: { include: { education: true } },
                career: { include: { occupation: true } },
                photos: {
                  where: { moderationStatus: "APPROVED" },
                  orderBy: { sortOrder: "asc" },
                },
              },
            },
          },
        },
        receiver: {
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
      },
    });

    if (!request) {
      return {
        success: false,
        statusCode: 404,
        code: "MESSAGE_REQUEST_NOT_FOUND",
        message: "Message request not found.",
      };
    }

    // Security: Authenticated user must be either sender or receiver
    if (request.senderUserId !== userId && request.receiverUserId !== userId) {
      return {
        success: false,
        statusCode: 403,
        code: "FORBIDDEN",
        message: "You are not authorized to view this message request.",
      };
    }

    const senderProfile = request.sender.profile;
    const details = senderProfile?.personalDetails;
    let age: number | undefined;
    if (details?.dateOfBirth) {
      const diff = Date.now() - new Date(details.dateOfBirth).getTime();
      age = Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
    }

    return {
      success: true,
      data: {
        request: {
          id: request.id,
          status: request.status,
          createdAt: request.createdAt,
          respondedAt: request.respondedAt,
          isReceiver: request.receiverUserId === userId,
          sender: {
            userId: request.senderUserId,
            profileId: senderProfile?.id,
            name: details ? `${details.firstName}${details.lastName ? " " + details.lastName : ""}` : "Member",
            age,
            gender: details?.gender,
            maritalStatus: details?.maritalStatus,
            religion: senderProfile?.religion?.religion?.name,
            community: senderProfile?.religion?.community?.name,
            education: senderProfile?.education?.education?.name || senderProfile?.education?.institutionName,
            occupation: senderProfile?.career?.occupation?.name || senderProfile?.career?.companyName,
            incomeRange: senderProfile?.career?.annualIncomeRange,
            photos: senderProfile?.photos?.map((p) => ({
              url: `/api/profile/photos/${p.id}/file`,
              isPrimary: p.photoType === "PRIMARY",
            })),
          },
        },
      },
    };
  }

  /**
   * 5. Accept Request (Atomic Transaction)
   */
  async acceptRequest(userId: string, requestId: string) {
    const request = await prisma.messageRequest.findUnique({
      where: { id: requestId },
      include: {
        receiver: {
          include: { profile: { include: { personalDetails: true } } },
        },
        sender: true,
      },
    });

    if (!request) {
      return {
        success: false,
        statusCode: 404,
        code: "MESSAGE_REQUEST_NOT_FOUND",
        message: "Message request not found.",
      };
    }

    // Security: Only the recipient can accept
    if (request.receiverUserId !== userId) {
      return {
        success: false,
        statusCode: 403,
        code: "FORBIDDEN",
        message: "You are not authorized to accept this message request.",
      };
    }

    if (request.status !== MessageRequestStatus.PENDING) {
      return {
        success: false,
        statusCode: 400,
        code: "INVALID_REQUEST_STATE",
        message: `This message request has already been ${request.status.toLowerCase()}.`,
      };
    }

    const senderUserId = request.senderUserId;
    const receiverUserId = request.receiverUserId;
    const receiverName =
      request.receiver.profile?.personalDetails?.firstName || "A Manglam Matrimony member";

    // Deterministic 2-party ordering for unique conversation
    const userOneId = senderUserId < receiverUserId ? senderUserId : receiverUserId;
    const userTwoId = senderUserId < receiverUserId ? receiverUserId : senderUserId;

    // Execute atomic transaction
    const transactionResult = await prisma.$transaction(async (tx) => {
      // 1. Update Request status
      const updatedRequest = await tx.messageRequest.update({
        where: { id: requestId },
        data: {
          status: MessageRequestStatus.ACCEPTED,
          respondedAt: new Date(),
        },
      });

      // 2. Find or create unique conversation
      let conversation = await tx.conversation.findUnique({
        where: { userOneId_userTwoId: { userOneId, userTwoId } },
      });

      if (!conversation) {
        conversation = await tx.conversation.create({
          data: {
            userOneId,
            userTwoId,
          },
        });
      }

      // 3. Upsert participants
      await tx.conversationParticipant.upsert({
        where: { conversationId_userId: { conversationId: conversation.id, userId: userOneId } },
        update: {},
        create: { conversationId: conversation.id, userId: userOneId },
      });

      await tx.conversationParticipant.upsert({
        where: { conversationId_userId: { conversationId: conversation.id, userId: userTwoId } },
        update: {},
        create: { conversationId: conversation.id, userId: userTwoId },
      });

      // 4. Create Acceptance Notification for Sender
      await tx.notification.create({
        data: {
          userId: senderUserId,
          type: NotificationType.MESSAGE_REQUEST_ACCEPTED,
          title: "Message Request Accepted",
          body: `${receiverName} accepted your message request. You can now chat!`,
          relatedRequestId: requestId,
          relatedConversationId: conversation.id,
        },
      });

      return {
        request: updatedRequest,
        conversation,
      };
    });

    return {
      success: true,
      statusCode: 200,
      code: "MESSAGE_REQUEST_ACCEPTED",
      message: "Message request accepted successfully. Conversation is now active.",
      data: {
        request: transactionResult.request,
        conversationId: transactionResult.conversation.id,
      },
    };
  }

  /**
   * 6. Decline Request (Atomic Transaction)
   */
  async declineRequest(userId: string, requestId: string) {
    const request = await prisma.messageRequest.findUnique({
      where: { id: requestId },
    });

    if (!request) {
      return {
        success: false,
        statusCode: 404,
        code: "MESSAGE_REQUEST_NOT_FOUND",
        message: "Message request not found.",
      };
    }

    // Security: Only the recipient can decline
    if (request.receiverUserId !== userId) {
      return {
        success: false,
        statusCode: 403,
        code: "FORBIDDEN",
        message: "You are not authorized to decline this message request.",
      };
    }

    if (request.status !== MessageRequestStatus.PENDING) {
      return {
        success: false,
        statusCode: 400,
        code: "INVALID_REQUEST_STATE",
        message: `This message request has already been ${request.status.toLowerCase()}.`,
      };
    }

    const updated = await prisma.$transaction(async (tx) => {
      const decl = await tx.messageRequest.update({
        where: { id: requestId },
        data: {
          status: MessageRequestStatus.DECLINED,
          respondedAt: new Date(),
        },
      });

      await tx.notification.create({
        data: {
          userId: request.senderUserId,
          type: NotificationType.MESSAGE_REQUEST_DECLINED,
          title: "Message Request Update",
          body: "Your message request was declined.",
          relatedRequestId: requestId,
        },
      });

      return decl;
    });

    return {
      success: true,
      statusCode: 200,
      code: "MESSAGE_REQUEST_DECLINED",
      message: "Message request declined.",
      data: {
        request: updated,
      },
    };
  }

  /**
   * 7. Get relationship status between current user and target profile/user
   */
  async getRelationshipStatus(currentUserId: string, targetIdentifier: string) {
    let targetUserId: string | null = null;

    const userMatch = await prisma.user.findUnique({
      where: { id: targetIdentifier },
      select: { id: true },
    });

    if (userMatch) {
      targetUserId = userMatch.id;
    } else {
      const profileMatch = await prisma.profile.findUnique({
        where: { id: targetIdentifier },
        select: { userId: true },
      });
      if (profileMatch) {
        targetUserId = profileMatch.userId;
      }
    }

    if (!targetUserId) {
      return {
        success: true,
        data: {
          relationshipState: "NO_RELATIONSHIP",
        },
      };
    }

    if (targetUserId === currentUserId) {
      return {
        success: true,
        data: {
          relationshipState: "SELF",
        },
      };
    }

    const existing = await prisma.messageRequest.findMany({
      where: {
        OR: [
          { senderUserId: currentUserId, receiverUserId: targetUserId },
          { senderUserId: targetUserId, receiverUserId: currentUserId },
        ],
      },
      orderBy: { createdAt: "desc" },
    });

    const activePending = existing.find((r) => r.status === MessageRequestStatus.PENDING);
    if (activePending) {
      return {
        success: true,
        data: {
          relationshipState:
            activePending.senderUserId === currentUserId ? "PENDING_SENT" : "PENDING_RECEIVED",
          requestId: activePending.id,
        },
      };
    }

    const accepted = existing.find((r) => r.status === MessageRequestStatus.ACCEPTED);
    if (accepted) {
      const userOneId = currentUserId < targetUserId ? currentUserId : targetUserId;
      const userTwoId = currentUserId < targetUserId ? targetUserId : currentUserId;

      const conversation = await prisma.conversation.findUnique({
        where: { userOneId_userTwoId: { userOneId, userTwoId } },
        select: { id: true },
      });

      return {
        success: true,
        data: {
          relationshipState: "ACCEPTED",
          requestId: accepted.id,
          conversationId: conversation?.id,
        },
      };
    }

    const declined = existing.find((r) => r.status === MessageRequestStatus.DECLINED);
    if (declined) {
      return {
        success: true,
        data: {
          relationshipState: "DECLINED",
          requestId: declined.id,
        },
      };
    }

    return {
      success: true,
      data: {
        relationshipState: "NO_RELATIONSHIP",
      },
    };
  }
}

export const messageRequestService = new MessageRequestService();
