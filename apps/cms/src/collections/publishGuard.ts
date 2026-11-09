import { APIError, type CollectionBeforeChangeHook } from "payload";
import { canPublish } from "../access/roles";

/**
 * Only editors, reviewers, and admins publish. An author's save of a
 * published status is refused, so their work waits for review. Calls of the
 * local API without a user (seed, jobs) are trusted.
 */
export const publishGuard: CollectionBeforeChangeHook = ({ data, originalDoc, req }) => {
  const publishing = data?._status === "published" && originalDoc?._status !== "published";
  if (publishing && req.user && !canPublish(req.user)) {
    throw new APIError("Only editors and reviewers can publish.", 403);
  }
  return data;
};
