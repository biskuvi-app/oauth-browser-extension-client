export interface SimpleStore<K extends string | number, V extends {} | null> {
	get: (key: K) => Promise<undefined | V>;
	set: (key: K, value: V) => Promise<void>;
	delete: (key: K) => Promise<void>;
	keys: () => Promise<K[]>;
}
