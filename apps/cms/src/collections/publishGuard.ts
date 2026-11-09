import { APIError, type CollectionBeforeChangeHook } from "payload";
import { canPublish, hasRole } from "../access/roles";

/**
 * Only editors, reviewers, and admins publish. An author's save of a
 * published status is refused, so their work waits for review. The news
 * worker publishes only a news item it labels as auto-published (its review
 * policy allowed it), and writes nothing but news. Calls of the local API
 * without a user (seed, jobs) are trusted.
 */
export const publishGuard: CollectionBeforeChangeHook = ({ data, originalDoc, req }) => {
  const bot = hasRole(req.user, "newsbot") && !canPublish(req.user);
  if (bot && (data?.type ?? originalDoc?.type) !== "news") {
    throw new APIError("The news worker writes only news.", 403);
  }
  const publishing = data?._status === "published" && originalDoc?._status !== "published";
  if (publishing && req.user && !canPublish(req.user)) {
    const labeled = (data?.autoPublished ?? originalDoc?.autoPublished) === true;
    if (!(bot && labeled)) throw new APIError("Only editors and reviewers can publish.", 403);
  }
  return data;
};
