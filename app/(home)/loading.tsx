import RowSkeleton from "../_components/RowSkeleton";

// 탭 이동은 서버 렌더가 필요한 동적 이동이라, 이 로딩 화면이 없으면 응답이 올 때까지
// 화면이 그대로 멈춰 있었다. 있으면 미리 받아둔 이 화면으로 즉시 전환된다.
export default function HomeLoading() {
  return (
    <main>
      <RowSkeleton />
      <RowSkeleton />
      <RowSkeleton />
    </main>
  );
}
