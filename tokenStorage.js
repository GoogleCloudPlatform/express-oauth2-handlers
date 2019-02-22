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
const config = require('./config');
const datastore = require('@google-cloud/datastore');
const {OAuth2Client} = require('google-auth-library');

const oauth2client = new OAuth2Client(
  config.GOOGLE_CLIENT_ID,
  config.GOOGLE_CLIENT_SECRET,
  config.GOOGLE_CALLBACK_URL
);

const __validateOrRefreshToken = (req, res, token, userId) => {
  if (!token) {
    return Promise.reject(config.ERROR_UNKNOWN_USER);
  }

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
        return resolve(oauth2client.credentials);
      });
    }).then(newToken => {
      return exports.storeToken(req, res, newToken, userId);
    });
  } else {
    oauth2client.credentials = token;
    return Promise.resolve();
  }
};

exports.storeToken = (req, res, token, userId) => {
  if (config.STORAGE_METHOD === 'datastore') {
    // Check for user ID
    if (!userId) {
      return Promise.reject(new Error(config.ERROR_NEEDS_USERID));
    }

    return datastore.save({
      key: datastore.key(['oauth2token', userId]),
      data: token,
    });
  } else if (config.STORAGE_METHOD === 'cookie') {
    // User ID not required
    res.cookie('oauth2token', JSON.stringify(token));
    return Promise.resolve();
  } else {
    return Promise.reject(new Error(config.ERROR_STORAGE_TYPE));
  }
};

exports.getAuth = (req, res, userId) => {
  if (config.STORAGE_METHOD === 'datastore') {
    // Check for user ID
    if (!userId) {
      return Promise.reject(new Error(config.ERROR_NEEDS_USERID));
    }

    return datastore
      .get(datastore.key(['oauth2token', userId]))
      .then(tokens => {
        return __validateOrRefreshToken(req, res, tokens[0], userId);
      })
      .then(() => {
        return Promise.resolve(oauth2client);
      });
  } else if (config.STORAGE_METHOD === 'cookie') {
    const token = JSON.parse(cookie.parse(req.headers.cookie)['oauth2token']);
    return __validateOrRefreshToken(req, res, token).then(() => {
      return Promise.resolve(oauth2client);
    });
  } else {
    return Promise.reject(new Error(config.ERROR_STORAGE_TYPE));
  }
};

exports.getToken = (req, res, userId) => {
  return exports.getAuth(req, res, userId).then(() => {
    return Promise.resolve(oauth2client.credentials);
  });
};
