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

const process = require('process'); // Makes it proxyquire-able

const cookie = require('cookie');
const sinon = require('sinon');

const config = require('./config');
const {Datastore} = require('@google-cloud/datastore');
const datastore = new Datastore();

const {OAuth2Client} = require('google-auth-library');

const googleapis = require('googleapis');
const OAuth2Api = googleapis.oauth2_v2.Oauth2;

// Global request/response mocks - ONLY for use in GCF w/non-HTTP triggers
// (GAE shares globals between requests => MAJOR security issue)
const stubNeedsReqRes = sinon
  .stub()
  .throws(new Error(config.ERROR_NEEDS_REQ_RES));
let GLOBAL_REQ = null;
let GLOBAL_RES = {
  cookie: stubNeedsReqRes,
  status: stubNeedsReqRes,
  send: stubNeedsReqRes,
  end: stubNeedsReqRes,
};

const __triggerType = process.env.FUNCTION_TRIGGER_TYPE;
const IS_HTTP = !__triggerType || __triggerType.toLowerCase().includes('http');

if (!IS_HTTP) {
  GLOBAL_REQ = {};
  GLOBAL_RES.locals = {};
}

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
      __setLocalScopedToken(req, res, newScopedToken);
      return __storeScopedToken(req, res, newScopedToken, userId);
    });
  } else {
    __setLocalScopedToken(req, res, scopedToken);
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
  } else if (config.STORAGE_METHOD === 'cookie' && IS_HTTP) {
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
  } else if (config.STORAGE_METHOD === 'cookie' && IS_HTTP) {
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

        return new Promise((resolve, reject) => {
          oauth2api.userinfo.v2.me.get(
            {auth: __getOAuth2Client(res)},
            (err, data) => {
              if (err) {
                return reject(err);
              }

              const id =
                config.USER_ID_FORMAT === 'email'
                  ? data.data.email
                  : data.data.id;
              __cacheSet(res, 'userId', id);
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
  __cacheSet(res, 'scopedToken', scopedToken);
  __getOAuth2Client(res).credentials = scopedToken.token;
};

/* Exported internal methods */
/* Used elsewhere in the library, not (really) intended for consumer use */
exports.setLocalScopedToken = (req, res, scopedToken) => {
  if (!IS_HTTP) {
    req = req || GLOBAL_REQ;
    res = res || GLOBAL_RES;
  } else if (!req || !res) {
    return Promise.reject(new Error(config.ERROR_NEEDS_REQ_RES));
  }

  return __setLocalScopedToken(req, res, scopedToken);
};

exports.getUnauthedClient = (req, res) => {
  if (!IS_HTTP) {
    req = req || GLOBAL_REQ;
    res = res || GLOBAL_RES;
  } else if (!req || !res) {
    return Promise.reject(new Error(config.ERROR_NEEDS_REQ_RES));
  }

  return __getOAuth2Client(res, 'client');
};

exports.storeScopedToken = async (req, res, scopedToken, userId) => {
  if (!IS_HTTP) {
    req = req || GLOBAL_REQ;
    res = res || GLOBAL_RES;
  } else if (!req || !res) {
    return Promise.reject(new Error(config.ERROR_NEEDS_REQ_RES));
  }

  return __storeScopedToken(req, res, scopedToken, userId);
};

exports.getAuthedScopedToken = (req, res, userId) => {
  if (!IS_HTTP) {
    req = req || GLOBAL_REQ;
    res = res || GLOBAL_RES;
  } else if (!req || !res) {
    return Promise.reject(new Error(config.ERROR_NEEDS_REQ_RES));
  }

  return __requireAnyAuth(req, res, userId).then(() => {
    return __cacheGet(res, 'scopedToken');
  });
};

/* Consumer library exports (for code clarity/cleanliness) */
exports.tryAuth = (req, res, userId) => {
  return __requireAnyAuth(req, res, userId)
    .then(() => {
      return Promise.resolve(true);
    })
    .catch(() => {
      return Promise.resolve(false);
    });
};

exports.requireAuth = (req, res, userId) => {
  if (!IS_HTTP) {
    req = req || GLOBAL_REQ;
    res = res || GLOBAL_RES;
  } else if (!req || !res) {
    return Promise.reject(new Error(config.ERROR_NEEDS_REQ_RES));
  }

  return __requireAnyAuth(req, res, userId);
};

exports.getAuthedClient = async (req, res, userId) => {
  if (!IS_HTTP) {
    req = req || GLOBAL_REQ;
    res = res || GLOBAL_RES;
  } else if (!req || !res) {
    return Promise.reject(new Error(config.ERROR_NEEDS_REQ_RES));
  }

  return __requireAnyAuth(req, res, userId).then(() => {
    return __cacheGet(res, 'client');
  });
};

exports.getAuthedUserId = (req, res) => {
  if (!IS_HTTP) {
    req = req || GLOBAL_REQ;
    res = res || GLOBAL_RES;
  } else if (!req || !res) {
    return Promise.reject(new Error(config.ERROR_NEEDS_REQ_RES));
  }

  return __getAuthedUserId(req, res);
};

exports.getAuthedToken = (req, res, userId) => {
  if (!IS_HTTP) {
    req = req || GLOBAL_REQ;
    res = res || GLOBAL_RES;
  } else if (!req || !res) {
    return Promise.reject(new Error(config.ERROR_NEEDS_REQ_RES));
  }

  return __requireAnyAuth(req, res, userId).then(() => {
    return __cacheGet(res, 'scopedToken').token;
  });
};

exports.authedUserHasScope = (req, res, scope) => {
  if (!IS_HTTP) {
    req = req || GLOBAL_REQ;
    res = res || GLOBAL_RES;
  } else if (!req || !res) {
    return Promise.reject(new Error(config.ERROR_NEEDS_REQ_RES));
  }

  return __authedUserHasScope(req, res, scope);
};
