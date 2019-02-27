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

const AuthLib = require('./lib');
const authLib = AuthLib('cookie', ['profile', 'email'], 'email', true);

// Auth boilerplate
exports.oauth2init = authLib.routes.init;
exports.oauth2callback = authLib.routes.cb;

// User code
exports.oauth2test = (req, res) => {
  return authLib.auth.requireAuth(req, res)
    .then((success) => {
      console.log('auth success?', success);
      return authLib.auth.authedUser.getUserId(req, res);
    })
    .then(userId => {
      res.status(200).send(`Your user ID is: ${userId}`);
    })
    .catch(err => {
      console.log(err);
      res.status(500).send(`An error occurred; check the logs.`);
    });
};

exports.silly = (req, res) => {
  res.send(process.env.FUNCTION_TRIGGER_TYPE);
}