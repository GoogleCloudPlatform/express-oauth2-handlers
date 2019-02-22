# Express OAuth 2 handlers

This library provides pre-built boilerplate code for obtaining and storing OAuth 2.0 tokens on Google Cloud Platform.

## Installation
```
npm install @google-cloud/express-oauth2-handlers
```

## Configuration
In order to use the library, several variables must be set. These values can be stored in either:
- Linux environment variables
- a `client_secret.json` file in the root directory of your function/app 

##### Required values
The following values can be obtained by [generating a new OAuth 2.0 client ID](https://console.cloud.google.com/apis/credentials) or reusing an existing one:
- **`GOOGLE_CLIENT_ID`**
- **`GOOGLE_CLIENT_SECRET`**
- **`GOOGLE_CALLBACK_URL`**

##### Optional values
These values can be specified during either the configuration or [initialization](#initialization) processes. Where values are different between the two, those specified during initialization take precedence.

###### `TOKEN_STORAGE_METHOD`
Specify how OAuth 2.0 tokens will be stored. *Must* be one of the following values:
- `cookie` Stores tokens on a _per-user basis_ using browser cookies.
- `datastore` Stores tokens _globally_ using [Cloud Datastore](https://cloud.google.com/datastore).

###### `DEFAULT_SCOPES`
A comma-separated list (such as `scope1,scope2,scope3`) of OAuth 2.0 scopes to use. See [this page](https://developers.google.com/identity/protocols/googlescopes) for a list of OAuth 2.0 scopes supported by Google APIs.

## Initialization
When importing and initializing the library, several different parameters are used.

###### `storage_method`
_Optional._ Specify how OAuth 2.0 tokens will be stored. Identical to (and takes precedence over) [`TOKEN_STORAGE_METHOD`](#token-storage-method) above.

###### `scopes`
_Optional._ An array of OAuth 2.0 scopes to request. See [this page](https://developers.google.com/identity/protocols/googlescopes) for a list of OAuth 2.0 scopes supported by Google APIs. Takes precedence over the `DEFAULT_SCOPES` environment variable.

###### `include_internal_methods`
_Optional._ If set to `true`, certain [internal methods](#internal-methods) will be exposed. These methods allow you to manually store and retrieve OAuth 2.0 tokens.

##### Example

```javascript
const Auth = require('@google-cloud/express-oauth2-handlers');
const auth = Auth('cookie', ['profile', 'email'])
```

##### Storage Methods
Use the following chart to decide which storage method is right for your use case.

|                                  | `cookie` | `datastore` |
| -------------------------------- | -------- | ------- |
| Requires end-user interaction? ^ | Yes      | **No** |
| Free?                            | **Yes**  | No |
| Platform restricted?             | **No**   | Google Cloud only |

_^ When fetching existing tokens_


## Methods
##### `auth.getClient`
Returns a reference to the (initialized and authenticated) OAuth 2.0 client.

##### Arguments
`req`
An Express-like request object

`res`
An Express-like response object

`userId`
_Datastore token-storage only._ A unique ID of type `string` that specifies which user the auth client will associate with.

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

### Internal Methods
If `include_internal_methods` is a truthy value, the following internal methods will be exposed:

#### `__internal.__storeToken`
This method saves a provided OAuth 2.0 access token using the currently-configured storage method.

##### Parameters
`req`
An Express-like request object

`res`
An Express-like response object

`token`
The OAuth 2.0 token to be stored, as an object.

`userId`
_Datastore token-storage only._ A unique ID of type `string` that specifies which user the token will be associated with.

#### `__internal.__getToken`
This method retrieves an OAuth 2.0 access token for the current user using the currently-configured storage method.

##### Parameters
`req`
_Cookie token-storage only._ An Express-like request object

`res`
_Cookie token-storage only._ An Express-like response object

`userId`
_Datastore token-storage only._ A unique ID of type `string` that which user's token will be retrieved.

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
Pull requests and issues are very much appreciated. Please read through [`CONTRIBUTING.md`](CONTRIBUTING.md) before submitting your contribution.
