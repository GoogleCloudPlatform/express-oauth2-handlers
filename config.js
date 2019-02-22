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

const nconf = require('nconf');
const path = require('path');

const configPath = path.join(
  path.dirname(require.main.filename),
  'client_secret.json'
);

nconf
  .env()
  .file(configPath)
  .defaults({
    TOKEN_STORAGE_METHOD: 'cookie',
    DEFAULT_SCOPES: '',
  });

nconf.required([
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_CALLBACK_URL',
  'TOKEN_STORAGE_METHOD',
  'DEFAULT_SCOPES',
]);

/* File/env var values */
exports.GOOGLE_CLIENT_ID = nconf.get('GOOGLE_CLIENT_ID');
exports.GOOGLE_CLIENT_SECRET = nconf.get('GOOGLE_CLIENT_SECRET');
exports.GOOGLE_CALLBACK_URL = nconf.get('GOOGLE_CALLBACK_URL');

/* Options */
exports.STORAGE_METHOD = nconf.get('TOKEN_STORAGE_METHOD');
exports.DEFAULT_SCOPES = nconf.get('DEFAULT_SCOPES').split(','); // Comma-separated

/* Errors */
exports.ERROR_UNKNOWN_USER = 'User referenced by user ID has not registered.';
exports.ERROR_STORAGE_TYPE =
  'Unknown STORAGE_TYPE value. Must be "cookie" or "datastore"';
exports.ERROR_NEEDS_USERID =
  'A userId is required to store tokens in datastore.';
exports.ERROR_CALLBACK_ARG_TYPES =
  'If cb() is provided options, both "onSuccess" and "onFailure" must be provided (as redirect URLs OR callbacks)';
