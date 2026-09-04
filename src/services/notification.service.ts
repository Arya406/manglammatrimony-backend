import { prisma } from "../config/database";

export class NotificationService {
  async getNotifications(userId: string, page = 1, limit = 20) {
    const skip = (Math.max(1, page) - 1) * Math.max(1, limit);
    const take = Math.min(50, Math.max(1, limit));

    const [notifications, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      prisma.notification.count({ where: { userId } }),
      prisma.notification.count({ where: { userId, readAt: null } }),
    ]);

    return {
      success: true,
      data: {
        notifications,
        unreadCount,
        pagination: {
          total,
          page,
          limit: take,
          totalPages: Math.ceil(total / take),
        },
      },
    };
  }

  async markAsRead(userId: string, notificationId: string) {
    const notif = await prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notif || notif.userId !== userId) {
      return {
        success: false,
        statusCode: 404,
        code: "NOTIFICATION_NOT_FOUND",
        message: "Notification not found.",
      };
    }

    const updated = await prisma.notification.update({
      where: { id: notificationId },
      data: { readAt: new Date() },
    });

    return {
      success: true,
      data: { notification: updated },
    };
  }

  async markAllAsRead(userId: string) {
    await prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });

    return {
      success: true,
      message: "All notifications marked as read.",
    };
  }
}

export const notificationService = new NotificationService();
