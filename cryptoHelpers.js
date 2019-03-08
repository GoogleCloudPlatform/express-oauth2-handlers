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
const crypto = require('tweetnacl');
const NONCE_LENGTH = crypto.secretbox.nonceLength;

const {
  decodeUTF8,
  encodeUTF8,
  encodeBase64,
  decodeBase64,
} = require('tweetnacl-util');

let kmsKeyPath, kmsClient;
if (config.USES_KMS) {
  const KmsClient = require('@google-cloud/kms').KeyManagementServiceClient;

  kmsClient = new KmsClient();
  kmsKeyPath = kmsClient.cryptoKeyPath(
    config.GCP_PROJECT,
    'global',
    config.KMS_KEY_RING,
    config.KMS_KEY_NAME
  );
}

exports.decrypt = async ciphertext => {
  if (config.USES_KMS) {
    const [result] = await kmsClient.decrypt({name: kmsKeyPath, ciphertext});
    return Buffer.from(result.plaintext, 'base64').toString();
  } else {
    const msgNonce = decodeBase64(ciphertext);

    const nonce = msgNonce.slice(0, NONCE_LENGTH);
    const msg = msgNonce.slice(NONCE_LENGTH, msgNonce.length);

    const decrypted = crypto.secretbox.open(
      msg,
      nonce,
      config.TOKEN_ENCRYPTION_BYTES
    );
    return decrypted
      ? Promise.resolve(encodeUTF8(decrypted))
      : Promise.reject(config.ERROR_TWEETNACL_DECRYPTION);
  }
};

exports.encrypt = async data => {
  if (config.USES_KMS) {
    const plaintext = Buffer.from(data);
    const [result] = await kmsClient.encrypt({name: kmsKeyPath, plaintext});
    return result.ciphertext.toString('base64');
  } else {
    const plaintext = decodeUTF8(data);
    const nonce = crypto.randomBytes(NONCE_LENGTH);

    const box = crypto.secretbox(
      plaintext,
      nonce,
      config.TOKEN_ENCRYPTION_BYTES
    );

    const msg = new Uint8Array(nonce.length + box.length);
    msg.set(nonce);
    msg.set(box, nonce.length);

    return encodeBase64(msg);
  }
};
