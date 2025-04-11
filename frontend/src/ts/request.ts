/**
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

import Axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import { reject } from 'lodash';
import { User } from 'oidc-client-ts';
import { PROJECT_CONFIG_JSON } from './const';
import { alertMsg, generateStr } from './utils';

function getUser() {
  const configJSONObj: ConfigType = localStorage.getItem(PROJECT_CONFIG_JSON)
    ? JSON.parse(localStorage.getItem(PROJECT_CONFIG_JSON) || '')
    : {};
  const oidcStorage = localStorage.getItem(
    `oidc.user:${configJSONObj.oidc_provider}:${configJSONObj.oidc_client_id}`
  );
  if (!oidcStorage) {
    return null;
  }
  return User.fromStorageString(oidcStorage);
}

const BASE_URL = '/api';
// define reqeustId key
const REQUEST_ID_KEY = 'X-Click-Stream-Request-Id';
// define requestId value
let requestId: string | null = null;

const axios = Axios.create({
  baseURL: BASE_URL,
  timeout: 100000,
});

/**
 * http request interceptor
 */
axios.interceptors.request.use(
  (config: any) => {
    const user = getUser();
    const token = user?.id_token;
    config.headers = {
      'Content-Type': 'application/json',
      Authorization: token ? `Bearer ${token}` : undefined,
    } as any;
    // set x-click-stream-request-id
    if (!config.headers[REQUEST_ID_KEY]) {
      config.headers[REQUEST_ID_KEY] = generateStr(18);
      requestId = config.headers[REQUEST_ID_KEY];
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

/**
 * http response interceptor
 */
axios.interceptors.response.use(
  (response) => {
    // reset requestId if success
    requestId = null;
    return response;
  },
  (error) => {
    // use previous requestId for retry
    error.config.headers[REQUEST_ID_KEY] = requestId;
    return Promise.reject(error);
  }
);

// GET Request
export function getRequest<T>(url: string, params?: any): Promise<T> {
  return axios
    .get<ApiResponse<T>>(`${url}`, {
      params,
    })
    .then((response: AxiosResponse) => {
      const apiRes: ApiResponse<T> = response.data;
      if (apiRes.success) {
        return response.data;
      } else {
        alertMsg(apiRes.message);
        throw new Error(response.data.message || 'Error');
      }
    })
    .catch((err) => {
      errMsg(err);
      reject(err);
    });
}

// POST Request
export function postRequest<T>(
  url: string,
  data?: any,
  config?: AxiosRequestConfig
): Promise<T> {
  return axios
    .post<ApiResponse<T>>(`${url}`, data, config)
    .then((response: AxiosResponse) => {
      const apiRes: ApiResponse<T> = response.data;
      if (apiRes.success) {
        return response.data;
      } else {
        alertMsg(apiRes.message);
        throw new Error(response.data.message || 'Error');
      }
    })
    .catch((err) => {
      errMsg(err);
      reject(err);
      throw new Error(err?.response?.data?.error || 'Error');
    });
}

// PUT Request
export function putRequest<T>(
  url: string,
  data?: any,
  config?: AxiosRequestConfig
): Promise<T> {
  return axios
    .put<ApiResponse<T>>(`${url}`, data, config)
    .then((response: AxiosResponse) => {
      const apiRes: ApiResponse<T> = response.data;
      if (apiRes.success) {
        return response.data;
      } else {
        alertMsg(apiRes.message);
        throw new Error(response.data.message || 'Error');
      }
    })
    .catch((err) => {
      errMsg(err);
      reject(err);
    });
}

// DELETE Request
export function deleteRequest<T>(url: string, data?: any): Promise<T> {
  return axios
    .delete<ApiResponse<T>>(`${url}`, data)
    .then((response: AxiosResponse) => {
      const apiRes: ApiResponse<T> = response.data;
      if (apiRes.success) {
        return response.data;
      } else {
        alertMsg(apiRes.message);
        throw new Error(response.data.message || 'Error');
      }
    })
    .catch((err) => {
      errMsg(err);
      reject(err);
    });
}

// Handler api request and return data
export const apiRequest = (
  fecth: 'get' | 'post' | 'put' | 'delete',
  url: string,
  param?: string | Record<string, any> | undefined
) => {
  return new Promise((resolve, reject) => {
    switch (fecth) {
      case 'get':
        getRequest(url, param)
          .then((response) => {
            resolve(response);
          })
          .catch((err) => {
            reject(err);
          });
        break;
      case 'post':
        postRequest(url, param)
          .then((response) => {
            resolve(response);
          })
          .catch((err) => {
            reject(err);
          });
        break;
      case 'put':
        putRequest(url, param)
          .then((response) => {
            resolve(response);
          })
          .catch((err) => {
            reject(err);
          });
        break;
      case 'delete':
        deleteRequest(url, param)
          .then((response) => {
            resolve(response);
          })
          .catch((err) => {
            reject(err);
          });
        break;
      default:
        reject('unknown request');
        break;
    }
  });
};

// Error handler
function errMsg(err: { response: { status: any; data: ApiResponse<null> } }) {
  if (err && err.response && err.response.status >= 400) {
    switch (err.response.status) {
      case 400:
        alertMsg(err.response?.data?.message);
        break;
      case 401:
        alertMsg('Unauthorized, please log in');
        break;
      case 403:
        alertMsg('Access denied');
        break;
      case 404:
        alertMsg('Request address not found');
        break;
      case 408:
        alertMsg('Request timed out');
        break;
      case 429:
        alertMsg('Too many requests');
        break;
      case 500:
        alertMsg('Internal server error');
        break;
      case 501:
        alertMsg('Service not implemented');
        break;
      case 502:
        alertMsg('Gateway error');
        break;
      case 503:
        alertMsg('Service is not available');
        break;
      case 504:
        alertMsg('Gateway timeout');
        break;
      case 505:
        alertMsg('HTTP version not supported');
        break;
      default:
        alertMsg('Network error please try again later');
        break;
    }
  } else {
    alertMsg('Network error please try again later');
  }
}
