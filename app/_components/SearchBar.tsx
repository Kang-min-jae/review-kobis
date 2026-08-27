import { auth } from "../../auth";
import AuthButton from "./AuthButton";
import SearchInput from "./SearchInput";

export default async function SearchBar() {
  const session = await auth();

  return (
    <div className="flex items-center gap-2 px-5 pt-5 pb-5">
      <SearchInput />
      <AuthButton session={session} />
    </div>
  );
}
