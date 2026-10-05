/** Better Auth error codes → French messages. */
const MESSAGES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "Email ou mot de passe incorrect.",
  USER_ALREADY_EXISTS: "Un compte existe déjà avec cet email. Connectez-vous.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "Un compte existe déjà avec cet email. Connectez-vous.",
  PASSWORD_TOO_SHORT: "Le mot de passe doit contenir au moins 8 caractères.",
  PASSWORD_TOO_LONG: "Le mot de passe est trop long.",
  INVALID_EMAIL: "Adresse email invalide.",
};

export function authErrorMessage(error: { code?: string; status?: number } | null): string {
  if (error?.status === 429) return "Trop de tentatives. Patientez une minute avant de réessayer.";
  return (error?.code && MESSAGES[error.code]) || "Une erreur est survenue. Réessayez.";
}
