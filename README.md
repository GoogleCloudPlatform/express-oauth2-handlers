# Express OAuth 2 handlers

This library provides pre-built boilerplate code for obtaining and storing OAuth 2.0 tokens on Google Cloud Platform.

## Installation
```
npm install @google-cloud/express-oauth2-handlers
```

## Storage options
Tokens can be stored in one of two ways - either globally in [Cloud Datastore](https://cloud.google.com/datastore) or in the user's browser through cookies.

|                                  | Datastore          | Cookies |
| -------------------------------- | ------------------ | ------- |
| Requires end-user interaction? ^ | **No**             | Yes     |
| Free?                            | No                 | **Yes** |
| Platform restricted?             | Google Cloud only  | **No**  |

_^ When fetching existing tokens_

## Routes
Routes are functions that emulate [Connect](https://github.com/senchalabs/connect)-style middleware. They are compatible with [Express](https://github.com/expressjs/express), as well as Express-like platforms such as [Google Cloud Functions](https://cloud.google.com/functions/docs/calling/http).

### `routes.init`
`init` is a route that redirects end-users to a consent prompt.

##### Arguments
`scope_array`: _(Optional)_ An array of OAuth2 scopes to request

### `routes.cb`
`cb` is a route that serves as an OAuth 2.0 callback URL. It consumes a one-time _authorization code_, converts it into a reusable _access token_, and stores the access token using the specified storage method.

##### Arguments
`onSuccess`:  _(Optional)_ A URL to redirect to **or** a callback function that accepts Express-like `req` and `res` parameters to be called once the `cb` route successfully obtains and stores an access token. 

`onFailure`:  _(Optional)_ A URL to redirect to **or** a callback function that accepts Express-like `req` and `res` parameters to be called if the `cb` route fails to obtain and store an access token.

_Note: if one of `onSuccess` and `onFailure` is provided to `cb`, the other must be provided as well._

## Invocation

#### App Engine

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

#### Cloud Functions
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
#### License
This project is licensed under the Apache 2.0 license.

#### Product status
This is **not** a Google product, official or otherwise.

#### Support level
Support for this library is **not** guaranteed, and it may be abandoned, deprecated, and/or deleted at any time with or without notice.

#### Contributing
Pull requests and issues are very much appreciated. Please read through [`CONTRIBUTING.md`](CONTRIBUTING.md) before submitting your contribution.
