import AuthButton from "./AuthButton";
import SearchInput from "./SearchInput";

export default function SearchBar() {
  return (
    <div className="flex items-center gap-2 px-5 pt-5 pb-5">
      <SearchInput />
      <AuthButton />
    </div>
  );
}
