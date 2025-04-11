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

import { randomInt } from 'crypto';
import Mustache from 'mustache';
import { logger } from './powertools';
import { MUSTACHE_RENDER_CATEGORIES } from '../constant';

export function isEmpty(a: any): boolean {
  if (a === '') return true; //Verify empty string
  if (a === 'null') return true; //Verify null string
  if (a === 'undefined') return true; //Verify undefined string
  if (!a && a !== 0 && a !== '') return true; //Verify undefined and null
  if (Array.prototype.isPrototypeOf(a) && a.length === 0) return true; //Verify empty array
  if (Object.prototype.isPrototypeOf(a) && Object.keys(a).length === 0) return true; //Verify empty objects
  return false;
}

export function generateRandomStr(length: number, charSet?: string): string {
  const lowerCase = 'abcdefghijklmnopqrstuvwxyz';
  const upperCase = lowerCase.toUpperCase();
  const numStr = '0123456789';
  const other = '!#$%^&-_=+|';

  let password = '';
  let strCharset = charSet;
  if (!strCharset) {
    strCharset = charSet ?? lowerCase + upperCase + numStr + other;
    // Fix ERROR: password must contain a number
    password = lowerCase[Math.floor(randomInt(0, lowerCase.length))]
      + upperCase[Math.floor(randomInt(0, upperCase.length))]
      + numStr[Math.floor(randomInt(0, numStr.length))]
      + other[Math.floor(randomInt(0, other.length))];
  }

  while (password.length < length) {
    password += strCharset.charAt(Math.floor(randomInt(0, strCharset.length)));
  }
  return password;
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function parseDynamoDBTableARN(ddbArn: string) {
  const arnComponents = ddbArn.split(':');
  const region = arnComponents[3];
  const tableName = arnComponents[5].split('/')[1];

  return {
    ddbRegion: region,
    ddbTableName: tableName,
  };
}

export function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0'); // Months are zero-based
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export interface TimezoneInfo {
  appId: string;
  timezone: string;
}

export function timezoneJsonArrayToDict(jsonArray: TimezoneInfo[]): { [key: string]: string } {
  const dict: { [key: string]: string } = {};
  for (const item of jsonArray) {
    dict[item.appId] = item.timezone;
  }
  return dict;
}

export function renderCategoryInSql(sqlTemplate: string) {
  return Mustache.render(sqlTemplate, {
    ...MUSTACHE_RENDER_CATEGORIES,
  });
}

export function parseMetadataFromSql(fileContent: string): any[] {
  const content = renderCategoryInSql(fileContent);
  const metadataRegex = /-- METADATA (.+)/g;
  const metadataMatches = content.matchAll(metadataRegex);
  const metadataArray: any[] = [];
  for (const match of metadataMatches) {
    const metadataJson = match[1];
    try {
      const metadataObject = JSON.parse(metadataJson);
      metadataArray.push(metadataObject);
    } catch (parseError) {
      logger.warn('JSON parsing error:', { parseError });
    }
  }
  return metadataArray;
}
