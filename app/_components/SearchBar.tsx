import AuthButton from "./AuthButton";

export default function SearchBar() {
  return (
    <div className="flex items-center gap-2 px-5 pt-5 pb-5">
      <input
        type="text"
        placeholder="영화 제목 또는 배우/감독 이름 "
        className="w-full flex-1 rounded-lg border border-neutral-700 bg-surface px-4 py-3 text-text placeholder:text-muted focus:border-brand focus:outline-none"
      />
      <AuthButton />
    </div>
  );
}
