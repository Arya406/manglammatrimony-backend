import { IOtpProvider } from "./OtpProvider.interface";
import { AuthMethod } from "../../types/auth";
import { config } from "../../config/env";

export class DevOtpProvider implements IOtpProvider {
  public name = "development-mock-provider";
  public lastOtp?: string;
  public lastRecipient?: string;

  async sendOtp(recipient: string, otp: string, method: AuthMethod): Promise<boolean> {
    this.lastOtp = otp;
    this.lastRecipient = recipient;
    if (config.devDummyOtpEnabled) {
      // In development mode only when explicitly enabled, log dispatch to console for local testing
      console.log(
        `\n[DEV OTP DISPATCH] Channel: ${method.toUpperCase()} | Recipient: ${recipient} | Verification OTP: [ ${otp} ]\n`
      );
    } else {
      console.log(`[PROD OTP NOTICE] Dispatch initiated for masked recipient via ${method}`);
    }
    return true;
  }
}
