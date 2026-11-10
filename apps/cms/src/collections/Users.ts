import { APIError, type CollectionConfig } from "payload";
import { hasRole, isAdmin, isAdminField, ROLES } from "../access/roles";
import { onlyMachineRoles, refuseSignIn, staffAuthSettings } from "../security/staffAuth";

export const Users: CollectionConfig = {
  slug: "users",
  auth: {
    // Staff sign in through the sign-in proxy and its second factor (#30),
    // so the lock only slows guessing; a long lock would let anyone who
    // knows an email lock its owner out. Guessing from one address is
    // limited at the edge (docs/cms.md).
    maxLoginAttempts: 10,
    lockTime: 10 * 60 * 1000,
    useAPIKey: true,
  },
  admin: { useAsTitle: "email", group: "Settings" },
  access: {
    // Staff see each other's names; only admins manage accounts.
    read: ({ req }) => !!req.user,
    create: isAdmin,
    update: ({ req, id }) => hasRole(req.user, "admin") || req.user?.id === id,
    delete: isAdmin,
  },
  hooks: {
    beforeLogin: [
      ({ req, user }) => {
        const current = staffAuthSettings();
        const reason = refuseSignIn(
          current,
          req.headers.get(current.emailHeader),
          String((user as { email?: unknown }).email ?? ""),
        );
        if (reason) throw new APIError(reason, 403, undefined, true);
        return user;
      },
    ],
    beforeChange: [
      ({ data, originalDoc }) => {
        // An API key skips the sign-in proxy, so only machine accounts hold
        // one; a person's key would be a password without a second factor.
        const enabled = data.enableAPIKey ?? originalDoc?.enableAPIKey;
        const roles = data.roles ?? originalDoc?.roles;
        if (enabled && !onlyMachineRoles(roles)) {
          throw new APIError(
            "only accounts with the newsbot or viewer role, and no other, may have an API key",
            400,
            undefined,
            true,
          );
        }
        return data;
      },
    ],
  },
  fields: [
    { name: "name", type: "text", required: true },
    {
      name: "roles",
      type: "select",
      hasMany: true,
      required: true,
      defaultValue: ["author"],
      options: ROLES.map((r) => ({ label: r[0]!.toUpperCase() + r.slice(1), value: r })),
      // Only admins change roles, so nobody raises their own.
      access: { create: isAdminField, update: isAdminField },
      saveToJWT: true,
    },
  ],
};
