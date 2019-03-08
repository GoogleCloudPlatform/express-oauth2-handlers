# Express OAuth 2 handlers

This library provides pre-built boilerplate code for obtaining and storing OAuth 2.0 tokens on Google Cloud Platform.

## Installation
```
npm install @google-cloud/express-oauth2-handlers
```

## Configuration
In order to use the library, several variables must be set. These values can be stored as Linux environment variables.

If a web application client secret file named `client_secret.json` is present in the root directory of your function/app, the required values below will be automatically imported.

##### Required values
The following values can be obtained by [generating a new OAuth 2.0 client ID](https://console.cloud.google.com/apis/credentials) or reusing an existing one:
- **`GOOGLE_CLIENT_ID`**
- **`GOOGLE_CLIENT_SECRET`**
- **`GOOGLE_CALLBACK_URL`**

**Note**
These values (and in particular the `GOOGLE_CLIENT_SECRET` value) should not be stored/committed alongside your codebase except when deployed to GCP hosting platforms. As such, this library does _not_ support specifying these values programmatically.

##### Reserved values

**`FUNCTION_TRIGGER_TYPE`**
This value is set by [some](https://cloud.google.com/functions/docs/env-var#reserved_keys_key_validation) (but not all) Google Cloud hosting platforms. Do **not** set it yourself or change its value.

**`GCP_PROJECT_ID`**
This value should be set to your GCP project ID automatically. If it isn't, make sure you do this manually.

##### Optional settings values
The following values can be specified during either the configuration or [initialization](#initialization) processes. Where values are different between the two, those specified during initialization take precedence.

###### `TOKEN_STORAGE_METHOD`
Specify how OAuth 2.0 tokens will be stored. *Must* be one of the following values:
- `cookie` Stores tokens on a _per-user basis_ using browser cookies.
- `datastore` Stores tokens _globally_ using [Cloud Datastore](https://cloud.google.com/datastore).

We recommend using `cookie` unless you have code running in a non-HTTP environment, as this delegates authentication to the user's browser.

The `datastore` option is best when part or all of your code isn't triggered by HTTP. **However, you must manually verify the authenticity of all `datastore` requests yourself.**

###### `DEFAULT_SCOPES`
A comma-separated list (such as `scope1,scope2,scope3`) of OAuth 2.0 scopes to use. See [this page](https://developers.google.com/identity/protocols/googlescopes) for a list of OAuth 2.0 scopes supported by Google APIs.

###### `USER_ID_FORMAT`
The format to use for unique User IDs. Two formats are supported:
- `email` email addresses
- `gaiaId` Google accounts ID numbers

We recommend using `gaiaId` when possible. However, some external platforms require the use of email addresses as unique User IDs. 

##### `TOKEN_ENCRYPTION_KEY`
Specifies the encryption method and/or key to use when encrypting OAuth 2.0 tokens as follows, from _least secure_ to _most secure_:
- `undefined` or not specified: use the `GOOGLE_CLIENT_SECRET` value of your OAuth 2.0 configuration as a `tweetnacl` symmetric encryption key
- any other string: use this value as a `tweetnacl` symmetric encryption key. **This string should be generated using [cryptography-safe](https://crypto.stackexchange.com/a/39188) randomness tools and kept secret.**
- `KMS` (case insensitive): use [Cloud KMS][kms]

When using `tweetnacl`, the `TOKEN_ENCRYPTION_KEY` value is hashed using `sha256` and truncated to generate the key used in the application.

##### `KMS_KEY_RING` and `KMS_KEY_NAME`
These values are used to encrypt stored OAuth 2.0 tokens when using [Cloud KMS][kms] (i.e. when [`TOKEN_ENCRYPTION_KEY`](#token_encryption_key) is set to `KMS`), and can be obtained by [creating a Cloud KMS encryption key](https://cloud.google.com/kms/docs/quickstart#key_rings_and_keys).

## Initialization
When importing and initializing the library, several different parameters are used.

###### `storageMethod`
_Optional._ Specify how OAuth 2.0 tokens will be stored. Identical to (and takes precedence over) [`TOKEN_STORAGE_METHOD`](#token-storage-method) above.

###### `scopes`
_Optional._ An array of OAuth 2.0 scopes to request. See [this page](https://developers.google.com/identity/protocols/googlescopes) for a list of OAuth 2.0 scopes supported by Google APIs. Takes precedence over the `DEFAULT_SCOPES` environment variable.

###### `userIdFormat`
_Optional._ The format to use for unique User IDs. Identical to (and takes precedence over) [`USER_ID_FORMAT`](#user-id-format) above.

###### `showInternals`
_Optional._ If set to `true`, certain [internal methods](#internal-methods) will be exposed.

##### Example
```javascript
const Auth = require('@google-cloud/express-oauth2-handlers');

// Cookie
const auth = Auth('cookie', ['profile', 'email']);

// Datastore
const auth = Auth('datastore', ['profile', 'email'], 'email');
```

##### Storage Methods
Use the following chart to decide which storage method is right for your use case.

|                                  | `cookie` | `datastore` |
| -------------------------------- | -------- | ------- |
| Requires user IDs?               | **No**   | Yes |
| Requires end-user interaction? ^ | Yes      | **No** |
| Works with free tier? +          | **Yes**  | No |
| Platform restricted?             | **No**   | Google Cloud only |

_^ When fetching existing tokens_
_+ [Cloud KMS][kms] can be used for [token encryption](#token_encryption_key), and does **not** have a free tier._

## Methods
##### `auth.tryAuth`
Attempts to authenticate the specified user while failing gracefully.

##### Arguments
`req`
An Express-like request object for HTTP invocations; `null` otherwise.

`res`
An Express-like response object for HTTP invocations; `null` otherwise.

`userId`
_Datastore token-storage only._ A unique User ID specifying which user to associate the token with.

##### Returns
`true` if the authentication succeeded, `false` otherwise.

##### `auth.requireAuth`
Attempts to authenticate the specified user, but does _not_ fail gracefully.

##### Arguments
`req`
An Express-like request object for HTTP invocations; `null` otherwise.

`res`
An Express-like response object for HTTP invocations; `null` otherwise.

`userId`
_Datastore token-storage only._ A unique User ID specifying which user to associate the token with.

##### Returns
A `Promise` containing a scoped token if the authentication succeeds; a rejected `Promise` containing an `Error` otherwise.

##### `auth.authedUser.hasScope`
Check if the authenticated user's token contains a specified OAuth 2.0 scope.

##### Arguments
`req`
An Express-like request object for HTTP invocations; `null` otherwise.

`res`
An Express-like response object for HTTP invocations; `null` otherwise.

`scope`
The OAuth 2.0 scope to check for

##### Returns
A `Promise` containing a boolean value if a user has been authenticated; a rejected `Promise` otherwise.

##### `auth.authedUser.getClient`
Retrieves the current user's (initialized and auto-authenticated) OAuth 2.0 client.

##### Arguments
`req`
An Express-like request object for HTTP invocations; `null` otherwise.

`res`
An Express-like response object for HTTP invocations; `null` otherwise.

`userId`
_Datastore token-storage only._ A unique User ID specifying which user the auth client will associate with.

##### Returns
A `Promise` containing a reference to the current user's authenticated OAuth 2.0 client.

##### `auth.authedUser.getToken`
Retrieves the standard _non-scoped_ OAuth 2.0 token associated with the specified (and auto-authenticated) user.

##### Arguments
`req`
An Express-like request object for HTTP invocations; `null` otherwise.

`res`
An Express-like response object for HTTP invocations; `null` otherwise.

`userId`
_Datastore token-storage only._ A unique User ID specifying which user's non-scoped token should be fetched.

##### Returns
A `Promise` containing the currently-authenticated user's OAuth 2.0 token.

##### `auth.getRawClient`
**Internal.** Retrieves a reference to an unauthenticated OAuth 2.0 client object.

##### Arguments
`req`
An Express-like request object for HTTP invocations; `null` otherwise.

`res`
An Express-like response object for HTTP invocations; `null` otherwise.

##### Returns
A `Promise` that resolves to the unauthenticated OAuth 2.0 client object.

##### `auth.authedUser.getUserId`
**Internal.** Returns the unique User ID of the currently authenticated user.

##### Arguments
`req`
An Express-like request object for HTTP invocations; `null` otherwise.

`res`
An Express-like response object for HTTP invocations; `null` otherwise.

##### Returns
A `Promise` containing the current user's Google user ID (`gaiaId`) or email address, depending on the value of [`USER_ID_FORMAT`](#USER-ID-FORMAT).

##### `auth.storeScopedToken`
**Internal.** Stores a scoped token associated with the specified user.

##### Arguments
`req`
An Express-like request object for HTTP invocations; `null` otherwise.

`res`
An Express-like response object for HTTP invocations; `null` otherwise.

`scopedToken`
The scoped token to associate with the specified user.

`userId`
_Datastore token-storage only._ A unique User ID specifying which user to associate the token with.

##### Returns
A `Promise` that resolves once the token is stored.

##### `auth.authedUser.getScopedToken`
**Internal.** Retrieves the scoped token associated with the specified (and auto-authenticated) user.

##### Arguments
`req`
An Express-like request object for HTTP invocations; `null` otherwise.

`res`
An Express-like response object for HTTP invocations; `null` otherwise.

`userId`
_Datastore token-storage only._ A unique User ID specifying which user's scoped token should be fetched.

##### Returns
A `Promise` containing the scoped token.

## Routes
Routes are functions that emulate [Connect](https://github.com/senchalabs/connect)-style middleware. They are compatible with [Express](https://github.com/expressjs/express), as well as Express-like platforms such as [Google Cloud Functions](https://cloud.google.com/functions/docs/calling/http).

#### `routes.init`
`init` is a route that redirects end-users to a consent prompt.

##### Arguments
`scope_array`
_Optional._ An array of OAuth2 scopes to request

#### `routes.cb`
`cb` is a route that serves as an OAuth 2.0 callback URL. It consumes a one-time _authorization code_, converts it into a reusable _access token_, and stores the access token using the specified storage method.

##### Arguments
`onSuccess`
_Optional._ A URL to redirect to **or** a callback function that accepts Express-like `req` and `res` parameters to be called once the `cb` route successfully obtains and stores an access token. 

`onFailure`
_Optional._ A URL to redirect to **or** a callback function that accepts Express-like `req` and `res` parameters to be called if the `cb` route fails to obtain and store an access token.

_Note: if one of `onSuccess` and `onFailure` is provided, the other must be provided as well._

## Invocation

##### App Engine

```javascript
// Express middleware format - no arguments
app.get('/oauth2init', oauth2.routes.init);
app.get('/oauth2callback', oauth2.routes.cb);

// Express middleware format - all arguments
app.get('/oauth2init', oauth2.routes.init(['scope_1', 'scope_2'])); // Array of OAuth scopes to request
app.get('/oauth2callback', oauth2.routes.cb('/success', '/failure')); // "onSuccess" and "onFailure" as redirect URLs

// Express middleware format - "onSuccess" and "onFailure" as callbacks
// - Technically possible, but not documented because it's bad practice
// - Instead, use additional Express middleware functions
```

##### Cloud Functions
```javascript
// HTTP Cloud Function format - no arguments
exports.oauth2init = oauth2.routes.init;
exports.oauth2callback = oauth2.routes.cb;

// HTTP Cloud Function format - all arguments
exports.oauth2init = oauth2.routes.init(['scope_1', 'scope_2']);
exports.oauth2callback = oauth2.routes.cb('/oauth2success', '/oauth2failure');

// HTTP Cloud Function format - "onSuccess" and "onFailure" as callbacks
// - Cloud Functions doesn't support Express-style middleware
// - Instead, you can use callbacks to handle post-route logic
const onSuccess = (req, res) => { ... }
const onFailure = (err, req, res) => { ... }

exports.oauth2init = ... // same as above
exports.oauth2callback = oauth2.routes.cb(onSuccess, onFailure);
```

## Legal terms
##### License
This project is licensed under the Apache 2.0 license.

##### Product status
This is **not** a Google product, official or otherwise.

##### Support level
Support for this library is **not** guaranteed, and it may be abandoned, deprecated, and/or deleted at any time with or without notice.

##### Contributing
Pull requests and issues are very much appreciated. Please read through [`CONTRIBUTING.md`](CONTRIBUTING.md) before making any contributions.

[kms]: https://cloud.google.com/kms/docs/