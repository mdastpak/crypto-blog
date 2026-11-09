import { Listing, listingMetadata, type ListingProps } from "@/components/cms/Listing";

// Depends on ?page=; the CMS answers it reads are still cached.
export const dynamic = "force-dynamic";

export const generateMetadata = (props: ListingProps) => listingMetadata("categories", props);

export default function Page(props: ListingProps) {
  return <Listing kind="categories" {...props} />;
}
