import type { Access, FieldAccess, PayloadRequest } from "payload";

/**
 * Editorial roles, from most to least power:
 * - admin: everything, including users and settings;
 * - editor: writes, publishes, and deletes any content;
 * - reviewer: reads and publishes, does not write;
 * - author: writes their own drafts, cannot publish.
 */
export const ROLES = ["admin", "editor", "reviewer", "author"] as const;
export type Role = (typeof ROLES)[number];

interface UserLike {
  id: number | string;
  roles?: Role[] | null;
}

export function hasRole(user: unknown, ...roles: Role[]): boolean {
  const u = user as UserLike | null | undefined;
  return !!u?.roles?.some((r) => roles.includes(r));
}

export const canPublish = (user: unknown) => hasRole(user, "admin", "editor", "reviewer");
export const canWrite = (user: unknown) => hasRole(user, "admin", "editor", "author");

export const isAdmin: Access = ({ req }) => hasRole(req.user, "admin");
export const isStaff: Access = ({ req }) => !!req.user;
export const isWriter: Access = ({ req }) => canWrite(req.user);
export const isEditor: Access = ({ req }) => hasRole(req.user, "admin", "editor");
export const isAdminField: FieldAccess = ({ req }) => hasRole(req.user, "admin");

/** Anyone reads published documents; staff also read drafts. */
export const publishedOrStaff: Access = ({ req }) =>
  req.user ? true : { _status: { equals: "published" } };

/** Editors update anything; authors only what they created. */
export const ownOrEditor: Access = ({ req }) => {
  if (hasRole(req.user, "admin", "editor", "reviewer")) return true;
  if (hasRole(req.user, "author")) return { createdBy: { equals: (req.user as UserLike).id } };
  return false;
};

export function userOf(req: PayloadRequest): UserLike | null {
  return (req.user as UserLike | null) ?? null;
}
