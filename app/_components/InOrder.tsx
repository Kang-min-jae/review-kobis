import { cache, type ReactNode } from "react";

// 공용 캐시 페이지(app/anon/…)를 다시 만들 때 결과가 매번 같은 바이트가 되게 한다.
//
// 상세·홈 화면은 예고편·리뷰·행 목록 같은 부분을 각자 따로 불러와서(<Suspense>), 먼저 끝난 부분부터 페이지
// 데이터(HTML·RSC)에 들어갔다. 끝나는 순서가 매번 달라 내용이 똑같아도 바이트가 달라졌고, Vercel은 내용이
// 바뀌었다고 보고 다시 만들 때마다 ISR 캐시를 새로 썼다(실측: 같은 페이지 5번 → 5번 모두 다른 바이트).
//
// <InOrder node={…} />로 감싼 부분은 데이터는 지금처럼 동시에 불러오되, 모든 부분의 데이터가 준비된 뒤
// 화면에 놓인 순서대로 한꺼번에 페이지에 들어간다. 로그인한 사람의 페이지는 캐시하지 않으니 쓰지 않는다
// — 준비된 부분부터 바로 보여 주는 편이 빠르다.

type Sequence = { pending: Promise<unknown>[]; last: Promise<void> };

// 요청마다 하나
const getSequence = cache((): Sequence => ({ pending: [], last: Promise.resolve() }));

// 감싼 부분이 모두 끝날 때까지 기다린다. 기다리는 사이 새로 등록된 부분이 있으면 그것도 기다린다.
async function allSettled(sequence: Sequence) {
  for (;;) {
    const count = sequence.pending.length;
    await Promise.allSettled(sequence.pending);
    if (sequence.pending.length === count) return;
  }
}

export async function InOrder({ node }: { node: Promise<ReactNode> }) {
  // 자리는 렌더 순서(화면 순서)대로 동기적으로 잡는다 — 이 함수가 처음 await하기 전에.
  const sequence = getSequence();
  sequence.pending.push(node);
  const previous = sequence.last;
  let markDone!: () => void;
  sequence.last = new Promise<void>((resolve) => {
    markDone = resolve;
  });
  try {
    await allSettled(sequence);
    await previous;
    return await node;
  } finally {
    markDone();
  }
}
