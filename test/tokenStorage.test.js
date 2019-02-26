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

function getSample(datastoreResult, cookieResult, expiryDate) {
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
    locals: {},
  };

  const configMock = {
    STORAGE_METHOD: (datastoreResult && 'datastore') || 'cookie',
    USER_ID_FORMAT: 'email',
    ERROR_UNKNOWN_USER: 'error_unknown_user',
    ERROR_STORAGE_METHOD: 'error_storage_method',
    ERROR_NEEDS_USERID: 'error_needs_userid',
    ERROR_CALLBACK_ARG_TYPES: 'error_callback_arg_types',
    ERROR_SCOPED_ONLY: 'error_scoped_only',
    ERROR_USERID_FORMAT: 'error_userid_format',
    ERROR_USERID_SCOPES: 'error_userid_scopes',
    ERROR_NOT_AUTHED: 'error_not_authed',
  };
  configMock.NEEDS_USER_ID = configMock.STORAGE_METHOD === 'datastore';

  const oauth2ClientMock = {
    credentials: {
      expiry_date: expiryDate,
    },
    refreshAccessToken: sinon.stub().yields(null, {}),
  };

  const googleAuthMock = {
    OAuth2Client: sinon.stub().returns(oauth2ClientMock),
  };

  const oauth2ApiMock = {
    v2: {
      me: {
        get: sinon.stub().yields(null, {
          email: 'email',
          id: 600613,
        }),
      },
    },
  };

  const googleapisMock = {
    oauth2_v2: {
      Oauth2: sinon.stub().returns(oauth2ApiMock),
    },
  };

  return {
    program: proxyquire('../tokenStorage', {
      '@google-cloud/datastore': datastoreMock,
      './config': configMock,
      'google-auth-library': googleAuthMock,
      googleapis: googleapisMock,
    }),
    mocks: {
      config: configMock,
      datastore: datastoreMock,
      googleAuth: googleAuthMock,
      oauth2Client: oauth2ClientMock,
      req: reqMock,
      res: resMock,
    },
  };
}

const test = require('ava');

/* Basic tests */
test('storeScopedToken should store token using cookies', t => {
  const {program, mocks} = getSample();

  const token = {
    token: uuid4(),
    scopes: [],
  };
  const userId = uuid4();

  program.storeScopedToken(mocks.req, mocks.res, token, userId);

  t.true(mocks.res.cookie.calledOnce);
  t.true(mocks.datastore.save.notCalled);
  t.deepEqual(mocks.res.cookie.firstCall.args, [
    'oauth2token',
    JSON.stringify(token),
  ]);
});

test('storeScopedToken should store token using datastore', t => {
  const {program, mocks} = getSample();
  mocks.config.STORAGE_METHOD = 'datastore';

  const token = {
    token: uuid4(),
    scopes: [],
  };
  const userId = uuid4();

  program.storeScopedToken(mocks.req, mocks.res, token, userId);

  t.true(mocks.res.cookie.notCalled);
  t.true(mocks.datastore.save.calledOnce);
  t.deepEqual(mocks.datastore.save.firstCall.args, [
    {
      key: ['oauth2token', userId],
      data: token,
    },
  ]);
});

test('storeScopedToken should fail if token is not a scopedToken', async t => {
  const {program, mocks} = getSample(null, 'foo=bar');
  mocks.config.STORAGE_METHOD = 'datastore';

  await t.throwsAsync(() => {
    return program.storeScopedToken(mocks.req, mocks.res, {token: uuid4()});
  }, 'error_scoped_only');

  await t.throwsAsync(() => {
    return program.storeScopedToken(mocks.req, mocks.res, {scopes: []});
  }, 'error_scoped_only');
});

test('getAuthedClient should read token via cookies', async t => {
  const refreshToken = uuid4();
  const userId = uuid4();
  const inputToken = {
    token: {
      expiry_date: new Date(8640000000000000).toString(),
      refresh_token: refreshToken,
    },
    scopes: [],
  };
  const inputCookie = `oauth2token=${JSON.stringify(inputToken)}`;

  const {program, mocks} = getSample(null, inputCookie);

  const mockAuth = await program.getAuthedClient(mocks.req, mocks.res, userId);

  t.true(mocks.datastore.get.notCalled);
  t.deepEqual(mockAuth.credentials, inputToken.token);
});

test('getAuthedClient should read token via datastore', async t => {
  const refreshToken = uuid4();
  const userId = uuid4();
  const inputToken = {
    token: {
      expiry_date: new Date(8640000000000000).toString(),
      refresh_token: refreshToken,
    },
    scopes: [],
  };

  const {program, mocks} = getSample([inputToken]);

  const mockAuth = await program.getAuthedClient(mocks.req, mocks.res, userId);

  t.true(mocks.datastore.get.calledOnce);
  t.deepEqual(mocks.datastore.get.firstCall.args, [['oauth2token', userId]]);
  t.deepEqual(mockAuth.credentials, inputToken.token);
});

/* Edge cases */
test('storeScopedToken should validate storage method', async t => {
  const token = {
    scopes: [],
    token: {},
  };
  const {program, mocks} = getSample();
  mocks.config.STORAGE_METHOD = 'foobar';

  await t.throwsAsync(async () => {
    await program.storeScopedToken(mocks.req, mocks.res, token);
  }, 'error_storage_method');
});

test('storeScopedToken should require userid for datastore', async t => {
  const {program, mocks} = getSample([]);
  const token = {
    scopes: [],
    token: {},
  };

  await t.throwsAsync(async () => {
    await program.storeScopedToken(mocks.req, mocks.res, token);
  }, 'error_needs_userid');
});

test('getAuthedClient should require userId if using datastore', async t => {
  const {program, mocks} = getSample([]);

  await t.throwsAsync(async () => {
    await program.getAuthedClient(mocks.req, mocks.res);
  }, 'error_needs_userid');
});

test('getAuthClient should throw error for missing user with datastore', async t => {
  const {program, mocks} = getSample([]);

  await t.throwsAsync(async () => {
    await program.getAuthedClient(mocks.req, mocks.res, 'foo');
  }, 'error_unknown_user');
});

test('getAuthClient should throw error for missing user with cookies', async t => {
  const {program, mocks} = getSample(null, 'foo=bar');

  await t.throwsAsync(async () => {
    await program.getAuthedClient(mocks.req, mocks.res);
  }, 'error_unknown_user');
});

test('getAuthClient should refresh out-of-date token', async t => {
  const refreshToken = uuid4();
  const userId = uuid4();
  const inputToken = {
    token: {
      expiry_date: Date.now().toString(),
      refresh_token: refreshToken,
    },
    scopes: [],
  };
  const inputCookie = `oauth2token=${JSON.stringify(inputToken)}`;

  const {program, mocks} = getSample(null, inputCookie, Date.now());

  const mockAuth = await program.getAuthedClient(mocks.req, mocks.res, userId);

  t.true(mockAuth.refreshAccessToken.calledOnce);
  t.true(mocks.res.cookie.calledOnce);
});

/* Helper methods */
test('getAuthedClient auto-auths', async t => {
  const inputToken = {
    scopes: [],
    token: {},
  };
  const {program, mocks} = getSample([inputToken], null, Date.now());

  const mockAuth = await program.getAuthedClient(mocks.req, mocks.res, 'foo');
  t.deepEqual(mockAuth, mocks.oauth2Client);
  t.true(mocks.oauth2Client.refreshAccessToken.calledOnce);
});

test('getAuthedUserId fails without auth (and does not auto-auth)', async t => {
  const inputToken = {
    scopes: [],
    token: {},
  };

  const {program, mocks} = getSample([inputToken], null, Date.now());

  await t.throwsAsync(() => {
    return program.getAuthedUserId(mocks.req, mocks.res, 'foo');
  }, 'error_not_authed');
  t.true(mocks.oauth2Client.refreshAccessToken.notCalled);
});

test('storeScopedToken succeeds without auth', async t => {
  const token = {
    scopes: [],
    token: {},
  };
  const {program, mocks} = getSample();

  await program.storeScopedToken(mocks.req, mocks.res, token);

  t.true(mocks.res.cookie.calledOnce);
  t.true(mocks.res.cookie.calledWith('oauth2token', JSON.stringify(token)));
});

test('getAuthedScopedToken auto-auths', async t => {
  const token = {
    scopes: [],
    token: {},
  };
  const {program, mocks} = getSample([token], null, Date.now());

  await program.getAuthedScopedToken(mocks.req, mocks.res, 'foo');
  t.true(mocks.oauth2Client.refreshAccessToken.calledOnce);
});

test('getAuthedToken auto-auths', async t => {
  const token = {
    scopes: [],
    token: {},
  };
  const {program, mocks} = getSample([token], null, Date.now());

  await program.getAuthedToken(mocks.req, mocks.res, 'foo');
  t.true(mocks.oauth2Client.refreshAccessToken.calledOnce);
});

test('authedUserHasScope fails without auth (and does not auto-auth)', async t => {
  const token = {
    scopes: [],
    token: {},
  };
  const {program, mocks} = getSample();

  await t.throwsAsync(() => {
    return program.authedUserHasScope(mocks.req, mocks.res, token);
  }, 'error_not_authed');
  t.true(mocks.oauth2Client.refreshAccessToken.notCalled);
});

test('getAuthedUserId fails with zero required scopes', async t => {
  const token = {
    scopes: ['not_email'],
    token: {},
  };
  const userId = uuid4();
  const {program, mocks} = getSample([token], null, userId);

  await program.getAuthedClient(mocks.req, mocks.res, userId); // Authenticate
  t.true(mocks.oauth2Client.refreshAccessToken.calledOnce);

  await t.throwsAsync(() => {
    return program.getAuthedUserId(mocks.req, mocks.res, token);
  }, 'error_userid_scopes');
});

test('getAuthedUserId passes with one required scope', async t => {
  const token = {
    scopes: ['email'],
    token: {},
  };
  const userId = uuid4();
  const {program, mocks} = getSample([token], null, userId);

  await program.getAuthedClient(mocks.req, mocks.res, userId); // Authenticate
  t.true(mocks.oauth2Client.refreshAccessToken.calledOnce);

  await t.notThrowsAsync(() => {
    return program.getAuthedUserId(mocks.req, mocks.res, token);
  });
});

test('getAuthedUserId checks for invalid userId formats', async t => {
  const token = {
    scopes: ['email'],
    token: {},
  };
  const userId = uuid4();
  const {program, mocks} = getSample([token]);

  mocks.config.USER_ID_FORMAT = 'bad_format';

  await program.getAuthedClient(mocks.req, mocks.res, userId); // Authenticate
  t.true(mocks.oauth2Client.refreshAccessToken.calledOnce);

  await t.throwsAsync(() => {
    return program.getAuthedUserId(mocks.req, mocks.res, token);
  }, 'error_userid_format');
});

test('getAuthedUserId succeeds with valid userId formats', async t => {
  const token = {
    scopes: ['email'],
    token: {},
  };
  const userId = uuid4();
  const {program, mocks} = getSample([token]);

  mocks.config.USER_ID_FORMAT = 'email';

  await program.getAuthedClient(mocks.req, mocks.res, userId); // Authenticate
  t.true(mocks.oauth2Client.refreshAccessToken.calledOnce);

  await t.notThrowsAsync(() => {
    return program.getAuthedUserId(mocks.req, mocks.res, token);
  });
});

test('authedUserHasScope checks if a user has a given scope', async t => {
  const token = {
    scopes: ['email'],
    token: {},
  };
  const userId = uuid4();
  const {program, mocks} = getSample([token]);

  await program.getAuthedClient(mocks.req, mocks.res, userId); // Authenticate
  t.true(mocks.oauth2Client.refreshAccessToken.calledOnce);

  const includedScope = await program.authedUserHasScope(
    mocks.req,
    mocks.res,
    'email'
  );
  t.true(includedScope);

  const excludedScope = await program.authedUserHasScope(
    mocks.req,
    mocks.res,
    'not_scope'
  );
  t.false(excludedScope);
});

test('canAuth auto-auths and returns true if it succeeds', async t => {
  const token = {
    scopes: [],
    token: {},
  };
  const {program, mocks} = getSample([token], null, Date.now());

  const result = await program.canAuth(mocks.req, mocks.res, 'foo');
  t.true(result);
  t.true(mocks.oauth2Client.refreshAccessToken.calledOnce);
});

test('canAuth returns true if already authenticated', async t => {
  const token = {
    scopes: [],
    token: {},
  };
  const {program, mocks} = getSample([token], null, Date.now());

  await program.getAuthedClient(mocks.req, mocks.res, 'foo');
  t.true(mocks.oauth2Client.refreshAccessToken.calledOnce);

  const result = await program.canAuth(mocks.req, mocks.res, 'foo');
  t.true(result);
});

test('canAuth returns false if auth fails', async t => {
  const {program, mocks} = getSample(null);
  mocks.config.STORAGE_METHOD = 'datastore'; // Nonexistent user

  const call = program.canAuth(mocks.req, mocks.res, 'foo');
  await t.notThrowsAsync(call);

  const result = await call;
  t.false(result);
});
