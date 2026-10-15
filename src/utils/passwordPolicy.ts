/** Shared password rules for signup, reset, and change-password. */
export function passwordPolicyError(password: string): string | null {
  if (password.length < 8) return "Password must be at least 8 characters";
  if (password.length > 128) return "Password is too long";
  if (!/[a-zA-Z]/.test(password)) return "Password must include a letter";
  if (!/[0-9]/.test(password)) return "Password must include a number";
  return null;
}
