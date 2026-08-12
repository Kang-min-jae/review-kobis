import SearchBar from "../_components/SearchBar";
import CategoryNav from "../_components/CategoryNav";
import MyListView from "../_components/MyListView";

export default function MyListPage() {
  return (
    <main>
      <SearchBar />
      <CategoryNav active="my-list" />
      <MyListView />
    </main>
  );
}
