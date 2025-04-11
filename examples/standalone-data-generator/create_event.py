"""
Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.

Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
with the License. A copy of the License is located at

    http://www.apache.org/licenses/LICENSE-2.0

or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
and limitations under the License.
"""
import random
import configure
import send_event
import util.util as utils
from application.AppProvider import AppProvider

app_provider = AppProvider()
max_batch_event_number = configure.EVENTS_PER_REQUEST * (configure.MAX_BATCH_REQUEST_NUMBER - 1)


def get_users(count):
    return [app_provider.get_random_user() for _ in range(count)]


def get_user_event_of_day(user, day, events_of_day):
    events = []
    session_times = random.choices(configure.SESSION_TIMES)[0]
    start_times = utils.get_session_start_time_arr(session_times, day)

    for i in range(session_times):
        utils.current_timestamp = start_times[i]
        app_provider.generate_session_events(user, events)

    events_of_day.extend(events)


if __name__ == '__main__':
    configure.init_config()

    # ✅ Removed appId/endpoint check (not needed for PostgreSQL-only use)
    start_time = utils.get_current_timestamp()
    all_user_count = app_provider.get_all_user_count()

    users = get_users(int(all_user_count / 4))
    new_users_of_day = int(all_user_count / 40)
    days = utils.get_days_arr()
    total_events_count = 0

    for day in days:
        day_str = utils.get_day_of_timestamp(day)
        print(f"\n----------- start day: {day_str} -----------")
        events_of_day = []
        users_count = random.choices(app_provider.get_dau_count())[0]

        users.extend(get_users(new_users_of_day))
        day_users = random.sample(users, users_count)

        start_gen_day_user_event_time = utils.get_current_timestamp()
        day_events_count = 0
        handled_user_count = 0

        for user in day_users:
            get_user_event_of_day(user, day, events_of_day)
            handled_user_count += 1

            if len(events_of_day) > max_batch_event_number:
                day_events_count += len(events_of_day)
                print(f"{day_str} total user count: {users_count}, left: {users_count - handled_user_count}")
                send_event.send_events_of_batch(events_of_day)
                events_of_day = []

        if len(events_of_day) > 0:
            print(f"{day_str} total user count: {users_count}, left: 0")
            day_events_count += len(events_of_day)
            send_event.send_events_of_batch(events_of_day)

        total_events_count += day_events_count
        print(f"send {day_events_count} events for {day_str} cost: {utils.get_current_timestamp() - start_gen_day_user_event_time}ms\n")

    print(f"job finished, uploaded {total_events_count} events, cost: {utils.get_current_timestamp() - start_time}ms\n")

# import random
# import configure
# import send_event
# import util.util as utils
# from application.AppProvider import AppProvider

# app_provider = AppProvider()
# max_batch_event_number = configure.EVENTS_PER_REQUEST * (configure.MAX_BATCH_REQUEST_NUMBER - 1)


# def get_users(count):
#     user_list = []
#     for i in range(count):
#         user_list.append(app_provider.get_random_user())
#     return user_list


# def get_user_event_of_day(user, day, events_of_day):
#     events = []
#     session_times = random.choices(configure.SESSION_TIMES)[0]
#     # different session for user in one day
#     start_times = utils.get_session_start_time_arr(session_times, day)
#     for i in range(session_times):
#         # init current timestamp
#         user.current_timestamp = start_times[i]
#         app_provider.generate_session_events(user, events)
#     events_of_day.extend(events)


# if __name__ == '__main__':
#     configure.init_config()
#     if configure.APP_ID == "" or configure.ENDPOINT == "":
#         print("Error: please config your appId and endpoint")
#     else:
#         print("Your configuration is:\nappId: " + configure.APP_ID + "\nendpoint: " + configure.ENDPOINT)
#         start_time = utils.get_current_timestamp()
#         # init all user
#         all_user_count = app_provider.get_all_user_count()
#         users = get_users(int(all_user_count / 4))
#         new_users_of_day = int(all_user_count / 40)
#         # get days arr
#         days = utils.get_days_arr()
#         total_events_count = 0
#         for day in days:
#             day_str = utils.get_day_of_timestamp(day)
#             print("\n----------- start day: " + day_str + " -----------")
#             events_of_day = []
#             users_count = random.choices(app_provider.get_dau_count())[0]
#             users.extend(get_users(new_users_of_day))
#             day_users = random.sample(users, users_count)
#             start_gen_day_user_event_time = utils.get_current_timestamp()
#             day_events_count = 0
#             handled_user_count = 0
#             for user in day_users:
#                 get_user_event_of_day(user, day, events_of_day)
#                 handled_user_count += 1
#                 if len(events_of_day) > max_batch_event_number:
#                     day_events_count += len(events_of_day)
#                     print(day_str + " total user count: " + str(users_count) + ", left: " +
#                           str(users_count - handled_user_count))
#                     send_event.send_events_of_batch(events_of_day)
#                     events_of_day = []
#             if len(events_of_day) > 0:
#                 print(day_str + " total user count: " + str(users_count) + ", left: 0")
#                 day_events_count += len(events_of_day)
#                 send_event.send_events_of_batch(events_of_day)
#             total_events_count += day_events_count
#             print("send " + str(day_events_count) + " events for " + day_str + " cost:" + str(
#                 utils.get_current_timestamp() - start_gen_day_user_event_time) + "\n")

#         print("job finished, upload " + str(total_events_count) + " events, cost: " +
#               str(utils.get_current_timestamp() - start_time) + "ms\n")
#         print("Your configuration is:\nappId: " + configure.APP_ID + "\nendpoint: " + configure.ENDPOINT)
