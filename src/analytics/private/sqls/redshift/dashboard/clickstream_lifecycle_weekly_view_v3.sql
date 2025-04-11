CREATE OR REPLACE VIEW {{database_name}}.{{schema}}.{{viewName}}
AS
with lag_lead as (
  select user_pseudo_id, platform, time_period_week,
    lag(time_period_week,1) over (partition by user_pseudo_id order by time_period_week),
    lead(time_period_week,1) over (partition by user_pseudo_id order by time_period_week)
  from {{database_name}}.{{schema}}.clickstream_lifecycle_view_v2
),
-- calculate lag and lead size
lag_lead_with_diffs as (
  select user_pseudo_id, platform, time_period_week, lag, lead, 
    datediff(week,lag,time_period_week) lag_size,
    datediff(week,time_period_week,lead) lead_size
  from lag_lead
),
-- case to lifecycle stage
calculated as (
  select 
    time_period_week,
    platform,
    this_week_value,
    next_week_churn,
    count(user_pseudo_id) as total_users
  from (
    select time_period_week, platform,
      case when lag is null or lag = 0 then '1-NEW'
        when lag_size = 1 then '2-RETAINED-ACTIVE'
        when lag_size > 1 then '3-RETURN'
      end as this_week_value,
      case when lead_size = 1 then NULL
        else '0-CHURN'
      end as next_week_churn,
      user_pseudo_id
    from lag_lead_with_diffs
    group by 1,2,3,4,5
  ) t1
  group by 1,2,3,4
)
select time_period_week as time_period, platform, this_week_value, sum(total_users) as sum
  from calculated group by 1,2,3
union
select time_period_week+7 as time_period, platform, '0-CHURN' as this_week_value, -1*sum(total_users) as sum
  from calculated where next_week_churn is not null 
  group by 1,2,3