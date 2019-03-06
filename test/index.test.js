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

const test = require('ava');
const uuid4 = require('uuid/v4');
const program = require('../index.js');

test.beforeEach(() => {
  process.env.GOOGLE_CLIENT_ID = 'google_client_id';
  process.env.GOOGLE_CLIENT_SECRET = 'google_client_secret';
  process.env.GOOGLE_CALLBACK_URL = 'google_callback_url';
  process.env.USER_ID_FORMAT = 'gaiaId';
});

test.afterEach.always(() => {
  delete process.env.DEFAULT_SCOPES;
  delete process.env.TOKEN_STORAGE_METHOD;
});

test.serial('works without provided arguments', t => {
  t.notThrows(() => {
    program();
  });
});

const getTruthyKeys = obj => {
  return Object.keys(obj)
    .filter(k => !!obj[k])
    .sort();
};

test.serial('exports ALL default methods', t => {
  const programInternal = program([], '', '', false);
  t.deepEqual(getTruthyKeys(programInternal), ['auth', 'routes']);

  t.deepEqual(getTruthyKeys(programInternal.auth), [
    'authedUser',
    'requireAuth',
    'tryAuth',
  ]);

  t.deepEqual(getTruthyKeys(programInternal.auth.authedUser), [
    'getClient',
    'getToken',
    'hasScope',
  ]);
});

test.serial('exports ALL internal methods', t => {
  const programExternal = program([], '', '', true);
  t.deepEqual(getTruthyKeys(programExternal), ['auth', 'routes']);

  t.deepEqual(getTruthyKeys(programExternal.auth), [
    'authedUser',
    'getRawClient',
    'requireAuth',
    'storeScopedToken',
    'tryAuth',
  ]);

  t.deepEqual(getTruthyKeys(programExternal.auth.authedUser), [
    'getClient',
    'getScopedToken',
    'getToken',
    'getUserId',
    'hasScope',
  ]);
});

test.serial('exports internal methods correctly', t => {
  const programWithout = program([], '', '', false);
  t.falsy(programWithout.auth.storeScopedToken);

  const programWith = program([], '', '', true);
  t.truthy(programWith.auth.storeScopedToken);
});

test.serial('sets scopes env var', t => {
  const scope1 = uuid4();
  const scope2 = uuid4();

  program(null, [scope1, scope2]);
  t.is(process.env.DEFAULT_SCOPES, `${scope1},${scope2}`);
});

test.serial('sets storage_method env var', t => {
  const storageMethod = uuid4();

  program(storageMethod, []);
  t.is(process.env.TOKEN_STORAGE_METHOD, storageMethod);
});

test.serial('sets user format env var', t => {
  program([], '', 'email', true);
  t.is(process.env.USER_ID_FORMAT, 'email');
});
