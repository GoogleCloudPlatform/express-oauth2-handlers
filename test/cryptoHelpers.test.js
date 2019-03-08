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

const sinon = require('sinon');
const test = require('ava');
const uuid4 = require('uuid/v4');

const proxyquire = require(`proxyquire`).noPreserveCache();

test.before(() => {
  if (!process.env.KMS_KEY_RING || !process.env.KMS_KEY_NAME) {
    throw new Error(
      'Both KMS_KEY_NAME and KMS_KEY_RING must be set (as env vars).'
    );
  }
});

const getSample = nconfValues => {
  nconfValues = Object.assign(nconfValues, {
    DEFAULT_SCOPES: '',
  });

  const nconfMock = {
    use: sinon.stub().returnsThis(),
    set: sinon.stub().returnsThis(),
    get: x => nconfValues[x],
    env: sinon.stub().returnsThis(),
    required: sinon.stub(),
    defaults: sinon.stub().returns(nconfValues),
  };

  const configMock = proxyquire('../config', {
    nconf: nconfMock,
  });

  const cryptoHelpers = proxyquire('../cryptoHelpers', {
    './config': configMock,
  });

  return {
    program: cryptoHelpers,
    mocks: {
      nconf: nconfMock,
      config: configMock,
    },
  };
};

test(`should encrypt and decrypt using Cloud KMS`, async t => {
  const {program} = getSample({
    USES_KMS: true,
    KMS_KEY_RING: process.env.KMS_KEY_RING,
    KMS_KEY_NAME: process.env.KMS_KEY_NAME,
    TOKEN_ENCRYPTION_KEY: 'foo',
  });

  const data = uuid4();

  const encrypted = await program.encrypt(data);
  t.is(typeof encrypted, 'string');
  t.not(data, encrypted);

  const decrypted = await program.decrypt(encrypted);
  t.is(typeof decrypted, 'string');
  t.is(data, decrypted);
});

test(`should encrypt and decrypt using tweetnacl`, async t => {
  const {program} = getSample({
    USES_KMS: false,
    TOKEN_ENCRYPTION_KEY: uuid4(),
  });

  const data = uuid4();

  const encrypted = await program.encrypt(data);
  t.is(typeof encrypted, 'string');
  t.not(data, encrypted);

  const decrypted = await program.decrypt(encrypted);
  t.is(typeof decrypted, 'string');
  t.is(data, decrypted);
});
