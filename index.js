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

module.exports = (scopes, storage_method, include_internal_methods) => {
  // Set global config env vars
  process.env.DEFAULT_SCOPES = (scopes || []).join(',');
  process.env.TOKEN_STORAGE_METHOD = storage_method;

  // Import libraries (AFTER setting env vars)
  routes = require('./routes');
  tokenStorage = require('./tokenStorage');

  // Export library methods
  let exported = {
    auth: {
      client: tokenStorage.client,
      token: null,
    },
    routes: {
      init: routes.init,
      cb: routes.cb,
    },
  };

  // Export internal methods (if asked to, in case someone needs these)
  if (include_internal_methods) {
    exported.__internal = {
      __saveToken: tokenStorage.saveToken,
      __getAuth: tokenStorage.getAuth,
    };
  }

  // Done!
  return exported;
};

// // ekoleda@ sbazyl@

// // DESIGN
// o2.routes.{init / cb}
// o2.getToken - gets token
// o2.__tokenLib.{__get/__set} - backend functions

// // SAMPLE USAGE
// const Auth = require('@google-cloud/express-oauth2');
// const auth = Auth(scopes, storage_type);

// // GCF
// exports.oauth2init = auth.routes.init("/oauth2callback")
//                    = auth.routes.init("/oauth2callback", [scopes])
// exports.oauth2callback = auth.routes.cb
