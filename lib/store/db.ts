import type {At} from '@atcute/client/lexicons';

import type {DPoPKey} from '../types/dpop.js';
import type {AuthorizationServerMetadata} from '../types/server.js';
import type {SimpleStore} from '../types/store.js';
import type {Session} from '../types/token.js';
import {locks} from '../utils/runtime.js';
import {RsOk} from "../utils/result.js";

export interface OAuthDatabaseOptions {
    name: string;
}

interface SchemaItem<T> {
    value: T;
    expiresAt: number | null;
}

export interface Schema {
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

const getLocalStorage = () => {
    if (compatibleStorage) {
        return compatibleStorage;
    }

    try {
        // @ts-ignore -- Chromium-based
        compatibleStorage = chrome.storage.local;
        return compatibleStorage;
    } catch (error) {
        console.log(error);
    }

    try {
        // @ts-ignore -- Firefox-based
        compatibleStorage = browser.storage.local;
        return compatibleStorage;
    } catch (error) {
        console.log(error);
    }

    throw Error("Unsupported browser variation");
}

export type OAuthDatabase = ReturnType<typeof createOAuthDatabase>;

export const createOAuthDatabase = ({name}: OAuthDatabaseOptions) => {
    const controller = new AbortController();
    const signal = controller.signal;

    const createStore = <N extends keyof Schema>(
        subname: N,
        expiresAt: (item: Schema[N]['value']) => null | number,
    ): SimpleStore<Schema[N]['key'], Schema[N]['value']> | null |undefined => {
        let store: { [key: string]: any } | null | undefined;

        const storageKey = `${name}:${subname}`;
        const storage = getLocalStorage();

        async function persist() {
            RsOk<any>(store);
            await storage.set({storageKey: JSON.stringify(store)});
        }

        const read = async () => {
            if (signal.aborted) {
                throw new Error(`store closed`);
            }
            if (store) {
                return store;
            }
            let result: { [key: string]: string } | null = await storage.get([storageKey]);
            if (!result || Object.keys(result).length != 1) {
                return {};
            }
            let value = result[storageKey];
            store ??= parse(value);
            return store;
        };

        {
            const listener = (ev: StorageEvent) => {
                if (ev.key === storageKey) {
                    store = undefined;
                }
            };

            globalThis.addEventListener('storage', listener, {signal});
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
                locks.request(`${storageKey}:cleanup`, {ifAvailable: true}, cleanup).then(() => null);
            } else {
                cleanup(true).then(() => null);
            }
        }

        return {
            async get(key) {
                await read();

                if(!store) {
                    return;
                }

                const item: SchemaItem<Schema[N]['value']>  = store[key];
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
            async set(key, value) {
                await read();
                if (!store) {
                    store = {};
                }
                store[key] = {
                    expiresAt: expiresAt(value),
                    value: value,
                };
                await persist();
            },
            async delete(key) {
                await read();
                if (!store) {
                    return;
                }
                else if (store[key] !== undefined) {
                    delete store[key];
                    await persist();
                }
            },
            async keys() {
                await read();
                if (!store) {
                    return [];
                }
                return Object.keys(store);
            },
        };
    };

    return {
        dispose: () => {
            controller.abort();
        },

        sessions: createStore('sessions', ({token}) => {
            if (token.refresh) {
                return null;
            }

            return token.expires_at ?? null;
        }),
        states: createStore('states', (_item) => Date.now() + 10 * 60 * 1_000),
        dpopNonces: createStore('dpopNonces', (_item) => Date.now() + 10 * 60 * 1_000),
    };
};
