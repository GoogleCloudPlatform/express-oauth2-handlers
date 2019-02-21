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

const tokenStorage = require('./tokenStorage');
const config = require('./config');

const __isExpressCall = (arg1, arg2) =>
  [arg1, arg2].every(x => typeof x === 'object');

exports.init = (arg1, arg2, arg3) => {
  const handler = (req, res, scopes, next) => {
    res.redirect(
      tokenStorage.client.generateAuthUrl({
        access_type: 'offline',
        scope: scopes,
        prompt: 'consent', // Needed so we receive a refresh token every time
      })
    );
    if (next) {
      next();
    }
  };

  // Handle multi-layer function logic
  // e.g. `init` and `init()` behave similarly
  if (__isExpressCall(arg1, arg2)) {
    return handler(arg1, arg2, config.DEFAULT_SCOPES, arg3); // args = [req, res, next]
  } else {
    return (req, res, next) => handler(req, res, arg1, next); // args = [scope array]
  }
};

exports.cb = (arg1, arg2, arg3) => {
  const isFuncOrStr = x => ['string', 'function'].includes(typeof x);

  const handler = (req, res, next, onSuccess, onFailure) => {
    const code = req.query.code;

    // OAuth2: Exchange authorization code for access token
    return new Promise((resolve, reject) => {
      tokenStorage.client.getToken(code, (err, token) => {
        if (err) {
          return reject(err);
        }
        return resolve(token);
      });
    })
      .then(token => {
        // Store token
        return tokenStorage.saveToken(req, res, token);
      })
      .then(() => {
        // Custom actions
        if (isFuncOrStr(onSuccess)) {
          if (typeof onSuccess === 'function') {
            onSuccess(req, res);
          } else {
            res.redirect(onSuccess);
          }
        } else {
          res.status(200).send();
        }

        // Middleware emulation
        if (typeof next === 'function') {
          next();
        }
      })
      .catch(err => {
        if (isFuncOrStr(onFailure)) {
          if (typeof onFailure === 'function') {
            onFailure(err, req, res);
          } else {
            res.redirect(onFailure);
          }
        } else {
          console.log(err);
          res.status(500).send('Something went wrong, check the logs.');
        }

        // Middleware emulation
        if (typeof next === 'function') {
          next(err);
        }
      });
  };

  // Handle multi-layer function logic
  // e.g. `cb` and `cb()` behave similarly
  if (__isExpressCall(arg1, arg2)) {
    return handler(arg1, arg2, arg3); // args = [req, res, next]
  } else if ([arg1, arg2].every(isFuncOrStr)) {
    return (req, res, next) => handler(req, res, next, arg1, arg2); // args = [onSuccess, onFailure]
  } else {
    throw new Error(config.ERROR_CALLBACK_ARG_TYPES);
  }
};
