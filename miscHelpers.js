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
const config = require('./config');

// Global request/response mocks - ONLY for use in GCF w/non-HTTP triggers
// (GAE shares globals between requests => MAJOR security issue)
const stubNeedsReqRes = sinon
  .stub()
  .throws(new Error(config.ERROR_NEEDS_REQ_RES));
let GLOBAL_REQ = null;
let GLOBAL_RES = {
  cookie: stubNeedsReqRes,
  status: stubNeedsReqRes,
  send: stubNeedsReqRes,
  end: stubNeedsReqRes,
};

if (!config.IS_HTTP) {
  GLOBAL_REQ = {};
  GLOBAL_RES.locals = {};
}

exports.__wrapReqRes = method => {
  return (req, res, a, b) => {
    if (!config.IS_HTTP) {
      req = req || GLOBAL_REQ;
      res = res || GLOBAL_RES;
    } else if (!req || !res) {
      return Promise.reject(new Error(config.ERROR_NEEDS_REQ_RES));
    }

    return method(req, res, a, b);
  };
};

// GAE doesn't support per-concurrent-user globals, so use res.locals as
// our cache instead. Inefficient for GCF though, which is zero-concurrency.
exports.__cacheGet = (req, res, k) => {
  return res.locals.magicAuth && res.locals.magicAuth[k];
};

exports.__cacheSet = (req, res, k, v) => {
  res.locals.magicAuth = Object.assign(res.locals.magicAuth || {}, {[k]: v});
  return v;
};
