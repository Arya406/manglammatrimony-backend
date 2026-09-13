import { Resend } from "resend";
import { config } from "../config/env";

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface DispatchedEmailRecord {
  to: string;
  otp: string;
  type: "registration" | "login" | "activation";
  html?: string;
  dispatchedAt: Date;
}

export class EmailService {
  private resendClient: Resend | null = null;
  // Isolated test/dev in-memory store for integration test assertion
  private static testInbox: DispatchedEmailRecord[] = [];

  constructor() {
    if (config.resend.apiKey) {
      this.resendClient = new Resend(config.resend.apiKey);
    }
  }

  public getResendClient(): Resend | null {
    const key = config.resend.apiKey?.trim();
    if (!key || key.startsWith("mock_")) {
      return null;
    }
    if (!this.resendClient) {
      this.resendClient = new Resend(key);
    }
    return this.resendClient;
  }

  /**
   * For test runner / dev assertions only.
   */
  public static getLastDispatchedOtp(to: string): string | undefined {
    const normalized = to.trim().toLowerCase();
    const record = [...EmailService.testInbox]
      .reverse()
      .find((r) => r.to.trim().toLowerCase() === normalized);
    return record?.otp;
  }

  public static getTestInbox(to?: string): DispatchedEmailRecord[] {
    if (!to) return [...EmailService.testInbox];
    const normalized = to.trim().toLowerCase();
    return EmailService.testInbox.filter((r) => r.to.trim().toLowerCase() === normalized);
  }

  public getTestInbox(to?: string): DispatchedEmailRecord[] {
    return EmailService.getTestInbox(to);
  }

  public static clearTestInbox(): void {
    EmailService.testInbox = [];
  }

  /**
   * Generates a premium responsive HTML email template for Manglam Matrimony.
   */
  private generateAuthEmailHtml(otp: string, isLogin: boolean): string {
    const actionTitle = isLogin ? "Login Verification Code" : "Welcome to Manglam Matrimony";
    const actionSubtitle = isLogin
      ? "Enter this code to access your profile safely:"
      : "Verify your email address to begin your journey toward finding your life partner:";

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${actionTitle}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #FBF8F3; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="min-width: 100%; background-color: #FBF8F3; padding: 32px 16px;">
    <tr>
      <td align="center">
        <!-- Main Card Container -->
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 520px; background-color: #FFFFFF; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(123, 17, 35, 0.08); border: 1px solid #F1EAE0;">
          <!-- Header Banner -->
          <tr>
            <td style="background-color: #7B1123; padding: 28px 24px; text-align: center;">
              <span style="color: #C59B27; font-size: 11px; font-weight: 700; letter-spacing: 0.15em; text-transform: uppercase; display: block; margin-bottom: 4px;">Pavitra Bandhan</span>
              <h1 style="color: #FFFFFF; font-size: 24px; font-weight: 700; margin: 0; letter-spacing: 0.02em;">MANGLAM MATRIMONY</h1>
            </td>
          </tr>

          <!-- Body Content -->
          <tr>
            <td style="padding: 36px 32px; color: #2D2426;">
              <h2 style="font-size: 20px; font-weight: 600; color: #7B1123; margin-top: 0; margin-bottom: 12px;">${actionTitle}</h2>
              <p style="font-size: 15px; line-height: 1.6; color: #5A4E51; margin-bottom: 24px;">
                ${actionSubtitle}
              </p>

              <!-- OTP Code Display Box -->
              <div style="background-color: #FBF8F3; border: 2px dashed #C59B27; border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 24px;">
                <span style="font-size: 12px; font-weight: 600; color: #7B1123; letter-spacing: 0.1em; text-transform: uppercase; display: block; margin-bottom: 8px;">Your 6-Digit Verification Code</span>
                <span style="font-size: 36px; font-weight: 700; color: #7B1123; letter-spacing: 0.25em; font-family: monospace; display: inline-block;">${otp}</span>
              </div>

              <!-- Expiry and Security Notice -->
              <p style="font-size: 13px; line-height: 1.5; color: #8C827A; margin-bottom: 8px;">
                ⏱️ This code will expire in <strong>10 minutes</strong>.
              </p>
              <p style="font-size: 13px; line-height: 1.5; color: #8C827A; margin-bottom: 0;">
                🔒 For your security, never share this code with anyone. Manglam staff will never ask for your verification code.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #FAF6F0; padding: 20px 24px; text-align: center; border-top: 1px solid #F1EAE0;">
              <p style="font-size: 12px; color: #8C827A; margin: 0; line-height: 1.5;">
                © ${new Date().getFullYear()} Manglam Matrimony. Built with privacy and trust.<br>
                If you did not request this email, you can safely ignore it.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
  }

  /**
   * Sends registration email verification OTP.
   */
  async sendVerificationEmail(to: string, otp: string): Promise<SendEmailResult> {
    const normalizedTo = to.trim().toLowerCase();
    const subject = `Your Manglam Matrimony Verification Code`;
    const html = this.generateAuthEmailHtml(otp, false);

    return this.dispatchEmail(normalizedTo, subject, html, otp, "registration");
  }

  /**
   * Sends login verification OTP.
   */
  async sendLoginVerificationEmail(to: string, otp: string): Promise<SendEmailResult> {
    const normalizedTo = to.trim().toLowerCase();
    const subject = `Your Manglam Matrimony Login Code`;
    const html = this.generateAuthEmailHtml(otp, true);

    return this.dispatchEmail(normalizedTo, subject, html, otp, "login");
  }

  /**
   * Generates a premium responsive HTML email template for Account Activation.
   */
  private generateActivationEmailHtml(otp: string, firstName?: string): string {
    const greeting = firstName ? `Namaste ${firstName},` : "Namaste,";
    const actionTitle = "Claim Your Manglam Matrimony Profile";
    const actionSubtitle = `${greeting} A matrimonial profile and account has been created for you on Manglam Matrimony. To claim your account and begin discovering verified matches, please verify your email address using the code below:`;

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${actionTitle}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #FBF8F3; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="min-width: 100%; background-color: #FBF8F3; padding: 32px 16px;">
    <tr>
      <td align="center">
        <!-- Main Card Container -->
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 520px; background-color: #FFFFFF; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(123, 17, 35, 0.08); border: 1px solid #F1EAE0;">
          <!-- Header Banner -->
          <tr>
            <td style="background-color: #7B1123; padding: 28px 24px; text-align: center;">
              <span style="color: #C59B27; font-size: 11px; font-weight: 700; letter-spacing: 0.15em; text-transform: uppercase; display: block; margin-bottom: 4px;">Pavitra Bandhan</span>
              <h1 style="color: #FFFFFF; font-size: 24px; font-weight: 700; margin: 0; letter-spacing: 0.02em;">MANGLAM MATRIMONY</h1>
            </td>
          </tr>

          <!-- Body Content -->
          <tr>
            <td style="padding: 36px 32px; color: #2D2426;">
              <h2 style="font-size: 20px; font-weight: 600; color: #7B1123; margin-top: 0; margin-bottom: 12px;">${actionTitle}</h2>
              <p style="font-size: 15px; line-height: 1.6; color: #5A4E51; margin-bottom: 24px;">
                ${actionSubtitle}
              </p>

              <!-- OTP Code Display Box -->
              <div style="background-color: #FBF8F3; border: 2px dashed #C59B27; border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 24px;">
                <span style="font-size: 12px; font-weight: 600; color: #7B1123; letter-spacing: 0.1em; text-transform: uppercase; display: block; margin-bottom: 8px;">Your 6-Digit Activation Code</span>
                <span style="font-size: 36px; font-weight: 700; color: #7B1123; letter-spacing: 0.25em; font-family: monospace; display: inline-block;">${otp}</span>
              </div>

              <!-- Activation Link Note (No credentials in URL) -->
              <div style="text-align: center; margin-bottom: 24px;">
                <p style="font-size: 14px; color: #5A4E51; margin-bottom: 12px;">
                  Visit the activation page to enter this verification code and complete your profile:
                </p>
                <a href="${config.frontendUrl || "http://localhost:3000"}/activate" style="display: inline-block; background-color: #7B1123; color: #FFFFFF; text-decoration: none; font-weight: 600; font-size: 14px; padding: 10px 24px; border-radius: 6px;">
                  Activate My Profile
                </a>
              </div>

              <!-- Expiry and Security Notice -->
              <p style="font-size: 13px; line-height: 1.5; color: #8C827A; margin-bottom: 8px;">
                ⏱️ This activation code will expire in <strong>10 minutes</strong>.
              </p>
              <p style="font-size: 13px; line-height: 1.5; color: #8C827A; margin-bottom: 0;">
                🔒 For your security, never share this code with anyone. Manglam staff will never ask for your verification code.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #FAF6F0; padding: 20px 24px; text-align: center; border-top: 1px solid #F1EAE0;">
              <p style="font-size: 12px; color: #8C827A; margin: 0; line-height: 1.5;">
                © ${new Date().getFullYear()} Manglam Matrimony. Built with privacy and trust.<br>
                If you did not expect this profile creation, you can safely ignore this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
  }

  /**
   * Sends account ownership activation email with 6-digit verification code.
   */
  async sendAccountActivationEmail(
    to: string,
    otp: string,
    firstName?: string
  ): Promise<SendEmailResult> {
    const normalizedTo = to.trim().toLowerCase();
    const subject = `Claim Your Manglam Matrimony Profile & Account`;
    const html = this.generateActivationEmailHtml(otp, firstName);

    return this.dispatchEmail(normalizedTo, subject, html, otp, "activation");
  }

  /**
   * Centralized dispatch helper connecting to Resend or test environment.
   */
  private async dispatchEmail(
    to: string,
    subject: string,
    html: string,
    otp: string,
    type: "registration" | "login" | "activation"
  ): Promise<SendEmailResult> {
    // Record into isolated test store for automated testing verification
    EmailService.testInbox.push({
      to,
      otp,
      type,
      html,
      dispatchedAt: new Date(),
    });

    const resendClient = this.getResendClient();

    // In production, email delivery MUST strictly execute via Resend.
    // NEVER return synthetic success or bypass real delivery in production.
    if (config.nodeEnv === "production") {
      if (!resendClient || !config.resend.apiKey || config.resend.apiKey.startsWith("mock_")) {
        console.error("[EMAIL ERROR] Production email dispatch failed: RESEND_API_KEY is not configured.");
        return {
          success: false,
          error: "Email provider unconfigured. Valid RESEND_API_KEY is required in production.",
        };
      }

      if (!config.resend.fromEmail || config.resend.fromEmail.includes("onboarding@resend.dev")) {
        console.error(
          "[EMAIL ERROR] Production email dispatch failed: Valid verified domain sender is required in RESEND_FROM_EMAIL."
        );
        return {
          success: false,
          error:
            "Invalid production email sender. Senders using onboarding@resend.dev are not permitted in production.",
        };
      }

      try {
        const response = await resendClient.emails.send({
          from: config.resend.fromEmail,
          to: [to],
          subject,
          html,
        });

        if (response.error) {
          console.error("[RESEND API ERROR]:", response.error.message || response.error);
          return {
            success: false,
            error: response.error.message || "Failed to deliver email through Resend.",
          };
        }

        return {
          success: true,
          messageId: response.data?.id,
        };
      } catch (err: any) {
        console.error("[RESEND CLIENT ERROR]:", err.message || err);
        return {
          success: false,
          error: err.message || "Failed to deliver email through Resend.",
        };
      }
    }

    // In development / test environment:
    // If client is initialized with a non-mock key, send via Resend API
    if (resendClient && config.resend.apiKey && !config.resend.apiKey.startsWith("mock_")) {
      try {
        const response = await resendClient.emails.send({
          from: config.resend.fromEmail,
          to: [to],
          subject,
          html,
        });

        if (response.error) {
          console.error("[RESEND API ERROR]:", response.error.message || response.error);
          return {
            success: false,
            error: response.error.message || "Failed to deliver email through Resend.",
          };
        }

        return {
          success: true,
          messageId: response.data?.id,
        };
      } catch (err: any) {
        console.error("[RESEND CLIENT ERROR]:", err.message || err);
        return {
          success: false,
          error: err.message || "Failed to deliver email through Resend.",
        };
      }
    }

    // In development / test mode when real Resend credentials are not configured:
    if (config.devDummyOtpEnabled) {
      console.log(
        `\n[DEV DUMMY OTP] Action: ${type.toUpperCase()} | Recipient: ${to} | Verification OTP: [ ${otp} ]\n`
      );
    }

    return {
      success: true,
      messageId: `dev-msg-${Date.now()}`,
    };
  }
}

export const emailService = new EmailService();
