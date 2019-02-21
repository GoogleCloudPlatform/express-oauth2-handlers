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

const sinon = require('sinon');
const uuid4 = require('uuid/v4');
const proxyquire = require(`proxyquire`)
  .noPreserveCache()
  .noCallThru();

function getSample(storageMethod, datastoreResult, cookieResult, expiryDate) {
  expiryDate = expiryDate || new Date(8640000000000000);

  const datastoreMock = {
    key: sinon.stub().returnsArg(0),
    save: sinon.stub().resolves(),
    get: sinon.stub().resolves(datastoreResult),
  };

  const reqMock = {
    headers: {
      cookie: cookieResult,
    },
  };

  const resMock = {
    cookie: sinon.stub(),
  };

  const configMock = {
    STORAGE_METHOD: storageMethod,
    ERROR_STORAGE_TYPE: 'error_storage_type',
    ERROR_NEEDS_USERID: 'error_needs_userid',
  };

  const googleAuthMock = {
    OAuth2Client: sinon.stub().returns({
      credentials: {
        expiry_date: expiryDate,
      },
      refreshAccessToken: sinon.stub().yields(null, {}),
    }),
  };

  return {
    program: proxyquire('../tokenStorage', {
      '@google-cloud/datastore': datastoreMock,
      './config': configMock,
      'google-auth-library': googleAuthMock,
    }),
    mocks: {
      req: reqMock,
      res: resMock,
      datastore: datastoreMock,
      googleAuth: googleAuthMock,
    },
  };
}

const test = require('ava');

/* Basic tests */
test('should save token using cookies', t => {
  const sample = getSample('cookie');

  const reqMock = sample.mocks.req;
  const resMock = sample.mocks.res;
  const datastoreMock = sample.mocks.datastore;

  const token = uuid4();
  const userId = uuid4();

  sample.program.saveToken(reqMock, resMock, token, userId);

  t.true(resMock.cookie.calledOnce);
  t.true(datastoreMock.save.notCalled);
  t.deepEqual(resMock.cookie.firstCall.args, [
    'oauth2token',
    JSON.stringify(token),
  ]);
});

test('should save token using datastore', t => {
  const sample = getSample('datastore');

  const reqMock = sample.mocks.req;
  const resMock = sample.mocks.res;
  const datastoreMock = sample.mocks.datastore;

  const token = uuid4();
  const userId = uuid4();

  sample.program.saveToken(reqMock, resMock, token, userId);

  t.true(resMock.cookie.notCalled);
  t.true(datastoreMock.save.calledOnce);
  t.deepEqual(datastoreMock.save.firstCall.args, [
    {
      key: ['oauth2token', userId],
      data: token,
    },
  ]);
});

test('should get auth via token in cookies', async t => {
  const refreshToken = uuid4();
  const userId = uuid4();
  const inputToken = {
    expiry_date: new Date(8640000000000000).toString(),
    refresh_token: refreshToken,
  };
  const inputCookie = `oauth2token=${JSON.stringify(inputToken)}`;

  const sample = getSample('cookie', null, inputCookie);

  const reqMock = sample.mocks.req;
  const resMock = sample.mocks.res;
  const datastoreMock = sample.mocks.datastore;

  const mockAuth = await sample.program.getAuth(reqMock, resMock, userId);

  t.true(datastoreMock.get.notCalled);
  t.deepEqual(mockAuth.credentials, inputToken);
});

test('should get auth via token in datastore', async t => {
  const refreshToken = uuid4();
  const userId = uuid4();
  const inputToken = {
    expiry_date: new Date(8640000000000000).toString(),
    refresh_token: refreshToken,
  };

  const sample = getSample('datastore', [inputToken]);

  const reqMock = sample.mocks.req;
  const resMock = sample.mocks.res;
  const datastoreMock = sample.mocks.datastore;

  const mockAuth = await sample.program.getAuth(reqMock, resMock, userId);

  t.true(datastoreMock.get.calledOnce);
  t.deepEqual(datastoreMock.get.firstCall.args, [['oauth2token', userId]]);
  t.deepEqual(mockAuth.credentials, inputToken);
});

/* Edge cases */
test('should validate storage method', async t => {
  const sample = getSample('foobar');
  const program = sample.program;

  const reqMock = sample.mocks.req;
  const resMock = sample.mocks.res;

  await t.throwsAsync(async () => {
    await program.saveToken(reqMock, resMock);
  }, 'error_storage_type');
});

test('should require userid for datastore', async t => {
  const sample = getSample('datastore');
  const program = sample.program;

  const reqMock = sample.mocks.req;
  const resMock = sample.mocks.res;

  await t.throwsAsync(async () => {
    await program.getAuth(reqMock, resMock);
  }, 'error_needs_userid');
  await t.throwsAsync(async () => {
    await program.saveToken(reqMock, resMock);
  }, 'error_needs_userid');
});

test('should throw error for missing user with datastore', async t => {
  const sample = getSample('datastore', []);
  const program = sample.program;

  const reqMock = sample.mocks.req;
  const resMock = sample.mocks.res;

  await t.throwsAsync(async () => {
    await program.getAuth(reqMock, resMock);
  }, 'error_needs_userid');
});

test('should throw error for missing user with cookies', async t => {
  const sample = getSample('datastore', [{}], 'foo=bar');
  const program = sample.program;

  const reqMock = sample.mocks.req;
  const resMock = sample.mocks.res;

  await t.throwsAsync(async () => {
    await program.getAuth(reqMock, resMock);
  }, 'error_needs_userid');
});

test('should refresh out-of-date token', async t => {
  const refreshToken = uuid4();
  const userId = uuid4();
  const inputToken = {
    expiry_date: Date.now().toString(),
    refresh_token: refreshToken,
  };
  const inputCookie = `oauth2token=${JSON.stringify(inputToken)}`;

  const sample = getSample('cookie', null, inputCookie, Date.now());

  const reqMock = sample.mocks.req;
  const resMock = sample.mocks.res;

  const mockAuth = await sample.program.getAuth(reqMock, resMock, userId);

  t.true(mockAuth.refreshAccessToken.calledOnce);
  t.true(resMock.cookie.calledOnce);
});
