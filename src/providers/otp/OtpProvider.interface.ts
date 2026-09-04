import { AuthMethod } from "../../types/auth";

export interface IOtpProvider {
  name: string;
  sendOtp(recipient: string, otp: string, method: AuthMethod): Promise<boolean>;
}
