import type { At } from '@atcute/client/lexicons';

import type { DPoPKey } from '../types/dpop.js';
import type { AuthorizationServerMetadata } from '../types/server.js';
import type { SimpleStore } from '../types/store.js';
import type { Session } from '../types/token.js';
import { locks } from '../utils/runtime.js';

export interface OAuthDatabaseOptions {
	name: string;
}

interface SchemaItem<T> {
	value: T;
	expiresAt: number | null;
}

interface Schema {
	sessions: {
		key: At.DID;
		value: Session;
		indexes: {
			expiresAt: number;
		};
	};
	states: {
		key: string;
		value: {
			dpopKey: DPoPKey;
			metadata: AuthorizationServerMetadata;
			verifier?: string;
		};
	};

	dpopNonces: {
		key: string;
		value: string;
	};
}

const parse = (raw: string | null) => {
	if (raw != null) {
		const parsed = JSON.parse(raw);
		if (parsed != null) {
			return parsed;
		}
	}

	return {};
};

let compatibleStorage: any;

const getStorage= () => {
	if (compatibleStorage) {
		return compatibleStorage;
	}

	try {
		// Chromium-based
		compatibleStorage = chrome.storage.local;
		return compatibleStorage;
	} catch (error) {
		console.log(error);
	}

	try {
		// Firefox-based
		compatibleStorage = browser.storage.local;
		return compatibleStorage;
	} catch (error) {
		console.log(error);
	}

	return localStorage;
}

export type OAuthDatabase = ReturnType<typeof createOAuthDatabase>;

export const createOAuthDatabase = ({ name }: OAuthDatabaseOptions) => {
	const controller = new AbortController();
	const signal = controller.signal;

	const createStore = <N extends keyof Schema>(
		subname: N,
		expiresAt: (item: Schema[N]['value']) => null | number,
	): SimpleStore<Schema[N]['key'], Schema[N]['value']> => {
		let store: any;

		const storageKey = `${name}:${subname}`;

		const storage = getStorage();
		// todo: handle result await return
		const persist = async () => store && await storage.set({storageKey: JSON.stringify(store)});
		const read = async () => {
			if (signal.aborted) {
				throw new Error(`store closed`);
			}
			// todo: handle result await return
			return (store ??= parse(await storage.get([storageKey])));
		};

		{
			const listener = (ev: StorageEvent) => {
				if (ev.key === storageKey) {
					store = undefined;
				}
			};

			globalThis.addEventListener('storage', listener, { signal });
		}

		{
			const cleanup = async (lock: Lock | true | null) => {
				if (!lock || signal.aborted) {
					return;
				}

				await new Promise((resolve) => setTimeout(resolve, 10_000));
				if (signal.aborted) {
					return;
				}

				let now = Date.now();
				let changed = false;

				await read();

				for (const key in store) {
					const item = store[key];
					const expiresAt = item.expiresAt;

					if (expiresAt !== null && now > expiresAt) {
						changed = true;
						delete store[key];
					}
				}

				if (changed) {
					await persist();
				}
			};

			if (locks) {
				locks.request(`${storageKey}:cleanup`, { ifAvailable: true }, cleanup);
			} else {
				await cleanup(true);
			}
		}

		return {
			get(key) {
				await read();

				const item: SchemaItem<Schema[N]['value']> = store[key];
				if (!item) {
					return;
				}

				const expiresAt = item.expiresAt;
				if (expiresAt !== null && Date.now() > expiresAt) {
					delete store[key];
					await persist();

					return;
				}

				return item.value;
			},
			set(key, value) {
				await read();

				const item: SchemaItem<Schema[N]['value']> = {
					expiresAt: expiresAt(value),
					value: value,
				};

				store[key] = item;
				await persist();
			},
			delete(key) {
				await read();

				if (store[key] !== undefined) {
					delete store[key];
					await persist();
				}
			},
			keys() {
				await read();

				return Object.keys(store);
			},
		};
	};

	return {
		dispose: () => {
			controller.abort();
		},

		sessions: createStore('sessions', ({ token }) => {
			if (token.refresh) {
				return null;
			}

			return token.expires_at ?? null;
		}),
		states: createStore('states', (_item) => Date.now() + 10 * 60 * 1_000),
		dpopNonces: createStore('dpopNonces', (_item) => Date.now() + 10 * 60 * 1_000),
	};
};
