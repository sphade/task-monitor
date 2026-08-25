import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useRef, useState, type ReactNode } from 'react';
import {
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TextField } from '@/components/ui/kit';
import type { ThemeColors } from '@/constants/oih-theme';
import { useTheme } from '@/context/theme';
import { useThemedStyles, type StyleFactoryArgs } from '@/hooks/use-themed-styles';

const logo = require('../../../assets/images/logo.png');

/**
 * Shared chrome for every auth screen: warm orange gradient canvas, elevated
 * white card with a gradient accent bar, brand logo, and an optional footer.
 * Mirrors the web platform's login card.
 */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
  onBack,
  showLogo = true,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  onBack?: () => void;
  showLogo?: boolean;
}) {
  const { colors, gradients } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <LinearGradient colors={[...gradients.canvas]} style={styles.gradient}>
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          style={styles.safe}
          behavior={Platform.select({ ios: 'padding', default: undefined })}
        >
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.card}>
              <LinearGradient
                colors={[...gradients.accentBar]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.accentBar}
              />

              <View style={styles.cardBody}>
                {!!onBack && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Go back"
                    onPress={onBack}
                    hitSlop={10}
                    style={({ pressed }) => [styles.back, pressed && { opacity: 0.6 }]}
                  >
                    <Ionicons name="arrow-back" size={20} color={colors.textSecondary} />
                  </Pressable>
                )}

                <View style={styles.header}>
                  {showLogo && <Image source={logo} style={styles.logo} contentFit="contain" />}
                  <Text style={styles.title}>{title}</Text>
                  {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
                </View>

                {children}
              </View>

              {!!footer && <View style={styles.footer}>{footer}</View>}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

/** Standard legal footer used on the sign-in screen. */
export function TermsFooter() {
  const styles = useThemedStyles(makeStyles);
  return (
    <Text style={styles.footerText}>
      By continuing you agree to our <Text style={styles.footerLink}>Terms</Text> and{' '}
      <Text style={styles.footerLink}>Privacy Policy</Text>
    </Text>
  );
}

/** "Back to login" footer link for the recovery flow. */
export function BackToLoginFooter() {
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable onPress={() => router.replace('/(auth)/login')} hitSlop={8}>
      <Text style={styles.footerText}>
        Remembered it? <Text style={styles.footerLink}>Back to sign in</Text>
      </Text>
    </Pressable>
  );
}

/** Password field with a show/hide toggle. */
export function PasswordField({
  label,
  value,
  onChangeText,
  placeholder = 'Enter your password',
  error,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  error?: string;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [visible, setVisible] = useState(false);
  return (
    <View>
      <TextField
        label={label}
        icon="lock-closed-outline"
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        secureTextEntry={!visible}
        error={error}
        style={{ paddingRight: 44 }}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={visible ? 'Hide password' : 'Show password'}
        onPress={() => setVisible((v) => !v)}
        hitSlop={8}
        style={styles.eye}
      >
        <Ionicons
          name={visible ? 'eye-off-outline' : 'eye-outline'}
          size={18}
          color={colors.textMuted}
        />
      </Pressable>
    </View>
  );
}

/** Scores a password 0-4 on length and character variety. */
export function scorePassword(pw: string): number {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++;
  return score;
}

const STRENGTH_LABELS = ['Too short', 'Weak', 'Fair', 'Good', 'Strong'] as const;

/** Label + colour for a 0-4 strength score, resolved against the active palette. */
function strengthMeta(score: number, c: ThemeColors) {
  const tones = [c.danger, c.danger, c.warning, c.info, c.success];
  return { label: STRENGTH_LABELS[score], color: tones[score] };
}

/** Four-segment strength meter shown beneath a new-password field. */
export function PasswordStrength({ password }: { password: string }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  if (!password) return null;
  const score = scorePassword(password);
  const meta = strengthMeta(score, colors);
  return (
    <View style={styles.strengthWrap}>
      <View style={styles.strengthBars}>
        {[0, 1, 2, 3].map((i) => (
          <View
            key={i}
            style={[styles.strengthBar, { backgroundColor: i < score ? meta.color : colors.border }]}
          />
        ))}
      </View>
      <Text style={[styles.strengthLabel, { color: meta.color }]}>{meta.label}</Text>
    </View>
  );
}

/**
 * Six segmented boxes that mirror a single hidden input — the standard
 * premium OTP pattern. Tapping anywhere focuses the input.
 */
export function OtpInput({
  value,
  onChangeText,
  length = 6,
}: {
  value: string;
  onChangeText: (v: string) => void;
  length?: number;
}) {
  const styles = useThemedStyles(makeStyles);
  const inputRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  const digits = value.split('');

  return (
    <Pressable onPress={() => inputRef.current?.focus()} style={styles.otpRow}>
      {Array.from({ length }).map((_, i) => {
        const active = focused && i === Math.min(value.length, length - 1);
        return (
          <View key={i} style={[styles.otpBox, !!digits[i] && styles.otpBoxFilled, active && styles.otpBoxActive]}>
            <Text style={styles.otpDigit}>{digits[i] ?? ''}</Text>
          </View>
        );
      })}
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={(v) => onChangeText(v.replace(/\D/g, '').slice(0, length))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        keyboardType="number-pad"
        maxLength={length}
        autoComplete="sms-otp"
        textContentType="oneTimeCode"
        style={styles.hiddenInput}
      />
    </Pressable>
  );
}

const makeStyles = ({ c, isDark, radius, spacing }: StyleFactoryArgs) =>
  StyleSheet.create({
    gradient: { flex: 1 },
    safe: { flex: 1 },
    scroll: { flexGrow: 1, justifyContent: 'center', padding: spacing.lg },
    card: {
      backgroundColor: c.surface,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: c.divider,
      overflow: 'hidden',
      shadowColor: isDark ? '#000000' : '#111827',
      shadowOpacity: isDark ? 0.35 : 0.1,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 10 },
      elevation: 6,
    },
    accentBar: { height: 6, width: '100%' },
    cardBody: { padding: spacing.xl, gap: spacing.md },
    back: { alignSelf: 'flex-start', marginBottom: spacing.xs },
    header: { alignItems: 'center', marginBottom: spacing.md },
    logo: { width: 48, height: 48, borderRadius: 24, marginBottom: spacing.md },
    title: { color: c.text, fontSize: 23, fontWeight: '800', letterSpacing: -0.4 },
    subtitle: {
      color: c.textSecondary,
      fontSize: 13,
      marginTop: 5,
      textAlign: 'center',
      lineHeight: 19,
    },
    footer: {
      paddingHorizontal: spacing.xl,
      paddingVertical: spacing.md,
      backgroundColor: c.background,
      borderTopWidth: 1,
      borderTopColor: c.divider,
    },
    footerText: { color: c.textMuted, fontSize: 11.5, textAlign: 'center', lineHeight: 17 },
    footerLink: { color: c.accentMuted, fontWeight: '700' },
    eye: { position: 'absolute', right: 14, top: 33 },
    strengthWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: -2 },
    strengthBars: { flexDirection: 'row', gap: 4, flex: 1 },
    strengthBar: { flex: 1, height: 4, borderRadius: 2 },
    strengthLabel: { fontSize: 11, fontWeight: '700', minWidth: 58, textAlign: 'right' },
    otpRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
    otpBox: {
      flex: 1,
      aspectRatio: 0.82,
      maxHeight: 56,
      borderRadius: radius.md,
      borderWidth: 1.5,
      borderColor: c.border,
      backgroundColor: c.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    otpBoxFilled: { borderColor: c.accent, backgroundColor: c.accentSoft },
    otpBoxActive: { borderColor: c.accent, backgroundColor: c.surface },
    otpDigit: { color: c.text, fontSize: 20, fontWeight: '800' },
    hiddenInput: { position: 'absolute', opacity: 0, width: '100%', height: '100%' },
  });
