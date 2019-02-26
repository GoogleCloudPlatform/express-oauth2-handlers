/**
 * Copyright 2018 Google LLC.
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
const pify = require('pify');

const config = require('./config');
const datastore = require('@google-cloud/datastore');
const {OAuth2Client} = require('google-auth-library');

const googleapis = require('googleapis');
const OAuth2Api = googleapis.oauth2_v2.Oauth2;

// GAE doesn't support per-concurrent-user globals, so use res.locals as
// our cache instead. Inefficient for GCF though, which is zero-concurrency.
const __cacheGet = (res, key) => {
  return res.locals.magicalAuth && res.locals.magicalAuth[key];
};

const __cacheSet = (res, key, value) => {
  if (!res.locals.magicalAuth) {
    res.locals.magicalAuth = {};
  }
  res.locals.magicalAuth[key] = value;
  return value;
};

const __getOAuth2Client = res => {
  if (__cacheGet(res, 'client')) {
    return __cacheGet(res, 'client');
  }

  const client = new OAuth2Client(
    config.GOOGLE_CLIENT_ID,
    config.GOOGLE_CLIENT_SECRET,
    config.GOOGLE_CALLBACK_URL
  );
  __cacheSet(res, 'client', client);
  return client;
};

const __isScopedToken = scopedToken => {
  return !!scopedToken.scopes && !!scopedToken.token;
};

const __validateOrRefreshToken = (req, res, scopedToken, userId) => {
  if (!scopedToken) {
    return Promise.reject(new Error(config.ERROR_UNKNOWN_USER));
  }

  if (!__isScopedToken(scopedToken)) {
    return Promise.reject(new Error(config.ERROR_SCOPED_ONLY));
  }

  const token = scopedToken.token;
  const oauth2client = __getOAuth2Client(res);

  if (!token.expiry_date || token.expiry_date < Date.now() + 60000) {
    // Refresh token
    oauth2client.credentials.refresh_token =
      oauth2client.credentials.refresh_token || token.refresh_token;
    return new Promise((resolve, reject) => {
      // Pify and oauth2client don't mix
      oauth2client.refreshAccessToken(err => {
        if (err) {
          return reject(new Error(err));
        }
        return resolve({
          scopes: scopedToken.scopes,
          token: oauth2client.credentials,
        });
      });
    }).then(newScopedToken => {
      __cacheSet(res, 'scopedToken', newScopedToken);
      return __storeScopedToken(req, res, newScopedToken, userId);
    });
  } else {
    oauth2client.credentials = token;
    __cacheSet(res, 'scopedToken', scopedToken);
    return Promise.resolve(scopedToken);
  }
};

const __storeScopedToken = (req, res, scopedToken, userId) => {
  // Data validation
  if (!__isScopedToken(scopedToken)) {
    return Promise.reject(new Error(config.ERROR_SCOPED_ONLY));
  }
  if (config.NEEDS_USER_ID && !userId) {
    return Promise.reject(new Error(config.ERROR_NEEDS_USERID));
  }

  // Store token
  if (config.STORAGE_METHOD === 'datastore') {
    return datastore.save({
      key: datastore.key(['oauth2token', userId]),
      data: scopedToken,
    });
  } else if (config.STORAGE_METHOD === 'cookie') {
    // User ID not required
    res.cookie('oauth2token', JSON.stringify(scopedToken));
    return Promise.resolve();
  } else {
    return Promise.reject(new Error(config.ERROR_STORAGE_METHOD));
  }
};

const __authenticate = (req, res, userId) => {
  if (__cacheGet(res, 'scopedToken')) {
    return Promise.resolve(__cacheGet(res, 'scopedToken'));
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
  } else if (config.STORAGE_METHOD === 'cookie') {
    const scopedToken = JSON.parse(
      cookie.parse(req.headers.cookie)['oauth2token'] || null
    );
    return __validateOrRefreshToken(req, res, scopedToken);
  } else {
    return Promise.reject(new Error(config.ERROR_STORAGE_METHOD));
  }
};

const __requireExistingAuth = (req, res) => {
  if (!__isAuthed(req, res)) {
    return Promise.reject(new Error(config.ERROR_NOT_AUTHED));
  } else {
    return Promise.resolve(); // success
  }
};

const __requireAnyAuth = async (req, res, userId) => {
  if (!__isAuthed(req, res)) {
    return __authenticate(req, res, userId);
  } else {
    return Promise.resolve();
  }
};

const __isAuthed = (req, res) => {
  return !!__cacheGet(res, 'scopedToken');
};

const __authedUserHasScope = (req, res, scope) => {
  return __requireExistingAuth(req, res).then(() => {
    return __cacheGet(res, 'scopedToken').scopes.includes(scope);
  });
};

const __getAuthedUserId = (req, res) => {
  return __requireExistingAuth(req, res)
    .then(() => {
      if (__cacheGet(res, 'userId')) {
        return Promise.resolve(__cacheGet(res, 'userId'));
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
      if (
        config.USER_ID_FORMAT === 'email' ||
        config.USER_ID_FORMAT === 'gaiaId'
      ) {
        const oauth2api = new OAuth2Api('v2');

        return pify(oauth2api.v2.me.get)({
          auth: __getOAuth2Client(res),
          userId: 'me',
        }).then(data => {
          const id = config.USER_ID_FORMAT === 'email' ? data.email : data.id;
          __cacheSet(res, 'userId', id);
          return Promise.resolve(id);
        });
      } else {
        return Promise.reject(new Error(config.ERROR_USERID_FORMAT));
      }
    });
};

/* Library exports (for code clarity/cleanliness) */
exports.isAuthed = (req, res) => {
  return __isAuthed(req, res);
};

exports.getAuthedClient = async (req, res, userId) => {
  return __requireAnyAuth(req, res, userId).then(() => {
    return __cacheGet(res, 'client');
  });
};

exports.getAuthedUserId = (req, res) => {
  return __getAuthedUserId(req, res);
};

exports.storeScopedToken = async (req, res, scopedToken, userId) => {
  return __storeScopedToken(req, res, scopedToken, userId);
};

exports.getAuthedScopedToken = (req, res, userId) => {
  return __requireAnyAuth(req, res, userId).then(() => {
    return __cacheGet(res, 'scopedToken');
  });
};

exports.getAuthedToken = (req, res, userId) => {
  return __requireAnyAuth(req, res, userId).then(() => {
    return __cacheGet(res, 'scopedToken').token;
  });
};

exports.authedUserHasScope = (req, res, scope) => {
  return __authedUserHasScope(req, res, scope);
};
