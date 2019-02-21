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
const proxyquire = require(`proxyquire`)
  .noPreserveCache()
  .noCallThru();

function getSample(defaultScopes) {
  defaultScopes = defaultScopes || [];

  const authClientMock = {
    generateAuthUrl: sinon.stub(),
    getToken: sinon.stub().yields(),
  };

  const tokenStorageMock = {
    saveToken: sinon.stub().resolves(),
    client: authClientMock,
  };

  const reqMock = {
    query: {
      code: 'foo',
    },
  };

  const resMock = {
    redirect: sinon.stub(),
    status: sinon.stub().returnsThis(),
    send: sinon.stub(),
  };

  const configMock = {
    ERROR_CALLBACK_ARG_TYPES: 'error_callback_arg_types',
    DEFAULT_SCOPES: defaultScopes,
  };

  return {
    program: proxyquire('../routes', {
      './tokenStorage': tokenStorageMock,
      './config': configMock,
    }),
    mocks: {
      authClient: authClientMock,
      tokenStorage: tokenStorageMock,
      req: reqMock,
      res: resMock,
    },
  };
}

/* Common cases */
test('init: should accept one argument (scope array)', t => {
  const sample = getSample();

  const reqMock = sample.mocks.req;
  const resMock = sample.mocks.res;
  const nextMock = sinon.stub();

  const handler = sample.program.init(['scope']);

  handler(reqMock, resMock, nextMock);

  t.true(sample.mocks.authClient.generateAuthUrl.calledOnce);
  t.true(resMock.redirect.calledOnce);
  t.true(nextMock.calledOnce);
});

test('init: should accept zero arguments', t => {
  const sample = getSample();

  const reqMock = sample.mocks.req;
  const resMock = sample.mocks.res;
  const nextMock = sinon.stub();

  const handler = sample.program.init;

  handler(reqMock, resMock, nextMock);

  t.true(sample.mocks.authClient.generateAuthUrl.calledOnce);
  t.true(resMock.redirect.calledOnce);
  t.true(nextMock.calledOnce);
});

test('cb: should accept GCF args (req, res)', async t => {
  const sample = getSample();

  const reqMock = sample.mocks.req;
  const resMock = sample.mocks.res;
  const tokenStorageMock = sample.mocks.tokenStorage;

  const handler = sample.program.cb;
  await handler(reqMock, resMock);

  t.true(tokenStorageMock.client.getToken.calledOnce);
  t.true(tokenStorageMock.saveToken.calledOnce);

  t.true(resMock.status.calledWith(200));
  t.true(resMock.send.calledOnce);
});

test('cb: should accept middleware args (req, res, next)', async t => {
  const sample = getSample();

  const reqMock = sample.mocks.req;
  const resMock = sample.mocks.res;
  const nextMock = sinon.stub();
  const tokenStorageMock = sample.mocks.tokenStorage;

  const handler = sample.program.cb;
  await handler(reqMock, resMock, nextMock);

  t.true(tokenStorageMock.client.getToken.calledOnce);
  t.true(tokenStorageMock.saveToken.calledOnce);
  t.true(nextMock.calledOnce);
});

/* cb success/failure handlers */
test('cb: should handle success with callback function', async t => {
  const sample = getSample();

  const onSuccess = sinon.stub();
  const onFailure = sinon.stub();

  const reqMock = sample.mocks.req;
  const resMock = sample.mocks.res;
  const nextMock = sinon.stub();

  const handler = sample.program.cb(onSuccess, onFailure);
  await handler(reqMock, resMock, nextMock);

  t.true(onSuccess.calledOnce);
  t.true(onFailure.notCalled);
  t.true(nextMock.calledOnce);
});

test('cb: should handle error with callback function', async t => {
  const sample = getSample();
  sample.mocks.tokenStorage.saveToken = sinon.stub().rejects();

  const onSuccess = sinon.stub();
  const onFailure = sinon.stub();

  const reqMock = sample.mocks.req;
  const resMock = sample.mocks.res;

  const handler = sample.program.cb(onSuccess, onFailure);
  await handler(reqMock, resMock);

  t.true(onSuccess.notCalled);
  t.true(onFailure.calledOnce);
});

test('cb: should handle success with string redirect', async t => {
  const sample = getSample();

  const reqMock = sample.mocks.req;
  const resMock = sample.mocks.res;

  const handler = sample.program.cb('success', 'failure');
  await handler(reqMock, resMock);

  t.true(resMock.redirect.calledWith('success'));
});

test('cb: should handle error with string redirect', async t => {
  const sample = getSample();
  sample.mocks.tokenStorage.saveToken = sinon.stub().rejects();

  const reqMock = sample.mocks.req;
  const resMock = sample.mocks.res;

  const handler = sample.program.cb('success', 'failure');
  await handler(reqMock, resMock);

  t.true(resMock.redirect.calledWith('failure'));
});

/* DEFAULT_SCOPES behavior */
test('should respect DEFAULT_SCOPES setting', async t => {
  const sample = getSample(['scope_a']);

  const reqMock = sample.mocks.req;
  const resMock = sample.mocks.res;

  const handler = sample.program.init;
  await handler(reqMock, resMock);

  const authFunc = sample.mocks.tokenStorage.client.generateAuthUrl;
  t.true(authFunc.calledOnce);
  t.deepEqual(authFunc.firstCall.args[0].scope, ['scope_a']);
});

test('local scopes should override DEFAULT_SCOPES setting', async t => {
  const sample = getSample(['scope_a']);

  const reqMock = sample.mocks.req;
  const resMock = sample.mocks.res;

  const handler = sample.program.init(['scope_b']);
  await handler(reqMock, resMock);

  const authFunc = sample.mocks.tokenStorage.client.generateAuthUrl;
  t.true(authFunc.calledOnce);
  t.deepEqual(authFunc.firstCall.args[0].scope, ['scope_b']);
});
