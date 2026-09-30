import { configureStore, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import createSagaMiddleware from "redux-saga";
import { call, put, takeLatest } from "redux-saga/effects";
import { api } from "./api";

export type SessionUser = { id: string; email: string; name: string; tenantId: string | null; roles: string[] };
export type Job = { id: string; title: string; status: string; description: string };

const session = createSlice({
  name: "session",
  initialState: { user: null as SessionUser | null, error: null as string | null, loading: false },
  reducers: {
    loginRequested(state, _action: PayloadAction<{ email: string; password: string; tenantSlug?: string }>) {
      state.loading = true;
      state.error = null;
    },
    sessionReceived(state, action: PayloadAction<SessionUser>) {
      state.user = action.payload;
      state.loading = false;
      state.error = null;
    },
    sessionFailed(state, action: PayloadAction<string>) {
      state.loading = false;
      state.error = action.payload;
    },
    logoutRequested() {},
    loggedOut(state) {
      state.user = null;
    },
  },
});

const jobs = createSlice({
  name: "jobs",
  initialState: { items: [] as Job[], error: null as string | null },
  reducers: {
    jobsRequested() {},
    jobsReceived(state, action: PayloadAction<Job[]>) {
      state.items = action.payload;
      state.error = null;
    },
    jobsFailed(state, action: PayloadAction<string>) {
      state.error = action.payload;
    },
    approveRequested(_state, _action: PayloadAction<string>) {},
    applyRequested(_state, _action: PayloadAction<string>) {},
  },
});

export const { loginRequested, sessionReceived, sessionFailed, logoutRequested, loggedOut } = session.actions;
export const { jobsRequested, jobsReceived, jobsFailed, approveRequested, applyRequested } = jobs.actions;

function* loginWorker(action: ReturnType<typeof loginRequested>) {
  try {
    const me: SessionUser = yield call(api, "/auth/login", { method: "POST", body: JSON.stringify(action.payload) });
    yield put(sessionReceived(me));
    yield put(jobsRequested());
  } catch (error) {
    yield put(sessionFailed(error instanceof Error ? error.message : "invalid_credentials"));
  }
}

function* jobsWorker() {
  try {
    const rows: Job[] = yield call(api, "/jobs");
    yield put(jobsReceived(rows));
  } catch (error) {
    yield put(jobsFailed(error instanceof Error ? error.message : "jobs_failed"));
  }
}

function* approveWorker(action: ReturnType<typeof approveRequested>) {
  try {
    yield call(api, `/jobs/${action.payload}/decision`, { method: "POST", body: JSON.stringify({ status: "approved" }) });
    yield put(jobsRequested());
  } catch (error) {
    yield put(jobsFailed(error instanceof Error ? error.message : "approve_failed"));
  }
}

function* applyWorker(action: ReturnType<typeof applyRequested>) {
  try {
    yield call(api, "/applications", { method: "POST", body: JSON.stringify({ jobId: action.payload }) });
    yield put(jobsRequested());
  } catch (error) {
    yield put(jobsFailed(error instanceof Error ? error.message : "apply_failed"));
  }
}

function* logoutWorker() {
  try {
    yield call(api, "/auth/logout", { method: "POST" });
  } finally {
    yield put(loggedOut());
  }
}

function* rootSaga() {
  yield takeLatest(loginRequested.type, loginWorker);
  yield takeLatest(jobsRequested.type, jobsWorker);
  yield takeLatest(approveRequested.type, approveWorker);
  yield takeLatest(applyRequested.type, applyWorker);
  yield takeLatest(logoutRequested.type, logoutWorker);
}

const saga = createSagaMiddleware();
export const store = configureStore({
  reducer: { session: session.reducer, jobs: jobs.reducer },
  middleware: (getDefault) => getDefault({ thunk: false }).concat(saga),
});
saga.run(rootSaga);

export type RootState = ReturnType<typeof store.getState>;
