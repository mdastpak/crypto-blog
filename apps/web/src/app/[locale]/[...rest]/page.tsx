import { notFound } from "next/navigation";

// Any path under a locale that no page matches: the localized 404.
export default function CatchAll() {
  notFound();
}
