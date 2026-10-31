import { call, cancel, fork, join, takeEvery } from 'redux-saga/effects';

interface Tasks {
  [propName: string]: any;
}
export function takeLatestPerKey(
  patternOrChannel: any,
  worker: any,
  keySelector: any,
  ...args: any[]
) {
  return fork(function* (): Generator<any, void, any> {
    const tasks: Tasks = {};

    yield takeEvery(patternOrChannel, function* (action): Generator<any, void, any> {
      const key: string = yield call(keySelector, action);

      if (tasks[key]) {
        yield cancel(tasks[key]);
      }

      tasks[key] = yield fork(worker, ...args, action);

      yield join(tasks[key]);

      if (tasks[key] && !tasks[key].isRunning()) {
        delete tasks[key];
      }
    });
  });
}
