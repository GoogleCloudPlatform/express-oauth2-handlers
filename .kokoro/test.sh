#!/bin/bash

# Copyright 2018 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     https://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

set -xeo pipefail

export NPM_CONFIG_PREFIX=/home/node/.npm-global

cd $(dirname $0)/..

export GOOGLE_CLIENT_ID=google-client-id
export GOOGLE_CLIENT_SECRET=google-client-secret
export GOOGLE_CALLBACK_URL=google-callback-url
export GCP_PROJECT=gcp-project
export KMS_KEY_RING=kms-keyring
export KMS_KEY_NAME=kms-keyname

npm install
npm test
./node_modules/nyc/bin/nyc.js report

bash $KOKORO_GFILE_DIR/codecov.sh
