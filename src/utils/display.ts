export function displayName(user: {
  username?: string;
  first_name?: string;
  id: number;
}): string {
  if (user.username) return `@${user.username}`;
  return user.first_name ?? `user${user.id}`;
}