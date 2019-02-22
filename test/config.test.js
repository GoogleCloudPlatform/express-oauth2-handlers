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
const sinon = require('sinon');
const proxyquire = require('proxyquire').noPreserveCache();

test.beforeEach(() => {
  delete require.cache[require.resolve('../config')];

  process.env.GOOGLE_CLIENT_ID = 'google_client_id';
  process.env.GOOGLE_CLIENT_SECRET = 'google_client_secret';
  process.env.GOOGLE_CALLBACK_URL = 'google_callback_url';
});

test.serial('processes DEFAULT_SCOPES array as comma-separated string', t => {
  process.env.DEFAULT_SCOPES = 'a,b,c';

  const config = require('../config');

  t.deepEqual(config.DEFAULT_SCOPES, ['a', 'b', 'c']);
});

test.serial('should check for required env vars', t => {
  delete process.env.GOOGLE_CALLBACK_URL;

  t.throws(() => {
    require('../config');
  }, /GOOGLE_CALLBACK_URL/);
});

test.serial('should automatically load a client_secret.json file', t => {
  const fileContents = JSON.stringify({
    web: {
      client_id: 'foo',
      client_secret: 'bar',
      redirect_uris: ['https://google.com'],
    },
  });

  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
  delete process.env.GOOGLE_CALLBACK_URL;

  t.notThrows(() => {
    proxyquire('../config', {
      fs: {
        existsSync: sinon.stub().returns(true),
        readFileSync: sinon.stub().returns(fileContents),
      },
    });
  });
});
