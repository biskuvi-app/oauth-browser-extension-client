export function RsOk<T>(o: any, message?: string): T {
    if (o == null) {
        message ??= "value is null/empty";
        let stack = Error().stack;
        if (stack) {
            let sources = stack.split("\n");
            if (sources.length > 2) {
                let source = sources[2].trimStart();
                source = source.replace(/^at/, "");
                source = source.trimStart();
                throw `${source}:\n${typeof o}: ${message}`;
            }
        }
        throw `${typeof o}: ${message}`;
    }
    return o;
}
