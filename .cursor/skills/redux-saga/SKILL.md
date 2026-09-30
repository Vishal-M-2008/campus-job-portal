---
name: redux-saga
description: Organizes Redux Toolkit slices and redux-saga workers for API calls, uploads, and college import. Use when editing store, sagas, or client data flow.
---

# Redux saga

## Layout

`apps/web/src/store/index.ts` creates the store with `redux-saga`. One slice per domain: `session`, `jobs`, `applications`, `profile`, `admin`.

## Worker shape

```ts
function* loadJobs() {
  try {
    const body = yield call(api.get, "/jobs");
    yield put(jobsReceived(body));
  } catch (error) {
    yield put(jobsFailed(String(error)));
  }
}
```

`api` sends cookies and `x-csrf-token`. Components dispatch `jobsRequested`. They do not call `fetch`.

Uploads (`resume`, offer PDF) and CSV/Excel/JSON import use the same pattern and store `loading` plus `error` on the slice.
