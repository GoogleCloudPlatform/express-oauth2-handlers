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

// Hide output
test.before(() => {
  sinon.stub(console, 'log');
});
test.after.always(() => {
  console.log.restore();
});

function getSample(defaultScopes) {
  defaultScopes = defaultScopes || [];

  const authClientMock = {
    generateAuthUrl: sinon.stub(),
    getToken: sinon.stub().yields(),
  };

  const tokenStorageMock = {
    storeScopedToken: sinon.stub().resolves(),
    getClient: sinon.stub().returns(authClientMock),
  };

  const reqMock = {
    query: {
      code: 'foo',
      scopes: 'scope1 scope2 scope3',
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
  const {program, mocks} = getSample();
  const nextMock = sinon.stub();

  const handler = program.init(['scope']);

  handler(mocks.req, mocks.res, nextMock);

  t.true(mocks.authClient.generateAuthUrl.calledOnce);
  t.true(mocks.res.redirect.calledOnce);
  t.true(nextMock.calledOnce);
});

test('init: should accept zero arguments', t => {
  const {program, mocks} = getSample();
  const nextMock = sinon.stub();

  const handler = program.init;

  handler(mocks.req, mocks.res, nextMock);

  t.true(mocks.authClient.generateAuthUrl.calledOnce);
  t.true(mocks.res.redirect.calledOnce);
  t.true(nextMock.calledOnce);
});

test('cb: should accept GCF args (req, res)', async t => {
  const {program, mocks} = getSample();

  const handler = program.cb;
  await handler(mocks.req, mocks.res);

  t.true(mocks.authClient.getToken.calledOnce);
  t.true(mocks.tokenStorage.storeScopedToken.calledOnce);

  t.true(mocks.res.status.calledWith(200));
  t.true(mocks.res.send.calledOnce);
});

test('cb: should accept middleware args (req, res, next)', async t => {
  const {program, mocks} = getSample();
  const nextMock = sinon.stub();

  const handler = program.cb;
  await handler(mocks.req, mocks.res, nextMock);

  t.true(mocks.authClient.getToken.calledOnce);
  t.true(mocks.tokenStorage.storeScopedToken.calledOnce);
  t.true(nextMock.calledOnce);
});

/* cb success/failure handlers */
test('cb: should handle success with callback function', async t => {
  const {program, mocks} = getSample();

  const onSuccess = sinon.stub();
  const onFailure = sinon.stub();
  const nextMock = sinon.stub();

  const handler = program.cb(onSuccess, onFailure);
  await handler(mocks.req, mocks.res, nextMock);

  t.true(onSuccess.calledOnce);
  t.true(onFailure.notCalled);
  t.true(nextMock.calledOnce);
});

test('cb: should handle error with callback function', async t => {
  const {program, mocks} = getSample();
  mocks.tokenStorage.storeScopedToken = sinon.stub().rejects();

  const onSuccess = sinon.stub();
  const onFailure = sinon.stub();

  const handler = program.cb(onSuccess, onFailure);
  await handler(mocks.req, mocks.res);

  t.true(onSuccess.notCalled);
  t.true(onFailure.calledOnce);
});

test('cb: should handle success with string redirect', async t => {
  const {program, mocks} = getSample();

  const handler = program.cb('success', 'failure');
  await handler(mocks.req, mocks.res);

  t.true(mocks.res.redirect.calledWith('success'));
});

test('cb: should handle error with string redirect', async t => {
  const {program, mocks} = getSample();
  mocks.tokenStorage.storeScopedToken = sinon.stub().rejects();

  const handler = program.cb('success', 'failure');
  await handler(mocks.req, mocks.res);

  t.true(mocks.res.redirect.calledWith('failure'));
});

/* DEFAULT_SCOPES behavior */
test('should respect DEFAULT_SCOPES setting', async t => {
  const {program, mocks} = getSample(['scope_a']);

  const handler = program.init;
  await handler(mocks.req, mocks.res);

  const authFunc = mocks.authClient.generateAuthUrl;
  t.true(authFunc.calledOnce);
  t.deepEqual(authFunc.firstCall.args[0].scope, ['scope_a']);
});

test('local scopes should override DEFAULT_SCOPES setting', async t => {
  const {program, mocks} = getSample(['scope_a']);

  const handler = program.init(['scope_b']);
  await handler(mocks.req, mocks.res);

  const authFunc = mocks.authClient.generateAuthUrl;
  t.true(authFunc.calledOnce);
  t.deepEqual(authFunc.firstCall.args[0].scope, ['scope_b']);
});
