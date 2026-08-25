import SiteHeader from "../_components/SiteHeader";
import MyListView from "../_components/MyListView";

export default function MyListPage() {
  return (
    <main>
      <SiteHeader active="my-list" />
      <MyListView />
    </main>
  );
}
