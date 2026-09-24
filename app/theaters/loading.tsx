import SiteHeader from "@/app/_components/SiteHeader";
import RowSkeleton from "@/app/_components/RowSkeleton";

export default function Loading() {
  return (
    <main>
      <SiteHeader />
      <RowSkeleton />
      <RowSkeleton />
    </main>
  );
}
