import { ChunkJobData, WorkerResponse } from '../../types';

type JobCallback = (response: WorkerResponse) => void;

interface Job {
  data: ChunkJobData;
  callback: JobCallback;
}

/**
 * Manages a pool of Web Workers and a job queue.
 * Jobs are dispatched to idle workers; queued while all workers are busy.
 */
export default class WorkerPool {
  private readonly workers: Worker[] = [];
  private readonly idle: Worker[] = [];
  private readonly queue: Job[] = [];

  constructor(workerCount: number) {
    for (let i = 0; i < workerCount; i++) {
      const worker = new Worker(
        new URL('../../Workers/ChunkWorker.ts', import.meta.url),
        { type: 'module' },
      );
      worker.onmessage = (e: MessageEvent<WorkerResponse>) => this.onMessage(worker, e.data);
      this.workers.push(worker);
      this.idle.push(worker);
    }
  }

  /** Enqueue a chunk generation job. Runs immediately if a worker is free. */
  dispatch(data: ChunkJobData, callback: JobCallback): void {
    const worker = this.idle.pop();
    if (worker) {
      this.run(worker, { data, callback });
    } else {
      this.queue.push({ data, callback });
    }
  }

  /** Cancel all pending (queued) jobs for a specific chunk key. */
  cancel(chunkKey: string): void {
    const idx = this.queue.findIndex(j => j.data.chunkKey === chunkKey);
    if (idx !== -1) this.queue.splice(idx, 1);
  }

  private run(worker: Worker, job: Job): void {
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      job.callback(e.data);
      this.onMessage(worker, e.data);
    };
    worker.postMessage(job.data);
  }

  private onMessage(worker: Worker, _response: WorkerResponse): void {
    const next = this.queue.shift();
    if (next) {
      this.run(worker, next);
    } else {
      this.idle.push(worker);
    }
  }

  terminate(): void {
    for (const w of this.workers) w.terminate();
  }
}
