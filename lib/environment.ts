import {OAuthDatabase} from './store/db.js';

export let CLIENT_ID: string;
export let REDIRECT_URI: string;

export let database: OAuthDatabase | null | undefined;

export interface ConfigureOAuthOptions {
    /**
     * Client metadata, necessary to drive the whole request
     */
    metadata: {
        client_id: string;
        redirect_uri: string;
    };

    /**
     * Name that will be used as prefix for storage keys needed to persist authentication.
     * @default "atcute-oauth"
     */
    storageName?: string;
}

export const configureOAuth = (options: ConfigureOAuthOptions) => {
    ({client_id: CLIENT_ID, redirect_uri: REDIRECT_URI} = options.metadata);
    database = new OAuthDatabase({name: options.storageName ?? 'atcute-oauth'});
};
