/** Atomic reservation ledger for the single shared Workers AI daily budget. */
export interface NeuronStorage {
  get<T = unknown>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<boolean>;
}

export interface NeuronReservation {
  /** Internal accounting data only; never include this in an HTTP response. */
  id: string;
  day: string;
  amount: number;
}

interface StoredReservation {
  day: string;
  amount: number;
}

export interface NeuronBudgetState {
  day: string;
  neurons: number;
  paused: boolean;
  limit: number;
}

/**
 * Serializes check-and-reserve across every request using the budget Durable
 * Object. Failed inference releases exactly its reservation; successful
 * inference settles it while keeping the spent estimate in the daily total.
 */
export class NeuronBudget {
  private readonly storage: NeuronStorage;
  private readonly limit: number;
  private readonly dayKey: () => string;
  private chain: Promise<unknown> = Promise.resolve();

  constructor(storage: NeuronStorage, limit: number, dayKey: () => string) {
    this.storage = storage;
    this.limit = limit;
    this.dayKey = dayKey;
  }

  async state(): Promise<NeuronBudgetState> {
    const day = this.dayKey();
    const neurons = (await this.storage.get<number>(`neurons:${day}`)) ?? 0;
    return { day, neurons, paused: neurons >= this.limit, limit: this.limit };
  }

  async reserve(amount: number): Promise<NeuronReservation | null> {
    if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('invalid neuron reservation');
    return this.withLock(async () => {
      const day = this.dayKey();
      const key = `neurons:${day}`;
      const neurons = (await this.storage.get<number>(key)) ?? 0;
      if (neurons + amount > this.limit) return null;

      const reservation = { id: crypto.randomUUID(), day, amount };
      await this.storage.put(key, neurons + amount);
      try {
        await this.storage.put(`neuron-reservation:${reservation.id}`, { day, amount });
      } catch (error) {
        // Roll back the counter while still holding the lock. A failed token
        // write must not consume budget without returning a releasable token.
        try {
          await this.storage.put(key, neurons);
        } catch {
          // A failed rollback conservatively leaves budget consumed.
        }
        throw error;
      }
      const yesterday = new Date(`${day}T00:00:00.000Z`).getTime() - 24 * 60 * 60 * 1000;
      try {
        await this.storage.delete(`neurons:${new Date(yesterday).toISOString().slice(0, 10)}`);
      } catch {
        // Old daily keys are harmless; cleanup failure must not strand a token.
      }
      return reservation;
    });
  }

  /** Keep the budget spend after successful inference; delete its in-flight token. */
  async settle(reservation: NeuronReservation): Promise<void> {
    await this.withLock(async () => {
      const key = `neuron-reservation:${reservation.id}`;
      const stored = await this.storage.get<StoredReservation>(key);
      if (stored?.day === reservation.day && stored.amount === reservation.amount) {
        await this.storage.delete(key);
      }
    });
  }

  /** Release a failed inference once; repeated calls cannot undercount the day. */
  async release(reservation: NeuronReservation): Promise<void> {
    await this.withLock(async () => {
      const reservationKey = `neuron-reservation:${reservation.id}`;
      const stored = await this.storage.get<StoredReservation>(reservationKey);
      if (!stored || stored.day !== reservation.day || stored.amount !== reservation.amount) return;
      // Delete first: if counter settlement then fails, the budget remains
      // conservatively charged and a retry cannot release it a second time.
      if (!(await this.storage.delete(reservationKey))) return;
      const dayKey = `neurons:${stored.day}`;
      const neurons = (await this.storage.get<number>(dayKey)) ?? 0;
      await this.storage.put(dayKey, Math.max(0, neurons - stored.amount));
    });
  }

  private withLock<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.chain.then(operation, operation);
    this.chain = run.then(() => undefined, () => undefined);
    return run;
  }
}
