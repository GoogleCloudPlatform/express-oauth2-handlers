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

let routes;
let tokenStorage;

module.exports = (storageMethod, scopes, userIdFormat, showInternals) => {
  // Set global config env vars
  process.env.DEFAULT_SCOPES = (scopes || []).join(',');
  process.env.TOKEN_STORAGE_METHOD = storageMethod;
  process.env.USER_ID_FORMAT = userIdFormat;

  // Import libraries (AFTER setting env vars)
  routes = require('./routes');
  tokenStorage = require('./tokenStorage');

  // Export library methods
  let exported = {
    auth: {
      tryAuth: tokenStorage.tryAuth,
      requireAuth: tokenStorage.requireAuth,
      authedUser: {
        getClient: tokenStorage.getAuthedClient,
        getToken: tokenStorage.getAuthedToken,
        hasScope: tokenStorage.authedUserHasScope,
      },
    },
    routes: {
      init: routes.init,
      cb: routes.cb,
    },
  };

  // Export internal methods (if asked to, in case someone needs these)
  if (showInternals) {
    exported.auth.authedUser.getScopedToken = tokenStorage.getAuthedScopedToken;
    exported.auth.authedUser.getUserId = tokenStorage.getAuthedUserId;
    exported.auth.getRawClient = tokenStorage.getUnauthedClient;
    exported.auth.storeScopedToken = tokenStorage.storeScopedToken;
  }

  // Done!
  return exported;
};
