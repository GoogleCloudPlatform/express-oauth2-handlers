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

const test = require('ava');
const uuid4 = require('uuid/v4');
const program = require('../index.js');

test.beforeEach(() => {
  process.env.GOOGLE_CLIENT_ID = 'google_client_id';
  process.env.GOOGLE_CLIENT_SECRET = 'google_client_secret';
  process.env.GOOGLE_CALLBACK_URL = 'google_callback_url';
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

test.serial('exports internal variables', t => {
  const programWithout = program([]);
  t.falsy(programWithout.__internal);

  const programWith = program([], '', true);
  t.truthy(programWith.__internal);
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
