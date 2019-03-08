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

const config = require('./config');

const KmsClient = require('@google-cloud/kms').KeyManagementServiceClient;
const kmsClient = new KmsClient();
const kmsKeyPath = kmsClient.cryptoKeyPath(
  config.GCP_PROJECT,
  'global',
  config.KMS_KEY_RING,
  config.KMS_KEY_NAME
);

exports.__kmsDecrypt = async ciphertext => {
  const [result] = await kmsClient.decrypt({name: kmsKeyPath, ciphertext});
  return Buffer.from(result.plaintext, 'base64').toString();
};

exports.__kmsEncrypt = async data => {
  const plaintext = Buffer.from(data);
  const [result] = await kmsClient.encrypt({name: kmsKeyPath, plaintext});
  return result.ciphertext.toString('base64');
};