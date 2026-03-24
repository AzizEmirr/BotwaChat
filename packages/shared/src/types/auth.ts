export type UserRole = "owner" | "admin" | "member";

export type AuthenticatedUser = {
  id: string;
  email: string;
  username: string;
};
