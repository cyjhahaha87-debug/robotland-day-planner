// One storage request at a time per page; repeated reads share their pending result.
// Results are never cached across writes or identity changes.
(() => {
  function create({fetch: send, epoch, translate = value => value, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), random = Math.random}) {
    let tail = Promise.resolve(), writeSequence = 0;
    const reads = new Map();
    function assertSession(expected) {
      if (expected === epoch()) return;
      const error = new Error(translate('접속 정보가 바뀌었어요. 현재 반에서 다시 시도하세요.'));
      error.staleSession = true;
      throw error;
    }
    return function request(path, body) {
      const expected = epoch(), isWrite = body !== undefined;
      if (isWrite) writeSequence++;
      const key = JSON.stringify([expected, writeSequence, path]);
      if (!isWrite && reads.has(key)) return reads.get(key);
      const serialized = isWrite ? JSON.stringify(body) : undefined;
      const task = tail.then(async () => {
        for (let attempt = 0; ; attempt++) {
          // A queued write must never be sent using the next classroom's cookie.
          assertSession(expected);
          const response = await send('/api/' + path, {
            method: isWrite ? 'POST' : 'GET', headers: isWrite ? {'content-type': 'application/json'} : {},
            body: serialized, credentials: 'same-origin', signal: AbortSignal.timeout(22000)
          });
          const result = await response.json();
          assertSession(expected);
          // Only an explicit lock rejection guarantees that no write was performed.
          // Never retry ambiguous network timeouts, failed logins, or quota limits.
          const lockBusy = response.status === 503 && !result.ok &&
            (result.code === 'STORE_BUSY' || result.error === '요청이 많아요. 잠시 후 다시 시도해 주세요.');
          if (lockBusy && attempt === 0) { await sleep(800 + Math.floor(random() * 700)); continue; }
          if (!response.ok || !result.ok) {
            const message = lockBusy ? '저장소 연결이 지연되고 있어요. 잠시 후 다시 시도해 주세요.' : result.error || '연결을 확인해 주세요.';
            const error = new Error(translate(message));
            error.status = response.status; error.code = result.code;
            throw error;
          }
          return result;
        }
      });
      tail = task.catch(() => {});
      if (!isWrite) {
        reads.set(key, task);
        const clear = () => { if (reads.get(key) === task) reads.delete(key); };
        task.then(clear, clear);
      }
      return task;
    };
  }
  globalThis.RobotlandRequests = {create};
})();
