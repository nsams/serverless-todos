// The authenticated user: identified by email (the login of either platform, src/platform/), used as user id for all data
export type User = { id: string; email: string };

export function userFromEmail(email: string): User {
    const normalizedEmail = email.toLowerCase();
    return { id: normalizedEmail, email: normalizedEmail };
}
