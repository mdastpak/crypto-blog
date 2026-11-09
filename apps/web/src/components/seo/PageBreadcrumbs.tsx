import { Breadcrumbs, type Crumb } from "@/components/ui";
import { getConfig } from "@/lib/config";
import { breadcrumbList } from "@/lib/seo/jsonld";
import { JsonLd } from "./JsonLd";

/**
 * The page's breadcrumbs, and the same trail as a BreadcrumbList for search
 * engines. `current` is the page's own path (the last item has no link).
 */
export function PageBreadcrumbs({
  items,
  label,
  current,
}: {
  items: Crumb[];
  label: string;
  current: string;
}) {
  const { publicSiteUrl } = getConfig();
  return (
    <>
      <Breadcrumbs items={items} label={label} />
      <JsonLd data={breadcrumbList(publicSiteUrl, items, current)} />
    </>
  );
}
