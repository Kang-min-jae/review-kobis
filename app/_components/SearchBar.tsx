export default function SearchBar() {
  return (
    <div className="px-5 pt-5 pb-5">
      <input
        type="text"
        placeholder="영화 제목 또는 배우/감독 이름 "
        className="w-full rounded-lg border border-neutral-700 bg-surface px-4 py-3 text-text placeholder:text-muted focus:border-brand focus:outline-none"
      />
    </div>
  );
}
