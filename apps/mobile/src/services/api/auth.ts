import { messageOf, privateApi, publicApi, unwrap } from '@/lib/api';
import { API } from '@/lib/endpoints';
import type { ModuleKey, Permission, Session, User } from '@/types';
import type {
    AuthUserDto,
    LoginResultDto,
    PasswordResetVerifyResultDto,
    VerifyLoginResultDto,
} from '@/types/api';

/** Maps the API's auth user onto the domain user. */
function mapAuthUser(dto: AuthUserDto): User {
  return {
    id: String(dto.id ?? ''),
    fullName: dto.name ?? dto.username ?? 'Unknown',
    email: dto.email ?? '',
    role: dto.role ?? 'Staff',
    department: dto.department,
    isActive: true,
  };
}

/** Builds a session from the verify-login payload. */
function mapSession(dto: VerifyLoginResultDto): Session {
  const user = dto.user ?? {};
  return {
    token: dto.token,
    refresh: dto.refresh,
    user: mapAuthUser(user),
    // Permissions are identified by name.
    permissions: (user.permissions ?? []).map((p) => p.name) as Permission[],
    allowedModules: (user.allowed_modules ?? []) as ModuleKey[],
    sidebarModules: (user.sidebar_modules ?? []) as ModuleKey[],
  };
}

export const authService = {
  /**
   * Step one of login. Returns the `otp_key` that must be echoed back as
   * `temp_id` when verifying, plus the server's message.
   */
  async login(input: { login: string; password: string; rememberMe?: boolean }) {
    const res = await publicApi.post(API.LOGIN, {
      login: input.login,
      password: input.password,
      remember_me: input.rememberMe ?? false,
    });
    const data = unwrap<LoginResultDto>(res);
    return { tempId: String(data?.otp_key ?? ''), message: messageOf(res, 'Code sent') };
  },

  /** Step two of login: exchange the OTP for a JWT session. */
  async verifyLogin(input: { otp: string; tempId: string }): Promise<Session> {
    const res = await publicApi.post(API.VERIFY_LOGIN, {
      otp: input.otp,
      temp_id: input.tempId,
    });
    return mapSession(unwrap<VerifyLoginResultDto>(res));
  },

  async resendOtp(email: string) {
    const res = await publicApi.post(API.RESEND_OTP, { email });
    return messageOf(res, 'Code resent');
  },

  async forgotPassword(email: string): Promise<{ message: string; tempId: string }> {
    const res = await publicApi.post(API.FORGOT_PASSWORD, { email });
    const data = unwrap<LoginResultDto & Record<string, unknown>>(res);
    return {
      message: messageOf(res, 'Reset code sent'),
      // The handle the OTP screen must echo back as temp_id.
      tempId: String(data?.otp_key ?? ''),
    };
  },

  /** Verifies the reset OTP and returns the `token_hash` for reset-password. */
  async verifyPasswordReset(input: { otp: string; tempId: string }) {
    const res = await publicApi.post(API.PASSWORD_RESET_VERIFY, {
      otp: input.otp,
      temp_id: input.tempId,
    });
    const data = unwrap<PasswordResetVerifyResultDto>(res);
    return String(data?.token_hash ?? '');
  },

  async resetPassword(input: { token: string; password: string; confirmPassword: string }) {
    const res = await publicApi.post(API.RESET_PASSWORD, {
      token: input.token,
      password: input.password,
      confirm_password: input.confirmPassword,
    });
    return messageOf(res, 'Password reset');
  },

  async changePassword(input: {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
  }) {
    const res = await privateApi.post(API.CHANGE_PASSWORD, {
      current_password: input.currentPassword,
      new_password: input.newPassword,
      confirm_password: input.confirmPassword,
    });
    return messageOf(res, 'Password updated');
  },

  /** Current user's profile. Used to refresh RBAC on app start. */
  async profile(): Promise<AuthUserDto> {
    const res = await privateApi.get(API.PROFILE);
    return unwrap<AuthUserDto>(res);
  },

  /** Blacklists the refresh token server-side. Best-effort. */
  async logout(refresh?: string) {
    if (!refresh) return;
    await privateApi.post(API.LOGOUT, { refresh });
  },
};

export { mapAuthUser, mapSession };
