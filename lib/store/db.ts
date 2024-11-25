import type { At } from "@atcute/client/lexicons";
import type { DPoPKey } from "../types/dpop.js";
import type { AuthorizationServerMetadata } from "../types/server.js";
import type { SimpleStore } from "../types/store.js";
import type { Session } from "../types/token.js";

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

export class OAuthDatabase {
    private readonly name: string;
    private controller: AbortController;
    private signal: AbortSignal;
    private static storage: any;

    constructor(options: OAuthDatabaseOptions) {
        if (!OAuthDatabase.storage) {
            try {
                // @ts-ignore Chromium
                OAuthDatabase.storage = chrome.storage;
            } catch {
                try {
                    // @ts-ignore Firefox
                    OAuthDatabase.storage = browser.storage;
                } catch {
                    throw "Unsupported browser";
                }
            }
        }

        this.name = options.name;
        this.controller = new AbortController();
        this.signal = this.controller.signal;

        this.sessions = this.createStore("sessions", ({token}) => {
            if (token.refresh) {
                return null;
            }
            return token.expires_at ?? null;
        });

        this.states = this.createStore("states", (_item) => Date.now() + 10 * 60 * 1_000);
        this.dpopNonces = this.createStore("dpopNonces", (_item) => Date.now() + 10 * 60 * 1_000);

        // OAuthDatabase.storage.onChanged.addListener(this.handleStorageChange.bind(this));
    }

    sessions: SimpleStore<Schema["sessions"]["key"], Schema["sessions"]["value"]>;
    states: SimpleStore<Schema["states"]["key"], Schema["states"]["value"]>;
    dpopNonces: SimpleStore<Schema["dpopNonces"]["key"], Schema["dpopNonces"]["value"]>;

    // private handleStorageChange(changes: { [key: string]: any }, namespace: string) {
    //     if (namespace !== 'local') return;
    //     console.log('Storage changed:', changes);
    // }

    dispose(): void {
        this.controller.abort();
    }

    private createStore<N extends keyof Schema>(
        subname: N,
        expiresAt: (item: Schema[N]["value"]) => null | number,
    ): SimpleStore<Schema[N]["key"], Schema[N]["value"]> {
        const storageKey = `${this.name}:${subname}`;

        const persist = async (store: Record<string, SchemaItem<Schema[N]["value"]>>) => {
            try {
                await OAuthDatabase.storage.local.set({[storageKey]: store});
            } catch (error) {
                console.error("Error persisting storage:", error);
            }
        };

        const read = async (): Promise<Record<string, SchemaItem<Schema[N]["value"]>>> => {
            if (this.signal.aborted) {
                throw new Error(`store closed`);
            }

            try {
                const result = await OAuthDatabase.storage.local.get(storageKey);
                return result[storageKey] || {};
            } catch (error) {
                console.error("Error reading storage:", error);
                return {};
            }
        };

        let cleanupInterval: Timer | null = null;

        const cleanup = async () => {
            if (this.signal.aborted) {
                return;
            }

            try {
                const store = await read();
                let now = Date.now();
                let changed = false;

                for (const key in store) {
                    const item = store[key];
                    const itemExpiresAt = item.expiresAt;
                    if (itemExpiresAt !== null && now > itemExpiresAt) {
                        changed = true;
                        delete store[key];
                    }
                }

                if (changed) {
                    await persist(store);
                }
            } catch (error: any) {
                if (error.message.includes("Extension context invalidated.")) {
                    if (cleanupInterval) {
                        clearInterval(cleanupInterval);
                    }
                    return;
                }
                console.error("Error during cleanup:", error);
            }
        };

        // Periodically clean up expired items
        cleanupInterval = setInterval(cleanup, 10_000);
        this.signal.addEventListener("abort", () => clearInterval(cleanupInterval));

        return {
            async get(key) {
                const store = await read();
                const item: SchemaItem<Schema[N]["value"]> | undefined = store[key];

                if (!item) {
                    return;
                }

                const expiresAt = item.expiresAt;
                if (expiresAt !== null && Date.now() > expiresAt) {
                    delete store[key];
                    await persist(store);
                    return;
                }

                return item.value;
            },
            async set(key, value) {
                const store = await read();
                store[key] = {
                    expiresAt: expiresAt(value),
                    value: value,
                };
                await persist(store);
            },
            async delete(key) {
                const store = await read();
                if (store[key] !== undefined) {
                    delete store[key];
                    await persist(store);
                }
            },
            async keys() {
                const store = await read();
                return Object.keys(store);
            },
        };
    }
}
