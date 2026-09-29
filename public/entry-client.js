// Retain a secret for this exact entry attempt so a lost response can be recovered.
(() => {
  function create({storage, now = Date.now, random = () => [...crypto.getRandomValues(new Uint8Array(32))].map(n => n.toString(16).padStart(2, '0')).join('')}) {
    const pendingKey = 'robotland-pending-entry-v1', recoveryKey = 'robotland-student-recovery-v1';
    let memory = null;
    const read = key => { try { return JSON.parse(storage.getItem(key) || 'null'); } catch { return null; } };
    function pending() {
      const record = memory || read(pendingKey);
      return record && now() - record.entryTime >= -60000 && now() - record.entryTime < 600000 ? record : null;
    }
    function prepare(path, body) {
      const target = JSON.stringify([path, body.code || '', body.inviteToken || '', body.nickname, body.deviceId]);
      let record = pending();
      if (!record || record.target !== target) record = {target, entryToken: random(), recoveryToken: random(), entryTime: now(), deviceId: body.deviceId};
      memory = record;
      try { storage.setItem(pendingKey, JSON.stringify(record)); } catch {}
      return {...body, entryToken: record.entryToken, entryTime: record.entryTime, recoveryToken: record.recoveryToken};
    }
    function complete(body, result) {
      let saved = false;
      if (result.user?.role === 'student') {
        try {
          storage.setItem(recoveryKey, JSON.stringify({classId: result.user.classId, deviceId: result.user.deviceId, token: body.recoveryToken}));
          saved = true;
        } catch {}
      }
      if (pending()?.entryToken === body.entryToken) {
        memory = null;
        try { storage.removeItem(pendingKey); } catch {}
      }
      return saved && result.recoveryRegistered === true;
    }
    return {prepare, complete, pendingRecovery: () => {const p = pending(); return p ? {token:p.recoveryToken,deviceId:p.deviceId} : null;}};
  }
  globalThis.RobotlandEntry = {create};
})();
