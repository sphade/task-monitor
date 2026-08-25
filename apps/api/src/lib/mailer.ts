/**
 * Email delivery hook.
 *
 * The Django API sent OTP codes through its email service. On Workers, wire a
 * provider here — e.g. the MailChannels/Resend HTTP API via fetch, or
 * Cloudflare Email Routing (see the cloudflare-email-service skill).
 * Until a provider is configured, codes are logged so local flows work.
 */
export async function sendOtpEmail(
  to: string,
  code: string,
  purpose: 'login' | 'password-reset',
): Promise<void> {
  console.log(
    JSON.stringify({
      level: 'info',
      event: 'otp_email',
      to,
      purpose,
      // NOTE: replace with a real provider before public launch.
      code,
    }),
  );
}
