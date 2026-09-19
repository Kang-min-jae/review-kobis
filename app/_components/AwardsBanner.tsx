import type { AwardWin } from "../_lib/award-winners";

const FESTIVAL_ICONS: Record<string, string> = {
  academy: "🏆",
  cannes: "🎬",
  berlin: "🐻",
  venice: "🦁",
};

export default function AwardsBanner({ wins }: { wins: AwardWin[] }) {
  if (wins.length === 0) return null;

  // 같은 시상식+연도 조합을 하나의 행으로 묶는다
  const grouped = new Map<string, { festivalName: string; festivalId: string; year: number; categories: string[] }>();
  for (const win of wins) {
    const key = `${win.festivalId}-${win.year}`;
    if (!grouped.has(key)) {
      grouped.set(key, { festivalName: win.festivalName, festivalId: win.festivalId, year: win.year, categories: [] });
    }
    grouped.get(key)!.categories.push(win.category);
  }

  return (
    <div className="mb-5 rounded-xl border border-amber-500/30 bg-amber-500/8 px-4 py-3">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-amber-400">수상 이력</p>
      <div className="space-y-1.5">
        {Array.from(grouped.values()).map((group) => (
          <div key={`${group.festivalId}-${group.year}`} className="flex items-start gap-2">
            <span className="mt-0.5 text-sm leading-none">{FESTIVAL_ICONS[group.festivalId] ?? "🏅"}</span>
            <div className="min-w-0">
              <span className="text-xs font-semibold text-amber-300">{group.festivalName} {group.year}</span>
              <span className="mx-1.5 text-amber-600">·</span>
              <span className="text-xs text-amber-200/80">{group.categories.join(", ")}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
