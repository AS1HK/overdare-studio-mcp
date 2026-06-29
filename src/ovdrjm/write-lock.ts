/**
 * 쓰기 직렬화 큐 — 동시 변이를 하나의 순서로 줄세운다.
 * acquire() 는 release 함수를 resolve 하는 Promise 를 반환하며, 앞선 작업이 release 될 때까지 대기한다.
 * 동시 호출이 같은 월드 파일/카운터를 경쟁하지 않게 한다.
 */
export interface WriteLock {
  acquire(): Promise<() => void>;
}

export function createSerialQueue(): WriteLock {
  let tail: Promise<void> = Promise.resolve();
  function acquire(): Promise<() => void> {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const ready = tail;
    tail = tail.then(() => gate);
    return ready.then(() => release);
  }
  return { acquire };
}

/** 프로세스 전역 단일 쓰기 락. 모든 월드 변이는 이 락을 통과한다. */
export const ovdrjmWriteLock = createSerialQueue();
