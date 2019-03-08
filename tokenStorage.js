/**
 * Copyright 2019 Google LLC.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const cookie = require('cookie');
const config = require('./config');
const {Datastore} = require('@google-cloud/datastore');
const {OAuth2Client} = require('google-auth-library');
const OAuth2Api = require('googleapis').oauth2_v2.Oauth2;

const {__wrapReqRes, __cacheGet, __cacheSet} = require('./miscHelpers');
const cryptoHelpers = require('./cryptoHelpers');
const datastore = new Datastore();

const __getOAuth2Client = (req, res) => {
  if (__cacheGet(req, res, 'client')) {
    return __cacheGet(req, res, 'client');
  }

  const client = new OAuth2Client(
    config.GOOGLE_CLIENT_ID,
    config.GOOGLE_CLIENT_SECRET,
    config.GOOGLE_CALLBACK_URL
  );
  __cacheSet(req, res, 'client', client);
  return client;
};

const __isScopedToken = scopedToken => {
  return !!scopedToken.scopes && !!scopedToken.token;
};

const __validateOrRefreshToken = async (req, res, encryptedToken, userId) => {
  if (!encryptedToken) {
    return Promise.reject(new Error(config.ERROR_UNKNOWN_USER));
  }

  if (!__isScopedToken(encryptedToken)) {
    return Promise.reject(new Error(config.ERROR_SCOPED_ONLY));
  }

  const scopes = encryptedToken.scopes;
  let token = encryptedToken.token;
  const oauth2client = __getOAuth2Client(req, res);

  // Decrypt token
  token = await cryptoHelpers.decrypt(token);
  const scopedToken = Object.assign({}, encryptedToken);
  token = JSON.parse(token);
  scopedToken.token = token;

  if (!token.expiry_date || token.expiry_date < Date.now() + 60000) {
    // Refresh token
    const creds = oauth2client.credentials; // by-reference assignment
    creds.refresh_token = creds.refresh_token || token.refresh_token;
    return new Promise((resolve, reject) => {
      // oauth2client doesn't like Pify
      oauth2client.refreshAccessToken(err =>
        err ? reject(new Error(err)) : resolve({scopes, token: creds})
      );
    }).then(newScopedToken => {
      __setLocalScopedToken(req, res, newScopedToken);
      return __storeScopedToken(req, res, newScopedToken, userId);
    });
  } else {
    __setLocalScopedToken(req, res, scopedToken);
    return Promise.resolve(scopedToken);
  }
};

const __storeScopedToken = async (req, res, scopedToken, userId) => {
  if (config.NEEDS_USER_ID && !userId) {
    return Promise.reject(new Error(config.ERROR_NEEDS_USERID));
  }
  if (!__isScopedToken(scopedToken)) {
    return Promise.reject(new Error(config.ERROR_SCOPED_ONLY));
  }

  // Encrypt token
  const encryptedToken = Object.assign({}, scopedToken);
  encryptedToken.token = await cryptoHelpers.encrypt(
    JSON.stringify(scopedToken.token)
  );

  // Store token
  if (config.STORAGE_METHOD === 'datastore') {
    return datastore.save({
      key: datastore.key(['oauth2token', userId]),
      data: encryptedToken,
    });
  } else if (config.STORAGE_METHOD === 'cookie' && config.IS_HTTP) {
    // User ID not required
    res.cookie('oauth2token', JSON.stringify(encryptedToken), {secure: true});
    return Promise.resolve();
  } else {
    return Promise.reject(new Error(config.ERROR_STORAGE_METHOD));
  }
};

const __authenticate = (req, res, userId) => {
  if (__cacheGet(req, res, 'scopedToken')) {
    return Promise.resolve(__cacheGet(req, res, 'scopedToken'));
  }

  if (config.NEEDS_USER_ID && !userId) {
    return Promise.reject(new Error(config.ERROR_NEEDS_USERID));
  }

  // Get + validate token, then authenticate with it
  if (config.STORAGE_METHOD === 'datastore') {
    return datastore
      .get(datastore.key(['oauth2token', userId]))
      .then(tokens => {
        return __validateOrRefreshToken(req, res, tokens[0], userId);
      });
  } else if (config.STORAGE_METHOD === 'cookie' && config.IS_HTTP) {
    const scopedToken = JSON.parse(
      cookie.parse(req.headers.cookie)['oauth2token'] || null
    );
    return __validateOrRefreshToken(req, res, scopedToken);
  } else {
    return Promise.reject(new Error(config.ERROR_STORAGE_METHOD));
  }
};

const __requireExistingAuth = (req, res) =>
  !__isAuthed(req, res)
    ? Promise.reject(new Error(config.ERROR_NOT_AUTHED))
    : Promise.resolve();

const __requireAnyAuth = async (req, res, userId) =>
  !__isAuthed(req, res) ? __authenticate(req, res, userId) : Promise.resolve();

const __isAuthed = (req, res) => {
  return !!__cacheGet(req, res, 'scopedToken');
};

const __authedUserHasScope = (req, res, scope) => {
  return __requireExistingAuth(req, res).then(() => {
    return __cacheGet(req, res, 'scopedToken').scopes.includes(scope);
  });
};

const __getAuthedUserId = (req, res) => {
  return __requireExistingAuth(req, res)
    .then(() => {
      if (__cacheGet(req, res, 'userId')) {
        return Promise.resolve(__cacheGet(req, res, 'userId'));
      }

      // Verify necessary scopes are present
      return Promise.all([
        __authedUserHasScope(req, res, 'email'),
        __authedUserHasScope(req, res, 'profile'),
      ]);
    })
    .then(([hasEmail, hasProfile]) => {
      if (!hasEmail && !hasProfile) {
        return Promise.reject(new Error(config.ERROR_USERID_SCOPES));
      } else {
        return Promise.resolve();
      }
    })
    .then(() => {
      const idFormat = config.USER_ID_FORMAT;
      if (['email', 'gaiaId'].includes(idFormat)) {
        const oauth2api = new OAuth2Api('v2');

        return new Promise((resolve, reject) => {
          oauth2api.userinfo.v2.me.get(
            {auth: __getOAuth2Client(req, res)},
            (err, {data}) => {
              if (err) {
                return reject(err);
              }

              const id = idFormat === 'email' ? data.email : data.id;
              __cacheSet(req, res, 'userId', id);
              return resolve(id);
            }
          );
        });
      } else {
        return Promise.reject(new Error(config.ERROR_USERID_FORMAT));
      }
    });
};

// Set local scoped token, without validation
// Validation requires a userId, which these tokens don't (yet) have
const __setLocalScopedToken = (req, res, scopedToken) => {
  __cacheSet(req, res, 'scopedToken', scopedToken);
  __getOAuth2Client(req, res).credentials = scopedToken.token;
};

/* Exported internal methods */
/* Used elsewhere in the library, not (really) intended for consumer use */
exports.setLocalScopedToken = (req, res, scopedToken) =>
  __wrapReqRes(__setLocalScopedToken)(req, res, scopedToken);

exports.getUnauthedClient = (req, res) =>
  __wrapReqRes(__getOAuth2Client)(req, res);

exports.storeScopedToken = async (req, res, scopedToken, userId) =>
  __wrapReqRes(__storeScopedToken)(req, res, scopedToken, userId);

exports.getAuthedScopedToken = __wrapReqRes((req, res, userId) => {
  return __requireAnyAuth(req, res, userId).then(() => {
    return __cacheGet(req, res, 'scopedToken');
  });
});

/* Consumer library exports (for code clarity/cleanliness) */
exports.tryAuth = (req, res, userId) => {
  return __requireAnyAuth(req, res, userId)
    .then(() => Promise.resolve(true))
    .catch(() => Promise.resolve(false));
};

exports.requireAuth = (req, res, userId) =>
  __wrapReqRes(__requireAnyAuth)(req, res, userId);

exports.getAuthedClient = __wrapReqRes(async (req, res, userId) => {
  return __requireAnyAuth(req, res, userId).then(() => {
    return __cacheGet(req, res, 'client');
  });
});

exports.getAuthedUserId = (req, res) =>
  __wrapReqRes(__getAuthedUserId)(req, res);

exports.getAuthedToken = __wrapReqRes((req, res, userId) => {
  return __requireAnyAuth(req, res, userId).then(() => {
    return __cacheGet(req, res, 'scopedToken').token;
  });
});

exports.authedUserHasScope = (req, res, scope) =>
  __wrapReqRes(__authedUserHasScope)(req, res, scope);
