import SearchBar from "./_components/SearchBar";
import CategoryNav from "./_components/CategoryNav";
import NowInTheatersSection from "./_components/NowInTheatersSection";

export default function Home() {
  return (
    <main>
      <SearchBar />
      <CategoryNav />
      <NowInTheatersSection />
    </main>
  );
}
