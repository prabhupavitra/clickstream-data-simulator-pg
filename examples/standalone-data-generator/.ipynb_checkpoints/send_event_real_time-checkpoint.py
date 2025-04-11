"""
Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.

Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
with the License. A copy of the License is located at

    http://www.apache.org/licenses/LICENSE-2.0

or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
and limitations under the License.
"""
import threading

import configure
import util.util as utils
import requests
import enums as enums

global_sequence_id = 1
request_count_lock = threading.Lock()


def send_events_to_server(user, events):
    headers = {'Content-Type': 'application/json; charset=utf-8'}
    global global_sequence_id
    if user.platform == enums.Platform.Web:
        device = user.web_device
    else:
        device = user.mobile_device
    gzip = "gzip" if configure.IS_GZIP else ""
    request_param = {
        "platform": "Android",
        "appId": configure.APP_ID,
        "compression": gzip,
        "fakeIp": device.ip_address,
        "event_bundle_sequence_id": global_sequence_id
    }
    try:
        response = requests.post(url=configure.ENDPOINT, params=request_param, headers=headers, data=events)
        if response.status_code == 200:
            if configure.IS_LOG_FULL_REQUEST_MESSAGE:
                print("sent " + user.user_id + "'s events success, data len(" + str(len(events) / 1024) + "k)")
            with request_count_lock:
                global_sequence_id = global_sequence_id + 1
                if global_sequence_id % 100 == 0:
                    print("sent " + str(global_sequence_id) + " requests")
        else:
            print("sent " + user.user_id + "'s events fail, status{}".format(response.status_code))
    except Exception as e:
        print("endpoint error: " + str(e))


def send_events_of_day(user, events):
    event_line = utils.get_gzipped_line(configure.IS_GZIP, events)
    start_time = utils.current_timestamp()
    send_events_to_server(user, event_line)
    user.send_events += len(events)
    if configure.IS_LOG_FULL_REQUEST_MESSAGE:
        print("sent " + user.user_id + "'s " + str(len(events)) + " events, total events:" + str(
            user.total_day_events) + ", left events:" + str(
            user.total_day_events - user.send_events) + ", cost: " + str(
            utils.current_timestamp() - start_time) + "ms\n")
