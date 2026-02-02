import { checkPasswordStrength } from '@data/encryption';

export function isPasswordStepValid(
  password: string,
  confirmPassword: string
): boolean {
  const strength = checkPasswordStrength(password);
  return strength.isStrong && password === confirmPassword;
}
