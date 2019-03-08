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

const nconf = require('nconf');
const path = require('path');
const shajs = require('sha.js');

const {decodeBase64} = require('tweetnacl-util');

/* Standard configuration logic */
nconf
  .use('memory')
  .env()
  .defaults({
    TOKEN_STORAGE_METHOD: 'cookie',
    DEFAULT_SCOPES: '',
  });

/* Automatic secret discovery */
const secretPath = path.join(path.dirname(__dirname), 'client_secret.json');
console.log(`Searching for secrets in: ${secretPath}`);

const fs = require('fs');
if (fs.existsSync(secretPath)) {
  const contents = JSON.parse(fs.readFileSync(secretPath))['web'];
  if (contents && contents['client_id']) {
    nconf.set('GOOGLE_CLIENT_ID', contents['client_id']);
  }
  if (contents && contents['client_secret']) {
    nconf.set('GOOGLE_CLIENT_SECRET', contents['client_secret']);
  }
  if (
    contents &&
    contents['redirect_uris'] &&
    contents['redirect_uris'].length === 1
  ) {
    nconf.set('GOOGLE_CALLBACK_URL', contents['redirect_uris'][0]);
  }
}

nconf.required([
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_CALLBACK_URL',
  'TOKEN_STORAGE_METHOD',
  'DEFAULT_SCOPES',
  'GCP_PROJECT',
]);

/* Auth values */
exports.GOOGLE_CLIENT_ID = nconf.get('GOOGLE_CLIENT_ID');
exports.GOOGLE_CLIENT_SECRET = nconf.get('GOOGLE_CLIENT_SECRET');
exports.GOOGLE_CALLBACK_URL = nconf.get('GOOGLE_CALLBACK_URL');

/* Non-KMS encryption key */
let tokenKey =
  nconf.get('TOKEN_ENCRYPTION_KEY') || exports.GOOGLE_CLIENT_SECRET;
exports.TOKEN_ENCRYPTION_KEY =
  shajs('sha256')
    .update(tokenKey)
    .digest('hex')
    .slice(0, 43) + '=';
exports.TOKEN_ENCRYPTION_BYTES = decodeBase64(exports.TOKEN_ENCRYPTION_KEY);

/* KMS config */
const usesKms = tokenKey.toUpperCase() === 'KMS';
exports.USES_KMS = usesKms;

if (usesKms) {
  nconf.required(['KMS_KEY_RING', 'KMS_KEY_NAME']);
}

exports.KMS_KEY_RING = nconf.get('KMS_KEY_RING');
exports.KMS_KEY_NAME = nconf.get('KMS_KEY_NAME');

/* Options */
exports.STORAGE_METHOD = nconf.get('TOKEN_STORAGE_METHOD');
exports.DEFAULT_SCOPES = nconf.get('DEFAULT_SCOPES').split(','); // Comma-separated
exports.USER_ID_FORMAT = nconf.get('USER_ID_FORMAT');

/* Computed values */
exports.GCP_PROJECT = nconf.get('GCP_PROJECT');
exports.NEEDS_USER_ID = exports.STORAGE_METHOD === 'datastore';
const __triggerType = process.env.FUNCTION_TRIGGER_TYPE;

exports.IS_HTTP =
  !__triggerType || __triggerType.toLowerCase().includes('http');

/* Errors */
exports.ERROR_UNKNOWN_USER = 'User referenced by user ID has not registered.';
exports.ERROR_STORAGE_METHOD =
  'Unknown or unsupported STORAGE_METHOD value. Must be "datastore" or "cookie", and "cookie" can only works in HTTP contexts.';
exports.ERROR_NEEDS_USERID =
  'A userId is required to store tokens in datastore.';
exports.ERROR_CALLBACK_ARG_TYPES =
  'If cb() is provided options, both "onSuccess" and "onFailure" must be provided (as redirect URLs OR callbacks)';
exports.ERROR_SCOPED_ONLY =
  'This method only accepts "scoped" tokens. Use the getScopedToken() function to obtain them.';
exports.ERROR_USERID_FORMAT =
  'Unknown user ID format. User ID format must be a string ("email" or "gaiaId") or a function.';
exports.ERROR_USERID_SCOPES =
  'Using an email address or GAIA ID as user IDs requires adding the "profile" or "email" scopes.';
exports.ERROR_NOT_AUTHED = 'A user must be authenticated to use this method';
exports.ERROR_HTTP_ONLY =
  'This functionality is only supported when using HTTP(S).';
exports.ERROR_NEEDS_REQ_RES =
  'Please pass Express\' "req" and "res" objects to this function when using HTTP(S).';
exports.ERROR_TWEETNACL_DECRYPTION =
  '"tweetnacl" could not decrypt the provided message.';
